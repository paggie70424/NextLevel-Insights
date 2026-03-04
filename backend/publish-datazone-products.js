/**
 * publish-datazone-products.js
 * 
 * Automatically publishes all 6 Whoop data types as separate DataZone data products:
 *   recovery, sleep, cycles, workout, profile, body_measurement
 *
 * Steps:
 *  1. Trigger DataZone data source sync (discovers Glue tables → assets)
 *  2. Wait for sync to complete
 *  3. Search for each whoop_* asset
 *  4. Create a DataZone data product per data type (idempotent — skips existing)
 *  5. Write publish log to DynamoDB
 *
 * Usage:   node publish-datazone-products.js
 * Dry run: node publish-datazone-products.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { DataZoneClient,
    StartDataSourceRunCommand,
    GetDataSourceRunCommand,
    SearchCommand,
    CreateDataProductCommand
} = require('@aws-sdk/client-datazone');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { fromIni } = require('@aws-sdk/credential-providers');
const { v4: uuidv4 } = require('uuid');

// ── Config ────────────────────────────────────────────────────────────────────
const REGION = 'ap-southeast-2';
const PROFILE = 'c3l-analytics';
const DOMAIN_ID = 'dzd-cv79bbxiotkqsi';
const PROJECT_ID = '62guenc68nuvxe';
const DS_ID = 'bpr42x2umdut9e';   // c3l-nli-raw-devices-datasource
const DDB_TABLE = 'c3l-NextLevelInsights-DataSyncLogs';
const DRY_RUN = process.argv.includes('--dry-run');

// ── All 6 Whoop data products (one per Whoop API scope) ──────────────────────
const DATA_PRODUCTS = [
    {
        dataType: 'recovery',
        searchText: 'whoop_recovery',
        productName: 'c3l-nli_whoop_dev_raw_recovery',
        description: 'WHOOP recovery scores per user/day. ' +
            'Fields: recovery_score (0-100), resting_heart_rate (bpm), ' +
            'hrv_rmssd_milli (ms), spo2_percentage (%), skin_temp_celsius. ' +
            'Scope: read:recovery. Raw — c3l-NextLevelInsights.'
    },
    {
        dataType: 'sleep',
        searchText: 'whoop_sleep',
        productName: 'c3l-nli_whoop_dev_raw_sleep',
        description: 'WHOOP sleep records per user/day. ' +
            'Fields: sleep_performance_percentage, sleep_efficiency_percentage, ' +
            'respiratory_rate, stage_summary (REM/deep/light/awake ms). ' +
            'Scope: read:sleep. Raw — c3l-NextLevelInsights.'
    },
    {
        dataType: 'cycles',
        searchText: 'whoop_cycles',
        productName: 'c3l-nli_whoop_dev_raw_cycles',
        description: 'WHOOP physiological cycle data per user/day. ' +
            'Fields: strain, kilojoule (energy), average_heart_rate, max_heart_rate, ' +
            'timezone_offset, start/end timestamps. ' +
            'Scope: read:cycles. Raw — c3l-NextLevelInsights.'
    },
    {
        dataType: 'workout',
        searchText: 'whoop_workout',
        productName: 'c3l-nli_whoop_dev_raw_workout',
        description: 'WHOOP workout records per user/day. ' +
            'Fields: sport_id, strain, kilojoule, average_heart_rate, max_heart_rate, ' +
            'zone_duration (ms per heart rate zone), start/end timestamps. ' +
            'Scope: read:workout. Raw — c3l-NextLevelInsights.'
    },
    {
        dataType: 'profile',
        searchText: 'whoop_profile',
        productName: 'c3l-nli_whoop_dev_raw_profile',
        description: 'WHOOP user profile data. ' +
            'Fields: user_id, email, first_name, last_name. ' +
            'Scope: read:profile. Raw — c3l-NextLevelInsights.'
    },
    {
        dataType: 'body_measurement',
        searchText: 'whoop_body',
        productName: 'c3l-nli_whoop_dev_raw_body_measurement',
        description: 'WHOOP body measurements per user. ' +
            'Fields: height_meter, weight_kilogram, max_heart_rate. ' +
            'Scope: read:body_measurement. Raw — c3l-NextLevelInsights.'
    }
];

// ── AWS clients ───────────────────────────────────────────────────────────────
const creds = fromIni({ profile: PROFILE });
const dz = new DataZoneClient({ region: REGION, credentials: creds });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION, credentials: creds }));
const log = (e, m) => console.log(`${new Date().toISOString()} ${e}  ${m}`);

// ── Wait for a DataZone sync run to finish ────────────────────────────────────
const waitForRun = async (runId, timeoutMs = 180000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const r = await dz.send(new GetDataSourceRunCommand({ domainIdentifier: DOMAIN_ID, identifier: runId }));
        log('⏳', `Sync [${runId}] → ${r.status}`);
        if (['SUCCESS', 'FAILED', 'PARTIALLY_SUCCEEDED'].includes(r.status)) return r;
        await new Promise(res => setTimeout(res, 6000));
    }
    throw new Error('Sync run timed out after 3 min');
};

// ── Find an asset by name pattern in the project ─────────────────────────────
const findAsset = async (searchText) => {
    const r = await dz.send(new SearchCommand({
        domainIdentifier: DOMAIN_ID,
        owningProjectIdentifier: PROJECT_ID,
        searchScope: 'ASSET',
        searchText
    }));
    // Return first asset whose name contains the search text
    return (r.items || []).map(i => i.assetItem).find(a => a?.name?.includes(searchText)) || null;
};

// ── Check if a data product already exists by name ───────────────────────────
const findExistingProduct = async (name) => {
    const r = await dz.send(new SearchCommand({
        domainIdentifier: DOMAIN_ID,
        owningProjectIdentifier: PROJECT_ID,
        searchScope: 'DATA_PRODUCT',
        searchText: name
    }));
    return (r.items || []).find(i => i.dataProductItem?.name === name)?.dataProductItem || null;
};

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  c3l-NextLevelInsights | DataZone Auto-Publish (6 products)');
    console.log(`  Domain: ${DOMAIN_ID} | Project: ${PROJECT_ID}`);
    if (DRY_RUN) console.log('  *** DRY RUN — no changes will be made ***');
    console.log('══════════════════════════════════════════════════════════════\n');

    // Step 1 — trigger sync
    console.log('── Step 1: Trigger DataZone data source sync ───────────────');
    let runId;
    if (!DRY_RUN) {
        const r = await dz.send(new StartDataSourceRunCommand({
            domainIdentifier: DOMAIN_ID,
            dataSourceIdentifier: DS_ID
        }));
        runId = r.id;
        log('✅', `Sync run started: ${runId}`);

        // Step 2 — wait
        console.log('\n── Step 2: Waiting for sync to complete ────────────────────');
        const result = await waitForRun(runId);
        const st = result.runStatisticsForAssets || {};
        log('✅', `Sync done → added:${st.added || 0} updated:${st.updated || 0} unchanged:${st.unchanged || 0} failed:${st.failed || 0}`);
    } else {
        log('🔵', 'DRY RUN: skip sync');
    }

    // Step 3 — create data products
    console.log('\n── Step 3: Create DataZone data products ───────────────────');
    const summary = [];

    for (const cfg of DATA_PRODUCTS) {
        console.log(`\n  ▶ ${cfg.productName}`);

        const asset = await findAsset(cfg.searchText);
        if (!asset) {
            log('⚠️ ', `Asset not found for "${cfg.searchText}" — run Glue crawler first`);
            summary.push({ ...cfg, status: 'no_asset', productId: null });
            continue;
        }
        log('📋', `Asset: ${asset.name} (id: ${asset.identifier})`);

        const existing = await findExistingProduct(cfg.productName);
        if (existing) {
            log('⏭️ ', `Already exists (id: ${existing.id}) — skipping`);
            summary.push({ ...cfg, status: 'already_exists', productId: existing.id });
            continue;
        }

        if (DRY_RUN) {
            log('🔵', `Would create from asset ${asset.identifier}`);
            summary.push({ ...cfg, status: 'dry_run', productId: null });
            continue;
        }

        const created = await dz.send(new CreateDataProductCommand({
            domainIdentifier: DOMAIN_ID,
            owningProjectIdentifier: PROJECT_ID,
            name: cfg.productName,
            description: cfg.description,
            items: [{ identifier: asset.identifier, itemType: 'ASSET', revision: String(asset.revision || '1') }]
        }));
        log('✅', `CREATED: ${cfg.productName} (id: ${created.id})`);
        summary.push({ ...cfg, status: created.status, productId: created.id });

        // Write DynamoDB publish log
        await dynamo.send(new PutCommand({
            TableName: DDB_TABLE,
            Item: {
                sync_id: uuidv4(), timestamp: new Date().toISOString(),
                user_id: 'system', device_type: 'whoop', data_type: cfg.dataType,
                s3_path: '', data_stage: 'raw', record_count: 0,
                datazone_product_id: cfg.productName,
                status: 'published', error_message: null
            }
        }));
        log('📝', `DynamoDB log written for ${cfg.dataType}`);
    }

    // Summary
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  PUBLISH SUMMARY');
    console.log('  ──────────────────────────────────────────────────────────');
    for (const r of summary) {
        const icon = r.status === 'CREATED' ? '✅' : r.status === 'already_exists' ? '⏭️ ' : r.status === 'no_asset' ? '⚠️ ' : '🔵';
        const pid = r.productId ? ` (id: ${r.productId})` : '';
        console.log(`  ${icon} ${r.productName.padEnd(42)} ${r.status}${pid}`);
    }
    console.log('\n  Portal: https://dzd-cv79bbxiotkqsi.datazone.ap-southeast-2.on.aws/');
    console.log('══════════════════════════════════════════════════════════════\n');

})().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
