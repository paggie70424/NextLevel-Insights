================================================================================
c3l-NLI — LAMBDA FUNCTION INVENTORY
infrastructure/lambda/ | Runtime: Node.js 20.x | Region: ap-southeast-2
================================================================================

ALL FUNCTIONS PREFIXED: c3l-nli-
ALL DEPLOYED TO ACCOUNT: 184898280326


================================================================================
FUNCTION INDEX
================================================================================

 #  Function Name                    Trigger             Purpose
--------------------------------------------------------------------------------
 1  c3l-nli-ValidateJWT              Step Function       Cognito JWT verification
 2  c3l-nli-StoreConsent             Step Function       Write consent to DynamoDB
 3  c3l-nli-IngestHealth             Step Function Map   Pull wearable device data
 4  c3l-nli-NormalizeHealth          Step Function Map   Canonical schema transform
 5  c3l-nli-IngestAcademic           Step Function Map   Pull LMS data
 6  c3l-nli-NormalizeAcademic        Step Function Map   Canonical schema transform
 7  c3l-nli-UpdateGluePartition      Step Function Map   Start Glue crawler
 8  c3l-nli-UpdateDataZoneAsset      Step Function Map   DataZone sync trigger
 9  c3l-nli-UpdateLakeFormationFilter Step Function Map  Row filter upsert


================================================================================
FUNCTION DETAILS
================================================================================

1. c3l-nli-ValidateJWT
   File     : infrastructure/lambda/c3l-nli-ValidateJWT/index.js
   Purpose  : Verify Amazon Cognito access token. Extract student_id and role.
   Input    : { token: "Bearer eyJ...", resources: ["health#whoop", ...] }
   Output   : { student_id, role, resources, validated_at }
   IAM      : Needs Cognito DescribeUserPool
   Env Vars :
     COGNITO_USER_POOL_ID   - Cognito User Pool ID
     COGNITO_CLIENT_ID      - App client ID
     COGNITO_REGION         - ap-southeast-2

2. c3l-nli-StoreConsent
   File     : infrastructure/lambda/c3l-nli-StoreConsent/index.js
   Purpose  : Write consent record to DynamoDB for each resource.
   Input    : { student_id, role, resources }
   Output   : { student_id, role, resources_stored, resources }
   IAM      : DynamoDB PutItem on nextlevel-consent
   Env Vars :
     CONSENT_TABLE   - nextlevel-consent

