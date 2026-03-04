/**
 * c3l-nli-UpdateGluePartition
 * ------------------------------------------------------------------
 * Lambda function: Start the relevant AWS Glue crawler for the
 * newly ingested data partition and wait for completion.
 *
 * Crawler naming convention:
 *   c3l-nli-<domain>-<device_type>-crawler
 *   e.g. c3l-nli-health-whoop-crawler
 *        c3l-nli-academic-canvas_lms-crawler
 *
 * Trigger  : Step Function Task state (after Normalize)
 * Runtime  : Node.js 20.x
 * Env vars :
 *   AWS_REGION    - ap-southeast-2
 *   GLUE_DATABASE - c3l_nli_raw_devices
 *   GLUE_ROLE     - arn:aws:iam::184898280326:role/c3l-engageai-glue-crawler-anl
 *   RAW_BUCKET    - c3l-nextlevelinsights-data-lake
 * ------------------------------------------------------------------
 */

const { GlueClient, StartCrawlerCommand, GetCrawlerCommand, CreateCrawlerCommand } = require('@aws-sdk/client-glue');

const glue = new GlueClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const GLUE_DB = process.env.GLUE_DATABASE || 'c3l_nli_raw_devices';
const GLUE_ROLE = process.env.GLUE_ROLE || 'arn:aws:iam::184898280326:role/c3l-engageai-glue-crawler-anl';
const RAW_BUCKET = process.env.RAW_BUCKET || 'c3l-nextlevelinsights-data-lake';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function crawlerName(domain, device_type) {
    return `c3l-nli-${domain}-${device_type}-crawler`;
}

async function ensureCrawlerExists(name, domain, device_type) {
    try {
        await glue.send(new GetCrawlerCommand({ Name: name }));
        // Crawler already exists
        return;
    } catch (err) {
        if (err.name !== 'EntityNotFoundException') throw err;
    }

    // Crawler does not exist — create it
    const s3Path = `s3://${RAW_BUCKET}/raw/domain=${domain}/device_type=${device_type}/`;
    await glue.send(new CreateCrawlerCommand({
        Name: name,
        Role: GLUE_ROLE,
        DatabaseName: GLUE_DB,
        Targets: { S3Targets: [{ Path: s3Path }] },
        SchemaChangePolicy: {
            UpdateBehavior: 'UPDATE_IN_DATABASE',
            DeleteBehavior: 'LOG',
        },
        TablePrefix: `${domain}_${device_type}_`,
    }));
    console.log(`c3l-nli-UpdateGluePartition | Created crawler: ${name} → ${s3Path}`);
}

/**
 * @param {object} event - output from NormalizeHealth / NormalizeAcademic
 * @param {string} event.student_id
 * @param {string} event.device_type
 * @param {string} event.domain        - health | academic
 * @param {string} event.s3_processed_key
 */
exports.handler = async (event) => {
    const { student_id, device_type, domain } = event;

    const name = crawlerName(domain, device_type);

    await ensureCrawlerExists(name, domain, device_type);

    // Start crawler
    try {
        await glue.send(new StartCrawlerCommand({ Name: name }));
        console.log(`c3l-nli-UpdateGluePartition | Started crawler: ${name}`);
    } catch (err) {
        // CrawlerRunningException means it's already running — that's fine
        if (err.name !== 'CrawlerRunningException') throw err;
        console.log(`c3l-nli-UpdateGluePartition | Crawler already running: ${name}`);
    }

    // Poll every 15s, up to 3 minutes
    const maxWaitMs = 3 * 60 * 1000;
    const pollMs = 15_000;
    const startedAt = Date.now();
    let finalState = 'RUNNING';

    while (Date.now() - startedAt < maxWaitMs) {
        await sleep(pollMs);
        const res = await glue.send(new GetCrawlerCommand({ Name: name }));
        finalState = res.Crawler.State;
        console.log(`c3l-nli-UpdateGluePartition | ${name} state=${finalState}`);
        if (finalState !== 'RUNNING') break;
    }

    return {
        ...event,
        glue_crawler: name,
        glue_state: finalState,
        glue_updated_at: new Date().toISOString(),
    };
};
