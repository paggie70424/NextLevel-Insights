# c3l-NextLevelInsights — Whoop Data Pipeline
## Step-by-Step Documentation

---

## Architecture Overview

```
User clicks "Connect Whoop" in app
         │
         ▼
[1] Whoop OAuth2 → Node.js backend (server.js)
    ├── GET /v2/recovery   → recoveryRes
    └── GET /v2/activity/sleep → sleepRes
         │
         ▼
[2] S3 Upload (profile: c3l-analytics)
    ├── raw/whoop/recovery/YYYY/MM/DD/<userId>_recovery.json
    └── raw/whoop/sleep/YYYY/MM/DD/<userId>_sleep.json
         │
         ▼
[3] DynamoDB (profile: c3l-analytics)
    ├── c3l-NextLevelInsights-DataSyncLogs  ← 1 row per upload
    └── c3l-NextLevelInsights-UserDevicePermissions
         │
         ▼
[4] Glue Crawler (scheduled / manual trigger)
    └── Crawls s3://c3l-nextlevelinsights-data-lake/raw/whoop/
        → updates Glue catalog: c3l_nli_raw_devices
         │
         ▼
[5] DataZone — Separate Data Products
    ├── c3l-nli_whoop_dev_raw_recovery  ← Recovery data product
    └── c3l-nli_whoop_dev_raw_sleep     ← Sleep data product
```

---

## Step 1 — Whoop API Endpoints

| Data Type | Endpoint | Auth |
|-----------|----------|------|
| Recovery | `GET https://api.prod.whoop.com/developer/v2/recovery` | Bearer token |
| Sleep | `GET https://api.prod.whoop.com/developer/v2/activity/sleep` | Bearer token |

**Query params used:**
```
?start=<ISO8601>&end=<ISO8601>&limit=25&nextToken=<cursor>
```

---

## Step 2 — S3 Upload Structure

**Bucket:** `c3l-nextlevelinsights-data-lake`
**AWS Account:** `184898280326`
**AWS Profile (local):** `c3l-analytics`
**Region:** `ap-southeast-2`

### Folder Layout
```
s3://c3l-nextlevelinsights-data-lake/
└── raw/
    └── whoop/
        ├── recovery/
        │   └── 2026/02/26/
        │       └── 12922709_recovery.json
        └── sleep/
            └── 2026/02/26/
                └── 12922709_sleep.json
```

### File Schema — Recovery JSON
```json
{
  "meta": {
    "user_id": "12922709",
    "synced_at": "2026-02-26T06:00:00.000Z",
    "source": "whoop-api-v2"
  },
  "user_profile": { "user_id": 12922709, "email": "..." },
  "records": [
    {
      "cycle_id": 1313767869,
      "sleep_id": "a564d051-...",
      "score_state": "SCORED",
      "score": {
        "recovery_score": 13,
        "resting_heart_rate": 67,
        "hrv_rmssd_milli": 31.31,
        "spo2_percentage": 96.5,
        "skin_temp_celsius": 34.74
      }
    }
  ]
}
```

### File Schema — Sleep JSON
```json
{
  "meta": {
    "user_id": "12922709",
    "synced_at": "2026-02-26T06:00:00.000Z",
    "source": "whoop-api-v2"
  },
  "user_profile": { "user_id": 12922709, "email": "..." },
  "records": [
    {
      "id": "a564d051-...",
      "start": "2026-02-15T16:45:35.720Z",
      "end": "2026-02-15T20:46:06.430Z",
      "nap": false,
      "score": {
        "sleep_performance_percentage": 39,
        "sleep_efficiency_percentage": 90.62,
        "respiratory_rate": 17.17,
        "stage_summary": {
          "total_rem_sleep_time_milli": 2703190,
          "total_slow_wave_sleep_time_milli": 5703330,
          "total_light_sleep_time_milli": 4671170,
          "total_awake_time_milli": 1353020
        }
      }
    }
  ]
}
```

### Verify Upload (CLI)
```bash
# List today's recovery files
aws s3 ls s3://c3l-nextlevelinsights-data-lake/raw/whoop/recovery/ \
  --recursive --profile c3l-analytics

# Download and inspect a file
aws s3 cp s3://c3l-nextlevelinsights-data-lake/raw/whoop/recovery/2026/02/26/12922709_recovery.json \
  /tmp/check_recovery.json --profile c3l-analytics
cat /tmp/check_recovery.json | python3 -m json.tool | head -30
```

---

## Step 3 — DynamoDB

**Account:** `184898280326` | **Region:** `ap-southeast-2` | **Profile:** `c3l-analytics`

### Table: `c3l-NextLevelInsights-DataSyncLogs`
One row written per data type per sync.

