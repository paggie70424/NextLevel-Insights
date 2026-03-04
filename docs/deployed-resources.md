# c3l-NLI — Complete Resource Inventory & Status
**Account:** `184898280326` | **Region:** `ap-southeast-2` | **AWS Profile:** `c3l-analytics`
**Updated:** 2026-03-03

---

## 1. Frontend App → AWS Integration Map

| Frontend Action | Vue Component | AWS Service | Resource Name |
|----------------|---------------|-------------|---------------|
| Login / Auth | `ConnectedServices.vue` | Cognito User Pool | `ap-southeast-2_FlPLvTNhA` (data-lake pool) |
| Connect Whoop (OAuth) | `ConnectedServices.vue` | Backend `server.js` → Whoop API | — |
| Upload raw data to lake | `server.js` (backend) | S3 | `c3l-nextlevelinsights-data-lake` |
| Write sync log | `server.js` (backend) | DynamoDB | `c3l-NextLevelInsights-DataSyncLogs` |
| Student clicks "Share Resource" | `ConnectedServices.vue` (to wire up) | API Gateway → Step Function | `c3l-nli-ConsentShareStateMachine` |
| Student manages consent | `ConnectedServices.vue` (to wire up) | DynamoDB | `nextlevel-consent` |
| Staff views student data | *(not yet built)* | Athena + Lake Formation | `c3l_nli_raw_devices` Glue DB |
| Admin views analytics | *(not yet built)* | DataZone + Athena | `dzd-cv79bbxiotkqsi` |

---

## 2. Amazon S3

| Bucket | Status | Notes |
|--------|--------|-------|
| `c3l-nextlevelinsights-data-lake` | ✅ **EXISTS** | Main data lake bucket |
| `raw/whoop/<type>/YYYY/MM/DD/` | ✅ Data written by `server.js` | Whoop 6 data types |
| `raw/domain=health/device_type=<x>/year/month/day/` | 🔲 **Planned** | New canonical path (written by c3l-nli-IngestHealth Lambda) |
| `raw/domain=academic/device_type=<lms>/year/month/day/` | 🔲 **Planned** | Written by c3l-nli-IngestAcademic Lambda |
| `processed/domain=health/product=health_metrics/year/month/day/` | 🔲 **Planned** | Written by c3l-nli-NormalizeHealth Lambda |
| `processed/domain=academic/product=academic_engagement/year/month/day/` | 🔲 **Planned** | Written by c3l-nli-NormalizeAcademic Lambda |
| `export/` | ✅ **EXISTS** (empty) | Reserved for future exports |

---

## 3. Amazon DynamoDB

| Table | Status | PK / SK | Notes |
|-------|--------|---------|-------|
| `c3l-NextLevelInsights-DataSyncLogs` | ✅ **EXISTS** | — | Whoop sync log, written by `server.js` |
| `c3l-NextLevelInsights-UserDevicePermissions` | ✅ **EXISTS** | — | Existing permissions table |
| `c3l-NextLevelInsights-health-data` | ✅ **EXISTS** | — | Existing health data table |
| `c3l-NextLevelInsights-users` | ✅ **EXISTS** | — | Existing users table |
| `nextlevel-consent` | ✅ **CREATED THIS SESSION** | `PK=STUDENT#<id>` / `SK=RESOURCE#<domain>#<device>` | New consent table with GSI `domain-device-index` |

### `nextlevel-consent` GSI
| Index Name | PK | SK | Projected Fields |
|------------|----|----|-----------------|
| `domain-device-index` | `domain` | `device_type` | `student_id`, `status`, `consent_metrics`, `consented_at`, `expires_at` |

---

## 4. Amazon Cognito

**User Pool:** `ap-southeast-2_FlPLvTNhA` (name: `data-lake`)

| Group | IAM Role Linked | Status | Purpose |
|-------|----------------|--------|---------|
| `students` | `NextLevelStudentRole` | ✅ **CREATED THIS SESSION** | Students — own data only |
| `staff` | `NextLevelStaffRole` | ✅ **CREATED THIS SESSION** | Staff — consented students only |
| `admin` | `NextLevelAdminRole` | ✅ **CREATED THIS SESSION** | Admin — aggregated analytics |
| `data_lake_project_team_1` | — | Pre-existing | Old group |
| `tglf_team` | — | Pre-existing | Old group |

---

## 5. IAM Roles

