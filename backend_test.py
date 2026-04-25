"""
Backend test for Raven Scout AWS S3 image upload pipeline (production bucket).

Tests:
  1) Auth + tier gating on /api/media/presign-upload
  2) Input validation (role, extension, mime allowlists)
  3) Response shape on success (storageKey pattern, sanitization,
     uploadUrl format, privateDelivery, expiresIn, mime echo)
  4) Live S3 round-trip (presign-upload -> PUT -> presign-download -> GET
     -> /api/media/delete -> re-GET 404)
  5) Owner guard on /api/media/presign-download and /api/media/delete
  6) DELETE /api/hunts/{hunt_id} S3 cascade with REAL S3 keys

Backend base URL: http://localhost:8001
"""

import os
import sys
import uuid
import requests

BASE_URL = "http://localhost:8001/api"
PRO_TOKEN = "test_session_rs_001"
TRIAL_TOKEN = "test_session_trial_001"

# Real 1x1 PNG (RGBA black) - well-formed bytes
ONE_BY_ONE_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

results = []


def record(section, name, ok, detail=""):
    results.append((section, name, ok, detail))
    flag = "PASS" if ok else "FAIL"
    line = f"[{flag}] {section} :: {name}"
    if not ok and detail:
        line += f"  --> {detail}"
    elif detail and ok:
        line += f"  ({detail})"
    print(line, flush=True)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def post(path, *, token=None, json_body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers.update(auth(token))
    return requests.post(f"{BASE_URL}{path}", headers=headers, json=json_body, timeout=30)


def http_delete(path, *, token=None):
    headers = {}
    if token:
        headers.update(auth(token))
    return requests.delete(f"{BASE_URL}{path}", headers=headers, timeout=30)


# ============================================================
# SECTION 1 - Auth + tier gating on /api/media/presign-upload
# ============================================================
def section_1_auth_tier():
    section = "1.AuthTier"
    payload = {
        "imageId": f"img_{uuid.uuid4().hex[:8]}",
        "huntId": "hunt_test",
        "role": "primary",
        "mime": "image/jpeg",
        "extension": "jpg",
    }
    # No bearer
    r = post("/media/presign-upload", json_body=payload)
    record(section, "no Bearer -> 401", r.status_code == 401,
           f"got {r.status_code} body={r.text[:140]}")

    # Trial -> 403
    r = post("/media/presign-upload", token=TRIAL_TOKEN, json_body=payload)
    body = {}
    try:
        body = r.json()
    except Exception:
        pass
    ok = r.status_code == 403 and "Pro" in (body.get("detail") or "")
    record(section, "trial -> 403 Pro-only", ok, f"got {r.status_code} {body}")

    # Pro -> 200
    r = post("/media/presign-upload", token=PRO_TOKEN, json_body=payload)
    record(section, "pro -> 200", r.status_code == 200,
           f"got {r.status_code} body={r.text[:200]}")


# ============================================================
# SECTION 2 - Input validation
# ============================================================
def section_2_validation():
    section = "2.Validation"
    base = {
        "imageId": f"img_{uuid.uuid4().hex[:8]}",
        "huntId": "hunt_test",
        "role": "primary",
        "mime": "image/jpeg",
        "extension": "jpg",
    }

    # Unknown role
    p = {**base, "role": "hero"}
    r = post("/media/presign-upload", token=PRO_TOKEN, json_body=p)
    record(section, "unknown role 'hero' -> 400",
           r.status_code == 400, f"got {r.status_code} {r.text[:140]}")

    # Unsupported extensions
    for ext in ["tiff", "gif", "svg"]:
        p = {**base, "extension": ext}
        r = post("/media/presign-upload", token=PRO_TOKEN, json_body=p)
        record(section, f"ext '{ext}' -> 400",
               r.status_code == 400, f"got {r.status_code} {r.text[:140]}")

    # Disallowed mimes
    for m in ["image/gif", "image/tiff", "application/pdf", "text/plain"]:
        p = {**base, "mime": m}
        r = post("/media/presign-upload", token=PRO_TOKEN, json_body=p)
        record(section, f"mime '{m}' -> 400",
               r.status_code == 400, f"got {r.status_code} {r.text[:140]}")

    # Allowed mime+ext combos -> 200
    combos = [
        ("image/jpeg", "jpg"),
        ("image/jpeg", "jpeg"),
        ("image/png", "png"),
        ("image/webp", "webp"),
        ("image/heic", "heic"),
        ("image/heif", "heif"),
    ]
    for mime, ext in combos:
        p = {**base, "imageId": f"img_{uuid.uuid4().hex[:8]}",
             "mime": mime, "extension": ext}
        r = post("/media/presign-upload", token=PRO_TOKEN, json_body=p)
        ok = r.status_code == 200
        detail = f"got {r.status_code}"
        if ok and ext == "jpeg":
            j = r.json()
            key = j.get("storageKey", "")
            normalised = key.endswith(".jpg") and not key.endswith(".jpeg")
            ok = ok and normalised
            detail += f" key_ends={key[-8:]} normalised={normalised}"
        elif not ok:
            detail += f" body={r.text[:160]}"
        record(section, f"allowed {mime}+{ext} -> 200", ok, detail)


# ============================================================
# SECTION 3 - Response shape on success
# ============================================================
def section_3_response_shape():
    section = "3.ResponseShape"
    image_id = "hello world?"
    payload = {
        "imageId": image_id,
        "huntId": None,
        "role": "primary",
        "mime": "image/png",
        "extension": "png",
    }
    r = post("/media/presign-upload", token=PRO_TOKEN, json_body=payload)
    if r.status_code != 200:
        record(section, "presign 200", False, f"got {r.status_code} body={r.text[:200]}")
        return
    j = r.json()

    key = j.get("storageKey", "")
    expected_prefix = "hunts/test-user-001/_unassigned/primary/"
    record(section, "storageKey starts with expected prefix",
           key.startswith(expected_prefix), f"key={key}")
    record(section, "storageKey is sanitised (no space/?)",
           " " not in key and "?" not in key, f"key={key}")
    record(section, "storageKey ends in .png",
           key.endswith(".png"), f"key={key}")
    last_seg = key.rsplit("/", 1)[-1]
    record(section, "imageId portion sanitised",
           "_" in last_seg and "hello" in last_seg,
           f"last_seg={last_seg}")

    upload_url = j.get("uploadUrl", "")
    region = "us-east-2"
    bucket = "ravenscout-media-prod"
    expected_host = f"https://{bucket}.s3.{region}.amazonaws.com"
    record(section, f"uploadUrl host = {expected_host}",
           upload_url.startswith(expected_host),
           f"upload_url={upload_url[:160]}")
    record(section, "uploadUrl contains X-Amz-Signature",
           "X-Amz-Signature" in upload_url, "")
    record(section, "privateDelivery == true",
           j.get("privateDelivery") is True,
           f"got {j.get('privateDelivery')}")
    record(section, "expiresIn == 900",
           j.get("expiresIn") == 900, f"got {j.get('expiresIn')}")
    record(section, "mime echoes input",
           j.get("mime") == "image/png", f"got {j.get('mime')}")


# ============================================================
# SECTION 4 - Live S3 round trip
# ============================================================
def section_4_live_s3():
    section = "4.LiveS3"
    payload = {
        "imageId": f"smoke_{uuid.uuid4().hex[:8]}",
        "huntId": f"hunt_{uuid.uuid4().hex[:6]}",
        "role": "primary",
        "mime": "image/png",
        "extension": "png",
    }
    r = post("/media/presign-upload", token=PRO_TOKEN, json_body=payload)
    if r.status_code != 200:
        record(section, "presign-upload 200", False,
               f"got {r.status_code} body={r.text[:160]}")
        return
    j = r.json()
    record(section, "presign-upload 200", True, "")
    storage_key = j["storageKey"]
    upload_url = j["uploadUrl"]

    put = requests.put(upload_url, data=ONE_BY_ONE_PNG,
                       headers={"Content-Type": "image/png"}, timeout=30)
    record(section, "PUT bytes to S3 -> 200",
           put.status_code == 200,
           f"got {put.status_code} body={put.text[:200]}")
    if put.status_code != 200:
        return

    rd = post("/media/presign-download", token=PRO_TOKEN,
              json_body={"storageKey": storage_key})
    record(section, "presign-download 200",
           rd.status_code == 200,
           f"got {rd.status_code} body={rd.text[:200]}")
    if rd.status_code != 200:
        return
    download_url = rd.json()["downloadUrl"]

    g = requests.get(download_url, timeout=30)
    bytes_match = g.status_code == 200 and g.content == ONE_BY_ONE_PNG
    record(section, "GET downloadUrl returns same bytes",
           bytes_match,
           f"status={g.status_code} len={len(g.content)} expected={len(ONE_BY_ONE_PNG)}")

    rdl = post("/media/delete", token=PRO_TOKEN,
               json_body={"storageKey": storage_key})
    body = {}
    try:
        body = rdl.json()
    except Exception:
        pass
    record(section, "DELETE -> {success: true}",
           rdl.status_code == 200 and body.get("success") is True,
           f"got {rdl.status_code} {body}")

    rd2 = post("/media/presign-download", token=PRO_TOKEN,
               json_body={"storageKey": storage_key})
    if rd2.status_code != 200:
        record(section, "re-presign-download after delete 200",
               False, f"got {rd2.status_code} {rd2.text[:160]}")
        return
    durl2 = rd2.json()["downloadUrl"]
    g2 = requests.get(durl2, timeout=30)
    record(section, "re-GET after delete -> 404",
           g2.status_code == 404, f"got {g2.status_code}")


# ============================================================
# SECTION 5 - Owner guard
# ============================================================
def section_5_owner_guard():
    section = "5.OwnerGuard"
    foreign = "hunts/SOMEONE_ELSE/h1/primary/img.jpg"
    bad_no_prefix = "users/test-user-001/foo.jpg"
    bad_traversal = "hunts/test-user-001/../whoops.jpg"

    r = post("/media/presign-download", token=PRO_TOKEN,
             json_body={"storageKey": foreign})
    record(section, "download foreign -> 403",
           r.status_code == 403, f"got {r.status_code} {r.text[:140]}")

    r = post("/media/presign-download", token=PRO_TOKEN,
             json_body={"storageKey": bad_no_prefix})
    record(section, "download non-hunts prefix -> 400",
           r.status_code == 400, f"got {r.status_code} {r.text[:140]}")

    r = post("/media/presign-download", token=PRO_TOKEN,
             json_body={"storageKey": bad_traversal})
    record(section, "download '..' traversal -> 400",
           r.status_code == 400, f"got {r.status_code} {r.text[:140]}")

    r = post("/media/delete", token=PRO_TOKEN,
             json_body={"storageKey": foreign})
    record(section, "delete foreign -> 403",
           r.status_code == 403, f"got {r.status_code} {r.text[:140]}")

    r = post("/media/delete", token=PRO_TOKEN,
             json_body={"storageKey": bad_no_prefix})
    record(section, "delete non-hunts prefix -> 400",
           r.status_code == 400, f"got {r.status_code} {r.text[:140]}")

    r = post("/media/delete", token=PRO_TOKEN,
             json_body={"storageKey": bad_traversal})
    record(section, "delete '..' traversal -> 400",
           r.status_code == 400, f"got {r.status_code} {r.text[:140]}")


# ============================================================
# SECTION 6 - DELETE /api/hunts/{hunt_id} cascade with REAL S3
# ============================================================
def section_6_hunt_cascade():
    section = "6.HuntCascade"
    image_id = f"casc_{uuid.uuid4().hex[:8]}"
    hunt_id = f"rs-cascade-{uuid.uuid4().hex[:8]}"

    payload = {
        "imageId": image_id, "huntId": hunt_id,
        "role": "primary", "mime": "image/png", "extension": "png",
    }
    r = post("/media/presign-upload", token=PRO_TOKEN, json_body=payload)
    if r.status_code != 200:
        record(section, "presign-upload for cascade",
               False, f"got {r.status_code} {r.text[:160]}")
        return
    j = r.json()
    storage_key = j["storageKey"]
    upload_url = j["uploadUrl"]

    put = requests.put(upload_url, data=ONE_BY_ONE_PNG,
                       headers={"Content-Type": "image/png"}, timeout=30)
    if put.status_code != 200:
        record(section, "PUT bytes to S3 (cascade)",
               False, f"got {put.status_code}")
        return
    record(section, "Real S3 object created", True, f"key={storage_key}")

    hunt_body = {
        "hunt_id": hunt_id,
        "metadata": {
            "species": "deer", "speciesName": "Whitetail Deer",
            "date": "2026-02-15", "timeWindow": "morning",
            "windDirection": "NW", "temperature": "38F",
            "propertyType": "private", "region": "East Texas",
            "huntStyle": "archery",
        },
        "analysis": {"summary": "cascade test", "overlays": []},
        "analysis_context": {"prompt_version": "v2"},
        "media_refs": [storage_key],
        "primary_media_ref": storage_key,
        "image_s3_keys": [storage_key],
        "storage_strategy": "cloud-first",
        "extra": {},
    }
    r = post("/hunts", token=PRO_TOKEN, json_body=hunt_body)
    record(section, "POST /api/hunts seed -> 200",
           r.status_code == 200, f"got {r.status_code} {r.text[:160]}")

    rd = http_delete(f"/hunts/{hunt_id}", token=PRO_TOKEN)
    body = {}
    try:
        body = rd.json()
    except Exception:
        pass
    s3 = body.get("s3", {}) if isinstance(body, dict) else {}
    ok_status = rd.status_code == 200
    ok_top = body.get("ok") is True and body.get("deleted") == 1
    ok_s3 = (s3.get("requested") == 1 and s3.get("deleted") == 1
             and s3.get("failed") == [])
    record(section, "DELETE /api/hunts cascade response shape",
           ok_status and ok_top and ok_s3,
           f"status={rd.status_code} body={body}")

    # Final: GET via fresh download URL should 404
    rd2 = post("/media/presign-download", token=PRO_TOKEN,
               json_body={"storageKey": storage_key})
    if rd2.status_code != 200:
        record(section, "post-cascade presign-download",
               False, f"got {rd2.status_code} {rd2.text[:160]}")
        return
    durl = rd2.json()["downloadUrl"]
    g = requests.get(durl, timeout=30)
    record(section, "post-cascade GET -> 404",
           g.status_code == 404, f"got {g.status_code}")


def main():
    print("=" * 78)
    print("Raven Scout - AWS S3 production bucket end-to-end test")
    print("Bucket: ravenscout-media-prod  Region: us-east-2")
    print(f"Backend: {BASE_URL}")
    print("=" * 78)

    section_1_auth_tier()
    section_2_validation()
    section_3_response_shape()
    section_4_live_s3()
    section_5_owner_guard()
    section_6_hunt_cascade()

    print()
    print("=" * 78)
    print("SUMMARY")
    print("=" * 78)
    by_section = {}
    for sec, name, ok, detail in results:
        by_section.setdefault(sec, []).append((name, ok, detail))
    total_ok = 0
    total = 0
    for sec, items in by_section.items():
        sec_ok = sum(1 for _, ok, _ in items if ok)
        sec_total = len(items)
        total_ok += sec_ok
        total += sec_total
        verdict = "PASS" if sec_ok == sec_total else "FAIL"
        print(f"[{verdict}] {sec}: {sec_ok}/{sec_total}")
        for name, ok, detail in items:
            if not ok:
                print(f"      X {name} :: {detail}")
    print()
    print(f"OVERALL: {total_ok}/{total} assertions passed")
    return 0 if total_ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