| Attribute | Type | Example |
|-----------|------|---------|
| `sync_id` | String (PK) | UUID |
| `timestamp` | String (SK) | `"2026-02-26T06:00:00.000Z"` |
| `user_id` | String | `"12922709"` |
| `device_type` | String | `"whoop"` |
| `data_type` | String | `"recovery"` or `"sleep"` |
| `s3_path` | String | `"s3://c3l-nextlevelinsights-data-lake/raw/whoop/recovery/..."` |
| `data_stage` | String | `"raw"` |
| `record_count` | Number | `19` |
| `datazone_product_id` | String | `"c3l-nli_whoop_dev_raw_recovery"` |
| `status` | String | `"success"` or `"failed"` |

**IAM Role used by Node.js backend:**
Local credentials via `c3l-analytics` AWS profile
(`~/.aws/credentials` → `[c3l-analytics]` → `AWSReservedSSO_AWSAdministratorAccess`)

### Verify Records (CLI)
```bash
# View recent sync logs for user 12922709
aws dynamodb query \
  --table-name c3l-NextLevelInsights-DataSyncLogs \
  --index-name user_id-index \
  --key-condition-expression "user_id = :uid" \
  --expression-attribute-values '{":uid":{"S":"12922709"}}' \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'Items[*].{dt:data_type.S,s3:s3_path.S,status:status.S,count:record_count.N}'
```

> **Note:** If the GSI doesn't exist yet, use a Scan:
> ```bash
> aws dynamodb scan \
>   --table-name c3l-NextLevelInsights-DataSyncLogs \
>   --filter-expression "user_id = :uid" \
>   --expression-attribute-values '{":uid":{"S":"12922709"}}' \
>   --region ap-southeast-2 --profile c3l-analytics
> ```

---

## Step 4 — AWS Glue Crawler

**Purpose:** Auto-detect schema from S3 JSON files → update `c3l_nli_raw_devices` Glue catalog → available in DataZone.

**IAM Role used:** `c3l-engageai-glue-crawler-anl` (account `184898280326`)
> This role has the Glue service trust policy. The `c3l-NextLevelInsights-datazone-role` is for DataZone only.

### 4a. Create Crawler for Recovery
```bash
aws glue create-crawler \
  --name "c3l-nli-whoop-recovery-crawler" \
  --role "arn:aws:iam::184898280326:role/c3l-NextLevelInsights-datazone-role" \
  --database-name "c3l_nli_raw_devices" \
  --targets '{"S3Targets":[{"Path":"s3://c3l-nextlevelinsights-data-lake/raw/whoop/recovery/"}]}' \
  --schema-change-policy '{"UpdateBehavior":"UPDATE_IN_DATABASE","DeleteBehavior":"LOG"}' \
  --configuration '{"Version":1.0,"CrawlerOutput":{"Partitions":{"AddOrUpdateBehavior":"InheritFromTable"},"Tables":{"AddOrUpdateBehavior":"MergeNewColumns"}}}' \
  --table-prefix "whoop_recovery_" \
  --region ap-southeast-2 \
  --profile c3l-analytics 2>&1
```

### 4b. Create Crawler for Sleep
```bash
aws glue create-crawler \
  --name "c3l-nli-whoop-sleep-crawler" \
  --role "arn:aws:iam::184898280326:role/c3l-NextLevelInsights-datazone-role" \
  --database-name "c3l_nli_raw_devices" \
  --targets '{"S3Targets":[{"Path":"s3://c3l-nextlevelinsights-data-lake/raw/whoop/sleep/"}]}' \
  --schema-change-policy '{"UpdateBehavior":"UPDATE_IN_DATABASE","DeleteBehavior":"LOG"}' \
  --configuration '{"Version":1.0,"CrawlerOutput":{"Partitions":{"AddOrUpdateBehavior":"InheritFromTable"},"Tables":{"AddOrUpdateBehavior":"MergeNewColumns"}}}' \
  --table-prefix "whoop_sleep_" \
  --region ap-southeast-2 \
  --profile c3l-analytics 2>&1
```

### 4c. Run Crawlers Manually (first time)
```bash
# Start recovery crawler
aws glue start-crawler \
  --name "c3l-nli-whoop-recovery-crawler" \
  --region ap-southeast-2 --profile c3l-analytics

# Start sleep crawler
aws glue start-crawler \
  --name "c3l-nli-whoop-sleep-crawler" \
  --region ap-southeast-2 --profile c3l-analytics

# Check status (wait a minute then run this)
aws glue get-crawler \
  --name "c3l-nli-whoop-recovery-crawler" \
  --region ap-southeast-2 --profile c3l-analytics \
  --query '{state:Crawler.State,lastRun:Crawler.LastCrawl}'
```

### 4d. Schedule Crawlers (daily at 2am AEST)
```bash
aws glue update-crawler \
  --name "c3l-nli-whoop-recovery-crawler" \
  --schedule "cron(0 15 * * ? *)" \
  --region ap-southeast-2 --profile c3l-analytics

aws glue update-crawler \
  --name "c3l-nli-whoop-sleep-crawler" \
  --schedule "cron(0 15 * * ? *)" \
  --region ap-southeast-2 --profile c3l-analytics
```
> `cron(0 15 * * ? *)` = 15:00 UTC = 01:30 ACST / 02:00 AEST

