# DataZone Auto-Publish Run — Results

**Date:** 2026-03-04  
**Profile:** `c3l-analytics` (AWS account `184898280326`)  
**Script:** `backend/publish-datazone-products.js`  
**Domain:** `c3l-NextLevelInsights-domain` (`dzd-cv79bbxiotkqsi`)  
**Project:** `c3l-NextLevelInsights-project` (`62guenc68nuvxe`)  
**Portal:** https://dzd-cv79bbxiotkqsi.datazone.ap-southeast-2.on.aws/

---

## Step 1 — DataZone Data Source Sync

| Field | Value |
|-------|-------|
| Data Source | `c3l-nli-raw-devices-datasource` (`bpr42x2umdut9e`) |
| Run ID | `bgopvehbfcs4yq` |
| Status | ✅ **SUCCESS** |
| Assets Added | 0 |
| Assets Updated | 0 |
| Assets Unchanged | 6 |
| Assets Failed | 0 |

> All 6 Glue tables already catalogued and unchanged — this is the expected steady-state after prior pipeline runs.

---

## Step 2 — Glue Tables (Source Assets)

Database: `c3l_nli_raw_devices` (S3: `s3://c3l-nextlevelinsights-data-lake/raw/`)

| Glue Table | Asset ID |
|-----------|----------|
| `whoop_recovery_recovery` | `b8022lrr7pgzky` |
| `whoop_sleep_sleep` | `b8a2dvm9613cte` |
| `whoop_cycles_cycles` | `dr8s22dyobiwte` |
| `whoop_workout_workout` | `5ufdtp7p57wnqa` |
| `whoop_profile_profile` | `b3e2ms62fft89u` |
| `whoop_body_measurement_body_measurement` | `cmw7smxl73vzmq` |

---

## Step 3 — DataZone Data Products (Publish Summary)

All 6 products confirmed present. Script is **idempotent** — skips creation if product already exists.

| Data Product Name | Product ID | Status |
|-------------------|-----------|--------|
| `c3l-nli_whoop_dev_raw_recovery` | `6hqn3g0y79j3fm` | ⏭️ already_exists |
| `c3l-nli_whoop_dev_raw_sleep` | `3x0ab1gwetmf1e` | ⏭️ already_exists |
| `c3l-nli_whoop_dev_raw_cycles` | `bgl3cpifkirzc2` | ⏭️ already_exists |
| `c3l-nli_whoop_dev_raw_workout` | `4nmviarruy9ew2` | ⏭️ already_exists |
| `c3l-nli_whoop_dev_raw_profile` | `c53depjoepc6qq` | ⏭️ already_exists |
| `c3l-nli_whoop_dev_raw_body_measurement` | `cqjheigpue2v1e` | ⏭️ already_exists |

---

## Naming Convention

All assets follow: `c3l-nli_<device>_<env>_<stage>[_<datatype>]`

| Asset Type | Pattern | Example |
|-----------|---------|---------|
| DataZone data product | `c3l-nli_whoop_dev_raw_<type>` | `c3l-nli_whoop_dev_raw_recovery` |
| Glue database (raw) | `c3l_nli_raw_devices` | — |
| Glue database (processed) | `c3l_nli_processed_devices` | — |
| S3 (raw) | `s3://c3l-nextlevelinsights-data-lake/raw/<device>/` | `raw/whoop/` |
| S3 (processed) | `s3://c3l-nextlevelinsights-data-lake/processed/<device>/` | `processed/whoop/` |

---

## How to Re-Run

```bash
# From project root
cd backend
node publish-datazone-products.js

# Dry run (no changes to AWS)
node publish-datazone-products.js --dry-run
```

**Prerequisites:**
- AWS SSO session active: `aws sso login --profile c3l-analytics`
- Glue crawler has run and tables are present in `c3l_nli_raw_devices`
- `.env` contains `AWS_REGION`, `AWS_PROFILE` (or use default from `~/.aws/config`)

---

## Infrastructure Summary

| Resource | Name / ID |
|----------|-----------|
| AWS Account | `184898280326` |
| AWS Region | `ap-southeast-2` (Sydney) |
| AWS Profile | `c3l-analytics` |
| DataZone Domain | `c3l-NextLevelInsights-domain` (`dzd-cv79bbxiotkqsi`) |
| DataZone Project | `c3l-NextLevelInsights-project` (`62guenc68nuvxe`) |
| Data Source (raw) | `c3l-nli-raw-devices-datasource` (`bpr42x2umdut9e`) |
| DynamoDB (permissions) | `c3l-NextLevelInsights-UserDevicePermissions` |
| DynamoDB (sync logs) | `c3l-NextLevelInsights-DataSyncLogs` |
