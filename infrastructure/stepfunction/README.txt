================================================================================
c3l-NLI — STEP FUNCTION STATE MACHINE
c3l-nli-ConsentShareStateMachine | Amazon States Language (ASL)
Region: ap-southeast-2 | Account: 184898280326
================================================================================

FILE: infrastructure/stepfunction/c3l-nli-ConsentShareStateMachine.json


================================================================================
OVERVIEW
================================================================================

This state machine is the orchestration backbone of the NextLevel Insights
consent-driven data pipeline.

It is triggered every time a student clicks "Share Resource" in the UI.

API Gateway receives the POST request and starts a Step Functions execution:
  POST /consent
  Body: { "token": "Bearer eyJ...", "resources": ["health#whoop", "academic#canvas_lms"] }


================================================================================
STATE MACHINE FLOW
================================================================================

  [START]
     |
     v
  ValidateJWT  (Task)
     Calls: c3l-nli-ValidateJWT Lambda
     On error: → AuthFailed (Fail state)
     Output : { student_id, role, resources }
     |
     v
  StoreConsent  (Task)
     Calls: c3l-nli-StoreConsent Lambda
     Writes: DynamoDB nextlevel-consent — one item per resource
     Output : { student_id, role, resources_stored, resources }
     |
     v
  MapOverResources  (Map)
     Type          : Map
     Items         : consent.resources  ["health#whoop", "academic#canvas_lms"]
     MaxConcurrency: 5 (parallel processing)
     |
     |-- For each resource:
     |
     v
     ParseResource  (Pass)
       Extracts student_id and access_tokens from execution input
       |
       v
     ChooseDomain  (Choice)
       health#*   → HealthBranch_Ingest
       academic#* → AcademicBranch_Ingest
       default    → UnsupportedDomain (Fail)
       |
       +----------HEALTH BRANCH-----------+
       |                                  |
       v                                  v
       HealthBranch_Ingest          AcademicBranch_Ingest
       (c3l-nli-IngestHealth)       (c3l-nli-IngestAcademic)
       Pulls raw from wearable API  Pulls raw from LMS API
       Saves to S3 raw/domain=health/  Saves to S3 raw/domain=academic/
       |                                  |
       v                                  v
       HealthBranch_Normalize      AcademicBranch_Normalize
       (c3l-nli-NormalizeHealth)   (c3l-nli-NormalizeAcademic)
       → processed/domain=health/  → processed/domain=academic/
       +----------------------------------+
                     |
                     v (shared from here)
              UpdateGluePartition  (Task)
                (c3l-nli-UpdateGluePartition)
                Starts Glue crawler (auto-creates if missing)
                Polls until READY (max 4 min)
                     |
                     v
              UpdateDataZoneAsset  (Task)
                (c3l-nli-UpdateDataZoneAsset)
                Triggers DataZone data-source sync
                Polls until SUCCEEDED (max 5 min)
                     |
                     v
              UpdateLakeFormationFilter  (Task)
                (c3l-nli-UpdateLakeFormationFilter)
                Upserts Data Cells Filter:
                  student_id IN (all consented students)
                     |
                     v
              ResourceComplete  (Pass)
                { pipeline_complete: true, athena_ready: true }
                [END of Map iterator]

  MapOverResources results collected → pipeline_results array
     |
     v
  PipelineComplete  (Pass)
     { status: "SUCCESS", resources_count, pipeline_results }
     [END]


================================================================================
INPUT SCHEMA
================================================================================

{
  "token": "Bearer eyJhbGciOiJSUzI1NiIs...",
  "resources": [
    "health#whoop",
    "health#fitbit",
    "academic#canvas_lms"
  ],
  "access_tokens": {
    "health":   "<whoop or fitbit oauth token>",
    "academic": "<canvas or moodle api token>"
  }
}

Note: access_tokens.health is used by all health device ingestion.
For per-device tokens in future, extend access_tokens to:
  { "whoop": "...", "fitbit": "...", "canvas_lms": "..." }


================================================================================
OUTPUT SCHEMA (on SUCCESS)
================================================================================

{
  "status": "SUCCESS",
  "student_id": "abc-uuid-123",
  "resources_count": 3,
  "pipeline_results": [
    {
      "student_id": "abc-uuid-123",
      "domain": "health",
      "device_type": "whoop",
      "record_count": 45,
      "lf_filter": "c3l-nli-staff-filter-health-whoop",
      "pipeline_complete": true,
      "athena_ready": true
    },
    ...
  ]
}


================================================================================
ERROR HANDLING
================================================================================

State              Error Type          Handling
----------------------------------------------------------------------
ValidateJWT        All errors          → AuthFailed (Fail state)
                                         Stops execution immediately
StoreConsent       Lambda errors       Retry x3, backoff x2
IngestHealth       Lambda errors       Retry x2, backoff x2
IngestAcademic     Lambda errors       Retry x2, backoff x2
UpdateGluePartition  Timeout           Task timeout = 240s (4 min)
UpdateDataZoneAsset  Timeout           Task timeout = 360s (6 min)


================================================================================
DEPLOY COMMAND (CLI)
================================================================================

# Create execution role first (required)
EXECUTION_ROLE="arn:aws:iam::184898280326:role/c3l-nli-StepFunctionExecutionRole"

aws stepfunctions create-state-machine \
  --name c3l-nli-ConsentShareStateMachine \
  --definition file://infrastructure/stepfunction/c3l-nli-ConsentShareStateMachine.json \
  --role-arn "$EXECUTION_ROLE" \
  --region ap-southeast-2 --profile c3l-analytics

# Update existing state machine:
STATE_MACHINE_ARN="arn:aws:states:ap-southeast-2:184898280326:stateMachine:c3l-nli-ConsentShareStateMachine"

aws stepfunctions update-state-machine \
  --state-machine-arn "$STATE_MACHINE_ARN" \
  --definition file://infrastructure/stepfunction/c3l-nli-ConsentShareStateMachine.json \
  --region ap-southeast-2 --profile c3l-analytics

# Start execution manually for testing:
aws stepfunctions start-execution \
  --state-machine-arn "$STATE_MACHINE_ARN" \
  --name "test-$(date +%s)" \
  --input '{"token":"Bearer eyJ...","resources":["health#whoop"],"access_tokens":{"health":"whoop_token_here"}}' \
  --region ap-southeast-2 --profile c3l-analytics


================================================================================
EXECUTION ROLE REQUIRED PERMISSIONS
================================================================================

The Step Function execution role (c3l-nli-StepFunctionExecutionRole) needs:
  lambda:InvokeFunction on:
    arn:aws:lambda:ap-southeast-2:184898280326:function:c3l-nli-*


================================================================================
