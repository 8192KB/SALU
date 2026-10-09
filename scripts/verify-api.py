#!/usr/bin/env python3
import json
import http.cookiejar
import os
import urllib.error
import urllib.request

base = os.environ.get("SALU_API_URL", "http://127.0.0.1:8081")
cookies = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))


def request(path, method="GET", headers=None):
    req = urllib.request.Request(base + path, method=method, headers=headers or {})
    try:
        response = client.open(req, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    assert response.headers.get_content_type() == "application/json"
    assert response.headers.get("Location") is None
    return response.status, json.load(response)


status, health = request("/api/health")
assert status == 200 and health["database"] == "UP", health
status, error = request("/api/records")
assert status == 401 and error["code"] == "AUTHENTICATION_REQUIRED", error
status, error = request("/api/records", "POST")
assert status == 403 and error["code"] == "CSRF_INVALID", error
status, csrf = request("/api/csrf")
assert status == 200 and csrf["token"]
assert any(cookie.name == "SALU_SESSION" for cookie in cookies)
status, error = request("/api/records", "POST", {csrf["headerName"]: csrf["token"]})
assert status == 401 and error["code"] == "AUTHENTICATION_REQUIRED", error
print("API 검증: health·세션 쿠키·CSRF·JSON 401/403 통과")
