#!/bin/bash

# Get Auth0 token
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

echo "Testing BFF Login with token..."
echo ""
curl -v -X POST "http://localhost:30001/api/auth/login" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remember_me": true}' \
  2>&1 | grep -A 50 "< HTTP"