| Role Name | Status | Purpose |
|-----------|--------|---------|
| `c3l-nli-LambdaExecutionRole` | ✅ **EXISTS** (pre-existing) | Execution role for all c3l-nli Lambda functions |
| `NextLevelStudentRole` | ✅ **CREATED THIS SESSION** | Cognito authenticated role — students |
| `NextLevelStaffRole` | ✅ **CREATED THIS SESSION** | Cognito authenticated role — staff |
| `NextLevelAdminRole` | ✅ **CREATED THIS SESSION** | Cognito authenticated role — admin |
| `c3l-nli-StepFunctionExecutionRole` | ✅ **CREATED THIS SESSION** | Step Function execution — invoke all c3l-nli Lambdas |
| `c3l-NextLevelInsights-backend-role` | ✅ Pre-existing | Backend server role |
| `c3l-NextLevelInsights-datazone-role` | ✅ Pre-existing | DataZone role |
| `c3l-NextLevelInsights-mobile-upload-role` | ✅ Pre-existing | Mobile upload role |
| `c3l-engageai-glue-crawler-anl` | ✅ Pre-existing | Glue crawler IAM role |

### IAM Policies Attached to `c3l-nli-LambdaExecutionRole`
- `AWSLambdaBasicExecutionRole`
- `AmazonDynamoDBFullAccess`
- `AmazonS3FullAccess`
- `AWSGlueConsoleFullAccess`
- `AWSLakeFormationCrossAccountManager`
- `AmazonDataZoneFullAccess`

---

## 6. Lambda Functions (Code Written — **NOT YET DEPLOYED to AWS**)

All files in: `infrastructure/lambda/<name>/index.js`

| Function Name | File | Status | Trigger | Purpose |
|---------------|------|--------|---------|---------|
| `c3l-nli-ValidateJWT` | ✅ Code ready | 🔲 **NOT DEPLOYED** | Step Function | Verify Cognito JWT, extract student_id + role |
| `c3l-nli-StoreConsent` | ✅ Code ready | 🔲 **NOT DEPLOYED** | Step Function | Write consent to `nextlevel-consent` DynamoDB |
| `c3l-nli-IngestHealth` | ✅ Code ready | 🔲 **NOT DEPLOYED** | Step Function Map | Pull Whoop/Fitbit/Oura → S3 raw/ |
| `c3l-nli-NormalizeHealth` | ✅ Code ready | 🔲 **NOT DEPLOYED** | Step Function Map | Canonical schema → S3 processed/ |
| `c3l-nli-IngestAcademic` | ✅ Code ready | 🔲 **NOT DEPLOYED** | Step Function Map | Pull Canvas/Moodle → S3 raw/ |
| `c3l-nli-NormalizeAcademic` | ✅ Code ready | 🔲 **NOT DEPLOYED** | Step Function Map | Canonical schema → S3 processed/ |
| `c3l-nli-UpdateGluePartition` | ✅ Code ready | 🔲 **NOT DEPLOYED** | Step Function Map | Start Glue crawler, auto-create crawler if missing |
| `c3l-nli-UpdateDataZoneAsset` | ✅ Code ready | 🔲 **NOT DEPLOYED** | Step Function Map | DataZone data-source sync trigger |
| `c3l-nli-UpdateLakeFormationFilter` | ✅ Code ready | 🔲 **NOT DEPLOYED** | Step Function Map | Upsert LF row filter per student_id |

**Deploy command (run once Lambda env has stabilised):**
```bash
cd /Users/pei-yiliu/Workspace/c3l/hackathon/anitigravity_hack/infrastructure/lambda
ROLE="arn:aws:iam::184898280326:role/c3l-nli-LambdaExecutionRole"
ENV_VARS="Variables={RAW_BUCKET=c3l-nextlevelinsights-data-lake,PROCESSED_BUCKET=c3l-nextlevelinsights-data-lake,CONSENT_TABLE=nextlevel-consent,GLUE_DATABASE=c3l_nli_raw_devices,GLUE_ROLE=arn:aws:iam::184898280326:role/c3l-engageai-glue-crawler-anl,DATAZONE_DOMAIN_ID=dzd-cv79bbxiotkqsi,DATAZONE_DATASOURCE_ID=bpr42x2umdut9e,AWS_ACCOUNT_ID=184898280326,STAFF_ROLE_ARN=arn:aws:iam::184898280326:role/NextLevelStaffRole,COGNITO_REGION=ap-southeast-2}"

for fn in c3l-nli-ValidateJWT c3l-nli-StoreConsent c3l-nli-IngestHealth c3l-nli-NormalizeHealth \
          c3l-nli-IngestAcademic c3l-nli-NormalizeAcademic c3l-nli-UpdateGluePartition \
          c3l-nli-UpdateDataZoneAsset c3l-nli-UpdateLakeFormationFilter; do
  zip -q "/tmp/${fn}.zip" -j "${fn}/index.js"
  aws lambda create-function \
    --function-name "$fn" --runtime nodejs20.x \
    --role "$ROLE" --handler index.handler \
    --zip-file "fileb:///tmp/${fn}.zip" \
    --timeout 300 --memory-size 512 \
    --environment "$ENV_VARS" \
    --region ap-southeast-2 --profile c3l-analytics 2>&1 | grep -E "FunctionArn|error"
  echo "done: $fn"
done
```

