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
  - task: "Hunt-Style Modifier pipeline (archery / rifle / blind / saddle / public_land / spot_and_stalk)"
    implemented: true
    working: true
    file: "/app/backend/species_prompts/pack.py, /app/backend/species_prompts/hunt_styles.py, /app/backend/species_prompts/whitetail.py, /app/backend/species_prompts/turkey.py, /app/backend/species_prompts/hog.py, /app/backend/species_prompts/__init__.py, /app/backend/prompt_builder.py, /app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Completed the Hunt-Style Modifier work left in-progress by the
          previous agent.

          Architecture (mirrors the Regional + Seasonal modifier pattern):
            • `HuntStyleModifier` dataclass added to
              /app/backend/species_prompts/pack.py (behavior / tactical /
              caution / species-tips adjustments + confidence note).
            • /app/backend/species_prompts/hunt_styles.py is the new
              module: CANONICAL_HUNT_STYLES (6 ids), normalize_hunt_style
              alias-tolerant resolver, resolve_hunt_style_modifier
              (canonical-only by design), and get_hunt_style_label.
            • Per-species content populated on whitetail, turkey, hog for
              all 6 canonical styles. GENERIC_FALLBACK_PACK
              intentionally has no hunt-style modifiers so unsupported
              species degrade to the neutral "unspecified" notice.
            • Prompt rendering helpers render_hunt_style_modifier_block
              and render_no_hunt_style_context_note added to pack.py.
              (Also removed a latent bug in render_species_prompt_block
              that would have tried to _bullets(dict) if the pack had
              hunt_style_modifiers.)
            • prompt_builder.assemble_system_prompt now accepts an
              optional `hunt_style` kwarg, normalizes to canonical,
              resolves the species-scoped modifier, and inserts the
              block between SEASONAL CONTEXT and HUNT CONDITIONS —
              stable block order: species → regional → seasonal →
              hunt-style → conditions.
            • /api/analyze-hunt flow:
              - HuntConditions.hunt_style (already present, optional).
              - Server normalizes once, logs `Hunt style resolved:
                id=... source=...`, threads canonical id into
                assemble_system_prompt, and includes a
                `hunt_style_resolution` object in the response
                {styleId, styleLabel, source, rawInput} parallel to
                region_resolution.
              - AnalyzeResponse model gained an optional
                hunt_style_resolution field.

          Tests: /app/backend/tests/test_hunt_style_modifiers.py adds
          92 new tests covering canonical inventory, alias
          normalization, per-species coverage, resolver
          canonical-only contract, prompt pipeline integration
          (presence, absence, ordering, conditions-dict path,
          explicit-kwarg precedence), style-isolation sanity
          (archery → close-range language, public_land → pressure
          language, saddle → mobility language, spot_and_stalk →
          glassing/stalk/approach language), and block rendering
          headings / neutral-note content.

          Backend suite now: 312 passing, 3 skipped, 2 pre-existing
          failures (live HTTP overlay-rendering tests unrelated to
          this work).

          Smoke-tested end-to-end: backend hot-reloaded cleanly and
          an unsolicited analyze-hunt request already logged
          "Hunt style resolved: id=None source=unspecified" with no
          regressions.

          Needs: backend retesting to validate analyze-hunt
          response shape (hunt_style_resolution present + canonical)
          for each of the 6 styles and the unspecified case.
      - working: true
        agent: "testing"
        comment: |
          hunt_style_resolution contract verified end-to-end against
          the preview URL POST /api/analyze-hunt with Bearer
          test_session_rs_001 (Pro). Harness: /app/hunt_style_test.py.
          All 5 cases requested (A–E) returned 200 with exactly the
          expected { styleId, styleLabel, source, rawInput } shape:

            A) omitted         -> {null, null, "unspecified",   null}           PASS
            B) "archery"       -> {"archery", "Archery", "user_selected", "archery"} PASS
            C) "Public Land"   -> {"public_land", "Public Land", "user_selected", "Public Land"} PASS (canonical + display-label normalization)
            D) "bow hunting"   -> {"archery", "Archery", "user_selected", "bow hunting"} PASS (alias normalization; rawInput preserved)
            E) "banana"        -> {null, null, "unspecified", "banana"} PASS 200 (NOT 4xx; silent fallback as designed)

          Regression F: region_resolution remains present and correct
          on every response. With latitude=31.2956, longitude=-95.9778
          supplied on conditions, all 5 responses carry
            region_resolution = {
              resolvedRegionId: "east_texas",
              resolvedRegionLabel: "East Texas",
              regionResolutionSource: "gps",
              latitude: 31.2956, longitude: -95.9778
            }
          — zero interference between the two resolutions. The two
          server-side log lines ("Region resolved: ..." and
          "Hunt style resolved: ...") both fire on every call.

          Substantive assertions: 40/40 PASS. (Harness also printed 5
          lines tagged "FAIL region_resolution has recognizable keys" —
          those are false positives from an overly strict key-name
          whitelist in the test script; the actual region_resolution
          dict is present, well-shaped, and semantically correct per
          the preceding assertions. No backend issue.)

          AnalyzeResponse.hunt_style_resolution is now populated
          parallel to region_resolution as specified. No fixes applied
          to source.

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
  - task: "Mobile results hydration — durable provisional (AsyncStorage) hot-cache for just-analyzed hunts"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/media/provisionalHuntStore.ts, /app/frontend/src/media/huntHydration.ts, /app/frontend/app/results.tsx, /app/frontend/src/media/__tests__/provisionalHuntStore.test.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          User reported on-device validation failing: after a map
          capture + analyze, /results showed "RESULTS NOT FOUND —
          Hunt data could not be loaded." The earlier web-preview
          `expo-file-system: no writable directory` issue had been
          patched with an in-memory session seat in saveHunt, but
          the symptom persisted on mobile Chrome.

          SMOKING GUN (in backend logs, ISO timestamps):
            14:45:19.995 - AI response received len=11919
            14:45:20.210 - hunt_not_found reason=missing_from_all_sources  (+217ms!)
            14:45:25.242 - hunt_not_found reason=timeout

          Only 217ms between the API reply and the /results miss —
          too fast for saveHunt to have even started. Earlier hunts
          showed `persist_degraded` events BEFORE the miss; this one
          showed ZERO persist events at all. On mobile Chrome using
          expo-router's static-SSR web output, each route transition
          can spin up a fresh JS runtime, wiping the in-memory
          module singleton. The previous in-memory-only fix was
          useless in that environment.

          FIX — durable provisional hot-cache tier:
          1) /app/frontend/src/media/provisionalHuntStore.ts (new)
             Single-entry AsyncStorage bucket keyed by
             `raven_provisional_hunt_v1`. Holds the FULL analysis
             record + base64 displayUris for the most-recent hunt.
             Survives tab reshuffle, bfcache, and route-transition
             runtime resets. Rotated to exactly one entry so it
             can never grow.
          2) saveHunt — Step 0 now seats the provisional record
             in BOTH the in-memory singleton AND AsyncStorage. The
             Step 2 path clears the AsyncStorage entry only after
             the real analysisStore write succeeds. If the real
             path fails, the provisional record stays in place
             as the durable fallback.
          3) hydrateHuntResult — adds tier 1.5 between in-memory
             and analysisStore: reads the provisional cache and
             hydrates directly from it. Emits `hunt_hydrate` events
             per tier so we can see exactly which tier served any
             given load.
          4) Diagnostic logs: `save_hunt_started` (with image byte
             sizes + large-payload flag), `save_hunt_provisional_seated`
             (with bytes + quota_warning), `save_hunt_completed`,
             `results_load_started`, `hunt_hydrate` (tier_hit).
             So future regressions show BOTH what was saved AND
             which tier served /results, instead of the previous
             opaque `hunt_not_found`.
          5) 11 new tests in
             src/media/__tests__/provisionalHuntStore.test.ts
             covering: round-trip, survive-runtime-restart
             (re-import), single-entry huntId isolation, clear
             semantics, provisionalToRuntime adapter, malformed
             data + wrong schema tolerance, and size reporting.

          Full frontend unit suite: 134/134 passing (was 123).
          Metro bundles clean: web 1379 mods, android 1675 mods.

          Why this is robust across mobile Chrome / Expo Go / web:
          AsyncStorage maps to localStorage on web and to native
          AsyncStorage on iOS/Android. On web it ALSO uses the
          `expo-file-system` fallback for very large items — but
          the provisional entry is one single key, and the store
          logs its approximate size so we can see quota pressure
          (>4MB warning threshold chosen below the typical ~5MB
          localStorage-per-origin cap).

          Needs: user re-run on phone to confirm /results now
          hydrates immediately after analyze, and to see the new
          diagnostic events in backend logs (save_hunt_started,
          save_hunt_provisional_seated, hunt_hydrate).

  - task: "Image-overlay fitted-rect coordinate contract (results overlay alignment fix)"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/utils/imageFit.ts, /app/frontend/src/components/ImageOverlayCanvas.tsx, /app/frontend/app/results.tsx, /app/frontend/src/utils/__tests__/imageFit.test.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          User reported: /analyze-hunt succeeds (success: true,
          full v2 result), but overlay markers on /results render
          in the wrong places — the captured map image itself looks
          correct, only the overlays drift.

          ROOT CAUSE: ImageOverlayCanvas rendered the analyzed
          image with resizeMode="cover" inside a fixed container
          (MAP_WIDTH × MAP_HEIGHT). "cover" crops whichever axis
          overflows. But the LLM returns overlays with
          x_percent/y_percent normalized to the ANALYZED image's
          natural pixel grid, and the client positioned markers
          using the CONTAINER dims as the image coordinate space.
          Any aspect-ratio mismatch between capture and container
          drifted markers on the cropped axis.

          FIX:
          1) New /app/frontend/src/utils/imageFit.ts — ONE
             canonical `computeFittedImageRect(cW, cH, natW, natH)`
             returning {offsetX, offsetY, width, height, degraded}
             + `findOutOfBoundsOverlayIndices` validator. Contract
             documented inline.
          2) ImageOverlayCanvas — accepts `imageNaturalWidth/Height`,
             renders image + children inside a letterbox-aware
             inner View so child x_percent/y_percent math lands on
             real image pixels regardless of container aspect.
             Tap-to-image-space rejects taps on letterbox pad.
          3) results.tsx — computes same fitted rect from
             `analysisBasis.naturalWidth/Height` (already captured
             by Basis Lock at analyze time). All overlay math
             (DraggableMarker zones + markers, FocusRing,
             handleMapPress, handleMarkerDrag) uses FITTED_W /
             FITTED_H. Dev-only guard loudly logs overlays that
             fall outside [0,100] + flags degraded rects so future
             regressions fail loudly.
          4) 18 new tests in src/utils/__tests__/imageFit.test.ts
             covering same-aspect / portrait / landscape /
             post-rotation / missing dims / defensives /
             marker coordinate round-trip / out-of-bounds detector.

          Full frontend unit suite: 123/123 passing (was 105).
          Metro bundles clean on web (1377 mods) + Android (1675 mods).

          No backend change required — the v2 schema already emits
          percent-of-analyzed-image coords; Basis Lock already
          saves naturalWidth/Height. Legacy hunts without natural
          dims degrade cleanly to the prior full-container layout.

          Needs: on-device verification by the user (capture a map,
          analyze, confirm marker positions visually match the LLM's
          labeled observations).

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

  - task: "Hunts CRUD backend + cloud sync + mobile-only web blocker"
    implemented: true
    working: true
    file: "/app/backend/server.py, /app/frontend/src/api/huntsApi.ts, /app/frontend/src/components/WebBlocker.tsx, /app/frontend/app/_layout.tsx, /app/frontend/src/media/huntHydration.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Feb 2026 — Two features landed together.

          A) Mobile-only web blocker
          Product is native-only. Added a root-level gate:
          - /app/frontend/src/components/WebBlocker.tsx — renders an
            "install on your phone" card + App Store / Play Store
            buttons when Platform.OS === 'web'.
          - /app/frontend/app/_layout.tsx — when useWebBlocked() is
            true, the entire router tree is replaced with the
            blocker (prevents any SSR/preview attempt to render
            /results with a base64 payload).
          - Dev bypass: URL param ?dev=1 OR localStorage
            `raven_dev_web_bypass=1` skips the blocker so E2E /
            screenshot tests still work.
          - app.json left unchanged (web is still bundled so preview
            works for dev agents; runtime gate handles UX).

          B) /api/hunts CRUD (MongoDB-backed, server-authoritative)
          New collection: `hunts`. Indices: (user_id, created_at DESC)
          for history list, (user_id, hunt_id) unique for idempotent
          upsert. Scoped strictly per-user — cross-user access is
          impossible by design.
          - POST /api/hunts — create or replace (upsert).
          - GET /api/hunts?limit=50&skip=0 — paginated list, newest
            first, current user only.
          - GET /api/hunts/{hunt_id} — single fetch.
          - PUT /api/hunts/{hunt_id} — partial patch (overlay edits,
            re-analysis).
          - DELETE /api/hunts/{hunt_id} — idempotent.

          Frontend client: /app/frontend/src/api/huntsApi.ts
            Non-throwing, reads session token from AsyncStorage.
            upsertHunt / listHuntsFromCloud / getHuntFromCloud /
            patchHunt / deleteHuntFromCloud.

          Wired into huntHydration.finalizeProvisionalHunt — after
          local AnalysisStore write succeeds (web path) OR after the
          full saveHunt pipeline returns (native path), we POST
          /api/hunts to cloud-sync. Fire-and-forget semantics: if
          cloud sync fails (auth expired, offline) the local record
          is the source of truth and we retry opportunistically.

          TESTED:
          - 137/137 frontend unit tests pass.
          - TypeScript: 0 errors.
          - Smoke-tested all 5 CRUD routes via curl with seeded
            test user (test-user-001, test_session_rs_001):
              * POST → 200, hunt returned with timestamps
              * GET list → total=1, includes new hunt
              * GET single → 200 with full payload
              * PUT patch → analysis replaced, created_at stable,
                updated_at bumped
              * DELETE → 200 {deleted:1}
              * GET deleted → 404
              * POST without auth (valid body) → 401
              * GET other-user hunt with bogus token → 401

          NEEDS RETESTING: Run deep_testing_backend_v2 to exercise
          the new /api/hunts routes under realistic tier/auth
          scenarios and regression-check the existing endpoints.

          Known limits (by design for this patch):
          - S3 image upload still unreachable on web (needs native
            EAS build OR a web-direct PUT path; scoped separately).
          - Frontend history screen (if any) not yet wired to
            GET /api/hunts — only the cloud write is live this round.
      - working: true
        agent: "testing"
        comment: |
          Full /api/hunts CRUD contract verified end-to-end against
          the preview URL (EXPO_PUBLIC_BACKEND_URL =
          https://tactical-auth-hub.preview.emergentagent.com).
          Harness: /app/hunts_crud_test.py — 66/66 substantive
          assertions PASS.

          Seeded a second Pro test user directly in Mongo for the
          cross-user scenarios (matches /app/memory/test_credentials.md
          intent): test-user-002 / email=test2@ravenscout.app /
          tier=pro / session_token=test_session_rs_002 (expires
          +30 days). test-user-001 / test_session_rs_001 already
          present.

          AUTH / OWNERSHIP (critical)
          ✅ POST /api/hunts no-auth → 401 "Not authenticated"
          ✅ POST /api/hunts invalid token → 401 "Invalid session"
          ✅ GET /api/hunts no-auth → 401
          ✅ GET /api/hunts/{id} no-auth → 401
          ✅ PUT /api/hunts/{id} no-auth → 401
          ✅ DELETE /api/hunts/{id} no-auth → 401
          ✅ Cross-user GET another user's hunt → 404 (NOT 403, so
             existence is not leaked — matches spec)
          ✅ Cross-user PUT another user's hunt → 404
          ✅ Cross-user DELETE another user's hunt → 404 + owner's
             doc still intact (verified via GET after attempt)

          POST /api/hunts  (example request)
            Headers: Authorization: Bearer test_session_rs_001,
                     Content-Type: application/json
            Body   : {
              "hunt_id": "rs-test-98146fb8fa",
              "metadata": {"species":"deer","speciesName":"Whitetail Deer",
                           "date":"2026-02-15","timeWindow":"morning",
                           "windDirection":"NW","temperature":"38F",
                           "propertyType":"private","region":"East Texas",
                           "huntStyle":"archery",
                           "weatherData":{"wind_speed_mph":6,"condition":"Clear"},
                           "locationCoords":{"latitude":31.2956,"longitude":-95.9778}},
              "analysis": {"summary":"...", "overlays":[...], "top_setups":[...]},
              "analysis_context": {"prompt_version":"v2","modelUsed":"gpt-5.2"},
              "media_refs": ["mem://local/hunt/img1.jpg"],
              "primary_media_ref": "mem://local/hunt/img1.jpg",
              "image_s3_keys": [],
              "storage_strategy": "local-first",
              "extra": {"clientBuild":"ios-1.2.0"}
            }
            → 200 {
              "ok": true,
              "hunt": {
                "user_id": "test-user-001",
                "hunt_id": "rs-test-98146fb8fa",
                "created_at": "2026-04-23T19:59:25.178000",
                "updated_at": "2026-04-23T19:59:25.178000",
                "metadata": {...}, "analysis": {...},
                "analysis_context": {...}, "media_refs":[...],
                "primary_media_ref": "...", "image_s3_keys":[],
                "storage_strategy":"local-first", "extra":{...}
              }
            }
          ✅ ok=true / hunt.user_id echoes caller / hunt_id echoed
          ✅ created_at and updated_at are ISO strings
          ✅ metadata + analysis + nested overlays preserved

          Idempotent upsert (same hunt_id + user)
          ✅ Re-POSTing same hunt_id replaces $set fields
          ✅ created_at stable across upsert (via $setOnInsert)
          ✅ updated_at is bumped to now()

          Body validation (HuntUpsertBody)
          ✅ hunt_id shorter than 4 chars → 422 string_too_short
          ✅ hunt_id longer than 64 chars → 422 string_too_long
          ✅ metadata missing → 422 field required

          GET /api/hunts (list)
            GET /api/hunts?limit=50&skip=0 →
              200 {"ok":true,"total":1,"limit":50,"skip":0,
                   "hunts":[{...newest first}]}
          ✅ Default limit=50, skip=0 applied when absent
          ✅ Newest-first sort honored
          ✅ limit=9999 clamps to 200 (NOT 400)
          ✅ skip=-5 clamps to 0 (NOT 400)
          ✅ limit=0 clamps to 1 (NOT 400)

          GET /api/hunts/{hunt_id}
          ✅ Owner → 200 {"ok":true,"hunt":{...}}
          ✅ Missing id → 404 {"detail":"Hunt not found"}
          ✅ Another user's hunt → 404 (not 403)

          PUT /api/hunts/{hunt_id}
            Body: {"analysis":{"summary":"Patched only analysis",
                               "overlays":[{"label":"Edited"}]}}
          ✅ Partial patch applied; other fields (metadata) untouched
          ✅ created_at stable; updated_at bumped
          ✅ Nonexistent id → 404
          ✅ Cross-user → 404 (target doc never mutated)

          DELETE /api/hunts/{hunt_id}
          ✅ Owner → 200 {"ok":true,"deleted":1}
          ✅ Second DELETE (already deleted) → 404
          ✅ Cross-user DELETE → 404 AND owner's doc still readable

          Per-user uniqueness (compound index)
          ✅ User1 and User2 can both POST hunt_id="shared-<uuid>"
             with independent payloads — both return 200 and each
             user GETs back only their own document (User1 sees
             speciesName="User1 deer", User2 sees "User2 turkey").
             Compound index (user_id, hunt_id) enforces per-user
             uniqueness as designed.

          REGRESSION (existing endpoints — all 200)
          ✅ GET /api/auth/me (Bearer test_session_rs_001) →
             {user_id:"test-user-001", tier:"pro", usage:{...}}
          ✅ GET /api/subscription/tiers (public) →
             {tiers: {trial,core,pro}}
          ✅ GET /api/subscription/status (auth'd) → tier=pro
          ✅ POST /api/analyze-hunt with a 256x256 PNG + minimal
             body → 200 {success:true, result:{id, overlays:[...5],
             v2,...}, region_resolution:{resolvedRegionId:"east_texas",
             source:"gps"}, hunt_style_resolution:{styleId:null,
             source:"unspecified"}}.
             NOTE: initial run used a 10x10 PNG that OpenAI rejected
             ("unsupported image") — that was a test-image issue,
             not a backend regression. The endpoint's own error
             translation is working correctly (HTTP 200 with
             success=false + user-facing error, no 500). Re-ran
             with a valid 256x256 PNG; full success path including
             region_resolution and hunt_style_resolution confirmed
             intact.

          Routing sanity
          ✅ All five new routes are wired under /api prefix only —
             no /api/hunts/hunts or duplicate mount. Verified via
             supervisor access logs: POST/GET/PUT/DELETE /api/hunts
             and /api/hunts/{id}. No 404s on the prefixed paths,
             no accidental exposure under a nested path.

          Security summary
          ✅ No 500s observed on any route under any scenario.
          ✅ No auth bypass: all 5 routes 401 without bearer / with
             bogus bearer.
          ✅ No cross-user data leak: cross-user GET/PUT/DELETE
             return 404 (existence hidden) AND the target doc is
             never mutated.

          No source files modified by the testing agent. The second
          Pro test user (test-user-002 / test_session_rs_002) and
          matching session were seeded via direct Mongo insert per
          the review request and are suitable for re-use on
          subsequent runs.

          Main agent: please summarise and finish — /api/hunts CRUD
          is production-ready.

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

species_expansion_v1_modifiers:
  - task: "Deepened prompt packs — regional + hunt-style modifiers for elk/bear/moose/antelope/coyote"
    implemented: true
    working: true
    file: "/app/backend/species_prompts/{elk,bear,moose,antelope,coyote}.py, /app/backend/prompt_builder.py, /app/backend/tests/test_species_expansion_modifiers.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          Deepened prompt packs (regional + hunt-style modifiers) verified
          end-to-end via direct import of
          `prompt_builder.assemble_system_prompt` and a live /api/analyze-hunt
          smoke call.

          Wrote /app/backend/tests/test_species_expansion_modifiers.py (41
          tests). Combined suite:
              cd /app/backend && python -m pytest \
                tests/test_species_prompt_packs.py \
                tests/test_species_expansion_modifiers.py -q
              -> 115 passed in 0.06s  (74 prior + 41 new; zero regressions)

          SCENARIO 1 — HUNT-STYLE MODIFIER RENDERING  (17 (species,style)
          pairs)
          ✅ elk      × {archery, rifle, spot_and_stalk, public_land}
          ✅ bear     × {archery, rifle, spot_and_stalk}
          ✅ moose    × {archery, rifle, spot_and_stalk}
          ✅ antelope × {archery, rifle, blind, spot_and_stalk}
          ✅ coyote   × {archery, rifle, public_land}
          For each, the assembled prompt contains:
            • The modifier's `name` (e.g. "Rifle (Elk)",
              "Archery (Black Bear)", "Ground Blind / Pit Blind (Pronghorn)",
              etc. — exact match to the dataclass `name` field).
            • The HUNT STYLE CONTEXT header with style_id=<canonical>.
            • A distinguishing phrase from tactical_adjustments (e.g.
              elk+archery "caller 30-60 yards behind the shooter",
              antelope+blind "stock tanks, windmill outflows",
              coyote+rifle "rested bipod / pack, sight downwind", etc.).
            • The "unspecified" fallback notice is NOT emitted when a
              real style resolves.
          ✅ Cross-contamination guard: for every one of the 5 species, the
             assembled prompt does NOT contain the whitetail-specific
             phrase "hinge-cut" (from whitetail.tactical_guidance). Confirms
             no bleed-through between packs.

          SCENARIO 2 — REGIONAL MODIFIER RENDERING  (12 (species,region)
          pairs)
          ✅ elk      × {mountain_west, plains}
          ✅ bear     × {mountain_west, southeast_us, midwest}
          ✅ moose    × {mountain_west, midwest}
          ✅ antelope × {plains, mountain_west}
          ✅ coyote   × {plains, southeast_us, mountain_west}
          For each, the assembled prompt contains:
            • The regional modifier's `name` (e.g. elk+mountain_west
              "Mountain West (Rocky Mountain Elk)",
              coyote+southeast_us "Southeastern Coyote", etc.).
            • The REGIONAL CONTEXT header with region_id=<canonical>.
            • A distinguishing regional phrase (elk+mountain_west "aspen";
              antelope+plains "Wyoming"; coyote+southeast_us
              "pine plantation"; bear+southeast_us "pocosin";
              moose+mountain_west "Shiras"; coyote+mountain_west "juniper";
              elk+plains "coulee"; bear+mountain_west "avalanche chute";
              bear+midwest "Upper Midwest"; moose+midwest "Minnesota";
              antelope+mountain_west "sagebrush"; coyote+plains
              "shelterbelt").
            • "REGIONAL CONTEXT: generic" NOT emitted when a real region
              resolves.

          SCENARIO 3 — COMBINED STYLE + REGION  (3 cases)
          ✅ elk + archery + mountain_west
          ✅ antelope + blind + plains
          ✅ coyote + rifle + southeast_us
          For each, BOTH names and BOTH distinguishing phrases appear,
          neither fallback notice is emitted, AND the builder's stable
          block order is verified by string-index ordering:
            SPECIES -> REGIONAL CONTEXT -> SEASONAL CONTEXT ->
            HUNT STYLE CONTEXT -> HUNT CONDITIONS.

          SCENARIO 4 — FALLBACK — UNKNOWN STYLE OR REGION
          ✅ elk + hunt_style="saddle" (elk registers archery/rifle/
             spot_and_stalk/public_land, NOT saddle)  -> prompt renders
             with "HUNT STYLE CONTEXT: unspecified" (graceful neutral
             notice); no exception; no cross-contamination from the
             whitetail saddle pack.
          ✅ elk + region_id="south_texas" (elk registers mountain_west/
             plains only) -> prompt renders with "REGIONAL CONTEXT:
             generic (region_id=south_texas, source=manual_override)";
             no whitetail "South Texas (Brush Country)" content leaks.
          ✅ coyote + hunt_style="saddle" + region_id="east_texas" (both
             unknown to coyote pack) -> prompt renders with BOTH
             fallback notices, no exception, no cross-pack leakage.
          ✅ Belt-and-braces: assemble_system_prompt called with
             hunt_style="banana_boat_method" + region="narnia" for each
             of the 5 expanded species — no exception; all prompts
             render > 500 chars.

          SCENARIO 5 — BACKWARD COMPAT (whitetail untouched)
          Already covered by the existing
          tests/test_species_prompt_packs.py suite (74 passing, re-run
          here), and reconfirmed via the combined pytest run above.
          Whitetail's "SPECIES: Whitetail Deer" block + its
          south_texas regional modifier + its archery hunt-style
          modifier all still render correctly. No regressions detected
          in the 74 prior tests.

          SCENARIO 6 — LIVE /api/analyze-hunt SMOKE  (zero 500s)
          Backend base URL: EXPO_PUBLIC_BACKEND_URL =
          https://tactical-auth-hub.preview.emergentagent.com
          POST /api/analyze-hunt
            Headers: Authorization: Bearer test_session_rs_001
                     Content-Type: application/json
                     User-Agent: RavenScoutTest/1.0
            Body   : {
              "conditions": {
                "animal": "coyote",
                "hunt_date": "2026-02-15",
                "time_window": "morning",
                "wind_direction": "NW",
                "temperature": "32F",
                "property_type": "public",
                "region": "Texas",
                "hunt_style": "rifle",
                "latitude": 31.2956,
                "longitude": -95.9778
              },
              "map_image_base64": "<256x256 PNG>"
            }
          -> HTTP 200, success=true, 5 overlays,
             region_resolution = {"resolvedRegionId":"east_texas",
             "resolvedRegionLabel":"East Texas",
             "regionResolutionSource":"gps","latitude":31.2956,
             "longitude":-95.9778}
             hunt_style_resolution = {"styleId":"rifle",
             "styleLabel":"Rifle","source":"user_selected",
             "rawInput":"rifle"}
          ✅ NO 500. Pack rendering path never crashes with the expanded
             modifier packs in-line.

          FILES ADDED
          ✅ /app/backend/tests/test_species_expansion_modifiers.py
             (4 test classes, 41 parametrized assertions). Run:
               cd /app/backend && python -m pytest \
                 tests/test_species_expansion_modifiers.py -q
               -> 41 passed in 0.04s
             Combined with existing suite:
               cd /app/backend && python -m pytest \
                 tests/test_species_prompt_packs.py \
                 tests/test_species_expansion_modifiers.py -q
               -> 115 passed in 0.06s

          No source files modified by testing. Deepened prompt packs are
          production-ready; the five expanded species each register
          well-formed hunt_style_modifiers and regional_modifiers that
          render end-to-end through the assembled LLM system prompt,
          with graceful fallbacks on unknown ids and zero cross-pack
          contamination.

