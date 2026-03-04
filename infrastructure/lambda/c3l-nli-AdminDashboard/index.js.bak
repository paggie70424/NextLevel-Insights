/**
 * c3l-nli-AdminDashboard
 * ------------------------------------------------------------------
 * NEW Lambda: Admin data dashboard query engine.
 *
 * Flow:
 *   1. Validate Cognito JWT → extract admin_sub, verify group == admin
 *   2. Query DynamoDB c3l-nli-user-consent GSI1
 *      GSI1PK = ADMIN#<admin_sub>
 *      → Returns all student_subs that consented to this admin
 *   3. Build Athena SQL: SELECT * FROM processed_health_metrics
 *      WHERE owner_id IN (<student_subs>)
 *   4. Execute Athena query (async poll or sync w/ waiter)
 *   5. Return JSON rows to frontend
 *
 * This ensures:
 *   Admin2 only sees students who shared with Admin2.
 *   Admin7 never sees Admin2's students. Ever.
 *
 * Trigger  : API Gateway GET /dashboard
 * Runtime  : Node.js 20.x
 * AWS Profile: c3l-analytics (local deploy only — Lambda uses IAM role)
 * Env vars :
 *   CONSENT_V2_TABLE      - c3l-nli-user-consent
 *   ATHENA_DATABASE       - c3l_nli_raw_devices
 *   ATHENA_OUTPUT_BUCKET  - s3://c3l-nextlevelinsights-data-lake/athena-results/
 *   COGNITO_USER_POOL_ID  - ap-southeast-2_FlPLvTNhA
 *   COGNITO_CLIENT_ID     - (app client id)
 *   AWS_REGION            - ap-southeast-2
 *
 * Deploy command (c3l-analytics profile):
 *   cd infrastructure/lambda
 *   zip -q /tmp/c3l-nli-AdminDashboard.zip -j c3l-nli-AdminDashboard/index.js
 *   aws lambda create-function \
 *     --function-name c3l-nli-AdminDashboard \
 *     --runtime nodejs20.x \
 *     --role arn:aws:iam::184898280326:role/c3l-nli-LambdaExecutionRole \
 *     --handler index.handler \
 *     --zip-file fileb:///tmp/c3l-nli-AdminDashboard.zip \
 *     --timeout 120 --memory-size 512 \
 *     --environment "Variables={CONSENT_V2_TABLE=c3l-nli-user-consent,ATHENA_DATABASE=c3l_nli_raw_devices,ATHENA_OUTPUT_BUCKET=s3://c3l-nextlevelinsights-data-lake/athena-results/,AWS_REGION=ap-southeast-2}" \
 *     --region ap-southeast-2 --profile c3l-analytics
 * ------------------------------------------------------------------
 */

const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb')
const { unmarshall } = require('@aws-sdk/util-dynamodb')
const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena')
const { CognitoJwtVerifier } = require('aws-jwt-verify')

const REGION = process.env.AWS_REGION || 'ap-southeast-2'
const ddb = new DynamoDBClient({ region: REGION })
const athena = new AthenaClient({ region: REGION })

const TABLE = process.env.CONSENT_V2_TABLE || 'c3l-nli-user-consent'
const ATHENA_DB = process.env.ATHENA_DATABASE || 'c3l_nli_raw_devices'
const ATHENA_OUTPUT = process.env.ATHENA_OUTPUT_BUCKET || 's3://c3l-nextlevelinsights-data-lake/athena-results/'

const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    tokenUse: 'access',
    clientId: process.env.COGNITO_CLIENT_ID,
})

// ── Helper: poll Athena until SUCCEEDED or FAILED ───────────────────
async function waitForQuery(queryExecutionId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 1000))
        const { QueryExecution } = await athena.send(
            new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
        )
        const state = QueryExecution.Status.State
        if (state === 'SUCCEEDED') return
        if (state === 'FAILED' || state === 'CANCELLED') {
            throw new Error(`Athena query ${state}: ${QueryExecution.Status.StateChangeReason}`)
        }
        console.log(`c3l-nli-AdminDashboard | Athena status: ${state} (attempt ${i + 1})`)
    }
    throw new Error('c3l-nli-AdminDashboard: Athena query timed out')
}

exports.handler = async (event) => {
    // ── 1. Validate JWT ─────────────────────────────────────────────
    const authHeader = (event.headers || {}).Authorization || (event.headers || {}).authorization || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')

    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Missing Authorization header' }) }
    }

    let claims
    try {
        claims = await verifier.verify(token)
    } catch (err) {
        return { statusCode: 403, body: JSON.stringify({ error: `Invalid token: ${err.message}` }) }
    }

    // ── 2. Check admin role — always from verified JWT, never request body ──
    const groups = claims['cognito:groups'] || []
    if (!groups.includes('admin')) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Admin role required to access dashboard' }) }
    }

    const admin_sub = claims.sub  // Cognito UUID — this is the identity key

    console.log(`c3l-nli-AdminDashboard | admin_sub=${admin_sub}`)

    // ── 3. Query DynamoDB GSI1 — get all students that shared with this admin ──
    const gsiResult = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
            ':pk': { S: `ADMIN#${admin_sub}` },
        },
        FilterExpression: '#status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
    }))

    const consentRecords = (gsiResult.Items || []).map(i => unmarshall(i))

    if (!consentRecords.length) {
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'No students have shared data with this admin yet',
                admin_sub,
                rows: [],
            }),
        }
    }

    // Extract unique student_subs
    const studentSubs = [...new Set(consentRecords.map(r => r.student_sub))]
    console.log(`c3l-nli-AdminDashboard | Consented students: ${studentSubs.join(', ')}`)

    // ── 4. Build Athena SQL — scoped to this admin's students ONLY ──────
    const idList = studentSubs.map(s => `'${s}'`).join(', ')
    const sql = `
    SELECT owner_id,
           AVG(sleep_score)    AS avg_sleep,
           AVG(recovery_score) AS avg_recovery,
           COUNT(*)            AS record_count
    FROM   processed_health_metrics
    WHERE  owner_id IN (${idList})
      AND  date >= date('2026-01-01')
    GROUP  BY owner_id
  `.trim()

    console.log(`c3l-nli-AdminDashboard | Athena SQL:\n${sql}`)

    // ── 5. Execute Athena query ──────────────────────────────────────────
    const startResult = await athena.send(new StartQueryExecutionCommand({
        QueryString: sql,
        QueryExecutionContext: { Database: ATHENA_DB },
        ResultConfiguration: { OutputLocation: ATHENA_OUTPUT },
    }))

    const queryExecutionId = startResult.QueryExecutionId
    await waitForQuery(queryExecutionId)

    // ── 6. Fetch results ─────────────────────────────────────────────────
    const results = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId }))
    const rows = (results.ResultSet.Rows || []).slice(1).map(row => ({
        owner_id: row.Data[0]?.VarCharValue,
        avg_sleep: parseFloat(row.Data[1]?.VarCharValue || 0),
        avg_recovery: parseFloat(row.Data[2]?.VarCharValue || 0),
        record_count: parseInt(row.Data[3]?.VarCharValue || 0, 10),
    }))

    return {
        statusCode: 200,
        body: JSON.stringify({
            admin_sub,
            consented_students: studentSubs.length,
            consent_records: consentRecords.length,
            athena_query_id: queryExecutionId,
            rows,
        }),
    }
}
