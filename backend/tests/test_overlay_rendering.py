"""
Test overlay rendering bug fix - verify backend returns overlays with x_percent and y_percent
"""
import pytest
import requests
import os
import base64
from pathlib import Path

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
TEST_TOKEN = "test_session_rs_001"

# Create a simple test image (1x1 pixel PNG)
TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

class TestOverlayRendering:
    """Test backend returns overlays correctly for overlay rendering bug fix"""

    def test_analyze_hunt_returns_overlays_with_coordinates(self):
        """Verify /api/analyze-hunt returns overlays with x_percent and y_percent"""
        response = requests.post(
            f"{BASE_URL}/api/analyze-hunt",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"},
            json={
                "conditions": {
                    "animal": "deer",
                    "hunt_date": "2026-05-15",
                    "time_window": "morning",
                    "wind_direction": "NW",
                    "temperature": "55°F",
                    "precipitation": "None",
                    "property_type": "public",
                    "region": "Midwest"
                },
                "map_image_base64": f"data:image/png;base64,{TEST_IMAGE_BASE64}"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] is True, f"Analysis failed: {data.get('error')}"
        assert "result" in data, "No result in response"
        
        result = data["result"]
        assert "overlays" in result, "No overlays in result"
        assert len(result["overlays"]) > 0, "No overlays returned"
        
        # Verify each overlay has required coordinate fields
        for overlay in result["overlays"]:
            assert "x_percent" in overlay, f"Overlay missing x_percent: {overlay}"
            assert "y_percent" in overlay, f"Overlay missing y_percent: {overlay}"
            assert "type" in overlay, f"Overlay missing type: {overlay}"
            assert "label" in overlay, f"Overlay missing label: {overlay}"
            assert "reasoning" in overlay, f"Overlay missing reasoning: {overlay}"
            assert "confidence" in overlay, f"Overlay missing confidence: {overlay}"
            
            # Verify coordinates are in valid range (0-100)
            x = overlay["x_percent"]
            y = overlay["y_percent"]
            assert 0 <= x <= 100, f"x_percent out of range: {x}"
            assert 0 <= y <= 100, f"y_percent out of range: {y}"
            
            # Verify type is one of the expected overlay types
            valid_types = ["stand", "corridor", "access_route", "avoid", "bedding", "food", "water", "trail"]
            assert overlay["type"] in valid_types, f"Invalid overlay type: {overlay['type']}"
        
        print(f"✅ Backend returned {len(result['overlays'])} overlays with valid coordinates")
        for i, overlay in enumerate(result["overlays"]):
            print(f"  Overlay {i+1}: {overlay['type']} at ({overlay['x_percent']:.1f}%, {overlay['y_percent']:.1f}%) - {overlay['label']}")

    def test_overlay_types_have_correct_structure(self):
        """Verify different overlay types (markers vs zones) have correct structure"""
        response = requests.post(
            f"{BASE_URL}/api/analyze-hunt",
            headers={"Authorization": f"Bearer {TEST_TOKEN}"},
            json={
                "conditions": {
                    "animal": "turkey",
                    "hunt_date": "2026-05-20",
                    "time_window": "morning",
                    "wind_direction": "E",
                    "temperature": "60°F",
                    "precipitation": "None"
                },
                "map_image_base64": f"data:image/png;base64,{TEST_IMAGE_BASE64}"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        overlays = data["result"]["overlays"]
        
        # Check for zone overlays (corridor, avoid) which may have width/height
        zone_types = ["corridor", "avoid"]
        marker_types = ["stand", "access_route", "bedding", "food", "water", "trail"]
        
        for overlay in overlays:
            if overlay["type"] in zone_types:
                # Zones may have width_percent and height_percent
                if "width_percent" in overlay and overlay["width_percent"] is not None:
                    assert 0 <= overlay["width_percent"] <= 100, f"Invalid width_percent: {overlay['width_percent']}"
                if "height_percent" in overlay and overlay["height_percent"] is not None:
                    assert 0 <= overlay["height_percent"] <= 100, f"Invalid height_percent: {overlay['height_percent']}"
                    print(f"✅ Zone overlay: {overlay['type']} with dimensions {overlay.get('width_percent')}% x {overlay.get('height_percent')}%")
            else:
                # Markers should be point locations
                print(f"✅ Marker overlay: {overlay['type']} at ({overlay['x_percent']:.1f}%, {overlay['y_percent']:.1f}%)")
