/**
 * c3l-nli-UpdateDataZoneAsset
 * ------------------------------------------------------------------
 * Lambda function: Trigger a DataZone data-source sync so the newly
 * crawled Glue table appears / updates in the DataZone catalog.
 *
 * DataZone identifiers (from existing pipeline):
 *   Domain  : dzd-cv79bbxiotkqsi
 *   Project : 62guenc68nuvxe
 *   Data source for raw devices: bpr42x2umdut9e
 *
 * Trigger  : Step Function Task state (after UpdateGluePartition)
 * Runtime  : Node.js 20.x
 * Env vars :
 *   AWS_REGION            - ap-southeast-2
 *   DATAZONE_DOMAIN_ID    - dzd-cv79bbxiotkqsi
 *   DATAZONE_PROJECT_ID   - 62guenc68nuvxe
 *   DATAZONE_DATASOURCE_ID- bpr42x2umdut9e
 * ------------------------------------------------------------------
 */

const { DataZoneClient, StartDataSourceRunCommand, GetDataSourceRunCommand } = require('@aws-sdk/client-datazone');

const dz = new DataZoneClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

const DOMAIN_ID = process.env.DATAZONE_DOMAIN_ID || 'dzd-cv79bbxiotkqsi';
const DATASOURCE_ID = process.env.DATAZONE_DATASOURCE_ID || 'bpr42x2umdut9e';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} event - output from c3l-nli-UpdateGluePartition
 * @param {string} event.student_id
 * @param {string} event.domain
 * @param {string} event.device_type
 * @param {string} event.glue_state
 */
exports.handler = async (event) => {
    const { student_id, domain, device_type, glue_state } = event;

    if (glue_state && glue_state !== 'READY' && glue_state !== 'SUCCEEDED') {
        console.warn(`c3l-nli-UpdateDataZoneAsset | Glue crawler finished with state ${glue_state}, proceeding anyway`);
    }

    // Start DataZone data source run
    const runRes = await dz.send(new StartDataSourceRunCommand({
        domainIdentifier: DOMAIN_ID,
        dataSourceIdentifier: DATASOURCE_ID,
    }));

    const runId = runRes.id;
    console.log(`c3l-nli-UpdateDataZoneAsset | DataZone run started: ${runId}`);

    // Poll up to 5 minutes for completion
    const maxWaitMs = 5 * 60 * 1000;
    const pollMs = 20_000;
    const startedAt = Date.now();
    let status = runRes.status;
    let stats = {};

    while (Date.now() - startedAt < maxWaitMs && !['SUCCEEDED', 'FAILED', 'PARTIALLY_SUCCEEDED'].includes(status)) {
        await sleep(pollMs);
        const check = await dz.send(new GetDataSourceRunCommand({
            domainIdentifier: DOMAIN_ID,
            identifier: runId,
        }));
        status = check.status;
        stats = check.runStatisticsForAssets || {};
        console.log(`c3l-nli-UpdateDataZoneAsset | run=${runId} status=${status}`, stats);
    }

    return {
        ...event,
        datazone_run_id: runId,
        datazone_status: status,
        datazone_stats: stats,
        datazone_updated_at: new Date().toISOString(),
    };
};
