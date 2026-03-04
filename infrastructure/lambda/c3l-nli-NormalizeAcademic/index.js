/**
 * c3l-nli-NormalizeAcademic  (資料正規化 Lambda — Academic Domain)
 * ------------------------------------------------------------------
 * Lambda function: Read raw academic JSON from S3, transform to
 * canonical schema, write normalized records to S3 processed zone.
 *
 * Canonical Schema:
 *   student_id      string
 *   device_type     string   (canvas_lms | moodle | blackboard)
 *   metric_type     string   (grade | login_count | submission_count | discussion_posts ...)
 *   metric_value    double
 *   metric_unit     string
 *   event_timestamp string   (ISO 8601)
 *
 * S3 Input  : raw/domain=academic/device_type=<lms>/year=.../...json
 * S3 Output : processed/domain=academic/product=academic_engagement/
 *               year=YYYY/month=MM/day=DD/
 *               <student_id>_<lms>_normalized.json
 *
 * Trigger  : Step Function Task state (after IngestAcademic)
 * Runtime  : Node.js 20.x
 * Env vars :
 *   RAW_BUCKET       - c3l-nextlevelinsights-data-lake
 *   PROCESSED_BUCKET - c3l-nextlevelinsights-data-lake
 *   AWS_REGION       - ap-southeast-2
 * ------------------------------------------------------------------
 */

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const RAW_BUCKET = process.env.RAW_BUCKET || 'c3l-nextlevelinsights-data-lake';
const PROC_BUCKET = process.env.PROCESSED_BUCKET || 'c3l-nextlevelinsights-data-lake';

async function readS3JSON(bucket, key) {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function record(student_id, device_type, metric_type, metric_value, metric_unit, event_timestamp) {
    return { student_id, device_type, metric_type, metric_value: Number(metric_value) || null, metric_unit, event_timestamp };
}

// ─── LMS normalizers ────────────────────────────────────────────────────────

function normalizeCanvas(student_id, raw) {
    const rows = [];
    const today = new Date().toISOString();

    // Courses enrolled
    rows.push(record(student_id, 'canvas_lms', 'enrolled_courses',
        (raw.courses || []).length, 'count', today));

    // Submissions per course
    for (const c of (raw.submissions || [])) {
        const subs = Array.isArray(c.submissions) ? c.submissions : [];
        const submitted = subs.filter(s => s.workflow_state === 'submitted' || s.workflow_state === 'graded').length;
        const graded = subs.filter(s => s.score !== null && s.score !== undefined).length;
        const avgScore = graded > 0
            ? subs.filter(s => s.score != null).reduce((a, s) => a + Number(s.score), 0) / graded
            : null;

        const ts = subs[0]?.submitted_at || today;
        if (submitted) rows.push(record(student_id, 'canvas_lms', 'submissions_count', submitted, 'count', ts));
        if (graded) rows.push(record(student_id, 'canvas_lms', 'graded_count', graded, 'count', ts));
        if (avgScore) rows.push(record(student_id, 'canvas_lms', 'avg_score', avgScore, 'points', ts));
    }

    return rows;
}

function normalizeMoodle(student_id, raw) {
    const rows = [];
    const today = new Date().toISOString();

    rows.push(record(student_id, 'moodle', 'enrolled_courses',
        (raw.courses || []).length, 'count', today));

    for (const item of (raw.grades?.usergrades || [])) {
        for (const g of (item.gradeitems || [])) {
            if (g.graderaw !== null && g.graderaw !== undefined) {
                rows.push(record(student_id, 'moodle', 'grade', g.graderaw, 'points', today));
            }
        }
    }

    return rows;
}

function normalizeGenericAcademic(student_id, device_type, raw) {
    const rows = [];
    const ts = new Date().toISOString();
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'number') {
            rows.push(record(student_id, device_type, k, v, 'unknown', ts));
        }
    }
    return rows;
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * @param {object} event - output from c3l-nli-IngestAcademic
 * @param {string} event.student_id
 * @param {string} event.device_type
 * @param {string} event.s3_raw_key
 * @param {string} event.s3_bucket
 */
exports.handler = async (event) => {
    const { student_id, device_type, s3_raw_key, s3_bucket } = event;

    if (!student_id || !device_type || !s3_raw_key) {
        throw new Error('c3l-nli-NormalizeAcademic: Missing required fields from IngestAcademic output');
    }

    const raw = await readS3JSON(s3_bucket || RAW_BUCKET, s3_raw_key);
    const data = raw.data || raw;

    let normalized = [];
    switch (device_type) {
        case 'canvas_lms': normalized = normalizeCanvas(student_id, data); break;
        case 'moodle': normalized = normalizeMoodle(student_id, data); break;
        default: normalized = normalizeGenericAcademic(student_id, device_type, data); break;
    }

    normalized = normalized.filter(r => r.metric_value !== null && r.metric_value !== undefined);

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');

    const destKey = `processed/domain=academic/product=academic_engagement/` +
        `year=${year}/month=${month}/day=${day}/` +
        `${student_id}_${device_type}_normalized.json`;

    await s3.send(new PutObjectCommand({
        Bucket: PROC_BUCKET,
        Key: destKey,
        Body: JSON.stringify(normalized, null, 2),
        ContentType: 'application/json',
    }));

    console.log(`c3l-nli-NormalizeAcademic | ${normalized.length} records → s3://${PROC_BUCKET}/${destKey}`);

    return {
        student_id,
        device_type,
        domain: 'academic',
        s3_processed_key: destKey,
        s3_processed_bucket: PROC_BUCKET,
        record_count: normalized.length,
        normalized_at: now.toISOString(),
    };
};
