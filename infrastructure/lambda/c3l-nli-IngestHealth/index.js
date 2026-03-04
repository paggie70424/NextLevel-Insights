/**
 * c3l-nli-IngestHealth  (資料攝取 Lambda — Health Domain)
 * ------------------------------------------------------------------
 * Lambda function: Pull raw health data from wearable device APIs
 * and save to S3 raw zone.
 *
 * Supported device_type values:
 *   whoop | apple_watch | fitbit | oura | garmin | samsung_watch
 *
 * S3 Output path:
 *   s3://<RAW_BUCKET>/raw/domain=health/device_type=<x>/
 *       year=YYYY/month=MM/day=DD/<student_id>_<device_type>.json
 *
 * Trigger  : Step Function Map state (one invocation per resource)
 * Runtime  : Node.js 20.x
 * Env vars :
 *   RAW_BUCKET        - c3l-nextlevelinsights-data-lake
 *   AWS_REGION        - ap-southeast-2
 *   WHOOP_API_BASE    - https://api.prod.whoop.com/developer
 *   FITBIT_API_BASE   - https://api.fitbit.com/1
 * ------------------------------------------------------------------
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const RAW_BUCKET = process.env.RAW_BUCKET || 'c3l-nextlevelinsights-data-lake';
const WHOOP_BASE = process.env.WHOOP_API_BASE || 'https://api.prod.whoop.com/developer';
const FITBIT_BASE = process.env.FITBIT_API_BASE || 'https://api.fitbit.com/1';

// ─── Helpers ────────────────────────────────────────────────────────────────

function httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
            });
        });
        req.on('error', reject);
    });
}

function dateParam(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
}

// ─── Device-specific ingest functions ───────────────────────────────────────

async function ingestWhoop(student_id, access_token) {
    const start = dateParam(30);
    const end = dateParam(0);
    const qs = `?start=${start}&end=${end}&limit=25`;

    const [recovery, sleep, cycles, workout, profile, body] = await Promise.all([
        httpGet(`${WHOOP_BASE}/v2/recovery${qs}`, { Authorization: `Bearer ${access_token}` }),
        httpGet(`${WHOOP_BASE}/v2/activity/sleep${qs}`, { Authorization: `Bearer ${access_token}` }),
        httpGet(`${WHOOP_BASE}/v2/cycle${qs}`, { Authorization: `Bearer ${access_token}` }),
        httpGet(`${WHOOP_BASE}/v2/activity/workout${qs}`, { Authorization: `Bearer ${access_token}` }),
        httpGet(`${WHOOP_BASE}/v1/user/profile/basic`, { Authorization: `Bearer ${access_token}` }),
        httpGet(`${WHOOP_BASE}/v1/user/measurement/body`, { Authorization: `Bearer ${access_token}` }),
    ]);

    return {
        recovery: { records: recovery.records || [] },
        sleep: { records: sleep.records || [] },
        cycles: { records: cycles.records || [] },
        workout: { records: workout.records || [] },
        profile,
        body_measurement: body,
    };
}

async function ingestFitbit(student_id, access_token) {
    // Fitbit v1 API — heart rate + sleep
    const today = new Date().toISOString().slice(0, 10);
    const period = '30d';
    const [heartRate, sleep] = await Promise.all([
        httpGet(`${FITBIT_BASE}/user/-/activities/heart/date/${today}/${period}.json`, { Authorization: `Bearer ${access_token}` }),
        httpGet(`${FITBIT_BASE}/user/-/sleep/date/${today}.json`, { Authorization: `Bearer ${access_token}` }),
    ]);
    return { heartRate, sleep };
}

async function ingestAppleWatch(student_id, access_token) {
    // Apple HealthKit via server-side export (requires HealthKit entitlement)
    // This is a placeholder — real implementation uses Apple Health Records API
    console.log('c3l-nli-IngestHealth | apple_watch: HealthKit server export not yet integrated');
    return { note: 'apple_watch integration pending HealthKit server-side setup' };
}

async function ingestOura(student_id, access_token) {
    // Oura Ring API v2
    const start = dateParam(30).slice(0, 10);
    const end = dateParam(0).slice(0, 10);
    const [readiness, sleep, activity] = await Promise.all([
        httpGet(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${start}&end_date=${end}`, { Authorization: `Bearer ${access_token}` }),
        httpGet(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${start}&end_date=${end}`, { Authorization: `Bearer ${access_token}` }),
        httpGet(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${start}&end_date=${end}`, { Authorization: `Bearer ${access_token}` }),
    ]);
    return { readiness, sleep, activity };
}

// Easy to add new device:  garmin, samsung_watch, etc.
async function ingestGarmin(student_id, access_token) {
    console.log('c3l-nli-IngestHealth | garmin: integration pending Garmin Health API OAuth');
    return { note: 'garmin integration placeholder' };
}

// ─── Main dispatcher ────────────────────────────────────────────────────────

/**
 * @param {object} event
 * @param {string} event.student_id
 * @param {string} event.device_type    - whoop | apple_watch | fitbit | oura | garmin
 * @param {string} event.access_token   - OAuth2 access token for device API
 */
exports.handler = async (event) => {
    const { student_id, device_type, access_token } = event;

    if (!student_id || !device_type) {
        throw new Error('c3l-nli-IngestHealth: Missing student_id or device_type');
    }

    let rawData;
    switch (device_type) {
        case 'whoop': rawData = await ingestWhoop(student_id, access_token); break;
        case 'fitbit': rawData = await ingestFitbit(student_id, access_token); break;
        case 'apple_watch': rawData = await ingestAppleWatch(student_id, access_token); break;
        case 'oura': rawData = await ingestOura(student_id, access_token); break;
        case 'garmin': rawData = await ingestGarmin(student_id, access_token); break;
        default:
            throw new Error(`c3l-nli-IngestHealth: Unknown device_type "${device_type}". ` +
                `Supported: whoop, fitbit, apple_watch, oura, garmin`);
    }

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');

    const s3Key = `raw/domain=health/device_type=${device_type}/` +
        `year=${year}/month=${month}/day=${day}/` +
        `${student_id}_${device_type}.json`;

    const payload = {
        meta: {
            student_id,
            device_type,
            domain: 'health',
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

    console.log(`c3l-nli-IngestHealth | s3://${RAW_BUCKET}/${s3Key}`);

    return {
        student_id,
        device_type,
        domain: 'health',
        s3_raw_key: s3Key,
        s3_bucket: RAW_BUCKET,
        ingested_at: now.toISOString(),
    };
};
