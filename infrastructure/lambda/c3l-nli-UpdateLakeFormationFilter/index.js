/**
 * c3l-nli-UpdateLakeFormationFilter
 * ------------------------------------------------------------------
 * Lambda function: Create or update a Lake Formation row-level filter
 * on the Glue table so that StaffRole/AdminRole can only query
 * rows where student_id is in the consented list.
 *
 * Lake Formation LF-Tags applied:
 *   domain       = health | academic | performance
 *   sensitivity  = restricted
 *
 * Row filter: student_id IN ('<id1>', '<id2>', ...)
 *   - Applied per table per domain
 *   - Staff can only see rows of students who consented
 *   - Admin sees aggregated view only (via separate Athena view)
 *
 * Trigger  : Step Function Task state (after UpdateDataZoneAsset)
 * Runtime  : Node.js 20.x
 * Env vars :
 *   AWS_REGION            - ap-southeast-2
 *   AWS_ACCOUNT_ID        - 184898280326
 *   GLUE_DATABASE         - c3l_nli_raw_devices
 *   STAFF_ROLE_ARN        - arn:aws:iam::184898280326:role/c3l-nli-StaffRole
 *   ADMIN_ROLE_ARN        - arn:aws:iam::184898280326:role/c3l-nli-AdminRole
 *   CONSENT_TABLE         - nextlevel-consent
 * ------------------------------------------------------------------
 */

const { LakeFormationClient, CreateDataCellsFilterCommand, UpdateDataCellsFilterCommand, DeleteDataCellsFilterCommand, GetTableCommand } = require('@aws-sdk/client-lakeformation');
const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const lf = new LakeFormationClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || '184898280326';
const GLUE_DB = process.env.GLUE_DATABASE || 'c3l_nli_raw_devices';
const STAFF_ROLE = process.env.STAFF_ROLE_ARN || `arn:aws:iam::${ACCOUNT_ID}:role/c3l-nli-StaffRole`;
const CONSENT_TABLE = process.env.CONSENT_TABLE || 'nextlevel-consent';

// ─── Glue table name conventions ────────────────────────────────────────────

function glueTableName(domain, device_type) {
    // Matches the table prefix set by UpdateGluePartition
    return `${domain}_${device_type}_normalized`;
}

// ─── Fetch all consented student IDs for a given domain/device ──────────────

async function fetchConsentedStudentIds(domain, device_type) {
    // Scan consent table for active consents for this resource
    // In production: use a GSI on (domain, device_type) for efficiency
    const res = await ddb.send(new QueryCommand({
        TableName: CONSENT_TABLE,
        IndexName: 'domain-device-index',  // GSI required
        KeyConditionExpression: '#domain = :domain AND device_type = :device',
        FilterExpression: '#status = :active',
        ExpressionAttributeNames: {
            '#domain': 'domain',
            '#status': 'status',
        },
        ExpressionAttributeValues: {
            ':domain': { S: domain },
            ':device': { S: device_type },
            ':active': { S: 'active' },
        },
    }));

    return (res.Items || []).map((i) => unmarshall(i).student_id).filter(Boolean);
}

// ─── Upsert row filter ───────────────────────────────────────────────────────

async function upsertRowFilter(tableName, studentIds, filterSuffix) {
    const filterName = `c3l-nli-staff-filter-${filterSuffix}`;
    const rowExpr = studentIds.length > 0
        ? `student_id IN (${studentIds.map(id => `'${id}'`).join(', ')})`
        : `student_id IS NULL`;   // No consenting students = no rows visible

    const filterDef = {
        TableCatalogId: ACCOUNT_ID,
        DatabaseName: GLUE_DB,
        TableName: tableName,
        Name: filterName,
        RowFilter: { FilterExpression: rowExpr },
        ColumnWildcard: {},   // all columns permitted within the row filter
    };

    try {
        await lf.send(new CreateDataCellsFilterCommand({ TableData: filterDef }));
        console.log(`c3l-nli-UpdateLakeFormationFilter | Created filter: ${filterName}`);
    } catch (err) {
        if (err.name === 'AlreadyExistsException') {
            await lf.send(new UpdateDataCellsFilterCommand({ TableData: filterDef }));
            console.log(`c3l-nli-UpdateLakeFormationFilter | Updated filter: ${filterName}`);
        } else {
            throw err;
        }
    }

    return { filterName, rowExpr, studentCount: studentIds.length };
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * @param {object} event - output from c3l-nli-UpdateDataZoneAsset
 * @param {string} event.student_id
 * @param {string} event.domain        - health | academic
 * @param {string} event.device_type
 */
exports.handler = async (event) => {
    const { student_id, domain, device_type } = event;

    // Fetch ALL consented student IDs for this resource (not just the current student)
    let consentedIds;
    try {
        consentedIds = await fetchConsentedStudentIds(domain, device_type);
    } catch (err) {
        // GSI might not exist yet — fall back to just the current student
        console.warn(`c3l-nli-UpdateLakeFormationFilter | GSI query failed, using single student. Err: ${err.message}`);
        consentedIds = [student_id];
    }

    // Ensure current student is included
    if (!consentedIds.includes(student_id)) {
        consentedIds.push(student_id);
    }

    const tableName = glueTableName(domain, device_type);
    const filterSuffix = `${domain}-${device_type}`;

    const result = await upsertRowFilter(tableName, consentedIds, filterSuffix);

    console.log(`c3l-nli-UpdateLakeFormationFilter | ${consentedIds.length} consented students | table=${tableName}`);

    return {
        ...event,
        lf_filter_name: result.filterName,
        lf_row_expression: result.rowExpr,
        lf_student_count: result.studentCount,
        lf_updated_at: new Date().toISOString(),
        pipeline_complete: true,
    };
};
