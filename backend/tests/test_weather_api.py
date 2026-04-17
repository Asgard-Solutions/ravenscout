"""
Backend API tests for Raven Scout - Weather API Integration
Tests: Weather endpoint with different time windows and parameters
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

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


class TestWeatherEndpoint:
    """Weather API endpoint tests"""
    
    def test_weather_endpoint_morning(self, api_client):
        """Test POST /api/weather with morning time window"""
        # Use Dallas, TX coordinates
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        payload = {
            "lat": 32.7767,
            "lon": -96.7970,
            "date": tomorrow,
            "time_window": "morning"
        }
        
        print(f"Testing weather endpoint with morning time window for {tomorrow}...")
        response = api_client.post(
            f"{BASE_URL}/api/weather",
            json=payload,
            timeout=20
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        
        if not data["success"]:
            error_msg = data.get("error", "Unknown error")
            print(f"✗ Weather fetch failed: {error_msg}")
            pytest.skip(f"Weather API failed: {error_msg}")
        
        assert data["success"] is True, f"Weather fetch should succeed, got error: {data.get('error')}"
        assert "data" in data, "Response should contain 'data' field"
        
        weather = data["data"]
        
        # Validate required fields
        required_fields = [
            "wind_direction", "wind_speed_mph", "temperature_f", 
            "precipitation_chance", "cloud_cover", "condition", 
            "humidity", "pressure_mb", "fetched_at", "is_forecast"
        ]
        
        for field in required_fields:
            assert field in weather, f"Weather data should have '{field}' field"
        
        # Validate optional fields
        assert "sunrise" in weather, "Weather data should have 'sunrise' field"
        assert "sunset" in weather, "Weather data should have 'sunset' field"
        assert "location_name" in weather, "Weather data should have 'location_name' field"
        
        # Validate data types and ranges
        assert isinstance(weather["wind_direction"], str), "wind_direction should be string"
        assert isinstance(weather["wind_speed_mph"], (int, float)), "wind_speed_mph should be numeric"
        assert weather["wind_speed_mph"] >= 0, "wind_speed_mph should be non-negative"
        
        assert isinstance(weather["temperature_f"], (int, float)), "temperature_f should be numeric"
        assert -50 <= weather["temperature_f"] <= 150, f"temperature_f out of reasonable range: {weather['temperature_f']}"
        
        assert isinstance(weather["precipitation_chance"], int), "precipitation_chance should be int"
        assert 0 <= weather["precipitation_chance"] <= 100, f"precipitation_chance out of range: {weather['precipitation_chance']}"
        
        assert isinstance(weather["cloud_cover"], int), "cloud_cover should be int"
        assert 0 <= weather["cloud_cover"] <= 100, f"cloud_cover out of range: {weather['cloud_cover']}"
        
        assert isinstance(weather["condition"], str), "condition should be string"
        assert len(weather["condition"]) > 0, "condition should not be empty"
        
        assert isinstance(weather["humidity"], int), "humidity should be int"
        assert 0 <= weather["humidity"] <= 100, f"humidity out of range: {weather['humidity']}"
        
        assert isinstance(weather["is_forecast"], bool), "is_forecast should be boolean"
        
        print(f"✓ Weather endpoint (morning) test passed")
        print(f"  - Location: {weather.get('location_name', 'N/A')}")
        print(f"  - Condition: {weather['condition']}")
        print(f"  - Temperature: {weather['temperature_f']}°F")
        print(f"  - Wind: {weather['wind_direction']} at {weather['wind_speed_mph']} mph")
        print(f"  - Cloud Cover: {weather['cloud_cover']}%")
        print(f"  - Precipitation Chance: {weather['precipitation_chance']}%")
        if weather.get('sunrise'):
            print(f"  - Sunrise: {weather['sunrise']}")
        if weather.get('sunset'):
            print(f"  - Sunset: {weather['sunset']}")
    
    def test_weather_endpoint_evening(self, api_client):
        """Test POST /api/weather with evening time window"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        payload = {
            "lat": 32.7767,
            "lon": -96.7970,
            "date": tomorrow,
            "time_window": "evening"
        }
        
        print(f"Testing weather endpoint with evening time window...")
        response = api_client.post(
            f"{BASE_URL}/api/weather",
            json=payload,
            timeout=20
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["success"] is True, f"Weather fetch should succeed"
        assert "data" in data, "Response should contain 'data' field"
        
        weather = data["data"]
        assert "wind_direction" in weather
        assert "temperature_f" in weather
        assert "cloud_cover" in weather
        
        print(f"✓ Weather endpoint (evening) test passed")
        print(f"  - Temperature: {weather['temperature_f']}°F")
        print(f"  - Wind: {weather['wind_direction']} at {weather['wind_speed_mph']} mph")
    
    def test_weather_endpoint_all_day(self, api_client):
        """Test POST /api/weather with all-day time window"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        payload = {
            "lat": 32.7767,
            "lon": -96.7970,
            "date": tomorrow,
            "time_window": "all-day"
        }
        
        print(f"Testing weather endpoint with all-day time window...")
        response = api_client.post(
            f"{BASE_URL}/api/weather",
            json=payload,
            timeout=20
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["success"] is True, f"Weather fetch should succeed"
        assert "data" in data, "Response should contain 'data' field"
        
        weather = data["data"]
        assert "wind_direction" in weather
        assert "temperature_f" in weather
        assert "cloud_cover" in weather
        
        print(f"✓ Weather endpoint (all-day) test passed")
        print(f"  - Temperature: {weather['temperature_f']}°F")
        print(f"  - Cloud Cover: {weather['cloud_cover']}%")
    
    def test_weather_endpoint_different_location(self, api_client):
        """Test POST /api/weather with different location (Austin, TX)"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        payload = {
            "lat": 30.2672,
            "lon": -97.7431,
            "date": tomorrow,
            "time_window": "morning"
        }
        
        print(f"Testing weather endpoint with Austin, TX coordinates...")
        response = api_client.post(
            f"{BASE_URL}/api/weather",
            json=payload,
            timeout=20
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["success"] is True, f"Weather fetch should succeed"
        assert "data" in data, "Response should contain 'data' field"
        
        weather = data["data"]
        assert "location_name" in weather
        
        print(f"✓ Weather endpoint (different location) test passed")
        print(f"  - Location: {weather.get('location_name', 'N/A')}")
        print(f"  - Condition: {weather['condition']}")
    
    def test_weather_endpoint_missing_fields(self, api_client):
        """Test POST /api/weather with missing required fields"""
        payload = {
            "lat": 32.7767,
            # Missing lon, date, time_window
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/weather",
            json=payload,
            timeout=20
        )
        
        # Should return 422 for validation error
        assert response.status_code == 422, \
            f"Expected 422 for missing fields, got {response.status_code}"
        print(f"✓ Missing fields validation test passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
