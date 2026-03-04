# c3l-NLI — Architecture & Deployment Notes

> AWS Account: `184898280326` | Region: `ap-southeast-2` | Profile: `c3l-analytics`  
> Last Updated: 2026-03-04

---

## 1. Cognito User Pool — `c3l-NextLevelInsights`

> ⚠️ This is the **dedicated** pool for this project. The old shared `data-lake` pool is not used.

| | |
|--|--|
| **Pool Name** | `c3l-NextLevelInsights` |
| **Pool ID** | `ap-southeast-2_7lxzyRc1Z` |
| **Pool ARN** | `arn:aws:cognito-idp:ap-southeast-2:184898280326:userpool/ap-southeast-2_7lxzyRc1Z` |
| **App Client** | `c3l-nli-app-client` |
| **Client ID** | `1tcq0o4uue5dp9ge603d7lsjqu` |
| **Sign-in attribute** | `email` |
| **Email verified** | Auto-verified |

### Groups

| Group | IAM Role | Purpose |
|-------|----------|---------|
| `students` | `NextLevelStudentRole` | Student users — share data, view My Data, manage consent |
| `admin` | `NextLevelAdminRole` | Admin users — view consented student analytics |

### JWT Claims (after sign-in)
```json
{
  "sub": "<uuid>",
  "cognito:groups": ["students"],   // or ["admin"]
  "email": "user@example.com",
  "custom:role": "student"
}
```

### Useful CLI Commands
```bash
# List groups
aws cognito-idp list-groups \
  --user-pool-id ap-southeast-2_7lxzyRc1Z \
  --region ap-southeast-2 --profile c3l-analytics

# Create a test student user
aws cognito-idp admin-create-user \
  --user-pool-id ap-southeast-2_7lxzyRc1Z \
  --username student1@test.com \
  --user-attributes Name=email,Value=student1@test.com \
  --region ap-southeast-2 --profile c3l-analytics

# Add user to students group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id ap-southeast-2_7lxzyRc1Z \
  --username student1@test.com \
  --group-name students \
  --region ap-southeast-2 --profile c3l-analytics
```

---

## 2. DynamoDB Tables

| Table | Purpose | Key Design |
|-------|---------|------------|
| `c3l-NextLevelInsights-UserDevicePermissions` | Device sharing toggles per user (DataZone) | PK: `USER#<sub>`, SK: `DEVICE#<type>` |
| `c3l-NextLevelInsights-DataSyncLogs` | Pipeline sync logs | PK: `RUN#<id>`, SK: `<timestamp>` |
| `c3l-NextLevelInsights-health-data` | Health data store | PK: `USER#<sub>`, SK: `<timestamp>` |
| `c3l-NextLevelInsights-users` | User profile store | PK: `USER#<sub>` |
| `nextlevel-consent` | **Per-admin consent mapping** | PK: `STUDENT#<sub>`, SK: `ADMIN#<sub>#RESOURCE#<domain>#<device>` |

### `nextlevel-consent` — Key Design
```
PK  = STUDENT#<student_sub>
SK  = ADMIN#<admin_sub>#RESOURCE#<domain>#<device_type>

GSI: domain-device-index
  HASH:  domain
  RANGE: device_type
  Projects: consent_metrics, consented_at, student_id, expires_at, status
```

**Example record:**
```json
{
  "PK": "STUDENT#uuid-s1",
  "SK": "ADMIN#uuid-a2#RESOURCE#health#whoop",
  "domain": "health",
  "device_type": "whoop",
  "student_sub": "uuid-s1",
  "admin_sub": "uuid-a2",
  "status": "active",
  "consented_at": "2026-03-04T00:00:00Z"
}
```

---

## 3. S3 Bucket

**Bucket:** `c3l-nextlevelinsights-data-lake`

```
c3l-nextlevelinsights-data-lake/
├── raw/
│   ├── domain=health/device_type=whoop/year=2026/month=03/day=04/<id>.json
│   └── domain=academic/device_type=canvas/year=2026/month=03/day=04/<id>.json
├── processed/
│   ├── domain=health/product=health_metrics/<id>.parquet
│   └── domain=academic/product=academic_engagement/<id>.parquet
└── athena-results/       ← Athena temp output
```

---

## 4. Glue Databases & Crawled Tables

| Database | Purpose |
|---------|---------|
| `c3l_nli_raw_devices` | Auto-catalogued by Glue crawlers |
| `c3l_nli_processed_devices` | Processed data catalog |

