/**
 * c3l-nli-ValidateJWT
 * ------------------------------------------------------------------
 * Lambda function: Validate Amazon Cognito JWT token.
 * Extracts identity fields from verified token claims.
 *
 * UPDATED: Now returns cognito:groups array and user_sub (Cognito UUID).
 * Both admin and student flows use sub as the canonical identity key.
 * Never trust req.body.role — always trust verified JWT claims.
 *
 * Trigger  : Step Function Task state (first step)
 * Runtime  : Node.js 20.x
 * AWS Profile: c3l-analytics (local deploy only — Lambda uses IAM role)
 * Env vars :
 *   COGNITO_USER_POOL_ID   - e.g. ap-southeast-2_FlPLvTNhA
 *   COGNITO_REGION         - e.g. ap-southeast-2
 *   COGNITO_CLIENT_ID      - app client id
 * ------------------------------------------------------------------
 */

const { CognitoJwtVerifier } = require('aws-jwt-verify');

const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    tokenUse: 'access',
    clientId: process.env.COGNITO_CLIENT_ID,
});

/**
 * @param {object} event
 * @param {string} event.token - Raw Bearer JWT from API Gateway
 * @param {string[]} event.resources - e.g. ["health#whoop", "academic#canvas_lms"]
 */
exports.handler = async (event) => {
    const token = (event.token || '').replace(/^Bearer\s+/i, '');

    if (!token) {
        throw new Error('c3l-nli-ValidateJWT: Missing token in event');
    }

    let claims;
    try {
        claims = await verifier.verify(token);
    } catch (err) {
        throw new Error(`c3l-nli-ValidateJWT: Invalid token — ${err.message}`);
    }

    // ── Identity extraction — always from verified claims, never from event body ──
    const user_sub = claims.sub;                              // Cognito UUID (canonical identity)
    const groups = claims['cognito:groups'] || [];          // e.g. ['students'] or ['admin']
    const email = claims.email || null;

    // Legacy: custom attributes for backward compat with old Step Function flow
    const student_id = claims['custom:student_id'] || user_sub;
    const role = groups.includes('admin') ? 'admin'
        : groups.includes('students') ? 'student'
            : (claims['custom:role'] || 'student');

    console.log(`c3l-nli-ValidateJWT | user_sub=${user_sub} role=${role} groups=[${groups.join(',')}]`);

    return {
        user_sub,       // Cognito sub UUID — use this as identity key everywhere
        student_id,     // backward compat
        role,           // 'admin' | 'student'
        groups,         // full cognito:groups array
        email,
        resources: event.resources || [],
        token,
        validated_at: new Date().toISOString(),
    };
};
