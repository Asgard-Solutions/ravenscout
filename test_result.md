#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Implement production-ready AWS S3-backed cloud media storage for Pro
  users using pre-signed PUT URLs, replacing the prior CloudMediaStore
  stub. Backend mints short-lived URLs; mobile app uploads directly to
  S3. Core/Free local storage must be unchanged. Graceful fallback to
  device-local storage (with pendingCloudSync=true) when S3 env vars
  are absent or any step fails.

backend:
  - task: "POST /api/media/presign-upload endpoint (Pro tier)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added endpoint. Requires Bearer session token + tier=pro. Returns
          503 when AWS_REGION/S3_BUCKET_NAME aren't configured (expected in
          this environment). Validates role in {primary, context, thumbnail}
          and extension in {jpg, jpeg, png, webp}. Rejects 403 for
          non-Pro users. Storage key format:
          hunts/{userId}/{huntId}/{role}/{imageId}.{ext}. No AWS credentials
          leave the backend.
      - working: true
        agent: "testing"
        comment: |
          Contract verified against preview URL. All assertions pass:
          • no-auth -> 401 "Not authenticated"
          • trial bearer -> 403 "Cloud media storage is a Pro tier feature."
          • pro + role='bogus' -> 400 listing allowed roles
            (validation runs BEFORE S3-configured check, as required)
          • pro + extension='exe' -> 400 listing allowed extensions
          • pro + mime='application/octet-stream' -> 400 "mime must be an image/* type"
          • pro + valid payload -> 503 "Cloud media storage is not configured
            on this server." (AWS env vars deliberately blank)
          Tested with test_session_rs_001 (pro) and test_session_trial_001
          (trial). No real S3 upload attempted.

  - task: "POST /api/media/presign-download endpoint (Pro tier)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added. Enforces ownership — storageKey must begin with
          hunts/{caller_user_id}/... Returns 503 when S3 not configured.
      - working: true
        agent: "testing"
        comment: |
          All contract behaviors verified:
          • no-auth -> 401
          • trial bearer -> 403 Pro-gated
          • storageKey containing '..' -> 400 "Invalid storage key"
          • storageKey starting with '/' -> 400
          • storageKey not prefixed with 'hunts/' -> 400
          • cross-user ownership mismatch (hunts/ANOTHER_USER/...)
            -> 403 "Storage key does not belong to caller"
            (ownership check runs BEFORE S3-configured check, as required)
          • pro + own valid key -> 503 "Cloud media storage is not configured"

  - task: "POST /api/media/delete endpoint (Pro tier, best-effort)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added. Ownership check identical to presign-download. Idempotent —
          returns success=true even when object was already absent. When S3
          is not configured, returns {success:false, reason:"S3 not configured"}
          so the mobile client can still clean up local state.
      - working: true
        agent: "testing"
        comment: |
          All contract behaviors verified:
          • no-auth -> 401
          • trial bearer -> 403 Pro-gated
          • '..' in key -> 400
          • '/' prefix -> 400
          • cross-user ownership mismatch -> 403 (before 503 check)
          • pro + own key with S3 not configured -> 200 with
            {"success": false, "reason": "S3 not configured"}
            — exact body confirmed, enabling local-state cleanup.

  - task: "s3_service module (boto3 presign helper)"
    implemented: true
    working: true
    file: "/app/backend/s3_service.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New module. Lazy-loads boto3 client from env. Supports optional
          CLOUDFRONT_BASE_URL / S3_PUBLIC_BASE_URL for public delivery,
          otherwise treats the bucket as private and callers should use
          signed-GET. Key builder is deterministic and sanitized.
      - working: true
        agent: "testing"
        comment: |
          is_configured() correctly returns False with blank AWS env,
          causing the endpoints to branch to their documented not-configured
          responses. boto3 presign code paths were not exercised (intentional
          — no live S3 in this env) and the module's contract surface
          (is_configured, build_storage_key-derived keys) behaves as
          expected through the HTTP layer.

frontend:
  - task: "CloudMediaStore — real S3 upload (replacing stub)"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/media/adapters/CloudMediaStore.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Rewrote the stub. Real flow: write compressed bytes to temp file,
          request presign, upload via expo-file-system uploadAsync PUT,
          clean up temp on success. Fallback Strategy B: on any failure,
          keep the temp file bytes and stamp asset with
          pendingCloudSync=true so UI still renders.
          Auth token is read via cloudConfig (default provider consults
          AsyncStorage session_token).
          Unit tests: yarn test:unit now 73/73 passing (was 57/57).
          Will be validated end-to-end on a real Pro device once AWS env
          vars are provided. No frontend testing requested by user.

