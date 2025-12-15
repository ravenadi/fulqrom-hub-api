#!/bin/bash

# Step 1: Get Auth0 token
echo "Step 1: Getting Auth0 token..."
AUTH_RESPONSE=$(curl -s -X POST "https://dev-ml7pxvj6vg32j740.au.auth0.com/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "http://auth0.com/oauth/grant-type/password-realm",
    "scope": "openid profile email",
    "client_id": "L3JN7NIRm67O9wBfxex1jRQJZwIUt6cq",
    "client_secret": "JZ72w4a9tmP6ovvYSsDLBWiU86APV_1zPL05p__lg6YIjGgrJnS5tK77UP63CHB0",
    "audience": "https://api.fulqrom.com.au",
    "username": "demo@fulqrom.com.au",
    "password": "Demo123!!",
    "realm": "Username-Password-Authentication"
  }')

ACCESS_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.access_token')

if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
    echo "❌ Failed to get Auth0 token"
    echo $AUTH_RESPONSE | jq .
    exit 1
fi

echo "✅ Got Auth0 token"

# Decode JWT to get user info
echo ""
echo "Step 2: Decoding JWT token..."
PAYLOAD=$(echo $ACCESS_TOKEN | cut -d'.' -f2)
# Add padding if needed
case ${#PAYLOAD} in
    0) PAYLOAD="" ;;
    *) while [ $((${#PAYLOAD} % 4)) -ne 0 ]; do PAYLOAD="${PAYLOAD}="; done ;;
esac
USER_INFO=$(echo $PAYLOAD | base64 -d 2>/dev/null | jq .)
echo "User info from token:"
echo $USER_INFO | jq '{sub, email}'

SUB=$(echo $USER_INFO | jq -r '.sub')
EMAIL=$(echo $USER_INFO | jq -r '.email // "demo@fulqrom.com.au"')

echo ""
echo "Auth0 ID (sub): $SUB"
echo "Email: $EMAIL"
