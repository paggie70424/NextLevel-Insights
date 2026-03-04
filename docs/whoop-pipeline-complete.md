# c3l-NextLevelInsights — Whoop Full Pipeline: All 6 Data Types

> **Run date:** 2026-02-26 | **AWS Account:** `184898280326` | **Profile:** `c3l-analytics` | **Region:** `ap-southeast-2`

---

## Architecture — All 6 Whoop API Scopes

```
User clicks "Connect Whoop"
         │  OAuth2 (6 scopes requested)
         ▼
[1] Whoop API — 6 endpoints fetched
    ├── read:recovery      GET /v2/recovery
    ├── read:sleep         GET /v2/activity/sleep
    ├── read:cycles        GET /v2/cycle
    ├── read:workout       GET /v2/activity/workout
    ├── read:profile       GET /v1/user/profile/basic
    └── read:body_measurement  GET /v1/user/measurement/body
         │
         ▼
[2] Amazon S3  (c3l-nextlevelinsights-data-lake)
    raw/whoop/recovery/YYYY/MM/DD/<userId>_recovery.json        ✅
    raw/whoop/sleep/YYYY/MM/DD/<userId>_sleep.json              ✅
    raw/whoop/cycles/YYYY/MM/DD/<userId>_cycles.json            ✅
    raw/whoop/workout/YYYY/MM/DD/<userId>_workout.json          ✅
    raw/whoop/profile/YYYY/MM/DD/<userId>_profile.json          ✅
    raw/whoop/body_measurement/YYYY/MM/DD/<userId>_body.json    ✅
         │
         ▼
[3] Amazon DynamoDB  (c3l-NextLevelInsights-DataSyncLogs)
    6 rows written — one per data type per sync                  ✅
         │
         ▼
[4] AWS Glue Crawlers  (6 crawlers — all SUCCEEDED)
    c3l_nli_raw_devices Glue DB:
    ├── whoop_recovery_recovery                                   ✅
    ├── whoop_sleep_sleep                                         ✅
    ├── whoop_cycles_cycles                                       ✅
    ├── whoop_workout_workout                                     ✅
    ├── whoop_profile_profile                                     ✅
    └── whoop_body_measurement_body_measurement                   ✅
         │
         ▼
[5] DataZone Sync  (c3l-nli-raw-devices-datasource)
    Run 650k8ev34jbyjm → added:4 updated:2 failed:0             ✅
         │
         ▼
[6] DataZone Data Products (6 separate products)
    ├── c3l-nli_whoop_dev_raw_recovery       id: 6hqn3g0y79j3fm  ✅
    ├── c3l-nli_whoop_dev_raw_sleep          id: 3x0ab1gwetmf1e  ✅
    ├── c3l-nli_whoop_dev_raw_cycles         id: bgl3cpifkirzc2  ✅
    ├── c3l-nli_whoop_dev_raw_workout        id: 4nmviarruy9ew2  ✅
    ├── c3l-nli_whoop_dev_raw_profile        id: c53depjoepc6qq  ✅
    └── c3l-nli_whoop_dev_raw_body_measurement id: cqjheigpue2v1e ✅
```

**DataZone portal:** https://dzd-cv79bbxiotkqsi.datazone.ap-southeast-2.on.aws/

---

## Step 1 — Whoop API Endpoints & Scopes

| Scope | Endpoint | Data | Records |
|-------|----------|------|---------|
| `read:recovery` | `GET /developer/v2/recovery` | Recovery score, HRV, RHR, SpO2, skin temp | 19 |
| `read:sleep` | `GET /developer/v2/activity/sleep` | Sleep stages, performance%, efficiency%, respiratory rate | 20 |
| `read:cycles` | `GET /developer/v2/cycle` | Day strain, kilojoule, avg/max heart rate | 25 |
| `read:workout` | `GET /developer/v2/activity/workout` | Sport, strain, kilojoule, HR zones | 25 |
| `read:profile` | `GET /developer/v1/user/profile/basic` | user_id, email, first/last name | 1 |
| `read:body_measurement` | `GET /developer/v1/user/measurement/body` | height_meter, weight_kg, max_heart_rate | 1 |

