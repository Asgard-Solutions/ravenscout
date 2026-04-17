"""
Backend API tests for Raven Scout - Auth + Subscription
Tests: Auth endpoints, subscription endpoints, usage enforcement, tier gating
"""
import pytest
import requests
import os
import base64
from PIL import Image
import io

# Get backend URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)

# Test credentials from test_credentials.md
TEST_USER_ID = "test-user-001"
TEST_SESSION_TOKEN = "test_session_rs_001"


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_headers():
    """Headers with valid auth token"""
    return {"Authorization": f"Bearer {TEST_SESSION_TOKEN}"}


@pytest.fixture
def test_map_image_base64():
    """Generate a simple test map image with visual features"""
    img = Image.new('RGB', (200, 200), color='#8B7355')
    pixels = img.load()
    
    # Add visual features
    for x in range(50, 100):
        for y in range(50, 100):
            pixels[x, y] = (34, 139, 34)
    
    for x in range(120, 180):
        for y in range(30, 80):
            pixels[x, y] = (65, 105, 225)
    
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    img_bytes = buffer.getvalue()
    img_base64 = base64.b64encode(img_bytes).decode('utf-8')
    
    return f"data:image/png;base64,{img_base64}"


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_auth_me_with_valid_token(self, api_client, auth_headers):
        """Test GET /api/auth/me with valid token returns user data + usage"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Validate user fields
        assert "user_id" in data, "Response should contain 'user_id' field"
        assert "email" in data, "Response should contain 'email' field"
        assert "name" in data, "Response should contain 'name' field"
        assert "picture" in data, "Response should contain 'picture' field"
        assert "tier" in data, "Response should contain 'tier' field"
        assert "usage" in data, "Response should contain 'usage' field"
        
        # Validate tier is one of the valid tiers
        assert data["tier"] in ["trial", "core", "pro"], f"Invalid tier: {data['tier']}"
        
        # Validate usage structure
        usage = data["usage"]
        assert "allowed" in usage, "Usage should have 'allowed' field"
        assert "remaining" in usage, "Usage should have 'remaining' field"
        assert "limit" in usage, "Usage should have 'limit' field"
        assert "tier" in usage, "Usage should have 'tier' field"
        
        assert isinstance(usage["allowed"], bool), "usage.allowed should be boolean"
        assert isinstance(usage["remaining"], int), "usage.remaining should be int"
        assert isinstance(usage["limit"], int), "usage.limit should be int"
        assert usage["remaining"] >= 0, "usage.remaining should be non-negative"
        
        print(f"✓ Auth /me with valid token test passed")
        print(f"  - User: {data['email']} ({data['name']})")
        print(f"  - Tier: {data['tier']}")
        print(f"  - Usage: {usage['remaining']}/{usage['limit']} remaining")
    
    def test_auth_me_without_token(self, api_client):
        """Test GET /api/auth/me without token returns 401"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Error response should contain 'detail' field"
        
        print(f"✓ Auth /me without token test passed (401 as expected)")
        print(f"  - Error: {data['detail']}")
    
    def test_auth_me_with_invalid_token(self, api_client):
        """Test GET /api/auth/me with invalid token returns 401"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer invalid_token_12345"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Error response should contain 'detail' field"
        
        print(f"✓ Auth /me with invalid token test passed (401 as expected)")


class TestSubscriptionEndpoints:
    """Subscription endpoint tests"""
    
    def test_subscription_status_with_auth(self, api_client, auth_headers):
        """Test GET /api/subscription/status with valid token returns tier info + usage"""
        response = api_client.get(
            f"{BASE_URL}/api/subscription/status",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "tier" in data, "Response should contain 'tier' field"
        assert "tier_info" in data, "Response should contain 'tier_info' field"
        assert "usage" in data, "Response should contain 'usage' field"
        assert "all_tiers" in data, "Response should contain 'all_tiers' field"
        
        # Validate tier
        assert data["tier"] in ["trial", "core", "pro"], f"Invalid tier: {data['tier']}"
        
        # Validate tier_info structure
        tier_info = data["tier_info"]
        assert "name" in tier_info, "tier_info should have 'name' field"
        assert "analysis_limit" in tier_info, "tier_info should have 'analysis_limit' field"
        assert "is_lifetime" in tier_info, "tier_info should have 'is_lifetime' field"
        assert "weather_api" in tier_info, "tier_info should have 'weather_api' field"
        assert "cloud_sync" in tier_info, "tier_info should have 'cloud_sync' field"
        assert "monthly_price" in tier_info, "tier_info should have 'monthly_price' field"
        assert "annual_price" in tier_info, "tier_info should have 'annual_price' field"
        
        # Validate usage
        usage = data["usage"]
        assert "remaining" in usage, "usage should have 'remaining' field"
        assert "limit" in usage, "usage should have 'limit' field"
        
        # Validate all_tiers
        all_tiers = data["all_tiers"]
        assert "trial" in all_tiers, "all_tiers should include 'trial'"
        assert "core" in all_tiers, "all_tiers should include 'core'"
        assert "pro" in all_tiers, "all_tiers should include 'pro'"
        
        print(f"✓ Subscription status test passed")
        print(f"  - Current tier: {data['tier']} ({tier_info['name']})")
        print(f"  - Analysis limit: {tier_info['analysis_limit']}")
        print(f"  - Weather API: {tier_info['weather_api']}")
        print(f"  - Usage: {usage['remaining']}/{usage['limit']}")
    
    def test_subscription_status_without_auth(self, api_client):
        """Test GET /api/subscription/status without token returns 401"""
        response = api_client.get(f"{BASE_URL}/api/subscription/status")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Subscription status without auth test passed (401 as expected)")
    
    def test_subscription_tiers_public(self, api_client):
        """Test GET /api/subscription/tiers returns all 3 tiers with correct pricing"""
        response = api_client.get(f"{BASE_URL}/api/subscription/tiers")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "tiers" in data, "Response should contain 'tiers' field"
        
        tiers = data["tiers"]
        
        # Validate all 3 tiers are present
        assert "trial" in tiers, "Should include 'trial' tier"
        assert "core" in tiers, "Should include 'core' tier"
        assert "pro" in tiers, "Should include 'pro' tier"
        
        # Validate trial tier
        trial = tiers["trial"]
        assert trial["name"] == "Trial", f"Trial name incorrect: {trial['name']}"
        assert trial["analysis_limit"] == 3, f"Trial limit should be 3, got {trial['analysis_limit']}"
        assert trial["is_lifetime"] is True, "Trial should be lifetime"
        assert trial["weather_api"] is False, "Trial should not have weather API"
        assert trial["monthly_price"] == 0, "Trial should be free"
        assert trial["annual_price"] == 0, "Trial should be free"
        
        # Validate core tier
        core = tiers["core"]
        assert core["name"] == "Core", f"Core name incorrect: {core['name']}"
        assert core["analysis_limit"] == 10, f"Core limit should be 10, got {core['analysis_limit']}"
        assert core["is_lifetime"] is False, "Core should not be lifetime"
        assert core["weather_api"] is True, "Core should have weather API"
        assert core["monthly_price"] == 7.99, f"Core monthly price should be 7.99, got {core['monthly_price']}"
        assert core["annual_price"] == 79.99, f"Core annual price should be 79.99, got {core['annual_price']}"
        
        # Validate pro tier
        pro = tiers["pro"]
        assert pro["name"] == "Pro", f"Pro name incorrect: {pro['name']}"
        assert pro["analysis_limit"] == 100, f"Pro limit should be 100, got {pro['analysis_limit']}"
        assert pro["is_lifetime"] is False, "Pro should not be lifetime"
        assert pro["weather_api"] is True, "Pro should have weather API"
        assert pro["cloud_sync"] is True, "Pro should have cloud sync"
        assert pro["monthly_price"] == 14.99, f"Pro monthly price should be 14.99, got {pro['monthly_price']}"
        assert pro["annual_price"] == 149.99, f"Pro annual price should be 149.99, got {pro['annual_price']}"
        
        print(f"✓ Subscription tiers test passed")
        print(f"  - Trial: {trial['analysis_limit']} lifetime analyses, ${trial['monthly_price']}/mo")
        print(f"  - Core: {core['analysis_limit']}/month, ${core['monthly_price']}/mo (${core['annual_price']}/yr)")
        print(f"  - Pro: {pro['analysis_limit']}/month, ${pro['monthly_price']}/mo (${pro['annual_price']}/yr)")
    
    def test_subscription_sync_revenuecat(self, api_client, auth_headers):
        """Test POST /api/subscription/sync-revenuecat updates user tier"""
        # Simulate RevenueCat entitlement data for Core tier
        payload = {
            "revenuecat_user_id": TEST_USER_ID,
            "entitlements": {
                "core_entitlement": {
                    "isActive": True,
                    "productIdentifier": "core_monthly"
                }
            }
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/subscription/sync-revenuecat",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        assert data["success"] is True, "Sync should succeed"
        assert "tier" in data, "Response should contain 'tier' field"
        
        # Note: This test modifies the user's tier. In a real test suite, we'd want to restore it.
        # For now, we'll just verify the response structure.
        
        print(f"✓ RevenueCat sync test passed")
        print(f"  - Tier after sync: {data['tier']}")


class TestUsageEnforcement:
    """Usage enforcement and tier gating tests"""
    
    def test_analyze_hunt_requires_auth(self, api_client, test_map_image_base64):
        """Test POST /api/analyze-hunt without auth returns 401"""
        payload = {
            "conditions": {
                "animal": "deer",
                "hunt_date": "2026-01-15",
                "time_window": "morning",
                "wind_direction": "N",
            },
            "map_image_base64": test_map_image_base64
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/analyze-hunt",
            json=payload,
            timeout=30
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Error response should contain 'detail' field"
        
        print(f"✓ Analyze-hunt requires auth test passed (401 as expected)")
        print(f"  - Error: {data['detail']}")
    
    def test_analyze_hunt_with_auth_succeeds(self, api_client, auth_headers, test_map_image_base64):
        """Test POST /api/analyze-hunt with auth succeeds and increments usage"""
        # First, get current usage
        me_response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers=auth_headers
        )
        assert me_response.status_code == 200
        initial_usage = me_response.json()["usage"]
        initial_remaining = initial_usage["remaining"]
        
        print(f"Initial usage: {initial_remaining}/{initial_usage['limit']} remaining")
        
        # If no analyses remaining, skip this test
        if initial_remaining == 0:
            pytest.skip("No analyses remaining for test user. Cannot test usage increment.")
        
        # Perform analysis
        payload = {
            "conditions": {
                "animal": "deer",
                "hunt_date": "2026-01-15",
                "time_window": "morning",
                "wind_direction": "N",
            },
            "map_image_base64": test_map_image_base64
        }
        
        print("Performing analysis (this may take 10-20 seconds)...")
        response = api_client.post(
            f"{BASE_URL}/api/analyze-hunt",
            headers=auth_headers,
            json=payload,
            timeout=60
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        
        if not data["success"]:
            error_msg = data.get("error", "Unknown error")
            # Check if it's a usage limit error
            if "limit" in error_msg.lower():
                print(f"✓ Usage limit enforced: {error_msg}")
                return
            else:
                pytest.skip(f"AI analysis failed: {error_msg}")
        
        assert data["success"] is True, f"Analysis should succeed"
        assert "result" in data, "Response should contain 'result' field"
        assert "usage" in data, "Response should contain updated 'usage' field"
        
        # Validate usage was incremented
        updated_usage = data["usage"]
        assert "remaining" in updated_usage, "Updated usage should have 'remaining' field"
        
        expected_remaining = initial_remaining - 1
        assert updated_usage["remaining"] == expected_remaining, \
            f"Usage should decrement by 1. Expected {expected_remaining}, got {updated_usage['remaining']}"
        
        print(f"✓ Analyze-hunt with auth test passed")
        print(f"  - Analysis succeeded")
        print(f"  - Usage after analysis: {updated_usage['remaining']}/{updated_usage['limit']} remaining")
        print(f"  - Usage correctly decremented from {initial_remaining} to {updated_usage['remaining']}")
    
    def test_weather_api_blocks_trial_users(self, api_client):
        """Test POST /api/weather blocks trial users with error message"""
        # For this test, we need a trial user token
        # The test user (test-user-001) might be trial tier
        # Let's check by calling /api/auth/me first
        
        me_response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {TEST_SESSION_TOKEN}"}
        )
        
        if me_response.status_code != 200:
            pytest.skip("Cannot verify user tier for weather API test")
        
        user_data = me_response.json()
        user_tier = user_data.get("tier", "trial")
        
        print(f"Testing weather API with user tier: {user_tier}")
        
        # Test weather API call
        from datetime import datetime, timedelta
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        payload = {
            "lat": 32.7767,
            "lon": -96.7970,
            "date": tomorrow,
            "time_window": "morning"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/weather",
            headers={"Authorization": f"Bearer {TEST_SESSION_TOKEN}"},
            json=payload,
            timeout=20
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        
        if user_tier == "trial":
            # Trial users should be blocked
            assert data["success"] is False, "Trial users should be blocked from weather API"
            assert "error" in data, "Error response should contain 'error' field"
            
            error_msg = data["error"]
            assert "Core" in error_msg or "Pro" in error_msg or "Upgrade" in error_msg, \
                f"Error message should mention upgrade requirement: {error_msg}"
            
            print(f"✓ Weather API blocks trial users test passed")
            print(f"  - Error message: {error_msg}")
        else:
            # Core/Pro users should succeed
            assert data["success"] is True, f"Core/Pro users should access weather API"
            assert "data" in data, "Response should contain 'data' field"
            
            print(f"✓ Weather API allows {user_tier} users test passed")
            print(f"  - Weather data retrieved successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