**Tables in `c3l_nli_raw_devices`** (live, auto-created by crawlers):
```
whoop_recovery_recovery      ← used in AdminDashboard Athena query
whoop_sleep_sleep            ← used in AdminDashboard Athena query
whoop_cycles_cycles
whoop_workout_workout
whoop_body_measurement_body_measurement
whoop_profile_profile
```

---

## 5. Lambda Functions — All `c3l-nli-*`

**Lambda Execution Role:** `arn:aws:iam::184898280326:role/c3l-nli-LambdaExecutionRole`

| # | Function | Trigger | Purpose |
|---|---------|---------|---------|
| 1 | `c3l-nli-ValidateJWT` | Step Function | Verify Cognito JWT, extract `student_sub` + role |
| 2 | `c3l-nli-StoreConsent` | Step Function | Write to `nextlevel-consent` DynamoDB |
| 3 | `c3l-nli-IngestHealth` | Step Function Map | Pull Whoop/Fitbit → S3 `raw/domain=health/` |
| 4 | `c3l-nli-NormalizeHealth` | Step Function Map | Normalize → S3 `processed/domain=health/` |
| 5 | `c3l-nli-IngestAcademic` | Step Function Map | Pull Canvas/Moodle → S3 `raw/domain=academic/` |
| 6 | `c3l-nli-NormalizeAcademic` | Step Function Map | Normalize → S3 `processed/domain=academic/` |
| 7 | `c3l-nli-UpdateGluePartition` | Step Function Map | Start Glue crawler, update `c3l_nli_raw_devices` |
| 8 | `c3l-nli-UpdateDataZoneAsset` | Step Function Map | Trigger DataZone data source sync |
| 9 | `c3l-nli-UpdateLakeFormationFilter` | Step Function Map | Upsert LF row filter for admin role |
| 10 | `c3l-nli-AdminDashboard` ✅ | HTTP GET / API | JWT verify → DynamoDB GSI → Athena filtered query |
| 11 | `c3l-nli-StoreConsentV2` | Step Function | V2 consent writer |

### `c3l-nli-AdminDashboard` — Deployed 2026-03-04

**ARN:** `arn:aws:lambda:ap-southeast-2:184898280326:function:c3l-nli-AdminDashboard`  
**Runtime:** Node.js 20.x | **Memory:** 512 MB | **Timeout:** 120 s

**Environment Variables (updated to c3l-NextLevelInsights pool):**
```
CONSENT_V2_TABLE       = nextlevel-consent
ATHENA_DATABASE        = c3l_nli_raw_devices
ATHENA_OUTPUT_BUCKET   = s3://c3l-nextlevelinsights-data-lake/athena-results/
COGNITO_USER_POOL_ID   = ap-southeast-2_7lxzyRc1Z       ← c3l-NextLevelInsights pool
COGNITO_CLIENT_ID      = 1tcq0o4uue5dp9ge603d7lsjqu     ← c3l-nli-app-client
```

**How the Lambda works:**
1. Verify Cognito JWT (aws-jwt-verify) → must be from `ap-southeast-2_7lxzyRc1Z`
2. Check `cognito:groups` includes `admin` → else 403
3. Extract `admin_sub` from JWT claims
4. Query `nextlevel-consent` GSI: `ADMIN#<admin_sub>` → get consented `student_subs`
5. Build Athena SQL: `WHERE owner_id IN (<student_subs>)`
6. Return JSON rows to frontend

**Deploy / Update commands:**
```bash
# Update code
cd infrastructure/lambda/c3l-nli-AdminDashboard
npm install --production
zip -qr ../c3l-nli-AdminDashboard.zip .

aws lambda update-function-code \
  --function-name c3l-nli-AdminDashboard \
  --zip-file fileb://../c3l-nli-AdminDashboard.zip \
  --region ap-southeast-2 --profile c3l-analytics

# Update env vars
aws lambda update-function-configuration \
  --function-name c3l-nli-AdminDashboard \
  --environment "Variables={CONSENT_V2_TABLE=nextlevel-consent,ATHENA_DATABASE=c3l_nli_raw_devices,ATHENA_OUTPUT_BUCKET=s3://c3l-nextlevelinsights-data-lake/athena-results/,COGNITO_USER_POOL_ID=ap-southeast-2_7lxzyRc1Z,COGNITO_CLIENT_ID=1tcq0o4uue5dp9ge603d7lsjqu}" \
  --region ap-southeast-2 --profile c3l-analytics
```

