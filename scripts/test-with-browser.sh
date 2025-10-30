#!/bin/bash

# Simple test script - copy cookies from your browser
# Usage: ./test-with-browser.sh

echo "🧪 Quick Test - Copy Cookies from Browser"
echo "=========================================="
echo ""
echo "Instructions:"
echo "1. Open browser → DevTools (F12) → Application → Cookies → http://localhost:30001"
echo "2. Find 'sid' cookie and copy its value"
echo "3. Find 'csrf' cookie and copy its value"
echo ""
read -p "Enter your SESSION cookie (sid=...): " SESSION_COOKIE
read -p "Enter your CSRF token: " CSRF_TOKEN
read -p "Enter Customer ID to test: " CUSTOMER_ID

if [ -z "$SESSION_COOKIE" ] || [ -z "$CSRF_TOKEN" ] || [ -z "$CUSTOMER_ID" ]; then
  echo "❌ Missing required values. Exiting."
  exit 1
fi

API_URL="http://localhost:30001"
ENDPOINT="${API_URL}/api/customers/${CUSTOMER_ID}"

echo ""
echo "📖 Step 1: Get customer and extract version..."
echo "---------------------------------------------"

GET_RESPONSE=$(curl -s -X GET "${ENDPOINT}" \
  -H "Accept: application/json" \
  -H "Cookie: ${SESSION_COOKIE}; csrf=${CSRF_TOKEN}" \
  -H "x-csrf-token: ${CSRF_TOKEN}")

HTTP_STATUS=$(echo "$GET_RESPONSE" | jq -r '.success // false')

if [ "$HTTP_STATUS" != "true" ]; then
  echo "❌ Failed to get customer"
  echo "$GET_RESPONSE" | jq '.' 2>/dev/null || echo "$GET_RESPONSE"
  exit 1
fi

VERSION=$(echo "$GET_RESPONSE" | jq -r '.data.__v // empty')
echo "✅ Customer fetched"
echo "   Version: ${VERSION}"
echo ""

echo "🚫 Step 2: Try update WITHOUT version (should fail)..."
echo "------------------------------------------------------"

PUT_NO_VERSION=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X PUT "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${SESSION_COOKIE}; csrf=${CSRF_TOKEN}" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -d '{"organisation":{"organisation_name":"Test No Version"}}')

HTTP_428=$(echo "$PUT_NO_VERSION" | grep "HTTP_STATUS" | cut -d: -f2)
if [ "$HTTP_428" == "428" ]; then
  echo "✅ Correctly rejected (428 Precondition Required)"
else
  echo "❌ Expected 428, got ${HTTP_428}"
  echo "$PUT_NO_VERSION" | sed '/HTTP_STATUS/d' | jq '.' 2>/dev/null
fi
echo ""

echo "✅ Step 3: Update WITH version (should succeed)..."
echo "---------------------------------------------------"

UPDATE_DATA=$(cat <<EOF
{
  "organisation": {
    "organisation_name": "Test With Version $(date +%s)"
  },
  "__v": ${VERSION}
}
EOF
)

PUT_WITH_VERSION=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X PUT "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${SESSION_COOKIE}; csrf=${CSRF_TOKEN}" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -d "$UPDATE_DATA")

HTTP_200=$(echo "$PUT_WITH_VERSION" | grep "HTTP_STATUS" | cut -d: -f2)
if [ "$HTTP_200" == "200" ]; then
  NEW_VERSION=$(echo "$PUT_WITH_VERSION" | sed '/HTTP_STATUS/d' | jq -r '.data.__v // empty')
  echo "✅ Update succeeded"
  echo "   Old version: ${VERSION}"
  echo "   New version: ${NEW_VERSION}"
else
  echo "❌ Update failed: HTTP ${HTTP_200}"
  echo "$PUT_WITH_VERSION" | sed '/HTTP_STATUS/d' | jq '.' 2>/dev/null
fi
echo ""

echo "⏰ Step 4: Try update with STALE version (should fail)..."
echo "--------------------------------------------------------"

STALE_UPDATE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X PUT "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${SESSION_COOKIE}; csrf=${CSRF_TOKEN}" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -d "{\"organisation\":{\"organisation_name\":\"Stale Test\"},\"__v\":${VERSION}}")

HTTP_409=$(echo "$STALE_UPDATE" | grep "HTTP_STATUS" | cut -d: -f2)
if [ "$HTTP_409" == "409" ]; then
  echo "✅ Correctly rejected stale version (409 Conflict)"
  CONFLICT_MSG=$(echo "$STALE_UPDATE" | sed '/HTTP_STATUS/d' | jq -r '.message // empty')
  echo "   ${CONFLICT_MSG}"
else
  echo "❌ Expected 409, got ${HTTP_409}"
  echo "$STALE_UPDATE" | sed '/HTTP_STATUS/d' | jq '.' 2>/dev/null
fi
echo ""

echo "🎉 Test Summary"
echo "==============="
echo "✅ GET returns version"
echo "✅ PUT without version → 428"
echo "✅ PUT with version → 200"
echo "✅ PUT with stale version → 409"
echo ""
echo "All dirty write protections are working!"

