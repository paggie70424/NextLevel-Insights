/**
 * c3l-nli-StoreConsentV2
 * ------------------------------------------------------------------
 * NEW Lambda: Store per-admin student consent in DynamoDB.
 *
 * Redesigned from c3l-nli-StoreConsent to support identity-level
 * filtering: students share data with SPECIFIC admins (not just the
 * admin role). Uses Cognito sub as identity — never email.
 *
 * DynamoDB Table : c3l-nli-user-consent
 *
 * Primary Key Design:
 *   PK  = STUDENT#<student_sub>
 *   SK  = ADMIN#<admin_sub>#RESOURCE#<domain>#<device>
 *
 * GSI1 (for admin queries):
 *   GSI1PK = ADMIN#<admin_sub>
 *   GSI1SK = STUDENT#<student_sub>#RESOURCE#<domain>#<device>
 *
 * Example — student uuid-s1 shares health/whoop with admin uuid-a2:
 *   PK  = STUDENT#uuid-s1
 *   SK  = ADMIN#uuid-a2#RESOURCE#health#whoop
 *
 * This means: Admin7 (uuid-a7) can NEVER see uuid-s1's data unless
 * uuid-s1 explicitly consented to uuid-a7.
 *
 * Trigger  : API Gateway POST /consent (replaces Step Function step)
 * Runtime  : Node.js 20.x
 * AWS Profile: c3l-analytics (local deploy only — Lambda uses IAM role)
 * Env vars :
 *   CONSENT_V2_TABLE  - c3l-nli-user-consent
 *   AWS_REGION        - ap-southeast-2
 *
 * Deploy command (c3l-analytics profile):
 *   cd infrastructure/lambda
 *   zip -q /tmp/c3l-nli-StoreConsentV2.zip -j c3l-nli-StoreConsentV2/index.js
 *   aws lambda create-function \
 *     --function-name c3l-nli-StoreConsentV2 \
 *     --runtime nodejs20.x \
 *     --role arn:aws:iam::184898280326:role/c3l-nli-LambdaExecutionRole \
 *     --handler index.handler \
 *     --zip-file fileb:///tmp/c3l-nli-StoreConsentV2.zip \
 *     --timeout 30 --memory-size 256 \
 *     --environment "Variables={CONSENT_V2_TABLE=c3l-nli-user-consent,AWS_REGION=ap-southeast-2}" \
 *     --region ap-southeast-2 --profile c3l-analytics
 * ------------------------------------------------------------------
 */

const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb')
const { marshall } = require('@aws-sdk/util-dynamodb')
const { CognitoJwtVerifier } = require('aws-jwt-verify')

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' })
const TABLE = process.env.CONSENT_V2_TABLE || 'c3l-nli-user-consent'

const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    tokenUse: 'access',
    clientId: process.env.COGNITO_CLIENT_ID,
})

/**
 * @param {object} event - API Gateway proxy event
 * @param {object} event.headers - Authorization: Bearer <jwt>
 * @param {object} event.body - JSON string
 * @param {string[]} event.body.admin_ids  - Cognito subs of admins to share with
 * @param {string[]} event.body.resources  - ["health#whoop", "academic#canvas_lms"]
 */
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

    // ── 2. Extract student identity (Cognito sub — never email) ─────
    const student_sub = claims.sub
    const groups = claims['cognito:groups'] || []

    if (!groups.includes('students')) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Only students can submit consent' }) }
    }

    // ── 3. Parse body ────────────────────────────────────────────────
    const body = JSON.parse(event.body || '{}')
    const { admin_ids = [], resources = [] } = body

    if (!admin_ids.length || !resources.length) {
        return { statusCode: 400, body: JSON.stringify({ error: 'admin_ids and resources are required' }) }
    }

    // ── 4. Write per-admin consent records ──────────────────────────
    const now = new Date().toISOString()
    const writes = []

    for (const admin_sub of admin_ids) {
        for (const resource of resources) {
            const [domain, device_type] = resource.split('#')

            // PK and SK — core consent record
            const item = {
                // Primary Key
                PK: `STUDENT#${student_sub}`,
                SK: `ADMIN#${admin_sub}#RESOURCE#${domain}#${device_type}`,
                // GSI1 — allows admin to query "which students shared with ME?"
                GSI1PK: `ADMIN#${admin_sub}`,
                GSI1SK: `STUDENT#${student_sub}#RESOURCE#${domain}#${device_type}`,
                // Data
                student_sub,
                admin_sub,
                domain,
                device_type,
                consented_at: now,
                status: 'active',
                // Metric-level consent (extend as needed)
                consent_metrics: {
                    sleep: true,
                    recovery: true,
                    heart_rate: true,
                    hrv: true,
                    strain: true,
                },
                expires_at: null,
                updated_at: now,
            }

            await ddb.send(new PutItemCommand({
                TableName: TABLE,
                Item: marshall(item, { removeUndefinedValues: true }),
            }))

            console.log(`c3l-nli-StoreConsentV2 | STUDENT#${student_sub} → ADMIN#${admin_sub} | ${domain}#${device_type}`)
            writes.push({ admin_sub, domain, device_type, status: 'stored' })
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Consent stored successfully',
            student_sub,
            records_written: writes.length,
            writes,
        }),
    }
}
