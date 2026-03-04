/**
 * c3l-nli-IngestAcademic  (資料攝取 Lambda — Academic Domain)
 * ------------------------------------------------------------------
 * Lambda function: Pull raw academic engagement data from LMS APIs
 * and save to S3 raw zone.
 *
 * Supported device_type (LMS) values:
 *   canvas_lms | moodle | blackboard
 *
 * S3 Output path:
 *   s3://<RAW_BUCKET>/raw/domain=academic/device_type=<lms>/
 *       year=YYYY/month=MM/day=DD/<student_id>_<lms>.json
 *
 * Trigger  : Step Function Map state (one invocation per resource)
 * Runtime  : Node.js 20.x
 * Env vars :
 *   RAW_BUCKET         - c3l-nextlevelinsights-data-lake
 *   AWS_REGION         - ap-southeast-2
 *   CANVAS_API_BASE    - e.g. https://canvas.institution.edu/api/v1
 *   CANVAS_API_TOKEN   - Canvas LMS API token (or from Secrets Manager)
 *   MOODLE_API_BASE    - e.g. https://moodle.institution.edu/webservice/rest/server.php
 *   MOODLE_API_TOKEN   - Moodle web service token
 * ------------------------------------------------------------------
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const RAW_BUCKET = process.env.RAW_BUCKET || 'c3l-nextlevelinsights-data-lake';
const CANVAS_BASE = process.env.CANVAS_API_BASE || '';
const MOODLE_BASE = process.env.MOODLE_API_BASE || '';

// ─── Helpers ────────────────────────────────────────────────────────────────

function httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`JSON parse error from ${url}: ${data.slice(0, 200)}`)); }
            });
        });
        req.on('error', reject);
    });
}

// ─── LMS-specific ingest functions ──────────────────────────────────────────

async function ingestCanvas(student_id, access_token) {
    const token = access_token || process.env.CANVAS_API_TOKEN;
    const headers = { Authorization: `Bearer ${token}` };

    // Courses, assignments, submissions, discussions
    const [courses, enrollments] = await Promise.all([
        httpGet(`${CANVAS_BASE}/courses?enrollment_state=active&per_page=50`, headers),
        httpGet(`${CANVAS_BASE}/users/self/enrollments?per_page=100`, headers),
    ]);

    const submissions = [];
    for (const course of (Array.isArray(courses) ? courses.slice(0, 5) : [])) {
        try {
            const subs = await httpGet(
                `${CANVAS_BASE}/courses/${course.id}/students/submissions?student_ids[]=self&per_page=50`,
                headers
            );
            submissions.push({ course_id: course.id, course_name: course.name, submissions: subs });
        } catch (e) {
            console.warn(`Canvas: could not fetch submissions for course ${course.id}: ${e.message}`);
        }
    }

    return { courses, enrollments, submissions };
}

async function ingestMoodle(student_id, access_token) {
    const token = access_token || process.env.MOODLE_API_TOKEN;
    const base = `${MOODLE_BASE}?wstoken=${token}&moodlewsrestformat=json`;

    const [userInfo, courses, grades] = await Promise.all([
        httpGet(`${base}&wsfunction=core_user_get_users_by_field&field=username&values[0]=${student_id}`),
        httpGet(`${base}&wsfunction=core_enrol_get_users_courses&userid=0&returnusercount=0`),
        httpGet(`${base}&wsfunction=gradereport_user_get_grade_items&userid=0&courseid=0`),
    ]);

    return { userInfo, courses, grades };
}

async function ingestBlackboard(student_id, access_token) {
    // Blackboard REST API
    // Placeholder — real implementation requires Blackboard Learn API OAuth
    console.log('c3l-nli-IngestAcademic | blackboard: REST API integration placeholder');
    return { note: 'Blackboard integration pending API key provisioning' };
}

// ─── Main Dispatcher ────────────────────────────────────────────────────────

/**
 * @param {object} event
 * @param {string} event.student_id
 * @param {string} event.device_type     - canvas_lms | moodle | blackboard
 * @param {string} event.access_token    - LMS API token or OAuth bearer
 */
exports.handler = async (event) => {
    const { student_id, device_type, access_token } = event;

    if (!student_id || !device_type) {
        throw new Error('c3l-nli-IngestAcademic: Missing student_id or device_type');
    }

    let rawData;
    switch (device_type) {
        case 'canvas_lms': rawData = await ingestCanvas(student_id, access_token); break;
        case 'moodle': rawData = await ingestMoodle(student_id, access_token); break;
        case 'blackboard': rawData = await ingestBlackboard(student_id, access_token); break;
        default:
            throw new Error(`c3l-nli-IngestAcademic: Unknown LMS "${device_type}". ` +
                `Supported: canvas_lms, moodle, blackboard`);
    }

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');

    const s3Key = `raw/domain=academic/device_type=${device_type}/` +
        `year=${year}/month=${month}/day=${day}/` +
        `${student_id}_${device_type}.json`;

    const payload = {
        meta: {
            student_id,
            device_type,
            domain: 'academic',
            synced_at: now.toISOString(),
            source: `c3l-nli-${device_type}-ingest`,
        },
        data: rawData,
    };

    await s3.send(new PutObjectCommand({
        Bucket: RAW_BUCKET,
        Key: s3Key,
        Body: JSON.stringify(payload, null, 2),
        ContentType: 'application/json',
    }));

    console.log(`c3l-nli-IngestAcademic | s3://${RAW_BUCKET}/${s3Key}`);

    return {
        student_id,
        device_type,
        domain: 'academic',
        s3_raw_key: s3Key,
        s3_bucket: RAW_BUCKET,
        ingested_at: now.toISOString(),
    };
};
