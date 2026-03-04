/**
 * run-whoop-pipeline.js
 * Reads latest local Whoop data → uploads ALL 6 data types to S3 → writes DynamoDB sync logs
 * Uses c3l-analytics AWS profile (account 184898280326, ap-southeast-2)
 *
 * Data types: recovery, sleep, cycles, workout, profile, body_measurement
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { fromIni } = require('@aws-sdk/credential-providers');

// ── Config ──────────────────────────────────────────────────────────────────
const AWS_REGION = 'ap-southeast-2';
const AWS_PROFILE = 'c3l-analytics';
const S3_BUCKET = 'c3l-nextlevelinsights-data-lake';
const TABLE_SYNC = 'c3l-NextLevelInsights-DataSyncLogs';
const DATA_DIR = path.join(__dirname, 'data/whoop/user_data');

const creds = fromIni({ profile: AWS_PROFILE });
const s3 = new S3Client({ region: AWS_REGION, credentials: creds });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION, credentials: creds }));

const log = (emoji, msg) => console.log(`${new Date().toISOString()} ${emoji}  ${msg}`);

const uploadToS3 = async (key, data) => {
    await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET, Key: key,
        Body: JSON.stringify(data, null, 2), ContentType: 'application/json'
    }));
    const uri = `s3://${S3_BUCKET}/${key}`;
    log('✅', `S3 → ${uri}`);
    return uri;
};

const writeSyncLog = async ({ userId, dataType, s3Path, recordCount, status }) => {
    await dynamo.send(new PutCommand({
        TableName: TABLE_SYNC,
        Item: {
            sync_id: uuidv4(), timestamp: new Date().toISOString(),
            user_id: String(userId), device_type: 'whoop', data_type: dataType,
            s3_path: s3Path, data_stage: 'raw', record_count: recordCount,
            datazone_product_id: `c3l-nli_whoop_dev_raw_${dataType}`,
            status, error_message: null
        }
    }));
    log('📝', `DynamoDB → whoop/${dataType} | records:${recordCount} | product:c3l-nli_whoop_dev_raw_${dataType}`);
};

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  c3l-NextLevelInsights | Whoop Full Pipeline (6 data types)');
    console.log(`  Profile: ${AWS_PROFILE} | Bucket: ${S3_BUCKET}`);
    console.log('════════════════════════════════════════════════════════════\n');

    // Load latest local file
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    if (!files.length) { console.error('No local Whoop data in', DATA_DIR); process.exit(1); }
    log('📂', `Loading: ${files[0]}`);
    const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[0]), 'utf8'));
    const userId = String(d.user_profile?.user_id || 'unknown');
    const syncedAt = d.synced_at || new Date().toISOString();
    const [yr, mo, dy] = syncedAt.slice(0, 10).split('-');
    log('👤', `User: ${userId} | Date: ${yr}-${mo}-${dy}`);

    // Define all 6 upload jobs
    const jobs = [
        {
            dataType: 'recovery',
            key: `raw/whoop/recovery/${yr}/${mo}/${dy}/${userId}_recovery.json`,
            payload: {
                meta: { user_id: userId, synced_at: syncedAt, source: 'whoop-api-v2' },
                user_profile: d.user_profile, records: d.recovery_data?.records || []
            },
            count: d.recovery_data?.records?.length || 0
        },
        {
            dataType: 'sleep',
            key: `raw/whoop/sleep/${yr}/${mo}/${dy}/${userId}_sleep.json`,
            payload: {
                meta: { user_id: userId, synced_at: syncedAt, source: 'whoop-api-v2' },
                user_profile: d.user_profile, records: d.sleep_data?.records || []
            },
            count: d.sleep_data?.records?.length || 0
        },
        {
            dataType: 'cycles',
            key: `raw/whoop/cycles/${yr}/${mo}/${dy}/${userId}_cycles.json`,
            payload: {
                meta: { user_id: userId, synced_at: syncedAt, source: 'whoop-api-v2' },
                user_profile: d.user_profile, records: d.cycle_data?.records || []
            },
            count: d.cycle_data?.records?.length || 0
        },
        {
            dataType: 'workout',
            key: `raw/whoop/workout/${yr}/${mo}/${dy}/${userId}_workout.json`,
            payload: {
                meta: { user_id: userId, synced_at: syncedAt, source: 'whoop-api-v2' },
                user_profile: d.user_profile, records: d.workout_data?.records || []
            },
            count: d.workout_data?.records?.length || 0
        },
        {
            dataType: 'profile',
            key: `raw/whoop/profile/${yr}/${mo}/${dy}/${userId}_profile.json`,
            payload: {
                meta: { user_id: userId, synced_at: syncedAt, source: 'whoop-api-v2' },
                ...d.user_profile
            },
            count: 1
        },
        {
            dataType: 'body_measurement',
            key: `raw/whoop/body_measurement/${yr}/${mo}/${dy}/${userId}_body_measurement.json`,
            payload: {
                meta: { user_id: userId, synced_at: syncedAt, source: 'whoop-api-v2' },
                user_id: userId, ...d.body_measurement
            },
            count: 1
        }
    ];

    const summary = [];
    for (const job of jobs) {
        console.log(`\n── ${job.dataType.toUpperCase()} ───────────────────────────────────`);
        try {
            const uri = await uploadToS3(job.key, job.payload);
            await writeSyncLog({ userId, dataType: job.dataType, s3Path: uri, recordCount: job.count, status: 'success' });
            summary.push({ dataType: job.dataType, uri, count: job.count, ok: true });
        } catch (err) {
            log('❌', `${job.dataType} FAILED: ${err.message}`);
            summary.push({ dataType: job.dataType, count: job.count, ok: false, err: err.message });
        }
    }

    // Summary table
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  PIPELINE SUMMARY');
    console.log('  ─────────────────────────────────────────────────────────');
    for (const s of summary) {
        const status = s.ok ? '✅' : '❌';
        console.log(`  ${status} ${s.dataType.padEnd(18)} records:${String(s.count).padStart(3)}  ${s.uri || s.err || ''}`);
    }
    console.log('════════════════════════════════════════════════════════════\n');
    console.log('NEXT: Run Glue crawlers then: node publish-datazone-products.js');
})().catch(err => { console.error('Pipeline ERROR:', err.message); process.exit(1); });