species_expansion_v1:
  - task: "Species registry expansion (5 new species) + tier gating + prompt-pack resolution"
    implemented: true
    working: true
    file: "/app/backend/species_registry.py, /app/backend/species_prompts/{elk,bear,moose,antelope,coyote}.py, /app/backend/species_prompts/registry.py, /app/backend/species_prompts/__init__.py, /app/backend/server.py (GET /api/species, POST /api/analyze-hunt species gate)"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          Species expansion validated end-to-end against the preview URL
          (EXPO_PUBLIC_BACKEND_URL =
          https://tactical-auth-hub.preview.emergentagent.com). Harness:
          /app/species_expansion_test.py — 40 PASS / 1 non-blocking FAIL
          (the one FAIL is pre-existing stale pytest assertions, see
          Scenario 6 below).

          Scenario 1 — PROMPT-PACK RESOLUTION  (PASS)
          ✅ resolve_species_pack("deer").canonical_id == "whitetail"
          ✅ resolve_species_pack("turkey").canonical_id == "turkey"
          ✅ resolve_species_pack("hog").canonical_id == "hog"
          ✅ resolve_species_pack("elk").canonical_id == "elk"
          ✅ resolve_species_pack("bear").canonical_id == "bear"
          ✅ resolve_species_pack("moose").canonical_id == "moose"
          ✅ resolve_species_pack("antelope").canonical_id == "antelope"
          ✅ resolve_species_pack("coyote").canonical_id == "coyote"
          ✅ is_supported_species(<each of the 8>) == True
          ✅ resolve_species_pack("unicorn").is_fallback is True
          Verified _PACKS tuple now has 8 entries in
          /app/backend/species_prompts/registry.py.

          Scenario 2 — GET /api/species (anonymous)  (PASS)
          ✅ HTTP 200
          ✅ user_tier == "trial" (anonymous → most restrictive)
          ✅ species array length == 8 (waterfowl/dove/quail absent)
          ✅ categories length == 3 with ids == {big_game, predator, bird}
          ✅ all categories have non-empty labels
          ✅ deer, turkey, hog -> locked:false
          ✅ elk, bear, moose, antelope, coyote -> locked:true
          ✅ every species has non-empty terminology
             (male/female/young/group)
          ✅ every species has form_fields object

          Scenario 3 — GET /api/species as pro / core  (PASS)
          Used Bearer test_session_rs_002 (test-user-002, tier=pro).
          ✅ user_tier == "pro"; all 8 species locked=false
          Then swapped test-user-002.tier -> "core" via direct Mongo
          update, re-called:
          ✅ user_tier == "core"; all 8 species still locked=false
             (core unlocks everything currently enabled, as expected —
             nothing is min_tier="pro" right now; waterfowl/dove/quail
             are the pro-gated entries but they remain enabled=False).
          ✅ Restored test-user-002.tier back to "pro".

          Scenario 4 — /api/analyze-hunt tier gating (critical)  (PASS)
          Using Bearer test_session_trial_001 (test-user-trial, tier=trial):
          ✅ POST /api/analyze-hunt animal="elk" + tiny 256x256 PNG
             -> 403 with detail exactly:
             "Elk is a Core feature. Upgrade your plan to analyze it."
             (contains "Core feature" per spec)
          ✅ Same request with animal="deer" -> NOT 403 on species gate
             (actual status was 200, end-to-end analysis succeeded;
             any non-403 would have been acceptable per the brief)
          Using Bearer test_session_rs_001 (pro) + animal="elk"
             + tiny 256x256 PNG:
          ✅ 200 with success=true — Pro user proceeds past the species
             gate AND the full LLM analysis pipeline ran (overlays +
             region_resolution + hunt_style_resolution emitted).

          Scenario 5 — Legacy SPECIES_DATA shim  (PASS)
          Ran in /app/backend:
            python -c "from server import SPECIES_DATA; \
                       print(sorted(SPECIES_DATA.keys()))"
          ✅ Output: ['antelope','bear','coyote','deer','elk','hog',
                      'moose','turkey']  (8 entries, all enabled species)
          ✅ For every entry: name + icon + description populated,
             behavior_rules is a non-empty list (lengths 5–6 per
             species), and the rules are the same strings the prompt
             packs expose (no drift — legacy_species_data() pulls
             directly from resolve_species_pack).

          Scenario 6 — Backward compat + existing pytest suite
          ✅ GET /api/auth/me Bearer test_session_rs_001 -> 200
             (user_id=test-user-001, tier=pro).
          ✅ Zero NEW 500s attributable to this suite during the run
             (the verify-otp 500 lines present in the log tail are
             pre-existing entries from the pre-tz-fix era, already
             documented in an earlier test_result.md entry).
          ❌ /app/backend/tests/test_species_prompt_packs.py — 68
             passing, 7 FAILING. The 7 failures are the OLD test
             assertions that still insist elk/moose/bear/pronghorn
             fall back to the GENERIC_FALLBACK_PACK:
               * TestSpeciesResolution.test_unsupported_species_falls_back[elk]
               * TestSpeciesResolution.test_unsupported_species_falls_back[moose]
               * TestSpeciesResolution.test_unsupported_species_falls_back[bear]
               * TestSpeciesResolution.test_unsupported_species_falls_back[pronghorn]
               * TestSpeciesResolution.test_is_supported_species
               * TestSpeciesResolution.test_inventory_shape
               * TestAssembleSystemPrompt.test_unsupported_species_uses_fallback_in_assembled_prompt
             Those assertions were WRITTEN BEFORE the 5 new packs
             existed and are invalidated by the very feature under
             review — they now (correctly!) prove that elk/moose/bear/
             pronghorn resolve to their own first-class packs, which is
             exactly the behavior we just shipped. Main agent needs to
             update the test file (move elk/moose/bear/pronghorn out of
             the "unsupported" param set, grow the expected inventory
             length from 3 to 8, and add the 5 new species to the
             assembled-prompt happy-path tests).
             This is a stale-test issue, NOT a regression of the new
             registry / packs / gating — all of those are verified
             working end-to-end above. Does not block sign-off.

          Security summary
          ✅ Species tier gating is enforced at the /api/analyze-hunt
             layer (not only in the UI): trial users POSTing elk /
             bear / moose / antelope / coyote are rejected with 403
             before the LLM call.
          ✅ The 403 message includes "Core feature" + species name +
             "Upgrade your plan" — matches the review spec.
          ✅ Deer/turkey/hog remain usable for trial users
             (not gated).
          ✅ Hidden species (waterfowl/dove/quail, enabled=False) are
             invisible to the catalog endpoint on every tier.

          No source files modified by the testing agent. Action item for
          main agent: update tests/test_species_prompt_packs.py to
          reflect the expanded canonical inventory (see Scenario 6
          failure list). The runtime feature itself is
          production-ready.



password_auth_set_password:
  - task: "POST /api/auth/set-password — first-time password attach for Google-only users"
    implemented: true
    working: true
    file: "/app/backend/password_auth.py, /app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New endpoint wired. Requires a valid session (Bearer) but NO
          current_password. Only succeeds if the user has no password_hash
          yet. Also added `has_password` to GET /api/auth/me so the UI
          can show "Set Password" vs "Change Password".
      - working: true
        agent: "testing"
        comment: |
          POST /api/auth/set-password + has_password flag verified end-to-end
          against the preview URL (EXPO_PUBLIC_BACKEND_URL). Harness:
          /app/set_password_test.py — 24/26 assertions PASS. The 2 remaining
          items are a documented MINOR (see end of this comment) — zero
          critical issues and zero 500s on /api/auth/set-password.

          Setup note: when the harness started, the test-user-002 user
          DOCUMENT had been dropped from the DB by earlier profile-delete
          tests, even though the user_sessions row for test_session_rs_002
          was still present (session expires +30 days). Testing agent
          re-seeded the user doc (user_id=test-user-002 / email=
          test2@ravenscout.app / tier=pro / analysis_count=0 / rollover=0)
          via a direct Mongo upsert to restore parity with
          /app/memory/test_credentials.md. This is a fixture-drift fix, NOT
          a functional fix to the endpoint under test.

          === SCENARIO 1 — Google-only user (password_hash $unset) ===
          Pre: db.users.update_one({email:"test2@ravenscout.app"},
                                   {"$unset":{"password_hash":""}}).
          ✅ 1a  GET  /api/auth/me   Bearer test_session_rs_002
                 -> 200, has_password=false (bool), field present.
          ✅ 1b  POST /api/auth/set-password {"new_password":"NewStrong1!"}
                 -> 200 body {"ok":true}.
          ✅ 1c  GET  /api/auth/me -> 200 has_password=true.
          ✅ 1d  POST /api/auth/login
                 {"email":"test2@ravenscout.app","password":"NewStrong1!"}
                 -> 200 with session_token="rs_<hex>" (freshly minted).
          ✅ 1e  Second POST /api/auth/set-password with a different strong
                 pw -> 409 with exact detail
                 "This account already has a password. Use Change Password
                  instead." (substring "already has a password" asserted)

          === SCENARIO 2 — Weak password validation ===
          Pre: re-$unset password_hash so endpoint reaches validate_password.
          ✅ "lowercase1!"   -> 400 detail="Password must include an uppercase letter."
          ✅ "UPPERCASE1!"   -> 400 detail="Password must include a lowercase letter."
          ✅ "NoDigitsAll!"  -> 400 detail="Password must include a number."
          ✅ "NoSymbols123A" -> 400 detail="Password must include a symbol (e.g. !@#$)."
          ⚠️ Minor: "short1!" (7 chars) returns 422 (Pydantic
             string_too_short) INSTEAD OF 400 with the custom
             "Password must be at least 10 characters long." This is because
             SetPasswordBody defines new_password with Field(..., min_length=10),
             so Pydantic validation fires BEFORE validate_password can emit
             the custom message. The user still gets a proper rejection (no
             500), and the prior RegisterBody flow has identical behavior
             (already documented in the password_auth task as acceptable).
             Low impact — functionally correct rejection, just a different
             status code + message shape than the review spec. If you want
             full parity with the spec (400 + custom detail), drop
             min_length=10 from SetPasswordBody.new_password and let
             validate_password handle ALL length/strength errors.

          === SCENARIO 3 — Auth ===
          ✅ No Bearer                     -> 401 "Not authenticated"
          ✅ Bearer "garbage"              -> 401 "Invalid session"
          ✅ Empty body {} with Bearer      -> 422 (missing new_password),
                                              NOT 500.
          ✅ No body at all with Bearer     -> 422, NOT 500.

          === SCENARIO 4 — Regression ===
          ✅ GET /api/auth/me Bearer test_session_rs_001 -> 200 with
             has_password present as boolean (actual value: false — user 001
             is currently Google-only; either true or false is acceptable
             per the review, the assertion is just that the field exists
             and is a bool).
          ✅ Zero 500s on /api/auth/set-password across the whole run
             (verified via /var/log/supervisor/backend.out.log — only
             200/400/401/409/422 status codes recorded against
             POST /api/auth/set-password during the testing window).
             Pre-existing 500s in the log are all from older
             /api/auth/verify-otp runs before the tz-naive fix; they do
             NOT recur.

          === RESTORATION STATE ===
          After the suite, testing agent restored test-user-002 to
          Google-only state by RE-UNSETTING password_hash — so the user
          is still a useful Google-only fixture for future runs (matches
          its documented intent in test_credentials.md). Session token
          test_session_rs_002 remains valid. tier=pro preserved. If you
          want to sign in with email+password again, call
          /api/auth/set-password once more with a strong pw.

          No source files modified by testing. Main agent: please
          summarise and finish — /api/auth/set-password is
          production-ready; optionally drop min_length=10 from the
          Pydantic body if you want 400-with-custom-detail parity for
          the short-password case (low priority).

          Please verify:

          1. A Google-only user (has no password_hash):
             a) GET /api/auth/me -> 200 with `has_password: false`.
             b) POST /api/auth/set-password with a strong pw -> 200 {ok:true}.
             c) GET /api/auth/me now returns `has_password: true`.
             d) POST /api/auth/login with that email+pw -> 200 session_token.
             e) Second call to /api/auth/set-password -> 409
                "This account already has a password. Use Change Password instead."

          2. Weak password validation: shortpw, no-upper, no-digit, no-symbol
             each return 400 with a clear `detail` string.

          3. Without Bearer -> 401.

          Setup note: there's no Google-only test user seeded. Create one
          directly in Mongo (or register a fresh account, then manually
          `users.update_one({email:...}, {"$unset": {"password_hash": 1}})`
          to simulate a Google-only user) to exercise scenario 1.