---

## 7. Step Function

| State Machine | Status | File |
|---------------|--------|------|
| `c3l-nli-ConsentShareStateMachine` | 🔲 **NOT DEPLOYED** (JSON ready) | `infrastructure/stepfunction/c3l-nli-ConsentShareStateMachine.json` |

**Deploy command:**
```bash
aws stepfunctions create-state-machine \
  --name c3l-nli-ConsentShareStateMachine \
  --definition file://infrastructure/stepfunction/c3l-nli-ConsentShareStateMachine.json \
  --role-arn arn:aws:iam::184898280326:role/c3l-nli-StepFunctionExecutionRole \
  --region ap-southeast-2 --profile c3l-analytics
```

---

## 8. AWS Glue

| Resource | Status | Notes |
|----------|--------|-------|
| **Glue Database:** `c3l_nli_raw_devices` | ✅ Pre-existing | Contains 6 Whoop tables |
| `whoop_recovery_recovery` | ✅ Pre-existing | |
| `whoop_sleep_sleep` | ✅ Pre-existing | |
| `whoop_cycles_cycles` | ✅ Pre-existing | |
| `whoop_workout_workout` | ✅ Pre-existing | |
| `whoop_profile_profile` | ✅ Pre-existing | |
| `whoop_body_measurement_body_measurement` | ✅ Pre-existing | |
| Crawlers: `c3l-nli-whoop-<type>-crawler` (×6) | ✅ Pre-existing | |
| Crawlers: `c3l-nli-health-<device>-crawler` | 🔲 Auto-created by Lambda on first run | Created by `c3l-nli-UpdateGluePartition` |
| Crawlers: `c3l-nli-academic-<lms>-crawler` | 🔲 Auto-created by Lambda on first run | Created by `c3l-nli-UpdateGluePartition` |

---

## 9. Amazon DataZone

**Domain:** `dzd-cv79bbxiotkqsi`
**Portal:** https://dzd-cv79bbxiotkqsi.datazone.ap-southeast-2.on.aws/

| Resource | ID | Status |
|----------|----|--------|
| Domain | `dzd-cv79bbxiotkqsi` | ✅ Pre-existing |
| Project (main) | `62guenc68nuvxe` | ✅ Pre-existing |
| Data Source (raw devices) | `bpr42x2umdut9e` | ✅ Pre-existing |
| **Project: `c3l-nli-Students`** | TBD | 🔲 **NOT YET CREATED** |
| **Project: `c3l-nli-Staff`** | TBD | 🔲 **NOT YET CREATED** |
| **Project: `c3l-nli-Admin`** | TBD | 🔲 **NOT YET CREATED** |
| Data Products (Whoop ×6) | `6hqn3g0y79j3fm` etc. | ✅ Pre-existing |

---

## 10. Lake Formation

| Resource | Status | Notes |
|----------|--------|-------|
| **LF-Tag** `domain` = health, academic, performance, raw, system | ✅ **CREATED THIS SESSION** | |
| **LF-Tag** `sensitivity` = restricted, internal, public | ✅ **CREATED THIS SESSION** | |
| **LF-Tag** `tier` = raw, processed, export | ✅ **CREATED THIS SESSION** | |
| Grant: `c3l-engageai-glue-crawler-anl` → DB `CREATE_TABLE` + ALL | ✅ Pre-existing | From Whoop pipeline setup |
| Row Filter: `c3l-nli-staff-filter-health-*` | 🔲 **Auto-created by Lambda** | Created by `c3l-nli-UpdateLakeFormationFilter` at runtime |
| Row Filter: `c3l-nli-staff-filter-academic-*` | 🔲 **Auto-created by Lambda** | Created by `c3l-nli-UpdateLakeFormationFilter` at runtime |

---

## 11. What Still Needs Doing

