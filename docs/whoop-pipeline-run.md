# c3l-NextLevelInsights — Whoop Pipeline: End-to-End Run Log

> **Run date:** 2026-02-26 | **User:** 12922709 | **AWS Profile:** `c3l-analytics` (account `184898280326`)

---

## Pipeline Overview

```
User clicks "Connect Whoop"
        │
        ▼ OAuth → Backend Node.js (server.js)
[1] Whoop API fetch (recovery + sleep)
        │
        ▼
[2] S3 Upload          ← raw/whoop/recovery/... & raw/whoop/sleep/...
        │
        ▼
[3] DynamoDB Log        ← c3l-NextLevelInsights-DataSyncLogs
        │
        ▼
[4] Glue Crawlers       ← c3l-nli-whoop-recovery-crawler / sleep-crawler
        │
        ▼
[5] DataZone Sync       ← c3l-nli-raw-devices-datasource
        │
        ▼
[6] Data Products       ← c3l-nli_whoop_dev_raw_recovery / sleep  [MANUAL via portal]
```

---

## Step 1 — Whoop API & OAuth Flow

> **Note:** Browser automation is not available on macOS. The OAuth flow runs when you click "Connect" in the app UI. For CLI testing, use the existing local Whoop data.

**Whoop OAuth endpoints:**
```
GET  https://api.prod.whoop.com/oauth/oauth2/auth    ← redirect user to this
POST https://api.prod.whoop.com/oauth/oauth2/token   ← exchange code for token
```

**Data APIs fetched after token exchange:**
| API | Endpoint |
|-----|----------|
| Recovery | `GET /developer/v2/recovery?start=...&end=...&limit=25` |
| Sleep | `GET /developer/v2/activity/sleep?start=...&end=...&limit=25` |

**Result from real run:**
- User ID: `12922709`
- Recovery records: **19**
- Sleep records: **20**
- Source file: `2026-02-19T04-15-11-447Z_whoop_data.json`

---

## Step 2 — S3 Upload ✅

**Bucket:** `c3l-nextlevelinsights-data-lake`
**Profile:** `c3l-analytics`

### Recovery
```
s3://c3l-nextlevelinsights-data-lake/raw/whoop/recovery/2026/02/19/12922709_recovery.json
```
- Records: 19
- Status: ✅ **SUCCESS**

### Sleep
```
s3://c3l-nextlevelinsights-data-lake/raw/whoop/sleep/2026/02/19/12922709_sleep.json
```
- Records: 20
- Status: ✅ **SUCCESS**

**Verify anytime:**
```bash
aws s3 ls s3://c3l-nextlevelinsights-data-lake/raw/whoop/ \
  --recursive --human-readable --profile c3l-analytics
```

---

## Step 3 — DynamoDB Sync Logs ✅

> **Note:** Tables must be in the `c3l-analytics` account (184898280326), not the Engage AI account. Created fresh for this account.

**Tables created in account 184898280326:**
```bash
# Already created — verify:
aws dynamodb list-tables --region ap-southeast-2 --profile c3l-analytics \
  --query 'TableNames[?contains(@, `NextLevelInsights`)]'
```

**Two log items written:**
| sync_id | device | data_type | records | s3_path | datazone_product_id | status |
|---------|--------|-----------|---------|---------|---------------------|--------|
| uuid | whoop | recovery | 19 | `s3://...recovery/...json` | `c3l-nli_whoop_dev_raw_recovery` | success |
| uuid | whoop | sleep | 20 | `s3://...sleep/...json` | `c3l-nli_whoop_dev_raw_sleep` | success |

**Verify:**
```bash
aws dynamodb scan \
  --table-name c3l-NextLevelInsights-DataSyncLogs \
  --filter-expression "user_id = :uid" \
  --expression-attribute-values '{":uid":{"S":"12922709"}}' \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'Items[*].{dt:data_type.S,s3:s3_path.S,status:status.S,count:record_count.N}'
```

---

## Step 4 — Glue Crawlers ✅

### Setup (one-time)

**IAM Role:** `arn:aws:iam::184898280326:role/c3l-engageai-glue-crawler-anl`

> ⚠️ **Lake Formation permissions required** — must grant these before crawlers can create tables:
```bash
GLUE_ROLE="arn:aws:iam::184898280326:role/c3l-engageai-glue-crawler-anl"

# Grant CREATE_TABLE on database
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier="$GLUE_ROLE" \
  --resource '{"Database":{"Name":"c3l_nli_raw_devices"}}' \
  --permissions "CREATE_TABLE" "DESCRIBE" \
  --region ap-southeast-2 --profile c3l-analytics

# Grant ALL on tables (wildcard)
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier="$GLUE_ROLE" \
  --resource '{"Table":{"DatabaseName":"c3l_nli_raw_devices","TableWildcard":{}}}' \
  --permissions "ALL" \
  --region ap-southeast-2 --profile c3l-analytics
```