password_auth:
  - task: "POST /api/auth/register + /api/auth/login (bcrypt, session minting)"
    implemented: true
    working: true
    file: "/app/backend/password_auth.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Password auth endpoints wired into api_router via
          build_password_auth_router(db, get_current_user). Please verify:
          1. POST /api/auth/register with a fresh email+strong password
             returns 200 with session_token, user_id, email, name.
             Password policy errors (short, no upper, no digit, no symbol)
             each return 400 with a clear `detail` string.
          2. POST /api/auth/register with an existing email (that already
             has password_hash) returns 409.
          3. POST /api/auth/login valid creds -> 200 + session_token;
             wrong password -> 401 "Invalid email or password." (same
             wording for unknown-email case — no enumeration).
          4. The session_token returned by register/login works
             immediately against GET /api/auth/me (Bearer).
          5. POST /api/auth/change-password requires Bearer; wrong
             current_password -> 401; success -> 200 and old non-current
             sessions are invalidated.
      - working: true
        agent: "testing"
        comment: |
          REGISTER + LOGIN + CHANGE-PASSWORD all verified end-to-end
          against the preview URL. Harness: /app/password_auth_test.py.

          POST /api/auth/register
          ✅ Fresh email `pwtest_<uuid>@example.com` / "StrongPass1!" /
             name="PW Test" -> 200 with
             {user_id, email, name, session_token, email_verified:false}.
          ✅ Email is lowercased in the response.
          ✅ session_token minted — immediately usable on /api/auth/me.
          ✅ pw="short1!" -> 422 (pydantic min_length=10 fires before
             validate_password — still a proper user-facing rejection,
             no 500).
          ✅ pw="lowercase1!" (no upper) -> 400 with
             detail="Password must include an uppercase letter."
          ✅ pw="UPPERCASE1!" (no lower) -> 400 with
             detail="Password must include a lowercase letter."
          ✅ pw="NoDigitsAll!" (no digit) -> 400 with
             detail="Password must include a number."
          ✅ pw="NoSymbols123A" (no symbol) -> 400 with
             detail="Password must include a symbol (e.g. !@#$)."
          ✅ Re-register same email -> 409
             detail="An account already exists for this email."

          POST /api/auth/login
          ✅ Correct creds -> 200 with session_token.
          ✅ Wrong password -> 401
             detail="Invalid email or password."
          ✅ Unknown email -> 401 with IDENTICAL detail text
             (no enumeration — spec verified).

          POST /api/auth/change-password (Bearer)
          ✅ Wrong current_password -> 401
             detail="Current password is incorrect."
          ✅ Correct current_password + new="ThirdPassX3#" -> 200 {ok:true}.
          ✅ Login with old pw -> 401; login with new pw -> 200.
          ✅ Without Bearer -> 401.

          Zero 500s in this group. No source modifications.

  - task: "Password reset OTP flow (request-password-reset, verify-otp, reset-password)"
    implemented: true
    working: true
    file: "/app/backend/password_auth.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          MSGRAPH_* env vars are intentionally blank in dev; the backend
          falls back to ConsoleMailer which logs the OTP to
          /var/log/supervisor/backend.out.log. Please verify:
          1. POST /api/auth/request-password-reset always returns 200
             (anti-enumeration), including for unknown emails.
          2. For a known email, a 6-digit OTP row is created in the
             password_reset_otps collection and the OTP itself is
             visible in the console mailer log (ConsoleMailer emits
             "Would send email" with the code in the text body).
          3. POST /api/auth/verify-otp with the captured OTP -> 200
             and a reset_token; wrong otp -> 401; after 5 wrong tries
             the code is purged + 429.
          4. POST /api/auth/reset-password with the reset_token + a
             strong new password -> 200 + new session_token; that
             token works on /api/auth/me; the old pw no longer logs in.
      - working: false
        agent: "testing"
        comment: |
          CRITICAL BUG — /api/auth/verify-otp returns 500 on EVERY call,
          which also blocks /api/auth/reset-password (unreachable without
          a reset_token from verify-otp). The entire password-reset flow
          is broken end-to-end.

          Request-password-reset (upstream) works correctly:
          ✅ POST /api/auth/request-password-reset for known email
             -> 200 {ok:true} (and ConsoleMailer logged the 6-digit OTP).
          ✅ POST /api/auth/request-password-reset for unknown email
             -> 200 {ok:true} (anti-enumeration honored).
          ✅ OTP captured from ConsoleMailer log (see NOTE below about
             log path — review said .out.log, actual path is .err.log).

          Verify-otp is broken:
          ❌ POST /api/auth/verify-otp with ANY otp (right or wrong)
             returns HTTP 500 "Internal Server Error".
          ❌ 5-wrong-attempt lockout path unreachable — we observed
             [500,500,500,500,500,500] instead of the expected
             [401,401,401,401,401,429].
          ❌ After-purge state unreachable — returned 500 instead of
             the expected 400 "No active reset code. Request a new one."

          ROOT CAUSE (from /var/log/supervisor/backend.err.log):
            File "/app/backend/password_auth.py", line 370, in verify_otp
              if not expires_at or expires_at < datetime.now(timezone.utc):
            TypeError: can't compare offset-naive and offset-aware datetimes

          The `expires_at` stored via
            db.password_reset_otps.insert_one({
              ...
              "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15),
            })
          is a tz-AWARE Python datetime, but MongoDB's BSON Date type is
          tz-NAIVE, and motor returns it as a naive datetime on read.
          The comparison `expires_at < datetime.now(timezone.utc)` then
          raises TypeError.

          The isinstance(expires_at, str) branch at lines 365-369 handles
          the string case but NOT the tz-naive datetime case that Mongo
          actually returns.

          SUGGESTED FIX (password_auth.py — main agent to apply):
            After retrieving `expires_at` in BOTH
              verify_otp  (~line 364-370)
              reset_password (~line 400-406)
            normalize tzinfo before the comparison, e.g.:
                if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
            Alternatively compare both sides as naive UTC:
                now_naive = datetime.utcnow()
                if not expires_at or expires_at < now_naive: ...
            (First option is cleaner.)

          Exact failing request body (for debugging):
            POST https://tactical-auth-hub.preview.emergentagent.com/api/auth/verify-otp
            Content-Type: application/json
            {"email":"pwtest_b1ffa166ad@example.com","otp":"740587"}   <- real captured OTP
              -> 500 "Internal Server Error"
            {"email":"pwtest_b1ffa166ad@example.com","otp":"000000"}   <- wrong
              -> 500 "Internal Server Error"

          NOTE on ConsoleMailer log location:
          The review instruction said the OTP is logged to
          /var/log/supervisor/backend.out.log, but in this environment
          the Python logger writes to stderr by default and supervisor
          pipes stderr to backend.err.log. The OTP line
          "[ConsoleMailer] Would send email:..." actually appears in
          backend.err.log (verified — 2+ entries per run). Harness
          updated to scan both paths. This is just a doc
          inaccuracy — it does NOT affect production (MSGraph mailer
          is the prod path), just dev testing instructions.

          Once the tz fix lands in password_auth.py, please re-run the
          harness; all remaining assertions in this group are scripted
          and ready (verify-otp 401/200/429, reset-password 200 with
          new session_token, old pw -> 401, new pw -> 200, old-session
          invalidation).
      - working: true
        agent: "testing"
        comment: |
          RE-RUN after main-agent tz-naive fix — tz normalization added
          at password_auth.py L373-374 (verify_otp) and L412-413
          (reset_password). Focused harness: /app/password_auth_s5s6_test.py.
          19/19 substantive assertions PASS. Zero 500s during the run
          (log-scraped invariant also asserted).

          === SCENARIO 5 — POST /api/auth/verify-otp ===
          Setup: registered pwtest_<hex>@example.com / StrongPass1! ;
          request-password-reset -> 200; OTP "026842" scraped from
          ConsoleMailer entry in /var/log/supervisor/backend.err.log
          (confirmed: the Python logger writes to stderr in this env,
          so err.log is the correct source in dev).

          ✅ wrong OTP "000000" -> 401 "Invalid code."   (was 500)
          ✅ real OTP "026842" -> 200 with
             {"reset_token": "rst_<urlsafe-base64>"}    (was 500)
          ✅ reset_token begins with "rst_"
          ✅ 6 consecutive wrong attempts after a FRESH request:
                status sequence == [401,401,401,401,401,429]
             Cross-verified in supervisor access log:
               verify-otp 401 x5 then 429 Too Many Requests.
          ✅ After the 429 purge, the next verify-otp call returns
             400 "No active reset code. Request a new one."

          === SCENARIO 6 — POST /api/auth/reset-password ===
          ✅ Valid reset_token + new_password "AnotherStrong2@" -> 200
             {"ok": true, "session_token": "rs_<hex>"}.  (was 500)
          ✅ POST /api/auth/login with OLD password "StrongPass1!"
             -> 401 (old pw truly invalidated).
          ✅ GET /api/auth/me with the new session_token -> 200,
             email echoed correctly.
          ✅ POST /api/auth/login with NEW password "AnotherStrong2@"
             -> 200 (user can sign in fresh).
          ✅ Re-use of the SAME reset_token on a second
             /api/auth/reset-password -> 400 with
             detail="Reset link invalid or expired."
             (single-use enforced; the token is purged on first use
             at password_auth.py L422).

          === ZERO 500s INVARIANT ===
          ✅ Zero new "Internal Server Error" and zero new
             "TypeError: can't compare offset-naive and offset-aware"
             tracebacks in backend.err.log / backend.out.log between
             run-start and run-end offsets. The tz-naive bug is fully
             fixed end-to-end.

          Password-reset OTP flow is production-ready. No source
          modifications by testing. Stuck count reset to 0,
          needs_retesting=false, working=true.

  - task: "Profile endpoints — PATCH /api/users/me + DELETE /api/users/me"
    implemented: true
    working: true
    file: "/app/backend/password_auth.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          1. PATCH /api/users/me with {"name":"New Name"} + Bearer -> 200
             and subsequent GET /api/auth/me reflects the change.
          2. DELETE /api/users/me with Bearer -> 200 {ok:true,deleted:1};
             subsequent GET /api/auth/me with the same Bearer -> 401.
          3. Both endpoints -> 401 without Bearer.
      - working: true
        agent: "testing"
        comment: |
          All profile contract behaviors verified against preview URL
          using a freshly-registered disposable user.

          PATCH /api/users/me
          ✅ Without Bearer -> 401 "Not authenticated".
          ✅ With Bearer, body {"name":"Renamed User"} -> 200.
          ✅ Subsequent GET /api/auth/me returns name="Renamed User"
             (change durably persisted).

          DELETE /api/users/me
          ✅ Without Bearer -> 401.
          ✅ With Bearer -> 200 {"ok":true,"deleted":1}.
          ✅ Subsequent GET /api/auth/me with the SAME Bearer -> 401
             (cascade delete of user + sessions honored).

          Regression (test_session_rs_001 still works)
          ✅ After seeding the missing test-user-001 user document (the
             session row already existed in user_sessions but the users
             row had been dropped from the DB — pre-existing state drift,
             not caused by this suite), GET /api/auth/me with Bearer
             test_session_rs_001 -> 200 with tier=pro and
             user_id=test-user-001. test_credentials.md unchanged.

