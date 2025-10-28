#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing Resource Access API Endpoint"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "POST /api/users/resource-access"
echo ""

curl -X POST http://localhost:30001/api/users/resource-access \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "68f75211ab9d0946c112721e",
    "resource_type": "building",
    "resource_id": "test-building-456",
    "resource_name": "API Test Building",
    "permissions": {
      "can_view": true,
      "can_create": false,
      "can_edit": true,
      "can_delete": false
    },
    "granted_by": "api-test"
  }' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Fetching user resource access to verify"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "GET /api/users/68f75211ab9d0946c112721e/resource-access"
echo ""

curl -X GET http://localhost:30001/api/users/68f75211ab9d0946c112721e/resource-access \
  -H "Content-Type: application/json" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | jq '.'