### Crawlers (already created)
| Crawler | S3 Target | Table Prefix |
|---------|-----------|--------------|
| `c3l-nli-whoop-recovery-crawler` | `raw/whoop/recovery/` | `whoop_recovery_` |
| `c3l-nli-whoop-sleep-crawler` | `raw/whoop/sleep/` | `whoop_sleep_` |

### Run Crawlers
```bash
aws glue start-crawler --name c3l-nli-whoop-recovery-crawler \
  --region ap-southeast-2 --profile c3l-analytics
aws glue start-crawler --name c3l-nli-whoop-sleep-crawler \
  --region ap-southeast-2 --profile c3l-analytics

# Check status
aws glue get-crawler --name c3l-nli-whoop-recovery-crawler \
  --region ap-southeast-2 --profile c3l-analytics \
  --query '{state:Crawler.State,status:Crawler.LastCrawl.Status,added:Crawler.LastCrawl.TablesAdded}'
```

### Result from run
| Crawler | Status | Tables |
|---------|--------|--------|
| recovery | ✅ SUCCEEDED | `whoop_recovery_recovery` |
| sleep | ✅ SUCCEEDED | `whoop_sleep_sleep` |

**Glue tables created:**
| Table | S3 Location | Format |
|-------|-------------|--------|
| `whoop_recovery_recovery` | `s3://c3l-nextlevelinsights-data-lake/raw/whoop/recovery/` | JSON (TextInputFormat) |
| `whoop_sleep_sleep` | `s3://c3l-nextlevelinsights-data-lake/raw/whoop/sleep/` | JSON (TextInputFormat) |

**Verify:**
```bash
aws glue get-tables --database-name c3l_nli_raw_devices \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'TableList[*].{table:Name,s3:StorageDescriptor.Location}' --output table
```

---

## Step 5 — DataZone Data Source Sync ✅

**Domain:** `c3l-NextLevelInsights-domain` (`dzd-cv79bbxiotkqsi`)
**Project:** `c3l-NextLevelInsights-project` (`62guenc68nuvxe`)
**Data Source:** `c3l-nli-raw-devices-datasource` (`bpr42x2umdut9e`)

### Trigger Sync
```bash
aws datazone start-data-source-run \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --data-source-identifier bpr42x2umdut9e \
  --region ap-southeast-2 --profile c3l-analytics \
  --query '{id:id,status:status}'
```

**Run triggered:** ID `cavufenrogbpr6` | Status: `REQUESTED` ✅

### Check Sync Status
```bash
aws datazone list-data-source-runs \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --data-source-identifier bpr42x2umdut9e \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'items[0].{status:status,started:createdAt,error:errorMessage}'
```

### Check Discovered Assets
```bash
aws datazone search \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --search-scope ASSET \
  --search-text "whoop" \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'items[*].assetItem.{name:name,id:identifier}' 2>&1
```

---

## Step 6 — Publish Data Products (Manual via Portal)

After the DataZone sync discovers the Glue tables as assets, publish them as separate data products:

1. Open: https://dzd-cv79bbxiotkqsi.datazone.ap-southeast-2.on.aws/
2. Navigate to **c3l-NextLevelInsights-project** → **Catalog**
3. Find `whoop_recovery_recovery` → **Publish as Data Product**
   - **Name:** `c3l-nli_whoop_dev_raw_recovery`
   - **Description:** "WHOOP recovery scores: resting HR, HRV, SpO2, skin temp. 19 records/user/sync."
4. Find `whoop_sleep_sleep` → **Publish as Data Product**
   - **Name:** `c3l-nli_whoop_dev_raw_sleep`
   - **Description:** "WHOOP sleep stages, efficiency %, respiratory rate. 20 records/user/sync."

---

## Full Pipeline — One-Command Re-Run

After the first setup (LF permissions + crawlers already done), re-running the whole pipeline takes:

```bash
# 1. Upload data to S3 + log to DynamoDB
cd /path/to/backend && node run-whoop-pipeline.js

# 2. Re-crawl new data
aws glue start-crawler --name c3l-nli-whoop-recovery-crawler \
  --region ap-southeast-2 --profile c3l-analytics
aws glue start-crawler --name c3l-nli-whoop-sleep-crawler \
  --region ap-southeast-2 --profile c3l-analytics

# 3. Re-sync DataZone (after crawlers finish)
aws datazone start-data-source-run \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --data-source-identifier bpr42x2umdut9e \
  --region ap-southeast-2 --profile c3l-analytics
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| DynamoDB `ResourceNotFoundException` | Tables in wrong account | Create tables with `--profile c3l-analytics` |
| Glue crawler `AccessDeniedException` | Missing LF CREATE_TABLE | Grant permissions (see Step 4 above) |
| S3 upload `NoCredentialError` | Wrong profile | Check `~/.aws/credentials` for `[c3l-analytics]` |
| DataZone sync finds no assets | Crawlers not run yet | Run crawlers first, wait for SUCCEEDED |