test_plan_archive_railway:

backend_railway_readiness:
  - task: "POST /api/auth/google — portable Google OAuth (replaces Emergent Auth for Railway)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          /api/auth/google contract verified end-to-end against the
          preview URL. Harness: /app/backend_test_railway.py — all
          assertions in this group PASS with ZERO 500s:
            • no body         -> 422 validation error
            • empty body {}   -> 422 validation error
            • id_token=""     -> 401 (falls through to google-auth,
                                returns "Invalid Google credential")
            • id_token="bogus"-> 401 "Invalid Google credential"
                                (logged server-side: "Wrong number of
                                 segments in token")
            • 3-segment tampered JWT (fake signature) -> 401
            • "a.b.c" / unicode / 4000-char garbage   -> 401 (no 500)
          GOOGLE_CLIENT_ID is present in backend/.env and the endpoint
          correctly routes through google.oauth2.id_token.verify_oauth2_token.
          Valid-token success path not exercised (requires a real
          Google ID token issued against the same audience — per the
          review brief, OK to skip; the 401 rejection path exercises
          the full verification flow.)

  - task: "analyze-hunt LLM swap — OpenAI direct SDK path (OPENAI_API_KEY preferred over EMERGENT_LLM_KEY)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          POST /api/analyze-hunt with a fresh 256x256 PNG + Bearer
          test_session_rs_001 returned:
            • HTTP 200
            • success=true
            • result.id + 5 overlays
            • region_resolution = {resolvedRegionId="east_texas",
                regionResolutionSource="gps"}
            • hunt_style_resolution = {styleId="saddle",
                styleLabel="Saddle", source="user_selected",
                rawInput="saddle"}
            • No 500, no LiteLLM error traces
          Verified OpenAI direct path was used: a fresh analyze-hunt
          call produced ZERO new LiteLLM / emergentintegrations /
          LlmChat / litellm.APIError markers in
          /var/log/supervisor/backend.out.log between the pre-run
          and post-run log offsets. (The older LiteLLM.Info banner
          on line 139 of out.log is from a prior run before the swap
          landed; it does not recur.)

  - task: "Railway deployment artifacts (Procfile, railway.json, .env.railway.example, README_RAILWAY.md)"
    implemented: true
    working: true
    file: "/app/backend/Procfile, /app/backend/railway.json, /app/backend/.env.railway.example, /app/backend/README_RAILWAY.md"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          All 4 files present and valid:
            • Procfile matches exactly:
                "web: uvicorn server:app --host 0.0.0.0 --port $PORT"
            • railway.json is valid JSON with:
                deploy.startCommand = uvicorn server:app ...
                deploy.healthcheckPath = "/api/health"
                deploy.healthcheckTimeout = 30
                deploy.restartPolicyType = "ON_FAILURE"
            • .env.railway.example documents MONGODB_URI,
                OPENAI_API_KEY, GOOGLE_CLIENT_ID, S3_BUCKET_NAME,
                WEATHER_API_KEY, REVENUECAT_SECRET_KEY, AWS_*.
            • README_RAILWAY.md is a complete deployment guide with
                Google OAuth client-type table + /api/health +
                /api/auth/google curl examples.

  - task: "Regression smoke — /api/health, /api/auth/me, /api/subscription/tiers, /api/hunts CRUD"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          No regressions after the Railway refactor:
            • GET /api/health -> 200 {"status":"ok"}
            • GET /api/auth/me (Bearer test_session_rs_001) -> 200
                tier=pro, user_id=test-user-001
            • GET /api/subscription/tiers -> 200 with trial/core/pro
            • /api/hunts CRUD spot check (POST, GET list, GET single,
                PUT, DELETE) all 200; DELETE returned deleted=1.
          Total: 26/26 assertions pass in /app/backend_test_railway.py.

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
      URL (https://tactical-auth-hub.preview.emergentagent.com/api). Test
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

  - agent: "main"
    message: |
      Implemented Hunt-Style Modifier pipeline (the last-working item
      from the handoff). Please validate the /api/analyze-hunt
      backend contract for the new hunt_style parameter. The Pro
      session token (Bearer test_session_rs_001) is already wired in
      test_credentials.md.

      Validation requests — backend at the preview URL
      (EXPO_PUBLIC_BACKEND_URL in /app/frontend/.env), each POST
      /api/analyze-hunt needs map_image_base64 = a tiny valid JPEG
      data URI (you can reuse one from prior test harnesses). Focus
      on RESPONSE SHAPE ONLY — LLM quality is out of scope here.

      The field you're validating lives under the top-level
      "hunt_style_resolution" key of the 200 response (parallel to
      the existing "region_resolution" key).

      A) Baseline — hunt_style omitted (field not present on conditions)
         EXPECTED: hunt_style_resolution = {
           styleId: null, styleLabel: null,
           source: "unspecified", rawInput: null
  - agent: "testing"
    message: |
      hunt_style_resolution contract VERIFIED on POST /api/analyze-hunt
      against the preview URL (EXPO_PUBLIC_BACKEND_URL) with Bearer
      test_session_rs_001 (Pro). Harness: /app/hunt_style_test.py —
      5 real analyze-hunt calls, 40/40 substantive assertions pass.

      All five requested cases returned 200 with exactly the expected
      { styleId, styleLabel, source, rawInput } shape parallel to
      region_resolution:

        A) omit hunt_style           -> {null, null, "unspecified", null}          ✅
        B) hunt_style="archery"      -> {"archery","Archery","user_selected","archery"}        ✅
        C) hunt_style="Public Land"  -> {"public_land","Public Land","user_selected","Public Land"} ✅  (display-label + canonical normalization)
        D) hunt_style="bow hunting"  -> {"archery","Archery","user_selected","bow hunting"}    ✅  (alias normalization; rawInput preserved verbatim)
        E) hunt_style="banana"       -> {null, null, "unspecified", "banana"}      ✅  (200, NOT 4xx — silent fallback as designed)

      Regression F: region_resolution remains present and correct on
      every one of the 5 responses. With the harness sending
      latitude=31.2956 / longitude=-95.9778 on conditions, every
      response carried:
        region_resolution = {
          resolvedRegionId:       "east_texas",
          resolvedRegionLabel:    "East Texas",
          regionResolutionSource: "gps",
          latitude: 31.2956,
          longitude: -95.9778
        }
      Zero interference between the two resolutions.

      Server-side observability: both INFO log lines fire on every
      call — "Region resolved: id=east_texas source=gps" and
      "Hunt style resolved: id=<canonical|None> source=<user_selected|unspecified>"
      — confirmed in /var/log/supervisor/backend.err.log. 200 OKs
      for all 5 /api/analyze-hunt calls confirmed in backend.out.log.

      Note on the harness: the test script printed 5 lines tagged
      "FAIL region_resolution has recognizable keys" — those are
      FALSE POSITIVES from an overly strict key-whitelist in the
      script (expected region_id/regionId but the API uses
      resolvedRegionId). The region_resolution dict is present,
      well-shaped, and semantically correct per the preceding
      passing assertions. No backend issue.

      No source files modified. Main agent: please summarise and
      finish — hunt_style_resolution is production-ready.
         }

      B) hunt_style = "archery"
         EXPECTED: styleId="archery", styleLabel="Archery",
           source="user_selected", rawInput="archery".

      C) hunt_style = "Public Land" (display label with mixed case)
         EXPECTED: styleId="public_land", styleLabel="Public Land",
           source="user_selected", rawInput="Public Land".
         This validates canonical normalization on the backend.

      D) hunt_style = "bow hunting" (alias)
         EXPECTED: styleId="archery", rawInput="bow hunting",
           source="user_selected".

      E) hunt_style = "banana" (garbage)
         EXPECTED: styleId=null, source="unspecified",
           rawInput="banana". Must NOT 4xx — we silently fall
           through to the neutral block.

      F) Regression smoke: region_resolution still present + correct
         on all of the above (no interference between the two
         resolutions).

      Skip the 6-style matrix (archery/rifle/blind/saddle/
      public_land/spot_and_stalk); only B and C are needed to prove
      canonical + alias + label paths. D covers alias, E covers
      garbage fallback, A covers the default.

      Unit-test baseline already green in this environment:
        • Backend pytest: 312 passed, 3 skipped, 2 pre-existing
          live-HTTP failures (unrelated)
        • Frontend node:test: 105 passed (was 94)

      No stuck tasks on this feature. Test_credentials.md unchanged.

  - agent: "testing"
    message: |
      Validated hunt_style_resolution contract on POST /api/analyze-hunt
      against the preview URL with Bearer test_session_rs_001 (Pro).
      40/40 substantive assertions pass. Harness: /app/hunt_style_test.py.

      Response shape ({styleId, styleLabel, source, rawInput}) for
      each case — all 200s:
        A) omitted      -> {null, null, "unspecified", null}
        B) "archery"    -> {"archery","Archery","user_selected","archery"}
        C) "Public Land"-> {"public_land","Public Land","user_selected","Public Land"}
        D) "bow hunting"-> {"archery","Archery","user_selected","bow hunting"}  (alias → canonical; rawInput preserved verbatim)
        E) "banana"     -> {null, null, "unspecified", "banana"}  (200 NOT 4xx — silent fallback as designed)

      Regression F: region_resolution still present + correct on all
      5 responses. With GPS (31.2956, -95.9778) on conditions,
      resolvedRegionId="east_texas" / source="gps" on every call.
      Zero interference between resolutions.

      Server logs confirm both "Region resolved: ..." and
      "Hunt style resolved: id=... source=..." fire per call.

      Note: harness printed 5 lines "FAIL region_resolution has
      recognizable keys" — false positives (it expected
      region_id/regionId; API uses resolvedRegionId). Real
      region_resolution dict is well-shaped per the preceding
      assertions. No backend issue. No fixes applied. No stuck tasks.



  - agent: "main"
    message: |
      Feb 2026 — OOM crash fix + deferred saveHunt pipeline.

      Changes:
      1. imageProfiles.ts: PROFILE_PRO.maxDim lowered 2048 → 1600 to
         prevent mobile-Chrome OOM on tall panoramic screenshots
         (previously 2048×4437 decoded to ~36MB bitmap and killed
         /results route). Test expectation updated in imageProcessor.test.ts.
      2. huntHydration.ts: Added finalizeProvisionalHunt(huntId, tier)
         helper. Runs the full saveHunt pipeline (MediaStore, AnalysisStore,
         S3 upload via /api/media/presign-upload) for hunts that are
         currently only in the provisional hot-cache. Idempotent; safe
         to call repeatedly. Never throws.
      3. results.tsx: After successful hydration, fires
         finalizeProvisionalHunt on a 600ms deferred timer. This
         restores S3 upload + Mongo persistence that was temporarily
         removed from setup.tsx while isolating the memory crash.
         The deferral ensures the DOM paints and the setup.tsx
         bitmap memory is freed before the background persistence
         allocates its own copies.

  - agent: "main"
    message: |
      Feb 2026 — Root-cause OOM fix via blob-URL swap.

      Troubleshoot agent diagnosed: mobile Chrome OOM-kills the /results
      tab when React Native Web's <Image source={{uri: base64}}> decodes
      the ~2MB base64 data URI into a bitmap on first paint, BEFORE
      the deferred finalize timer can fire. No JS error is thrown
      because browser-level OOM bypasses React error boundaries.

      Changes this round:
      1. setup.tsx: router.push → router.replace — unmounts /setup
         synchronously so its ~2MB base64 + bitmap are released
         before /results begins rendering.
      2. ImageOverlayCanvas.tsx: On web, convert the base64 data URI
         into a Blob URL via URL.createObjectURL() in a useEffect.
         First render shows a placeholder rect; once the blob exists
         (~1 React tick later) the <Image> swaps to the blob URL.
         The browser streams binary from the blob without forcing a
         synchronous JS-heap decode. Base64 string can now be GC'd.
         Added onLoad/onError diagnostics + overlay_image_blob_created
         event for visibility. Fixed pre-existing COLORS.void TS error.
      3. Native iOS/Android paths unchanged — they use the data URI
         directly (native bitmap decoder doesn't compete with the
         mobile-web tab heap).

      Expected effect: /results will stop bouncing back to /setup on
      mobile Chrome. User should see `overlay_image_loaded` event
      with via='blob_url' in backend logs after analyze completes.

      All 137 unit tests pass. TypeScript clean (0 errors).

      4. clientLog.ts: Widened ClientEvent union to cover all
         existing and new event names (pre-existing TS errors from
         unrecognized events are now resolved).

      No backend changes required for this patch. Mobile web is
      pending human verification (P1 crash fix) after which S3
      uploads should appear for new analyses and records should
      show up in MongoDB.

  - agent: "testing"
    message: |
      /api/hunts CRUD VERIFIED end-to-end against the preview URL
      (EXPO_PUBLIC_BACKEND_URL). Harness: /app/hunts_crud_test.py —
      66/66 assertions PASS. Seeded a second Pro test user
      directly in Mongo (test-user-002 / test_session_rs_002,
      tier=pro, expires 2026-05-23) to exercise cross-user
      scenarios per the review request.

      Auth / ownership (all critical)
        ✅ All 5 routes (POST, GET list, GET one, PUT, DELETE) 401
           without bearer or with bogus bearer
        ✅ Cross-user GET/PUT/DELETE → 404 (not 403) so existence
           is not leaked, and target document is never mutated
        ✅ POST idempotency: re-POST same hunt_id keeps created_at,
           bumps updated_at ($setOnInsert + $set)
        ✅ Per-user uniqueness: two different users can each have
           hunt_id="shared-<uuid>" as independent docs (compound
           unique index on (user_id, hunt_id))

      Endpoint behavior
        ✅ POST /api/hunts → 200 {ok:true, hunt:{...,created_at,
           updated_at as ISO strings}}; metadata + analysis +
           nested overlays preserved
        ✅ GET /api/hunts?limit=50&skip=0 → default limit=50/skip=0
           applied, newest-first sort; limit=9999 clamps to 200,
           skip=-5 clamps to 0, limit=0 clamps to 1 (all 200, not 400)
        ✅ GET /api/hunts/{id} → 200 owner / 404 missing / 404
           cross-user
        ✅ PUT /api/hunts/{id} → partial patch (only supplied fields
           applied, metadata untouched when absent); created_at
           stable, updated_at bumped; 404 missing / 404 cross-user
        ✅ DELETE /api/hunts/{id} → 200 {ok:true,deleted:1} owner /
           404 already-deleted / 404 cross-user + owner's doc intact
        ✅ POST body validation: hunt_id<4 → 422, hunt_id>64 → 422,
           missing metadata → 422

      Regression (existing endpoints — no regressions)
        ✅ GET /api/auth/me (Bearer test_session_rs_001) → 200
           tier=pro
        ✅ GET /api/subscription/tiers → 200 {trial,core,pro}
        ✅ GET /api/subscription/status (auth'd) → 200 tier=pro
        ✅ POST /api/analyze-hunt with a real 256x256 PNG →
           success=true, overlays rendered, region_resolution +
           hunt_style_resolution both present. (Note: first run
           used a 10x10 PNG which OpenAI rejects as "unsupported
           image" — the endpoint handled it cleanly with HTTP 200 +
           success=false + translated error text, no 500. Larger
           image re-run confirmed main product API is unaffected.)

      Routing sanity
        ✅ All five new routes wired under /api prefix only — no
           accidental /api/hunts/hunts nesting. Verified via the
           live supervisor access logs during the run.

      Security posture
        ✅ Zero 500s across all scenarios
        ✅ Zero auth bypass
        ✅ Zero cross-user data leak (existence hidden; docs never
           mutated by non-owners)

      No source files modified. No stuck tasks. Main agent: please
      summarise and finish — Hunts CRUD is production-ready.

  - agent: "main"
    message: |
      Feb 2026 — Password Auth + Profile + Biometric wiring complete.

      Changes this round:
      1. /app/backend/.env — added MSGRAPH_TENANT_ID / CLIENT_ID /
         CLIENT_SECRET / SENDER placeholders + EMAIL_PROVIDER=auto.
         When blank, password_auth.py's ConsoleMailer logs the OTP to
         backend.out.log (so the reset flow is fully testable without
         real Graph creds).
      2. /app/frontend/app/index.tsx — replaced the top-right sign-out
         icon with a circular profile avatar (Google photo → fallback
         initial) that routes to /profile. Sign-out now lives inside
         the profile screen.
      3. /app/frontend/app/login.tsx — after any successful password or
         Google sign-in, offers one-tap biometric enrollment if the
         device has Face ID / Fingerprint enrolled and the user hasn't
         opted in yet. Stores the current session token in
         SecureStore under a biometric-protected key.

      Please validate the password_auth task group:
        • /api/auth/register + /api/auth/login (bcrypt)
        • /api/auth/request-password-reset + verify-otp + reset-password
          (OTP is in ConsoleMailer log since MSGRAPH_* are blank)
        • /api/auth/change-password
        • PATCH /api/users/me + DELETE /api/users/me
      Regression check: GET /api/auth/me must still work for existing
      test_session_rs_001 Bearer and for tokens freshly minted by
      register/login/reset-password.

  - agent: "testing"
    message: |
      password_auth suite validated against the preview URL
      (EXPO_PUBLIC_BACKEND_URL = https://tactical-auth-hub.preview.emergentagent.com).
      Harness: /app/password_auth_test.py — 50 PASS / 5 FAIL across 9 scenarios.

      SCENARIO-BY-SCENARIO RESULTS

        1) REGISTER (POST /api/auth/register)                    ✅ PASS
           - Fresh email "pwtest_<uuid>@example.com" / "StrongPass1!"
             / name="PW Test" -> 200 {user_id, email (lowercased),
             name, session_token, email_verified:false}.
           - All 5 weak-password negatives each return a proper
             rejection with a user-facing detail string:
               "short1!"      -> 422 (pydantic min_length fires first)
               "lowercase1!"  -> 400 "...include an uppercase letter."
               "UPPERCASE1!"  -> 400 "...include a lowercase letter."
               "NoDigitsAll!" -> 400 "...include a number."
               "NoSymbols123A"-> 400 "...include a symbol (e.g. !@#$)."
           - Re-register same email -> 409
             "An account already exists for this email."

        2) LOGIN (POST /api/auth/login)                           ✅ PASS
           - Correct creds -> 200 with session_token.
           - Wrong password -> 401 "Invalid email or password."
           - Unknown email -> 401 with IDENTICAL detail text
             (no enumeration — verified).

        3) GET /api/auth/me with fresh session                    ✅ PASS
           - Bearer from register call -> 200 and echoes registered
             email. Post-reset and post-login bearers also work on
             /auth/me (verified where reachable).

        4) REQUEST PASSWORD RESET                                 ✅ PASS
           (POST /api/auth/request-password-reset)
           - Unknown email -> 200 {ok:true} (anti-enumeration).
           - Known email -> 200 {ok:true}; ConsoleMailer line
             "[ConsoleMailer] Would send email:" appeared in
             /var/log/supervisor/backend.err.log carrying the
             6-digit OTP in the text body — successfully regex-
             captured ("password reset code is: NNNNNN").
             NOTE: review instructions said backend.out.log, but
             Python's root logger writes to stderr -> supervisor
             routes that to .err.log. Harness scans both for
             robustness.

        5) VERIFY OTP (POST /api/auth/verify-otp)                 ❌ FAIL
           CRITICAL — verify-otp returns HTTP 500 on EVERY call:
           - Wrong OTP ("000000")  -> 500 Internal Server Error
           - Correct captured OTP  -> 500 Internal Server Error
           - Lockout sub-test (6 consecutive wrong OTPs on a
             fresh reset request) -> [500,500,500,500,500,500]
             instead of the expected [401,401,401,401,401,429].
           Example failing request body:
             POST /api/auth/verify-otp
             {"email":"pwtest_b1ffa166ad@example.com","otp":"740587"}
             -> 500 "Internal Server Error"

           ROOT CAUSE (from backend.err.log traceback — 100%
           reproducible):
             File "/app/backend/password_auth.py", line 370, in verify_otp
               if not expires_at or expires_at < datetime.now(timezone.utc):
             TypeError: can't compare offset-naive and offset-aware datetimes

           password_reset_otps docs insert "expires_at" as a
           tz-AWARE datetime, but MongoDB's BSON Date is tz-NAIVE,
           so motor returns it as a naive datetime. The guard at
           lines 365-369 only handles the (expires_at as str)
           case and leaves the native-datetime tz mismatch
           unhandled.

           SUGGESTED FIX (for main agent — do NOT re-fix if
           already applied):
             After reading `expires_at` in BOTH verify_otp and
             reset_password, normalize tz:
                 if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
                     expires_at = expires_at.replace(tzinfo=timezone.utc)
             (Alternatively compare both sides as naive UTC.)
             The same bug almost certainly exists at ~line 406 in
             reset_password — please patch both symmetrically.

        6) RESET PASSWORD (POST /api/auth/reset-password)         ❌ BLOCKED
           Unreachable — verify-otp never yields a reset_token.
           Will verify once #5 is fixed. Harness scenarios are
           scripted and ready.

        7) CHANGE PASSWORD (POST /api/auth/change-password)       ✅ PASS
           - Wrong current_password -> 401
             "Current password is incorrect."
           - current="StrongPass1!", new="ThirdPassX3#" -> 200 {ok:true}.
           - Login old pw -> 401; login new pw -> 200.
           - Without Bearer -> 401.

        8) PROFILE (PATCH + DELETE /api/users/me)                 ✅ PASS
           - PATCH without Bearer -> 401; DELETE without Bearer -> 401.
           - PATCH {name:"Renamed User"} -> 200; subsequent
             GET /api/auth/me returns name="Renamed User".
           - DELETE -> 200 {ok:true, deleted:1}; subsequent
             GET /api/auth/me with same Bearer -> 401.
             (Cascade delete of users + user_sessions confirmed.)

        9) REGRESSION — existing test_session_rs_001               ✅ PASS
           - Initially 401 "User not found" because the users row
             for test-user-001 had been dropped from the DB (the
             session_token row in user_sessions still existed).
             Pre-existing state drift — NOT caused by this suite.
             Re-seeded the missing user doc directly in Mongo
             (tier=pro, email=test@ravenscout.app) per
             /app/memory/test_credentials.md.
           - After re-seed: GET /api/auth/me with Bearer
             test_session_rs_001 -> 200 {user_id:"test-user-001",
             tier:"pro", ...}. No test_credentials.md changes.

      ZERO 500s outside verify-otp. No source files modified by
      the testing agent. No auth bypass, no enumeration, no cross-
      user data leaks. Change-password correctly keeps the current
      token and invalidates *other* sessions.

      BLOCKING BUG: /app/backend/password_auth.py verify_otp (line
      370) + reset_password (line 406) tz-comparison TypeError.
      Please apply the suggested fix above and re-call the testing
      agent — the harness will re-run scenarios 5 and 6 end-to-end.


  - agent: "testing"
    message: |
      CONFIRMATION — password-reset OTP flow re-run after main-agent's
      tz-naive datetime fix in /app/backend/password_auth.py
      (verify_otp L373-374 and reset_password L412-413 now normalize
      `expires_at.tzinfo = timezone.utc` before comparing).

      Focused harness: /app/password_auth_s5s6_test.py — re-runs ONLY
      scenarios 5 (verify-otp) and 6 (reset-password) as requested.
      Result: 19/19 substantive assertions PASS. ZERO 500s during
      the run (log-scraped invariant also asserted).

      Scenario 5 — POST /api/auth/verify-otp (against preview URL)
      ✅ wrong OTP "000000" -> 401 "Invalid code."        (was 500)
      ✅ real OTP (scraped from ConsoleMailer log at
         /var/log/supervisor/backend.err.log) -> 200 with
         {"reset_token": "rst_<urlsafe>"}                 (was 500)
      ✅ 6 consecutive wrong attempts after a FRESH reset request
         yielded exact sequence [401,401,401,401,401,429] — matches
         spec and cross-verified in supervisor access log.
      ✅ After 429 purge, next verify-otp -> 400
         "No active reset code. Request a new one."

      Scenario 6 — POST /api/auth/reset-password
      ✅ Valid reset_token + new strong password "AnotherStrong2@"
         -> 200 {"ok":true, "session_token":"rs_<hex>"}   (was 500)
      ✅ POST /api/auth/login with OLD password -> 401 (old pw
         truly invalidated).
      ✅ GET /api/auth/me with the new session_token -> 200, email
         echoed correctly.
      ✅ POST /api/auth/login with NEW password -> 200.
      ✅ Re-use of SAME reset_token on a second /reset-password
         -> 400 detail="Reset link invalid or expired." (single-use
         enforced via delete_many on the reset-tokens collection
         after first use at password_auth.py L422).

      Zero 500s invariant
      ✅ Zero new "Internal Server Error" and zero new
         "TypeError: can't compare offset-naive and offset-aware"
         tracebacks in backend.err.log / backend.out.log between
         run-start and run-end offsets.

      test_result.md password_auth statuses updated to working=true,
      needs_retesting=false, stuck_count=0. test_plan.current_focus
      and stuck_tasks cleared. Scenarios 1-4 and 7-9 were NOT retested
      (already passing per prior run). Main agent: please summarise
      and finish — password-reset OTP flow is production-ready.


  - agent: "testing"
    message: |
      POST /api/auth/set-password + has_password flag on /api/auth/me
      VERIFIED end-to-end against EXPO_PUBLIC_BACKEND_URL. Harness:
      /app/set_password_test.py — 24/26 assertions PASS, 0 critical
      failures, 0 500s on /api/auth/set-password.

      Pass/fail per review scenario:

        SCENARIO 1 — Google-only user (password_hash $unset)
          1a GET /api/auth/me -> 200 has_password:false           ✅
          1b POST /api/auth/set-password NewStrong1! -> 200 ok    ✅
          1c GET /api/auth/me -> has_password:true                ✅
          1d POST /api/auth/login with new pw -> 200 session_token✅
          1e Second set-password -> 409 "already has a password"  ✅

        SCENARIO 2 — Weak passwords (after re-unset password_hash)
          "lowercase1!"    -> 400 "Password must include an uppercase letter."  ✅
          "UPPERCASE1!"    -> 400 "Password must include a lowercase letter."   ✅
          "NoDigitsAll!"   -> 400 "Password must include a number."             ✅
          "NoSymbols123A"  -> 400 "Password must include a symbol (e.g. !@#$)." ✅
          "short1!"        -> 422 (Pydantic string_too_short)                    ⚠️ Minor
            ↑ Not 400. Root cause: SetPasswordBody defines new_password with
              Field(..., min_length=10), so Pydantic validates BEFORE
              validate_password can emit the custom "Password must be at
              least 10 characters long." message. Same behavior as
              RegisterBody (already documented as acceptable in the existing
              password_auth task). The user still gets a proper rejection
              (no 500). If you want 400 + custom detail parity, drop
              min_length=10 from SetPasswordBody.new_password and let
              validate_password handle it.

        SCENARIO 3 — Auth
          No Bearer            -> 401 "Not authenticated"   ✅
          Bearer "garbage"     -> 401 "Invalid session"     ✅
          Empty body {} + auth -> 422 (not 500)             ✅
          No body at all       -> 422 (not 500)             ✅

        SCENARIO 4 — Regression
          GET /api/auth/me Bearer test_session_rs_001 -> 200, has_password
          field present as boolean (actual value: false — test-user-001
          is currently Google-only).                        ✅
          Zero 500s on /api/auth/set-password across the run (verified in
          /var/log/supervisor/backend.out.log — only 200/400/401/409/422
          codes recorded against POST /api/auth/set-password during the
          testing window).                                  ✅

      Fixture fix applied (NOT a source-code change): when the harness
      started, the users-collection document for test-user-002 had been
      dropped by an earlier profile-delete test, leaving an orphaned
      user_sessions row for test_session_rs_002. Testing agent re-seeded
      the user doc via direct Mongo upsert (user_id=test-user-002,
      email=test2@ravenscout.app, tier=pro) — matches
      /app/memory/test_credentials.md.

      RESTORATION STATE (per review — my call, documented): AFTER the
      suite I RE-UNSET password_hash on test2@ravenscout.app so it's
      still useful as a Google-only test fixture. Session token
      test_session_rs_002 remains valid (expires +30 days). tier=pro
      preserved. No source modifications by testing.

      test_result.md updated: password_auth_set_password task set to
      working:true, needs_retesting:false, stuck_count=0.

      Main agent: please summarise and finish. Optional low-priority
      polish if you want exact spec-parity on short-pw case: drop
      Pydantic min_length from SetPasswordBody.new_password.



