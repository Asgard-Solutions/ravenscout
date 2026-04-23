"""
Create a test hunt with overlays for frontend testing
"""
import requests
import json
import os

BASE_URL = "https://species-mapper-5.preview.emergentagent.com"
TEST_TOKEN = "test_session_rs_001"

# Simple 1x1 pixel PNG
TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

print("Creating test hunt with overlays...")

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

if response.status_code == 200:
    data = response.json()
    if data["success"]:
        result = data["result"]
        hunt_id = result["id"]
        overlays = result["overlays"]
        
        print(f"\n✅ Test hunt created successfully!")
        print(f"Hunt ID: {hunt_id}")
        print(f"Number of overlays: {len(overlays)}")
        print(f"\nOverlay details:")
        for i, overlay in enumerate(overlays):
            print(f"  {i+1}. {overlay['type']} - {overlay['label']}")
            print(f"     Position: ({overlay['x_percent']:.1f}%, {overlay['y_percent']:.1f}%)")
            if overlay.get('width_percent'):
                print(f"     Size: {overlay['width_percent']:.1f}% x {overlay['height_percent']:.1f}%")
            print(f"     Confidence: {overlay['confidence']}")
        
        # Save hunt data for frontend testing
        hunt_data = {
            "id": hunt_id,
            "species": "deer",
            "speciesName": "Whitetail Deer",
            "date": "2026-05-15",
            "timeWindow": "morning",
            "windDirection": "NW",
            "mapImage": f"data:image/png;base64,{TEST_IMAGE_BASE64}",
            "result": result,
            "createdAt": "2026-04-17T19:15:00Z"
        }
        
        print(f"\n📝 Hunt data saved for frontend testing")
        print(f"Use hunt ID: {hunt_id}")
        print(f"Navigate to: https://species-mapper-5.preview.emergentagent.com/results?huntId={hunt_id}")
        
        # Output JSON for easy copying
        with open("/tmp/test_hunt_data.json", "w") as f:
            json.dump(hunt_data, f, indent=2)
        print(f"\n💾 Full hunt data saved to: /tmp/test_hunt_data.json")
        
    else:
        print(f"❌ Analysis failed: {data.get('error')}")
else:
    print(f"❌ Request failed: {response.status_code}")
    print(response.text)
