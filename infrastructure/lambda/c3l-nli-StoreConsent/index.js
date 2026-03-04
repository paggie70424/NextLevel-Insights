/**
 * c3l-nli-StoreConsent
 * ------------------------------------------------------------------
 * Lambda function: Store student consent in DynamoDB.
 *
 * DynamoDB Table : nextlevel-consent
 * PK             : STUDENT#<student_id>
 * SK             : RESOURCE#<domain>#<device_type>   e.g. RESOURCE#health#whoop
 *
 * Trigger  : Step Function Task state (after ValidateJWT)
 * Runtime  : Node.js 20.x
 * Env vars :
 *   CONSENT_TABLE   - DynamoDB table name (nextlevel-consent)
 *   AWS_REGION      - e.g. ap-southeast-2
 * ------------------------------------------------------------------
 */

const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const TABLE = process.env.CONSENT_TABLE || 'nextlevel-consent';

/**
 * @param {object} event - output from c3l-nli-ValidateJWT plus resource list
 * @param {string} event.student_id
 * @param {string} event.role
 * @param {string[]} event.resources  - ["health#whoop", "academic#canvas_lms"]
 */
exports.handler = async (event) => {
    const { student_id, role, resources = [] } = event;

    if (!student_id) throw new Error('c3l-nli-StoreConsent: Missing student_id');
    if (role !== 'student') throw new Error(`c3l-nli-StoreConsent: Only students can consent. Got role="${role}"`);

    const now = new Date().toISOString();
    const writes = [];

    for (const resource of resources) {
        // resource format: "domain#device_type"  e.g. "health#whoop"
        const [domain, device_type] = resource.split('#');

        const item = {
            PK: `STUDENT#${student_id}`,
            SK: `RESOURCE#${domain}#${device_type}`,
            student_id,
            domain,            // "health" | "academic" | "performance"
            device_type,       // "whoop" | "apple_watch" | "fitbit" | "canvas_lms" ...
            // Consent flags — device / metric / domain level
            consent_device: true,
            consent_domain: true,
            // Metric-level example (extend as needed)
            consent_metrics: {
                heart_rate: true,
                sleep: true,
                recovery: true,
                hrv: true,
                strain: true,
                respiratory_rate: true,
                spo2: true,
            },
            consented_at: now,
            expires_at: null,    // null = no expiry; set ISO string to auto-revoke
            status: 'active',
            // Audit
            created_by: student_id,
            updated_at: now,
        };

        await ddb.send(new PutItemCommand({
            TableName: TABLE,
            Item: marshall(item, { removeUndefinedValues: true }),
        }));

        console.log(`c3l-nli-StoreConsent | stored STUDENT#${student_id} RESOURCE#${domain}#${device_type}`);
        writes.push({ domain, device_type, status: 'stored' });
    }

    return {
        student_id,
        role,
        resources_stored: writes,
        // Pass resources forward for the Map state
        resources,
    };
};