### 4e. Verify Tables Created in Glue
```bash
aws glue get-tables \
  --database-name "c3l_nli_raw_devices" \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'TableList[*].{name:Name,location:StorageDescriptor.Location}' \
  --output table
```
You should see `whoop_recovery_raw` and `whoop_sleep_raw` tables.

---

## Step 5 — DataZone Data Product Registration

**Domain:** `c3l-NextLevelInsights-domain` (`dzd-cv79bbxiotkqsi`)
**Project:** `c3l-NextLevelInsights-project` (`62guenc68nuvxe`)
**Environment:** `c3l-NLI-Dev` (`5108vq94748m8y`)
**Data Source (already READY):** `c3l-nli-raw-devices-datasource` (`bpr42x2umdut9e`)

### 5a. Run the Data Source Sync (after crawler populates Glue)
```bash
# Trigger a sync run on the raw devices data source
aws datazone start-data-source-run \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --data-source-identifier bpr42x2umdut9e \
  --region ap-southeast-2 \
  --profile c3l-analytics \
  --query '{id:id,status:status}' 2>&1

# Check sync status
aws datazone list-data-source-runs \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --data-source-identifier bpr42x2umdut9e \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'items[0].{status:status,errorMessage:errorMessage}' 2>&1
```

### 5b. List Discovered Assets (after sync completes)
```bash
aws datazone list-asset-revisions \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --identifier <asset-id> \
  --region ap-southeast-2 --profile c3l-analytics 2>&1

# Or search for whoop assets
aws datazone search \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --search-scope ASSET \
  --search-text "whoop" \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'items[*].assetItem.{name:name,id:identifier}' 2>&1
```

### 5c. Data Products — One per Data Type

> **Key design decision:** We publish SEPARATE data products per data type, not the whole `raw/whoop/` folder as one product.

| Product Name | Glue Table | S3 Path | DataZone Product ID |
|-------------|-----------|---------|---------------------|
| `c3l-nli_whoop_dev_raw_recovery` | `whoop_recovery_raw` | `raw/whoop/recovery/` | `c3l-nli_whoop_dev_raw_recovery` |
| `c3l-nli_whoop_dev_raw_sleep` | `whoop_sleep_raw` | `raw/whoop/sleep/` | `c3l-nli_whoop_dev_raw_sleep` |

### 5d. Create Data Products via DataZone Portal
Once the data source sync completes, the Glue tables become assets in DataZone. Publish them as data products through the portal:

1. Open: https://dzd-cv79bbxiotkqsi.datazone.ap-southeast-2.on.aws/
2. Navigate to **c3l-NextLevelInsights-project** → **Catalog**
3. Find asset `whoop_recovery_raw` → click **Publish as Data Product**
   - Name: `c3l-nli_whoop_dev_raw_recovery`
   - Description: "WHOOP recovery scores: resting HR, HRV, SpO2, skin temp — c3l-NextLevelInsights"
4. Find asset `whoop_sleep_raw` → click **Publish as Data Product**
   - Name: `c3l-nli_whoop_dev_raw_sleep`
   - Description: "WHOOP sleep stages, performance %, efficiency %, respiratory rate — c3l-NextLevelInsights"

---

## IAM Roles Summary

| Step | Where | Role / Profile | Account |
|------|-------|----------------|---------|
| S3 Upload | Node.js backend | `c3l-analytics` local profile | `184898280326` |
| DynamoDB Write | Node.js backend | `c3l-analytics` local profile | `184898280326` |
| Glue Crawler | AWS Glue service | `c3l-NextLevelInsights-datazone-role` | `184898280326` |
| DataZone Sync | DataZone service | `c3l-NextLevelInsights-datazone-role` | `184898280326` |
| DataZone Admin | CLI commands | `c3l-analytics` local profile | `184898280326` |

---

## Quick Start — End-to-End Test

```bash
# 1. Start backend
cd backend && node server.js

# 2. Connect Whoop via the app UI (or hit the auth URL directly)
# → This automatically uploads recovery + sleep to S3 and writes DynamoDB logs

# 3. Verify S3 uploads
aws s3 ls s3://c3l-nextlevelinsights-data-lake/raw/whoop/ \
  --recursive --human-readable --profile c3l-analytics

# 4. Run Glue crawlers
aws glue start-crawler --name c3l-nli-whoop-recovery-crawler \
  --region ap-southeast-2 --profile c3l-analytics
aws glue start-crawler --name c3l-nli-whoop-sleep-crawler \
  --region ap-southeast-2 --profile c3l-analytics

# 5. Trigger DataZone data source sync
aws datazone start-data-source-run \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --data-source-identifier bpr42x2umdut9e \
  --region ap-southeast-2 --profile c3l-analytics

# 6. Publish assets as data products via the DataZone portal
# https://dzd-cv79bbxiotkqsi.datazone.ap-southeast-2.on.aws/
```