**Query params for collection endpoints:**
```
?start=<ISO8601_30days_ago>&end=<ISO8601_now>&limit=25
```

---

## Step 2 — S3 Upload

**Bucket:** `c3l-nextlevelinsights-data-lake`  
**AWS client:** `fromIni({ profile: 'c3l-analytics' })` — automatically used in `server.js`

### S3 Key Structure
```
raw/whoop/<data_type>/YYYY/MM/DD/<userId>_<data_type>.json
```

### Payload Format (all types)
```json
{
  "meta": {
    "user_id": "12922709",
    "synced_at": "2026-02-26T08:07:39.366Z",
    "source": "whoop-api-v2"
  },
  "user_profile": { "user_id": 12922709, "email": "..." },
  "records": [ ...type-specific records... ]
}
```
> **Note:** `profile` and `body_measurement` spread their fields directly (no `records` array).

### How code works (server.js)
```javascript
// All 6 types defined as a loop — new types can be added here:
const uploads = [
    { dataType: 'recovery',         s3Key: `raw/whoop/recovery/${yr}/${mo}/${dy}/...`,         count: recoveryRes?.records?.length },
    { dataType: 'sleep',            s3Key: `raw/whoop/sleep/...`,                               count: sleepRes?.records?.length },
    { dataType: 'cycles',           s3Key: `raw/whoop/cycles/...`,                              count: cycleRes?.records?.length },
    { dataType: 'workout',          s3Key: `raw/whoop/workout/...`,                             count: workoutRes?.records?.length },
    { dataType: 'profile',          s3Key: `raw/whoop/profile/...`,                             count: 1 },
    { dataType: 'body_measurement', s3Key: `raw/whoop/body_measurement/...`,                    count: 1 }
];
for (const u of uploads) {
    const uri = await uploadToS3(u.s3Key, u.payload);
    await writeSyncLog({ userId, dataType: u.dataType, s3Path: uri, count: u.count });
}
```

### Verify S3
```bash
aws s3 ls s3://c3l-nextlevelinsights-data-lake/raw/whoop/ \
  --recursive --human-readable --profile c3l-analytics
```

**Result:**
```
raw/whoop/body_measurement/2026/02/19/12922709_body_measurement.json
raw/whoop/cycles/2026/02/19/12922709_cycles.json
raw/whoop/profile/2026/02/19/12922709_profile.json
raw/whoop/recovery/2026/02/19/12922709_recovery.json
raw/whoop/sleep/2026/02/19/12922709_sleep.json
raw/whoop/workout/2026/02/19/12922709_workout.json
```

---

## Step 3 — DynamoDB Sync Logs

**Table:** `c3l-NextLevelInsights-DataSyncLogs` (account `184898280326`)

### 6 log items written per sync
| data_type | record_count | datazone_product_id | status |
|-----------|-------------|---------------------|--------|
| recovery | 19 | c3l-nli_whoop_dev_raw_recovery | success |
| sleep | 20 | c3l-nli_whoop_dev_raw_sleep | success |
| cycles | 25 | c3l-nli_whoop_dev_raw_cycles | success |
| workout | 25 | c3l-nli_whoop_dev_raw_workout | success |
| profile | 1 | c3l-nli_whoop_dev_raw_profile | success |
| body_measurement | 1 | c3l-nli_whoop_dev_raw_body_measurement | success |

### Verify
```bash
aws dynamodb scan \
  --table-name c3l-NextLevelInsights-DataSyncLogs \
  --filter-expression "user_id = :uid" \
  --expression-attribute-values '{":uid":{"S":"12922709"}}' \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'Items[*].{type:data_type.S,records:record_count.N,status:status.S}' \
  --output table
```

---

## Step 4 — Glue Crawlers

**IAM Role:** `arn:aws:iam::184898280326:role/c3l-engageai-glue-crawler-anl`
**Glue DB:** `c3l_nli_raw_devices`

