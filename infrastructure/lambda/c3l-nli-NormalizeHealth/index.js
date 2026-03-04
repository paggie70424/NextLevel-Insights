/**
 * c3l-nli-NormalizeHealth  (資料正規化 Lambda — Health Domain)
 * ------------------------------------------------------------------
 * Lambda function: Read raw health JSON from S3, transform to
 * canonical schema, write normalized records to S3 processed zone.
 *
 * Canonical Schema:
 *   student_id      string
 *   device_type     string
 *   metric_type     string
 *   metric_value    double
 *   metric_unit     string
 *   event_timestamp string (ISO 8601)
 *
 * S3 Input  : raw/domain=health/device_type=<x>/year=.../...json
 * S3 Output : processed/domain=health/product=health_metrics/
 *               year=YYYY/month=MM/day=DD/
 *               <student_id>_<device_type>_normalized.json
 *
 * Trigger  : Step Function Task state (after IngestHealth)
 * Runtime  : Node.js 20.x
 * Env vars :
 *   RAW_BUCKET       - c3l-nextlevelinsights-data-lake
 *   PROCESSED_BUCKET - c3l-nextlevelinsights-data-lake  (same bucket, different prefix)
 *   AWS_REGION       - ap-southeast-2
 * ------------------------------------------------------------------
 */

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const RAW_BUCKET = process.env.RAW_BUCKET || 'c3l-nextlevelinsights-data-lake';
const PROC_BUCKET = process.env.PROCESSED_BUCKET || 'c3l-nextlevelinsights-data-lake';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function readS3JSON(bucket, key) {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function record(student_id, device_type, metric_type, metric_value, metric_unit, event_timestamp) {
    return { student_id, device_type, metric_type, metric_value: Number(metric_value) || null, metric_unit, event_timestamp };
}

// ─── Device normalizers ─────────────────────────────────────────────────────

function normalizeWhoop(student_id, raw) {
    const rows = [];

    for (const r of raw.recovery?.records || []) {
        const ts = r.created_at || r.updated_at || new Date().toISOString();
        rows.push(record(student_id, 'whoop', 'recovery_score', r.score?.recovery_score, '%', ts));
        rows.push(record(student_id, 'whoop', 'hrv', r.score?.hrv_rmssd_milli, 'ms', ts));
        rows.push(record(student_id, 'whoop', 'resting_hr', r.score?.resting_heart_rate, 'bpm', ts));
        rows.push(record(student_id, 'whoop', 'spo2', r.score?.spo2_percentage, '%', ts));
        rows.push(record(student_id, 'whoop', 'skin_temp_celsius', r.score?.skin_temp_celsius, '°C', ts));
    }

    for (const s of raw.sleep?.records || []) {
        const ts = s.start || new Date().toISOString();
        rows.push(record(student_id, 'whoop', 'sleep_performance', s.score?.sleep_performance_percentage, '%', ts));
        rows.push(record(student_id, 'whoop', 'sleep_efficiency', s.score?.sleep_efficiency_percentage, '%', ts));
        rows.push(record(student_id, 'whoop', 'respiratory_rate', s.score?.respiratory_rate, 'bpm', ts));
        rows.push(record(student_id, 'whoop', 'total_sleep_ms', s.score?.stage_summary?.total_in_bed_time_milli, 'ms', ts));
    }

    for (const c of raw.cycles?.records || []) {
        const ts = c.start || new Date().toISOString();
        rows.push(record(student_id, 'whoop', 'strain', c.score?.strain, 'score', ts));
        rows.push(record(student_id, 'whoop', 'kilojoule', c.score?.kilojoule, 'kJ', ts));
        rows.push(record(student_id, 'whoop', 'avg_heart_rate', c.score?.average_heart_rate, 'bpm', ts));
        rows.push(record(student_id, 'whoop', 'max_heart_rate', c.score?.max_heart_rate, 'bpm', ts));
    }

    return rows;
}

function normalizeFitbit(student_id, raw) {
    const rows = [];
    for (const d of (raw.heartRate?.['activities-heart'] || [])) {
        rows.push(record(student_id, 'fitbit', 'resting_hr', d.value?.restingHeartRate, 'bpm', d.dateTime));
    }
    const sleep = raw.sleep?.sleep?.[0];
    if (sleep) {
        rows.push(record(student_id, 'fitbit', 'sleep_efficiency', sleep.efficiency, '%', sleep.startTime));
        rows.push(record(student_id, 'fitbit', 'total_sleep_min', sleep.minutesAsleep, 'min', sleep.startTime));
    }
    return rows;
}

function normalizeOura(student_id, raw) {
    const rows = [];
    for (const r of raw.readiness?.data || []) {
        rows.push(record(student_id, 'oura', 'readiness_score', r.score, 'score', r.day));
        rows.push(record(student_id, 'oura', 'hrv_balance', r.contributors?.hrv_balance, 'score', r.day));
    }
    for (const s of raw.sleep?.data || []) {
        rows.push(record(student_id, 'oura', 'sleep_score', s.score, 'score', s.day));
        rows.push(record(student_id, 'oura', 'total_sleep_sec', s.total_sleep_duration, 's', s.day));
    }
    return rows;
}

function normalizeGeneric(student_id, device_type, raw) {
    // Fallback: flatten top-level numeric fields
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
 * @param {object} event - output from c3l-nli-IngestHealth
 * @param {string} event.student_id
 * @param {string} event.device_type
 * @param {string} event.s3_raw_key
 * @param {string} event.s3_bucket
 */
exports.handler = async (event) => {
    const { student_id, device_type, s3_raw_key, s3_bucket } = event;

    if (!student_id || !device_type || !s3_raw_key) {
        throw new Error('c3l-nli-NormalizeHealth: Missing required fields from IngestHealth output');
    }

    const raw = await readS3JSON(s3_bucket || RAW_BUCKET, s3_raw_key);
    const data = raw.data || raw;

    let normalized = [];
    switch (device_type) {
        case 'whoop': normalized = normalizeWhoop(student_id, data); break;
        case 'fitbit': normalized = normalizeFitbit(student_id, data); break;
        case 'oura': normalized = normalizeOura(student_id, data); break;
        default: normalized = normalizeGeneric(student_id, device_type, data); break;
    }

    // Remove nulls
    normalized = normalized.filter(r => r.metric_value !== null && r.metric_value !== undefined);

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');

    const destKey = `processed/domain=health/product=health_metrics/` +
        `year=${year}/month=${month}/day=${day}/` +
        `${student_id}_${device_type}_normalized.json`;

    await s3.send(new PutObjectCommand({
        Bucket: PROC_BUCKET,
        Key: destKey,
        Body: JSON.stringify(normalized, null, 2),
        ContentType: 'application/json',
    }));

    console.log(`c3l-nli-NormalizeHealth | ${normalized.length} records → s3://${PROC_BUCKET}/${destKey}`);

    return {
        student_id,
        device_type,
        domain: 'health',
        s3_processed_key: destKey,
        s3_processed_bucket: PROC_BUCKET,
        record_count: normalized.length,
        normalized_at: now.toISOString(),
    };
};