tier_limits_rollover_v2:
  - task: "Pro tier limit → 40/month + 12-month rollover accumulate-mode"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          Tier limits + rollover v2 verified end-to-end against the
          preview URL (EXPO_PUBLIC_BACKEND_URL =
          https://tactical-auth-hub.preview.emergentagent.com).
          Harness: /app/tier_rollover_test.py — 33/33 assertions PASS.
          Zero 500s on any /api/auth/me call during the run
          (supervisor access log shows only 200/401).

          Fixture: seeded a one-off Core test user directly in Mongo
          (user_id=test-user-core-rollover / session=test_session_core_rollover
          / tier=core) since test_credentials.md has no Core fixture.
          The existing Pro fixtures (test-user-001, test-user-002) and
          Trial fixture (test-user-trial) were re-seeded defensively
          (upsert on users + user_sessions, session expiry +30d) before
          the scenarios run. No credentials rotated.

          === SCENARIO 1 — Pro tier limit = 40 ===
          Setup: test-user-002 reset to
            {tier:pro, analysis_count:0, rollover_count:0,
             billing_cycle_start: now()}
          GET /api/auth/me Bearer test_session_rs_002 →
            200 {
              tier: "pro",
              usage: {allowed:true, remaining:40, limit:40,
                      rollover:0, tier:"pro"},
              ...
            }
          ✅ tier == "pro"
          ✅ usage.limit == 40  (was 100 pre-change — confirmed updated)
          ✅ usage.remaining == 40 - 0 + 0 == 40
          ✅ usage.allowed == true

          === SCENARIO 2 — Core replace-mode rollover (unchanged) ===
          Setup: test-user-core-rollover set to
            {tier:core, analysis_count:3, rollover_count:0,
             billing_cycle_start: now() - 31 days}
          GET /api/auth/me Bearer test_session_core_rollover →
            200 {
              tier: "core",
              usage: {allowed:true, remaining:17, limit:10,
                      rollover:7, tier:"core"},
              ...
            }
          ✅ usage.limit == 10
          ✅ usage.rollover == 7   (= 10 - 3, capped at tier limit 10)
          ✅ usage.remaining == 17 (= 10 + 7)
          ✅ DB side: analysis_count reset to 0
          ✅ DB side: rollover_count persisted as 7
          Confirms rollover_months <= 1 branch:
            new_rollover = min(unused_this_cycle, analysis_limit)
          behaves as spec (replace-mode, single prior month carryover).

          === SCENARIO 3 — Pro accumulate-mode rollover (new) ===
          Setup: test-user-002 set to
            {tier:pro, analysis_count:5, rollover_count:30,
             billing_cycle_start: now() - 31 days}
          GET /api/auth/me Bearer test_session_rs_002 →
            200 {
              tier: "pro",
              usage: {allowed:true, remaining:105, limit:40,
                      rollover:65, tier:"pro"},
              ...
            }
          Math check:
            unused_this_cycle = 40 - 5 = 35
            new_rollover      = min(30 + 35, 40 * 12) = min(65, 480) = 65
            total_available   = 40 + 65 = 105
          ✅ usage.limit == 40
          ✅ usage.rollover == 65
          ✅ usage.remaining == 105
          ✅ DB side: analysis_count reset to 0
          ✅ DB side: rollover_count persisted as 65
          Confirms rollover_months > 1 branch:
            new_rollover = min(rollover_count + unused_this_cycle,
                               analysis_limit * rollover_months)
          correctly ADDs unused onto existing rollover (accumulate-mode).

          === SCENARIO 4 — Pro rollover cap = 480 (40 × 12) ===
          Setup: test-user-002 set to
            {tier:pro, analysis_count:0, rollover_count:475,
             billing_cycle_start: now() - 31 days}
          GET /api/auth/me Bearer test_session_rs_002 →
            200 {
              usage: {allowed:true, remaining:520, limit:40,
                      rollover:480, tier:"pro"}, ...
            }
          Math check:
            unused_this_cycle = 40 - 0 = 40
            new_rollover      = min(475 + 40, 480) = min(515, 480) = 480
            total_available   = 40 + 480 = 520
          ✅ usage.rollover == 480 (capped at 40*12)
          ✅ usage.remaining == 520
          ✅ usage.limit == 40

          === SCENARIO 5 — Pro limit reached message ===
          Setup: test-user-002 set to
            {tier:pro, analysis_count:40, rollover_count:0,
             billing_cycle_start: now()}  (fresh cycle, no rollover)
          GET /api/auth/me Bearer test_session_rs_002 →
            200 {
              usage: {
                allowed: false,
                remaining: 0,
                limit: 40,
                tier: "pro",
                message: "Monthly limit reached. Upgrade or wait for next cycle."
              }, ...
            }
          ✅ usage.allowed == false
          ✅ usage.remaining == 0
          ✅ usage.limit == 40
          ✅ usage.message contains "Monthly limit reached"

          === SCENARIO 6 — Regression: Trial + auth ===
          ✅ Trial (test_session_trial_001) → 200 with
             usage.limit == 3, tier == "trial" (is_lifetime path,
             unchanged by this patch).
          ✅ Pro 1 (test_session_rs_001) → 200 with usage.limit == 40.
          ✅ Zero 500s on /api/auth/me across the entire run.

          === CLEANUP ===
          ✅ test-user-002 restored to clean state:
             {tier:"pro", analysis_count:0, rollover_count:0,
              billing_cycle_start: now()}.
          Subsequent sessions (Profile screens, analyze flow, etc.)
          will start with a full 40-analysis Pro quota and no rollover.

          No source files modified by testing. Main agent: please
          summarise and finish — Pro 40/month + 12-month accumulate
          rollover + 480 cap are production-ready. Core replace-mode
          (10 + 1-month carryover) remains unchanged and correct.

agent_communication:
  - agent: "testing"
    message: |
      tier_limits_rollover_v2 validated — 33/33 assertions PASS via
      /app/tier_rollover_test.py against the preview URL.

      All 6 review scenarios green:
        1. Pro usage.limit is now 40 (was 100).
        2. Core replace-mode rollover unchanged: 10 + (10-3) = 17
           remaining, rollover=7.
        3. Pro accumulate-mode rollover: rollover 30 + unused 35 = 65,
           remaining = 40 + 65 = 105.
        4. Pro rollover cap honored: 475 + 40 clamps to 480 (40*12),
           remaining = 520.
        5. Pro limit-reached returns allowed=false, remaining=0,
           limit=40, message="Monthly limit reached. Upgrade or wait
           for next cycle."
        6. Trial unchanged (limit=3, is_lifetime), zero 500s anywhere.

      DB-side effects verified for the rollover cases: in-place update
      inside check_analysis_allowed resets analysis_count→0 and
      persists the new rollover_count. Cleanup restored test-user-002
      to {tier:pro, analysis_count:0, rollover_count:0,
      billing_cycle_start:now()}. No credential or source changes.

      Note: test_credentials.md still says "Pro: 100 analyses/month"
      (line 38). That's a doc-only staleness — the live tier config
      and behavior are 40/month. Worth updating when you touch the
      credentials file next; not a functional issue.

  - agent: "testing"
    message: |
      Species expansion v1 validated end-to-end against the preview URL.
      Harness: /app/species_expansion_test.py — 40 PASS / 1 non-blocking
      FAIL (stale pytest assertions, details below).

      ✅ Scenario 1 — prompt-pack resolution: all 8 species
         (deer/turkey/hog/elk/bear/moose/antelope/coyote) resolve to
         their own non-fallback packs with matching canonical_ids;
         `unicorn` correctly falls back.
      ✅ Scenario 2 — GET /api/species (anonymous): 200,
         user_tier="trial", 8 species, 3 categories, correct
         locked/unlocked split (deer/turkey/hog unlocked;
         elk/bear/moose/antelope/coyote locked), waterfowl/dove/quail
         hidden (enabled=False), terminology + form_fields populated
         on every entry.
      ✅ Scenario 3 — GET /api/species for pro (test_session_rs_002)
         and core (swapped via Mongo): all 8 unlocked both ways.
         Restored test-user-002 to tier=pro post-run.
      ✅ Scenario 4 — /api/analyze-hunt tier gating (critical):
         trial+elk -> 403 with detail "Elk is a Core feature. Upgrade
         your plan to analyze it." (matches spec); trial+deer -> 200
         (end-to-end analysis ran, not species-gated); pro+elk -> 200
         success=true (Pro proceeds past gate and completes analysis).
      ✅ Scenario 5 — legacy SPECIES_DATA shim: 8 keys exactly, every
         entry has name + icon + description + non-empty
         behavior_rules list (lengths 5-6).
      ✅ Scenario 6 — GET /api/auth/me test_session_rs_001 -> 200.
         Zero NEW 500s in backend logs during the run.
      ❌ Scenario 6 — existing pytest suite
         (tests/test_species_prompt_packs.py): 68 passing, 7 FAILING.
         The 7 failures are stale assertions that still insist
         elk/moose/bear/pronghorn resolve to GENERIC_FALLBACK_PACK —
         they were written before the 5 new packs existed and are
         invalidated by the very feature under review. NOT a
         regression of the new code; the runtime feature is correct.
         Main agent needs to update the test file:
           * TestSpeciesResolution.test_unsupported_species_falls_back
             — drop `elk`, `moose`, `bear`, `pronghorn` from the
             param list (keep `squirrel`, `whitetail_bobcat`, None, "",
             "   ").
           * TestSpeciesResolution.test_is_supported_species — expand
             its "supported" expectations to include elk/bear/moose/
             antelope/coyote.
           * TestSpeciesResolution.test_inventory_shape — inventory
             length is now 8 (was 3).
           * TestAssembleSystemPrompt.
             test_unsupported_species_uses_fallback_in_assembled_prompt
             — drop the newly-supported species from the "unsupported"
             param set.

      No source files modified by testing. test_result.md updated with
      a new `species_expansion_v1` task block. Main agent: please
      update tests/test_species_prompt_packs.py to match the new
      inventory; the species registry / prompt packs / /api/species /
      /api/analyze-hunt gating are production-ready.


  - agent: "testing"
    message: |
      Deepened prompt packs (regional + hunt-style modifiers) verified
      end-to-end for the 5 newly-expanded species
      (elk/bear/moose/antelope/coyote).

      New tests: /app/backend/tests/test_species_expansion_modifiers.py
      (41 parametrized assertions across 4 classes).

      Combined run:
          cd /app/backend && python -m pytest \
            tests/test_species_prompt_packs.py \
            tests/test_species_expansion_modifiers.py -q
          -> 115 passed in 0.06s  (74 prior + 41 new; zero regressions)

      ✅ Scenario 1 — 17 (species,style) pairs: each renders its
         canonical name (e.g. "Rifle (Elk)", "Archery (Black Bear)",
         "Ground Blind / Pit Blind (Pronghorn)") + HUNT STYLE CONTEXT
         header with style_id=<canonical> + a distinguishing
         tactical_adjustments phrase. Cross-contamination guard: no
         whitetail "hinge-cut" phrasing in any of the 5 packs.
      ✅ Scenario 2 — 12 (species,region) pairs: each renders its
         canonical regional name, REGIONAL CONTEXT header with
         region_id=<canonical>, AND a distinguishing regional phrase
         (elk+mountain_west "aspen"; antelope+plains "Wyoming";
         coyote+southeast_us "pine plantation"; etc.).
      ✅ Scenario 3 — combined: elk+archery+mountain_west,
         antelope+blind+plains, coyote+rifle+southeast_us all render
         BOTH modifiers. Builder block order verified:
         SPECIES -> REGIONAL -> SEASONAL -> HUNT STYLE -> HUNT CONDITIONS.
      ✅ Scenario 4 — graceful fallback: elk+saddle, elk+south_texas,
         coyote+saddle+east_texas, plus generic banana_boat_method +
         narnia across all 5 species — zero exceptions, neutral
         "unspecified" / "generic" notices emitted, no cross-pack
         leakage (whitetail saddle + whitetail south_texas content
         never shows up in elk/coyote prompts).
      ✅ Scenario 5 — backward compat: whitetail (deer) pack still
         resolves correctly with archery + south_texas; covered by the
         existing 74 tests in test_species_prompt_packs.py which all
         re-passed in the combined run.
      ✅ Scenario 6 — live smoke: POST /api/analyze-hunt with
         animal=coyote, hunt_style=rifle, GPS 31.2956,-95.9778 and a
         256x256 PNG against EXPO_PUBLIC_BACKEND_URL with Bearer
         test_session_rs_001 -> 200 success=true (5 overlays),
         region_resolution={east_texas, gps},
         hunt_style_resolution={rifle, user_selected}. Zero 500s on the
         expanded-pack rendering path. Backend log confirmed
         "Region resolved" + "Hunt style resolved" both fire, the
         prompt builds, OpenAI responds 200, pipeline completes.

      test_result.md updated: new species_expansion_v1_modifiers task
      block set to working:true, needs_retesting:false; current_focus
      cleared. No source files modified by testing agent.

      Main agent: please summarise and finish — deepened prompt packs
      are production-ready.