### Lake Formation Permissions (one-time setup)
```bash
GLUE_ROLE="arn:aws:iam::184898280326:role/c3l-engageai-glue-crawler-anl"

aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier="$GLUE_ROLE" \
  --resource '{"Database":{"Name":"c3l_nli_raw_devices"}}' \
  --permissions "CREATE_TABLE" "DESCRIBE" \
  --region ap-southeast-2 --profile c3l-analytics

aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier="$GLUE_ROLE" \
  --resource '{"Table":{"DatabaseName":"c3l_nli_raw_devices","TableWildcard":{}}}' \
  --permissions "ALL" \
  --region ap-southeast-2 --profile c3l-analytics
```

### Create All 6 Crawlers (one-time)
```bash
GLUE_ROLE="arn:aws:iam::184898280326:role/c3l-engageai-glue-crawler-anl"
BUCKET="s3://c3l-nextlevelinsights-data-lake"

for dtype in recovery sleep cycles workout profile body_measurement; do
  aws glue create-crawler \
    --name "c3l-nli-whoop-${dtype}-crawler" \
    --role "$GLUE_ROLE" \
    --database-name "c3l_nli_raw_devices" \
    --targets "{\"S3Targets\":[{\"Path\":\"${BUCKET}/raw/whoop/${dtype}/\"}]}" \
    --schema-change-policy '{"UpdateBehavior":"UPDATE_IN_DATABASE","DeleteBehavior":"LOG"}' \
    --table-prefix "whoop_${dtype}_" \
    --region ap-southeast-2 --profile c3l-analytics
  echo "✅ $dtype crawler created"
done
```

### Run All 6 Crawlers
```bash
for dtype in recovery sleep cycles workout profile body_measurement; do
  aws glue start-crawler --name "c3l-nli-whoop-${dtype}-crawler" \
    --region ap-southeast-2 --profile c3l-analytics
done

# Check status of all 6
for dtype in recovery sleep cycles workout profile body_measurement; do
  aws glue get-crawler --name "c3l-nli-whoop-${dtype}-crawler" \
    --region ap-southeast-2 --profile c3l-analytics \
    --query "{crawler:Crawler.Name,state:Crawler.State,status:Crawler.LastCrawl.Status}" \
    --output table
done
```

### Glue Tables Created (all 6)
| Crawler | Table | S3 Location |
|---------|-------|-------------|
| c3l-nli-whoop-recovery-crawler | `whoop_recovery_recovery` | `raw/whoop/recovery/` |
| c3l-nli-whoop-sleep-crawler | `whoop_sleep_sleep` | `raw/whoop/sleep/` |
| c3l-nli-whoop-cycles-crawler | `whoop_cycles_cycles` | `raw/whoop/cycles/` |
| c3l-nli-whoop-workout-crawler | `whoop_workout_workout` | `raw/whoop/workout/` |
| c3l-nli-whoop-profile-crawler | `whoop_profile_profile` | `raw/whoop/profile/` |
| c3l-nli-whoop-body_measurement-crawler | `whoop_body_measurement_body_measurement` | `raw/whoop/body_measurement/` |

```bash
# Verify all tables in Glue DB
aws glue get-tables --database-name c3l_nli_raw_devices \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'TableList[?contains(Name,`whoop`)].{table:Name,s3:StorageDescriptor.Location}' \
  --output table
```

---

## Step 5 — DataZone Data Source Sync

```bash
# Trigger sync
aws datazone start-data-source-run \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --data-source-identifier bpr42x2umdut9e \
  --region ap-southeast-2 --profile c3l-analytics \
  --query '{id:id,status:status}'

# Check result
aws datazone list-data-source-runs \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --data-source-identifier bpr42x2umdut9e \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'items[0].{status:status,added:runStatisticsForAssets.added,updated:runStatisticsForAssets.updated}'
```

**Result:** Run `650k8ev34jbyjm` → SUCCESS | added:4, updated:2

