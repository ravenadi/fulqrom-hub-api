#!/bin/bash

# Quick test script to check if version checking is working
# Usage: ./test-quick-version-check.sh <customer_id>

CUSTOMER_ID="${1:-68d3929ae4c5d9b3e920a9df}"
API_URL="http://localhost:30001"
ENDPOINT="${API_URL}/api/customers/${CUSTOMER_ID}"

echo "🧪 Quick Version Check Test"
echo "=========================="
echo "Customer ID: ${CUSTOMER_ID}"
echo ""

# Step 1: Get customer and extract version
echo "📖 Step 1: Get customer..."
RESPONSE=$(curl -s -X GET "${ENDPOINT}" \
  -H "Accept: application/json" \
  -H "Cookie: ${SESSION_COOKIE:-sid=d37a2d4fcc64644a03fe2c133c42db90d51016246af8a045dbb078caa6b39e2f}" \
  -H "x-csrf-token: ${CSRF_TOKEN:-14796e83496ba40325d08ca142ca6920c04275cdc9c907b521e4299238dd88a2}" \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

if [ "$HTTP_STATUS" != "200" ]; then
  echo "❌ Failed to get customer: HTTP $HTTP_STATUS"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  exit 1
fi

VERSION=$(echo "$BODY" | jq -r '.data.__v // empty')
ETAG=$(curl -s -I -X GET "${ENDPOINT}" \
  -H "Accept: application/json" \
  -H "Cookie: ${SESSION_COOKIE:-sid=d37a2d4fcc64644a03fe2c133c42db90d51016246af8a045dbb078caa6b39e2f}" \
  -H "x-csrf-token: ${CSRF_TOKEN:-14796e83496ba40325d08ca142ca6920c04275cdc9c907b521e4299238dd88a2}" | \
  grep -i "etag:" | cut -d' ' -f2 | tr -d '\r\n')

if [ -z "$VERSION" ] && [ "$VERSION" != "0" ]; then
  echo "⚠️  Could not extract version from response"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  exit 1
fi

echo "✅ Customer fetched"
echo "   Version (__v): $VERSION"
echo "   ETag: ${ETAG:-Not set}"
echo ""

# Step 2: Try update WITHOUT version (should fail with 428)
echo "🚫 Step 2: Try update WITHOUT version (should fail)..."
UPDATE_WITHOUT_VERSION=$(curl -s -X PUT "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Cookie: ${SESSION_COOKIE:-sid=d37a2d4fcc64644a03fe2c133c42db90d51016246af8a045dbb078caa6b39e2f}" \
  -H "x-csrf-token: ${CSRF_TOKEN:-14796e83496ba40325d08ca142ca6920c04275cdc9c907b521e4299238dd88a2}" \
  -d '{"organisation":{"organisation_name":"Test Without Version","notes":"Should fail"}}' \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS_428=$(echo "$UPDATE_WITHOUT_VERSION" | grep "HTTP_STATUS" | cut -d: -f2)

if [ "$HTTP_STATUS_428" == "428" ]; then
  echo "✅ Correctly rejected: 428 Precondition Required"
else
  echo "❌ Expected 428, got HTTP $HTTP_STATUS_428"
  echo "$UPDATE_WITHOUT_VERSION" | sed '/HTTP_STATUS/d' | jq '.' 2>/dev/null || echo "$UPDATE_WITHOUT_VERSION"
  exit 1
fi
echo ""

# Step 3: Update WITH version (should succeed)
echo "✅ Step 3: Update WITH version (should succeed)..."
UPDATE_DATA=$(cat <<EOF
{
  "organisation": {
    "organisation_name": "Test With Version $(date +%s)",
    "notes": "Updated at $(date)"
  },
  "__v": $VERSION
}
EOF
)

UPDATE_WITH_VERSION=$(curl -s -X PUT "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Cookie: ${SESSION_COOKIE:-sid=d37a2d4fcc64644a03fe2c133c42db90d51016246af8a045dbb078caa6b39e2f}" \
  -H "x-csrf-token: ${CSRF_TOKEN:-14796e83496ba40325d08ca142ca6920c04275cdc9c907b521e4299238dd88a2}" \
  -d "$UPDATE_DATA" \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS_200=$(echo "$UPDATE_WITH_VERSION" | grep "HTTP_STATUS" | cut -d: -f2)

if [ "$HTTP_STATUS_200" == "200" ]; then
  NEW_VERSION=$(echo "$UPDATE_WITH_VERSION" | sed '/HTTP_STATUS/d' | jq -r '.data.__v // empty')
  echo "✅ Update succeeded"
  echo "   Old version: $VERSION"
  echo "   New version: $NEW_VERSION"
else
  echo "❌ Update failed: HTTP $HTTP_STATUS_200"
  echo "$UPDATE_WITH_VERSION" | sed '/HTTP_STATUS/d' | jq '.' 2>/dev/null || echo "$UPDATE_WITH_VERSION"
  exit 1
fi
echo ""

# Step 4: Try update with STALE version (should fail with 409)
echo "⏰ Step 4: Try update with STALE version (should fail)..."
STALE_UPDATE_DATA=$(cat <<EOF
{
  "organisation": {
    "organisation_name": "Test Stale Version",
    "notes": "Should fail - stale version"
  },
  "__v": $VERSION
}
EOF
)

STALE_UPDATE=$(curl -s -X PUT "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Cookie: ${SESSION_COOKIE:-sid=d37a2d4fcc64644a03fe2c133c42db90d51016246af8a045dbb078caa6b39e2f}" \
  -H "x-csrf-token: ${CSRF_TOKEN:-14796e83496ba40325d08ca142ca6920c04275cdc9c907b521e4299238dd88a2}" \
  -d "$STALE_UPDATE_DATA" \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS_409=$(echo "$STALE_UPDATE" | grep "HTTP_STATUS" | cut -d: -f2)

if [ "$HTTP_STATUS_409" == "409" ]; then
  echo "✅ Correctly rejected stale version: 409 Conflict"
  echo "$STALE_UPDATE" | sed '/HTTP_STATUS/d' | jq -r '.message // empty' | head -1
else
  echo "❌ Expected 409, got HTTP $HTTP_STATUS_409"
  echo "$STALE_UPDATE" | sed '/HTTP_STATUS/d' | jq '.' 2>/dev/null || echo "$STALE_UPDATE"
  exit 1
fi
echo ""

echo "🎉 All tests passed! Version checking is working correctly."
echo ""
echo "Summary:"
echo "  ✅ GET customer returns version"
echo "  ✅ PUT without version → 428 (Precondition Required)"
echo "  ✅ PUT with correct version → 200 (Success)"
echo "  ✅ PUT with stale version → 409 (Conflict)"