3. c3l-nli-IngestHealth  (資料攝取 Lambda)
   File     : infrastructure/lambda/c3l-nli-IngestHealth/index.js
   Purpose  : Pull raw data from wearable device API. Save to S3 raw zone.
   Devices  : whoop | fitbit | oura | apple_watch | garmin | samsung_watch
   S3 Write : raw/domain=health/device_type=<x>/year/month/day/<id>.json
   Input    : { student_id, device_type, access_token }
   Output   : { student_id, device_type, domain, s3_raw_key, s3_bucket, ingested_at }
   IAM      : S3 PutObject on c3l-nextlevelinsights-data-lake/raw/*
   Env Vars :
     RAW_BUCKET     - c3l-nextlevelinsights-data-lake
     WHOOP_API_BASE - https://api.prod.whoop.com/developer
     FITBIT_API_BASE- https://api.fitbit.com/1

4. c3l-nli-NormalizeHealth  (資料正規化 Lambda)
   File     : infrastructure/lambda/c3l-nli-NormalizeHealth/index.js
   Purpose  : Convert raw health JSON to 6-field canonical schema.
   S3 Read  : raw/domain=health/...
   S3 Write : processed/domain=health/product=health_metrics/...
   Input    : { student_id, device_type, s3_raw_key, s3_bucket }
   Output   : { student_id, device_type, domain, s3_processed_key, record_count }
   IAM      : S3 GetObject (raw), S3 PutObject (processed)
   Env Vars :
     RAW_BUCKET        - c3l-nextlevelinsights-data-lake
     PROCESSED_BUCKET  - c3l-nextlevelinsights-data-lake

5. c3l-nli-IngestAcademic  (資料攝取 Lambda)
   File     : infrastructure/lambda/c3l-nli-IngestAcademic/index.js
   Purpose  : Pull raw data from LMS API. Save to S3 raw zone.
   LMS      : canvas_lms | moodle | blackboard
   S3 Write : raw/domain=academic/device_type=<lms>/year/month/day/<id>.json
   Input    : { student_id, device_type, access_token }
   Output   : { student_id, device_type, domain, s3_raw_key, s3_bucket, ingested_at }
   IAM      : S3 PutObject on c3l-nextlevelinsights-data-lake/raw/*
   Env Vars :
     RAW_BUCKET       - c3l-nextlevelinsights-data-lake
     CANVAS_API_BASE  - https://canvas.institution.edu/api/v1
     CANVAS_API_TOKEN - Canvas token (or Secrets Manager)
     MOODLE_API_BASE  - https://moodle.institution.edu/webservice/rest/server.php
     MOODLE_API_TOKEN - Moodle web service token

6. c3l-nli-NormalizeAcademic  (資料正規化 Lambda)
   File     : infrastructure/lambda/c3l-nli-NormalizeAcademic/index.js
   Purpose  : Convert raw LMS JSON to 6-field canonical schema.
   S3 Read  : raw/domain=academic/...
   S3 Write : processed/domain=academic/product=academic_engagement/...
   Input    : { student_id, device_type, s3_raw_key, s3_bucket }
   Output   : { student_id, device_type, domain, s3_processed_key, record_count }
   IAM      : S3 GetObject (raw), S3 PutObject (processed)

7. c3l-nli-UpdateGluePartition
   File     : infrastructure/lambda/c3l-nli-UpdateGluePartition/index.js
   Purpose  : Start Glue crawler for new S3 partition. Auto-creates if missing.
   Crawler  : c3l-nli-<domain>-<device_type>-crawler
   Glue DB  : c3l_nli_raw_devices
   Input    : { student_id, device_type, domain, s3_processed_key }
   Output   : (all input fields) + { glue_crawler, glue_state, glue_updated_at }
   IAM      : Glue StartCrawler, GetCrawler, CreateCrawler
   Timeout  : 240 seconds (Step Function Task)
   Env Vars :
     GLUE_DATABASE  - c3l_nli_raw_devices
     GLUE_ROLE      - arn:aws:iam::184898280326:role/c3l-engageai-glue-crawler-anl
     RAW_BUCKET     - c3l-nextlevelinsights-data-lake

8. c3l-nli-UpdateDataZoneAsset
   File     : infrastructure/lambda/c3l-nli-UpdateDataZoneAsset/index.js
   Purpose  : Trigger DataZone data source sync. New Glue table appears in catalog.
   Domain   : dzd-cv79bbxiotkqsi
   Source   : bpr42x2umdut9e
   Input    : { student_id, domain, device_type, glue_state }
   Output   : (all input fields) + { datazone_run_id, datazone_status, datazone_stats }
   IAM      : datazone:StartDataSourceRun, datazone:GetDataSourceRun
   Timeout  : 360 seconds (Step Function Task)
   Env Vars :
     DATAZONE_DOMAIN_ID      - dzd-cv79bbxiotkqsi
     DATAZONE_DATASOURCE_ID  - bpr42x2umdut9e

9. c3l-nli-UpdateLakeFormationFilter
   File     : infrastructure/lambda/c3l-nli-UpdateLakeFormationFilter/index.js
   Purpose  : Upsert LF row filter. Staff sees only consented students' rows.
   Filter   : student_id IN ('id1', 'id2', ...)
   Table    : <domain>_<device_type>_normalized in c3l_nli_raw_devices
   Input    : { student_id, domain, device_type }
   Output   : (all input) + { lf_filter_name, lf_row_expression, lf_student_count }
   IAM      : lakeformation:CreateDataCellsFilter, UpdateDataCellsFilter
              dynamodb:Query on nextlevel-consent (GSI: domain-device-index)
   Env Vars :
     AWS_ACCOUNT_ID   - 184898280326
     GLUE_DATABASE    - c3l_nli_raw_devices
     STAFF_ROLE_ARN   - arn:aws:iam::184898280326:role/c3l-nli-StaffRole
     CONSENT_TABLE    - nextlevel-consent


================================================================================
ADDING A NEW DEVICE (Zero Schema Change)
================================================================================

1. Add a new ingest function in c3l-nli-IngestHealth/index.js:
   async function ingestNewDevice(student_id, access_token) { ... }
   Add case 'new_device': in switch()

2. Add normalization in c3l-nli-NormalizeHealth/index.js:
   function normalizeNewDevice(student_id, raw) { ... }
   Add case 'new_device': in switch()

3. Done. No DynamoDB schema change. No new Glue table. No new data product.
   The Glue crawler auto-creates a table for the new partition prefix.


================================================================================
ENVIRONMENT VARIABLES QUICK REFERENCE
================================================================================

All Lambdas must have AWS_REGION = ap-southeast-2

Lambda                          Required Env Vars
-----------------------------------------------------------------
c3l-nli-ValidateJWT             COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_REGION
c3l-nli-StoreConsent            CONSENT_TABLE
c3l-nli-IngestHealth            RAW_BUCKET, WHOOP_API_BASE, FITBIT_API_BASE
c3l-nli-NormalizeHealth         RAW_BUCKET, PROCESSED_BUCKET
c3l-nli-IngestAcademic          RAW_BUCKET, CANVAS_API_BASE, CANVAS_API_TOKEN, MOODLE_API_BASE, MOODLE_API_TOKEN
c3l-nli-NormalizeAcademic       RAW_BUCKET, PROCESSED_BUCKET
c3l-nli-UpdateGluePartition     GLUE_DATABASE, GLUE_ROLE, RAW_BUCKET
c3l-nli-UpdateDataZoneAsset     DATAZONE_DOMAIN_ID, DATAZONE_DATASOURCE_ID
c3l-nli-UpdateLakeFormationFilter  AWS_ACCOUNT_ID, GLUE_DATABASE, STAFF_ROLE_ARN, CONSENT_TABLE


================================================================================