---

## Step 6 — DataZone Data Products (Auto-Published)

### Run the auto-publish script
```bash
# Install dependency (one-time)
cd backend && npm install @aws-sdk/client-datazone

# Run (idempotent — safe to re-run, skips existing products)
node backend/publish-datazone-products.js

# Dry run (shows what would be done without making changes)
node backend/publish-datazone-products.js --dry-run
```

### All 6 Data Products
| Product Name | DataZone ID | Whoop Scope | Glue Asset |
|-------------|-------------|-------------|------------|
| `c3l-nli_whoop_dev_raw_recovery` | `6hqn3g0y79j3fm` | read:recovery | whoop_recovery_recovery |
| `c3l-nli_whoop_dev_raw_sleep` | `3x0ab1gwetmf1e` | read:sleep | whoop_sleep_sleep |
| `c3l-nli_whoop_dev_raw_cycles` | `bgl3cpifkirzc2` | read:cycles | whoop_cycles_cycles |
| `c3l-nli_whoop_dev_raw_workout` | `4nmviarruy9ew2` | read:workout | whoop_workout_workout |
| `c3l-nli_whoop_dev_raw_profile` | `c53depjoepc6qq` | read:profile | whoop_profile_profile |
| `c3l-nli_whoop_dev_raw_body_measurement` | `cqjheigpue2v1e` | read:body_measurement | whoop_body_measurement_body_measurement |

### Verify via CLI
```bash
aws datazone search \
  --domain-identifier dzd-cv79bbxiotkqsi \
  --owning-project-identifier 62guenc68nuvxe \
  --search-scope DATA_PRODUCT \
  --search-text "c3l-nli_whoop" \
  --region ap-southeast-2 --profile c3l-analytics \
  --query 'items[*].dataProductItem.{name:name,id:id,status:status}'
```

---

## 🔁 One-Command Re-Run (for each new sync)

```bash
cd /path/to/anitigravity_hack

# 1. Upload all 6 data types to S3 + log to DynamoDB
cd backend && node run-whoop-pipeline.js

# 2. Run all 6 Glue crawlers
for dtype in recovery sleep cycles workout profile body_measurement; do
  aws glue start-crawler --name "c3l-nli-whoop-${dtype}-crawler" \
    --region ap-southeast-2 --profile c3l-analytics
done

# 3. Wait ~2 min for crawlers, then auto-publish data products
cd backend && node publish-datazone-products.js
```

> In production: Step 1 runs automatically on every Whoop OAuth callback in `server.js`.
> Steps 2–3 run on a daily schedule via Glue Schedule → EventBridge → Lambda calling the publish script.

---

## 🔑 IAM Roles Summary

| Step | Service | Role / Profile |
|------|---------|---------------|
| S3 upload + DynamoDB write | Node.js (server.js) | `c3l-analytics` local profile |
| Glue crawlers | AWS Glue service | `c3l-engageai-glue-crawler-anl` |
| LF permissions required for Glue | Lake Formation | Admin via `c3l-analytics` profile |
| DataZone sync + product creation | DataZone + Node.js | `c3l-analytics` local profile |

---

## 🐛 Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `ResourceNotFoundException` on DynamoDB | Tables in wrong account | Create tables in c3l-analytics account (184898280326) |
| Glue `AccessDeniedException` on CREATE_TABLE | Missing LF permissions | Grant LF CREATE_TABLE + ALL to `c3l-engageai-glue-crawler-anl` |
| Glue role `InvalidInputException` | Wrong role trust policy | Use `c3l-engageai-glue-crawler-anl`, NOT the DataZone role |
| DataZone `Cannot find module '@aws-sdk/client-datazone'` | Missing npm package | `cd backend && npm install @aws-sdk/client-datazone` |
| DataZone sync `0 assets added/updated` | Crawlers not run yet | Run crawlers first, wait for SUCCEEDED |
| DataZone search `OwningProjectId mandatory` | Missing param | Add `--owning-project-identifier 62guenc68nuvxe` |