metadata:
  created_by: "main_agent"
  version: "3.2"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Implemented real AWS S3 cloud media storage for Pro users. Since the
      test environment does NOT have AWS credentials/bucket configured,
      please validate contract-level correctness only:

      1. GET /api/auth/me works for existing Pro session token
         (pjacobsen@asgardsolution.io / user_868e51d0eb87).
         Session token lives in /app/memory/test_credentials.md.

      2. POST /api/media/presign-upload — with Pro Bearer token and body
         { imageId:"img_t1", huntId:"hunt_t1", role:"primary",
           mime:"image/jpeg", extension:"jpg" }
         EXPECTED: 503 with detail "Cloud media storage is not configured
         on this server." (because AWS env vars are blank)

      3. POST /api/media/presign-upload without any auth
         EXPECTED: 401

      4. POST /api/media/presign-upload with a non-Pro user — use the
         Trial test user: Bearer test_session_trial_001
         (user_id=test-user-trial, tier=trial, seeded in DB).
         EXPECTED: 403 with detail mentioning Pro tier feature.

      5. POST /api/media/presign-upload as Pro user with invalid role
         "bogus"
         EXPECTED: 400 mentioning allowed roles.

      6. POST /api/media/presign-upload as Pro user with invalid extension
         "exe"
         EXPECTED: 400 mentioning allowed extensions.

      7. POST /api/media/presign-download as Pro user with
         storageKey = "hunts/ANOTHER_USER/h1/primary/img.jpg"
         EXPECTED: 403 "Storage key does not belong to caller".

      8. POST /api/media/delete as Pro user with ownership-mismatched key
         EXPECTED: 403.

      9. POST /api/media/delete as Pro user with own key (e.g.
         "hunts/user_868e51d0eb87/h1/primary/img.jpg")
         EXPECTED: 200 with {"success": false, "reason": "S3 not configured"}
         (since S3 isn't configured in this env).

      10. Existing endpoints regression check: /api/health,
          /api/species, /api/analyze-hunt still work for a Pro user.

      Do NOT attempt a real upload — we only want to verify the presign
      *contract* today. Please use the backend at the preview URL
      (EXPO_PUBLIC_BACKEND_URL in /app/frontend/.env).

  - agent: "testing"
    message: |
      Backend presign contract validated end-to-end against the preview
      URL (https://asgard-tactical.preview.emergentagent.com/api). Test
      harness: /app/backend_test.py — 34/34 assertions pass.

      Summary of verified behavior:

      POST /api/media/presign-upload
        ✅ 401 without auth
        ✅ 403 for trial (detail mentions Pro tier)
        ✅ 400 for role='bogus' (validation fires BEFORE 503)
        ✅ 400 for extension='exe'
        ✅ 400 for non-image mime
        ✅ 503 for Pro+valid payload, detail: "Cloud media storage is
           not configured on this server."

      POST /api/media/presign-download
        ✅ 401 without auth
        ✅ 403 for trial (Pro-gated)
        ✅ 400 for storageKey containing '..'
        ✅ 400 for storageKey starting with '/'
        ✅ 400 for storageKey not prefixed with 'hunts/'
        ✅ 403 for cross-user ownership mismatch — ownership check
           runs BEFORE the S3-configured check, as required
        ✅ 503 for Pro+own key, detail: "Cloud media storage is not
           configured"

      POST /api/media/delete
        ✅ 401/403/400 gating identical to presign-download
        ✅ 200 with body {"success": false, "reason": "S3 not configured"}
           for Pro+own key when S3 is not configured — client can still
           clean up local state as designed.

      Regression smoke:
        ✅ GET /api/health -> 200 {"status":"ok"}
        ✅ GET /api/auth/me (Bearer test_session_rs_001) -> 200,
           tier=pro, user_id=test-user-001
        ✅ GET /api/subscription/tiers -> 200 with trial/core/pro
        ✅ GET /api/species -> 200 with deer/turkey/hog
        (analyze-hunt intentionally not exercised — expensive + the
         user asked us to skip it.)

      No real S3 calls were made. AWS env vars remain deliberately
      blank. No fixes applied to source — contract is correct as
      implemented. No stuck tasks. Main agent: please summarise and
      finish.

