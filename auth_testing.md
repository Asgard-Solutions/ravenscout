## Auth-Gated App Testing Playbook
### Step 1: Create Test User & Session
```bash
mongosh --eval "
use('raven_scout');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({ user_id: userId, email: 'test@example.com', name: 'Test User', picture: '', tier: 'trial', analysis_count: 0, billing_cycle_start: new Date(), rollover_count: 0, created_at: new Date() });
db.user_sessions.insertOne({ user_id: userId, session_token: sessionToken, expires_at: new Date(Date.now() + 7*24*60*60*1000), created_at: new Date() });
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```
### Step 2: Test Backend
```bash
curl -X GET 'http://localhost:8001/api/auth/me' -H 'Authorization: Bearer SESSION_TOKEN'
curl -X GET 'http://localhost:8001/api/subscription/status' -H 'Authorization: Bearer SESSION_TOKEN'
```
### Step 3: Browser Testing
Set cookie + navigate to app, verify dashboard loads.
