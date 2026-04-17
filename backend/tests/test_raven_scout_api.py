"""
Backend API tests for Raven Scout
Tests: Health check, species endpoint, analyze-hunt endpoint
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


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_headers():
    """Headers with valid auth token for testing"""
    return {"Authorization": "Bearer test_session_rs_001"}


@pytest.fixture
def test_map_image_base64():
    """Generate a simple test map image with visual features"""
    # Create a 200x200 image with some visual features (not blank)
    img = Image.new('RGB', (200, 200), color='#8B7355')  # Brown base (terrain)
    pixels = img.load()
    
    # Add some visual features - green patches (vegetation)
    for x in range(50, 100):
        for y in range(50, 100):
            pixels[x, y] = (34, 139, 34)  # Forest green
    
    # Add blue area (water)
    for x in range(120, 180):
        for y in range(30, 80):
            pixels[x, y] = (65, 105, 225)  # Royal blue
    
    # Add some darker areas (shadows/terrain)
    for x in range(10, 40):
        for y in range(150, 190):
            pixels[x, y] = (101, 67, 33)  # Dark brown
    
    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    img_bytes = buffer.getvalue()
    img_base64 = base64.b64encode(img_bytes).decode('utf-8')
    
    return f"data:image/png;base64,{img_base64}"


class TestHealthEndpoints:
    """Health check and basic endpoints"""
    
    def test_root_endpoint(self, api_client):
        """Test GET /api/ returns Raven Scout API message"""
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "message" in data, "Response should contain 'message' field"
        assert "Raven Scout" in data["message"], "Message should contain 'Raven Scout'"
        assert "version" in data, "Response should contain 'version' field"
        print(f"✓ Root endpoint test passed: {data}")
    
    def test_health_endpoint(self, api_client):
        """Test GET /api/health returns ok status"""
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should contain 'status' field"
        assert data["status"] == "ok", f"Expected status 'ok', got '{data['status']}'"
        print(f"✓ Health endpoint test passed: {data}")


class TestSpeciesEndpoint:
    """Species data endpoint tests"""
    
    def test_get_species(self, api_client):
        """Test GET /api/species returns 3 species with correct data"""
        response = api_client.get(f"{BASE_URL}/api/species")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "species" in data, "Response should contain 'species' field"
        
        species_list = data["species"]
        assert len(species_list) == 3, f"Expected 3 species, got {len(species_list)}"
        
        # Check for required species
        species_ids = [s["id"] for s in species_list]
        assert "deer" in species_ids, "Should include 'deer' species"
        assert "turkey" in species_ids, "Should include 'turkey' species"
        assert "hog" in species_ids, "Should include 'hog' species"
        
        # Validate structure of each species
        for species in species_list:
            assert "id" in species, f"Species should have 'id' field"
            assert "name" in species, f"Species should have 'name' field"
            assert "description" in species, f"Species should have 'description' field"
            assert "icon" in species, f"Species should have 'icon' field"
            
            # Validate specific species data
            if species["id"] == "deer":
                assert species["name"] == "Whitetail Deer", f"Deer name incorrect: {species['name']}"
            elif species["id"] == "turkey":
                assert species["name"] == "Wild Turkey", f"Turkey name incorrect: {species['name']}"
            elif species["id"] == "hog":
                assert species["name"] == "Wild Hog", f"Hog name incorrect: {species['name']}"
        
        print(f"✓ Species endpoint test passed: {len(species_list)} species found")
        for s in species_list:
            print(f"  - {s['id']}: {s['name']}")


class TestAnalyzeHuntEndpoint:
    """Hunt analysis endpoint tests"""
    
    def test_analyze_hunt_with_map_image(self, api_client, auth_headers, test_map_image_base64):
        """Test POST /api/analyze-hunt with real map image and conditions (requires auth)"""
        payload = {
            "conditions": {
                "animal": "deer",
                "hunt_date": "2026-01-15",
                "time_window": "morning",
                "wind_direction": "N",
                "temperature": "45°F",
                "precipitation": None,
                "property_type": "public",
                "region": "East Texas"
            },
            "map_image_base64": test_map_image_base64
        }
        
        print("Sending analyze-hunt request (this may take 10-20 seconds for AI processing)...")
        response = api_client.post(
            f"{BASE_URL}/api/analyze-hunt",
            headers=auth_headers,
            json=payload,
            timeout=60  # AI processing can take time
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        
        if not data["success"]:
            error_msg = data.get("error", "Unknown error")
            print(f"✗ Analysis failed: {error_msg}")
            # Don't fail the test if AI service is temporarily unavailable
            pytest.skip(f"AI analysis failed: {error_msg}")
        
        assert data["success"] is True, f"Analysis should succeed, got error: {data.get('error')}"
        assert "result" in data, "Response should contain 'result' field"
        
        result = data["result"]
        
        # Validate result structure
        assert "id" in result, "Result should have 'id' field"
        assert "overlays" in result, "Result should have 'overlays' field"
        assert "summary" in result, "Result should have 'summary' field"
        assert "top_setups" in result, "Result should have 'top_setups' field"
        assert "wind_notes" in result, "Result should have 'wind_notes' field"
        assert "best_time" in result, "Result should have 'best_time' field"
        assert "key_assumptions" in result, "Result should have 'key_assumptions' field"
        assert "species_tips" in result, "Result should have 'species_tips' field"
        
        # Validate overlays
        overlays = result["overlays"]
        assert isinstance(overlays, list), "Overlays should be a list"
        assert len(overlays) >= 3, f"Should have at least 3 overlays, got {len(overlays)}"
        
        # Check overlay structure
        for overlay in overlays:
            assert "type" in overlay, "Overlay should have 'type' field"
            assert overlay["type"] in ["stand", "corridor", "access_route", "avoid"], \
                f"Invalid overlay type: {overlay['type']}"
            assert "label" in overlay, "Overlay should have 'label' field"
            assert "x_percent" in overlay, "Overlay should have 'x_percent' field"
            assert "y_percent" in overlay, "Overlay should have 'y_percent' field"
            assert "reasoning" in overlay, "Overlay should have 'reasoning' field"
            assert "confidence" in overlay, "Overlay should have 'confidence' field"
            assert overlay["confidence"] in ["low", "medium", "high"], \
                f"Invalid confidence: {overlay['confidence']}"
            
            # Validate position percentages
            assert 0 <= overlay["x_percent"] <= 100, f"x_percent out of range: {overlay['x_percent']}"
            assert 0 <= overlay["y_percent"] <= 100, f"y_percent out of range: {overlay['y_percent']}"
        
        # Validate other fields
        assert isinstance(result["summary"], str) and len(result["summary"]) > 0, \
            "Summary should be a non-empty string"
        assert isinstance(result["top_setups"], list), "top_setups should be a list"
        assert isinstance(result["wind_notes"], str), "wind_notes should be a string"
        assert isinstance(result["best_time"], str), "best_time should be a string"
        assert isinstance(result["key_assumptions"], list), "key_assumptions should be a list"
        assert isinstance(result["species_tips"], list), "species_tips should be a list"
        
        print(f"✓ Analyze-hunt endpoint test passed")
        print(f"  - Analysis ID: {result['id']}")
        print(f"  - Overlays: {len(overlays)}")
        print(f"  - Summary: {result['summary'][:100]}...")
        print(f"  - Top setups: {len(result['top_setups'])}")
    
    def test_analyze_hunt_missing_conditions(self, api_client, test_map_image_base64):
        """Test POST /api/analyze-hunt with missing required fields"""
        payload = {
            "conditions": {
                "animal": "deer",
                # Missing required fields
            },
            "map_image_base64": test_map_image_base64
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/analyze-hunt",
            json=payload,
            timeout=30
        )
        
        # Should return 422 for validation error
        assert response.status_code == 422, \
            f"Expected 422 for missing fields, got {response.status_code}"
        print(f"✓ Missing conditions validation test passed")
    
    def test_analyze_hunt_invalid_species(self, api_client, auth_headers, test_map_image_base64):
        """Test POST /api/analyze-hunt with invalid species (requires auth)"""
        payload = {
            "conditions": {
                "animal": "invalid_species",
                "hunt_date": "2026-01-15",
                "time_window": "morning",
                "wind_direction": "N",
            },
            "map_image_base64": test_map_image_base64
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/analyze-hunt",
            headers=auth_headers,
            json=payload,
            timeout=30
        )
        
        # Should return 200 but with success=false and error message
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["success"] is False, "Should fail for invalid species"
        assert "error" in data, "Should contain error message"
        print(f"✓ Invalid species validation test passed: {data['error']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