| # | Task | Command / File |
|---|------|----------------|
| 1 | Deploy 9 Lambda functions | Use deploy command in Section 6 above |
| 2 | Deploy Step Function | Use command in Section 7 above |
| 3 | Create DataZone projects (Students/Staff/Admin) | `aws datazone create-project ...` |
| 4 | Wire frontend `POST /consent` → Step Function | Update `backend/server.js` or API Gateway |
| 5 | Create LF role grants for `NextLevelStaffRole` | See `docs/lakeformation-tags.txt` |
| 6 | Add `npm install aws-jwt-verify` to Lambda packages (for ValidateJWT) | Only if deploying with dependencies |

---

## 12. Local Code Files Created This Session

| File | Purpose |
|------|---------|
| `infrastructure/lambda/c3l-nli-ValidateJWT/index.js` | Lambda code |
| `infrastructure/lambda/c3l-nli-StoreConsent/index.js` | Lambda code |
| `infrastructure/lambda/c3l-nli-IngestHealth/index.js` | Lambda code |
| `infrastructure/lambda/c3l-nli-NormalizeHealth/index.js` | Lambda code |
| `infrastructure/lambda/c3l-nli-IngestAcademic/index.js` | Lambda code |
| `infrastructure/lambda/c3l-nli-NormalizeAcademic/index.js` | Lambda code |
| `infrastructure/lambda/c3l-nli-UpdateGluePartition/index.js` | Lambda code |
| `infrastructure/lambda/c3l-nli-UpdateDataZoneAsset/index.js` | Lambda code |
| `infrastructure/lambda/c3l-nli-UpdateLakeFormationFilter/index.js` | Lambda code |
| `infrastructure/lambda/README.txt` | Lambda inventory doc |
| `infrastructure/stepfunction/c3l-nli-ConsentShareStateMachine.json` | Step Function ASL JSON |
| `infrastructure/stepfunction/README.txt` | Step Function doc |
| `docs/architecture.txt` | Full platform architecture |
| `docs/dynamo-schema.txt` | DynamoDB schema reference |
| `docs/canonical-schema.txt` | Normalized schema + Athena queries |
| `docs/lakeformation-tags.txt` | LF-Tag strategy |
| `docs/role-datazone-setup.md` | DataZone project role design |
| `docs/deployed-resources.md` | **This file** — full status inventory |

---

## 13. Per-Admin Consent Redesign — Added 2026-03-04

### New Frontend Files

| File | Purpose |
|------|---------|
| `src/composables/useAuth.js` | Role auth composable — `userRole`, `isAdmin`, `login()`, `logout()` |
| `src/views/AdminDashboard.vue` | Admin data dashboard (access-denied view for students) |

### Modified Frontend Files

| File | Change |
|------|--------|
| `src/components/Sidebar.vue` | Added Admin section (purple), role badge, dev login switcher |
| `src/router/index.js` | Added `/admin/dashboard` route + `beforeEach` nav guard |

### New Lambda Functions (Code ready — **NOT YET DEPLOYED**)

| Function | Purpose | Table |
|----------|---------|-------|
| `c3l-nli-StoreConsentV2` | Per-admin consent: `STUDENT#<sub>` → `ADMIN#<sub>#RESOURCE#...` | `c3l-nli-user-consent` |
| `c3l-nli-AdminDashboard` | Queries GSI1, builds Athena query scoped to admin's students | `c3l-nli-user-consent` + Athena |

### Modified Lambda Functions

| Function | Change |
|----------|--------|
| `c3l-nli-ValidateJWT` | Now returns `user_sub`, `groups` (cognito:groups), `email` |

### New DynamoDB Table: `c3l-nli-user-consent` (**NOT YET CREATED**)

| Attribute | Value |
|-----------|-------|
| PK | `STUDENT#<student_sub>` |
| SK | `ADMIN#<admin_sub>#RESOURCE#<domain>#<device>` |
| GSI1PK | `ADMIN#<admin_sub>` |
| GSI1SK | `STUDENT#<student_sub>#RESOURCE#<domain>#<device>` |

**Create command:**
```bash
aws dynamodb create-table \
  --table-name c3l-nli-user-consent \
  --attribute-definitions \
      AttributeName=PK,AttributeType=S \
      AttributeName=SK,AttributeType=S \
      AttributeName=GSI1PK,AttributeType=S \
      AttributeName=GSI1SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes '[{"IndexName":"GSI1","KeySchema":[{"AttributeName":"GSI1PK","KeyType":"HASH"},{"AttributeName":"GSI1SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"},"BillingMode":"PAY_PER_REQUEST"}]' \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-2 --profile c3l-analytics
```

### New Documentation

| File | Purpose |
|------|---------|
| `docs/changes-summary.txt` | **Master changelog** — all new/changed files, all deploy commands |