---

## 6. DataZone

| | |
|--|--|
| **Domain ID** | `dzd-cv79bbxiotkqsi` |
| **Data Source ID** | `bpr42x2umdut9e` |
| **Role** | Governance & catalog only — not used for runtime row filtering |

After each Glue crawler run, `c3l-nli-UpdateDataZoneAsset` triggers a sync so new Glue tables appear in the DataZone catalog.

---

## 7. Full Data Flow

```
FRONTEND (Vue.js — localhost:5173)
│
│  Student connects Whoop / Canvas
│  → DataPermissions.vue: toggle per-admin consent
│  → POST /consent  (with Cognito JWT from c3l-NextLevelInsights pool)
│
▼
STEP FUNCTION — c3l-nli-ConsentPipeline
│
├─ c3l-nli-ValidateJWT
│   Verify JWT (pool: ap-southeast-2_7lxzyRc1Z)
│   Extract student_sub + cognito:groups
│
├─ c3l-nli-StoreConsent
│   DynamoDB: nextlevel-consent
│   PK = STUDENT#<sub>  SK = ADMIN#<sub>#RESOURCE#<domain>#<device>
│
└─ [Map over each device]
    │
    ├─ c3l-nli-IngestHealth / c3l-nli-IngestAcademic
    │   Pull raw JSON from Whoop / Canvas APIs
    │   → S3: raw/domain=health|academic/device_type=.../
    │
    ├─ c3l-nli-NormalizeHealth / c3l-nli-NormalizeAcademic
    │   Transform to canonical 6-field schema
    │   → S3: processed/domain=.../product=.../
    │
    ├─ c3l-nli-UpdateGluePartition
    │   Start Glue crawler → c3l_nli_raw_devices DB
    │   → Auto-creates: whoop_recovery_recovery, whoop_sleep_sleep, etc.
    │
    ├─ c3l-nli-UpdateDataZoneAsset
    │   Trigger DataZone sync (dzd-cv79bbxiotkqsi)
    │   → Glue table visible in DataZone catalog
    │
    └─ c3l-nli-UpdateLakeFormationFilter
        Build LF row filter: student_id IN ('s1','s2',...)
        Upsert filter on Glue table for NextLevelAdminRole

ADMIN DASHBOARD REQUEST
│
│  GET /dashboard  (Authorization: Bearer <Cognito JWT>)
│
▼
c3l-nli-AdminDashboard Lambda
│
├─ 1. Verify JWT → must be from ap-southeast-2_7lxzyRc1Z
├─ 2. Check cognito:groups includes 'admin'  → else 403
├─ 3. DynamoDB GSI: ADMIN#<admin_sub> → consented student_subs
├─ 4. Athena: SELECT ... FROM processed_health_metrics
│         WHERE owner_id IN (<student_subs>)
│         AND date >= date('2026-01-01')
└─ 5. Return JSON → AdminDashboard.vue renders results
```

---

## 8. Frontend Role Mapping

| UI Label | Form Value | `useAuth` key | Cognito Group |
|---------|-----------|--------------|---------------|
| 🎓 Student | `Student` | `student` | `students` |
| 💼 Admin / Staff | `Admin` | `admin` | `admin` |

**Files:**
- `src/components/AuthModal.vue` — role selector + handleSubmit mapping
- `src/composables/useAuth.js` — `isAdmin`, `isStudent`, `isLoggedIn` computed props
- `src/router/index.js` — `beforeEach` guard: non-admin → redirect to `/connected-services`

---

## 9. Change Log

| Date | Change |
|------|--------|
| 2026-03-04 | Created dedicated Cognito pool `c3l-NextLevelInsights` (`ap-southeast-2_7lxzyRc1Z`) |
| 2026-03-04 | Created `students` + `admin` groups with `NextLevelStudentRole` / `NextLevelAdminRole` |
| 2026-03-04 | Created App Client `c3l-nli-app-client` (`1tcq0o4uue5dp9ge603d7lsjqu`) |
| 2026-03-04 | Deployed `c3l-nli-AdminDashboard` Lambda (Node 20.x, 512MB, 120s) |
| 2026-03-04 | Updated Lambda env vars to point to new pool + client |
| 2026-03-04 | Deleted `staff` group from old `data-lake` pool (now using `admin` only) |
| 2026-03-04 | Frontend: renamed "Professional Staff" → "Admin / Staff" everywhere |
