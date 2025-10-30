# Manual Testing Guide for Dirty Read/Write Protection

## Overview
This guide helps you manually verify that dirty read and dirty write protections are working.

## Prerequisites
1. API server running on `http://localhost:30001`
2. Frontend running and you're logged in
3. Browser DevTools (Network tab) open

---

## Test 1: Verify Version is Returned in GET Response

### Steps:
1. Open browser DevTools (F12) → Network tab
2. Navigate to `/hub/customers` and click on a customer to view details
3. Look for the GET request to `/api/customers/{id}`
4. Check the Response

### Expected Result:
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "__v": 0,  // ← Version number should be present
    "organisation": { ... },
    ...
  }
}
```

**Also check Response Headers:**
```
ETag: W/"v0"  // ← ETag should be present
```

### Pass Criteria:
✅ Response body contains `__v` field  
✅ Response headers contain `ETag` header

---

## Test 2: Update WITHOUT Version (Should Fail - 428)

### Steps:
1. Open browser DevTools → Network tab
2. Navigate to `/hub/customers/{id}/edit`
3. Make any change to the form
4. Click "Save"
5. Check the PUT request

### Option A: Check Browser Network Tab
- Look at the PUT request to `/api/customers/{id}`
- Check if `__v` is in the request body or `If-Match` header is present
- If NOT present, should get 428 error

### Option B: Manual cURL Test
```bash
# Get your session cookie from browser DevTools → Application → Cookies
# Get CSRF token from browser DevTools → Application → Cookies

curl -X PUT 'http://localhost:30001/api/customers/YOUR_CUSTOMER_ID' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: sid=YOUR_SESSION_COOKIE; csrf=YOUR_CSRF_TOKEN' \
  -H 'x-csrf-token: YOUR_CSRF_TOKEN' \
  -d '{
    "organisation": {
      "organisation_name": "Test Without Version"
    }
    // NO __v field!
  }'
```

### Expected Result:
```json
{
  "success": false,
  "message": "Precondition required. Include If-Match header or __v in request body for concurrent write safety.",
  "code": "PRECONDITION_REQUIRED",
  "status": 428
}
```

### Pass Criteria:
✅ PUT request WITHOUT version returns 428 Precondition Required

---

## Test 3: Update WITH Version (Should Succeed - 200)

### Steps:
1. First, GET the customer to extract version:
```bash
curl -X GET 'http://localhost:30001/api/customers/YOUR_CUSTOMER_ID' \
  -H 'Cookie: sid=YOUR_SESSION_COOKIE; csrf=YOUR_CSRF_TOKEN' \
  -H 'x-csrf-token: YOUR_CSRF_TOKEN' \
  | jq '.data.__v'
```

2. Now UPDATE with that version:
```bash
curl -X PUT 'http://localhost:30001/api/customers/YOUR_CUSTOMER_ID' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: sid=YOUR_SESSION_COOKIE; csrf=YOUR_CSRF_TOKEN' \
  -H 'x-csrf-token: YOUR_CSRF_TOKEN' \
  -d '{
    "organisation": {
      "organisation_name": "Updated Name"
    },
    "__v": 0  // ← Version from GET response
  }'
```

### Expected Result:
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "__v": 1,  // ← Version incremented!
    "organisation": {
      "organisation_name": "Updated Name"
    },
    ...
  }
}
```

### Pass Criteria:
✅ PUT request WITH correct version returns 200 OK  
✅ Response shows incremented version number

---

## Test 4: Update with STALE Version (Should Fail - 409)

### Steps:
1. Get customer and note version (e.g., `__v: 5`)
2. Update it successfully (version becomes `6`)
3. Try to update again with the OLD version (`5`):

```bash
curl -X PUT 'http://localhost:30001/api/customers/YOUR_CUSTOMER_ID' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: sid=YOUR_SESSION_COOKIE; csrf=YOUR_CSRF_TOKEN' \
  -H 'x-csrf-token: YOUR_CSRF_TOKEN' \
  -d '{
    "organisation": {
      "organisation_name": "Should Fail"
    },
    "__v": 5  // ← OLD version (current is 6)
  }'
```

### Expected Result:
```json
{
  "success": false,
  "message": "Version conflict. The resource was modified by another user. Please refresh and try again.",
  "code": "VERSION_CONFLICT",
  "status": 409,
  "details": {
    "resource": "Customer",
    "id": "...",
    "clientVersion": 5,
    "currentVersion": 6,  // ← Server has newer version
    "advice": "Fetch the latest version, merge your changes, and retry with the new version."
  }
}
```

### Pass Criteria:
✅ PUT request WITH stale version returns 409 Conflict  
✅ Error message clearly explains version mismatch

---

## Test 5: Concurrent Updates (Dirty Write Protection)

### Steps:
1. Open **two browser tabs/windows** with the same customer edit page
2. Both tabs should load the customer with same version (e.g., `__v: 10`)
3. In **Tab 1**: Make changes and click "Save" (should succeed, version → 11)
4. In **Tab 2**: Make changes and click "Save" (should fail with version `10`)

### Expected Result:
- **Tab 1**: ✅ Success (200 OK), version updated to 11
- **Tab 2**: ❌ Conflict (409), message: "Version conflict. The resource was modified by another user."

### Pass Criteria:
✅ First update succeeds  
✅ Second update with old version fails with 409  
✅ User sees helpful error message

---

## Test 6: Unauthorized Access (Dirty Read Protection)

### Steps:
1. Try to access customer WITHOUT authentication:

```bash
curl -X GET 'http://localhost:30001/api/customers/YOUR_CUSTOMER_ID' \
  # NO cookies, NO authentication headers
```

### Expected Result:
```json
{
  "success": false,
  "message": "Authentication required. Please log in.",
  "code": "UNAUTHORIZED",
  "status": 401
}
```

### Pass Criteria:
✅ Unauthenticated requests return 401 Unauthorized  
✅ No customer data is leaked

---

## Test 7: Cross-Tenant Access (Additional Security)

### Steps:
1. Log in as User from Tenant A
2. Note a Customer ID from Tenant A
3. Try to access a Customer ID from Tenant B (if you know one)

### Expected Result:
```json
{
  "success": false,
  "message": "Customer not found or you do not have permission to update it",
  "status": 404
}
```

### Pass Criteria:
✅ Cannot access other tenant's data  
✅ Returns 404 (not 403 to avoid leaking existence)

---

## Quick Test Script

Use the provided script with your session cookies:

```bash
export TEST_CUSTOMER_ID="68d3929ae4c5d9b3e920a9df"
export TEST_SESSION_COOKIE="sid=YOUR_SESSION_ID"
export TEST_CSRF_TOKEN="YOUR_CSRF_TOKEN"

node scripts/test-dirty-read-write.js
```

---

## Expected Test Results Summary

| Test | Expected Status | Description |
|------|----------------|-------------|
| 1. GET returns version | ✅ | Response has `__v` and `ETag` |
| 2. Update without version | ❌ 428 | Precondition Required |
| 3. Update with version | ✅ 200 | Success, version incremented |
| 4. Update with stale version | ❌ 409 | Version Conflict |
| 5. Concurrent updates | ❌ 409 | First succeeds, second fails |
| 6. Unauthorized access | ❌ 401 | Authentication required |
| 7. Cross-tenant access | ❌ 404 | Not found (tenant isolation) |

---

## Troubleshooting

### Issue: All requests return 401
**Solution**: Your session cookie expired. Log in again and get fresh cookies.

### Issue: Update succeeds without version
**Solution**: Check that `requireIfMatch` middleware is applied to PUT route.

### Issue: No version in GET response
**Solution**: Check that `attachETag` middleware is applied globally.

### Issue: Version not incrementing
**Solution**: Ensure you're using `customer.save()` not `Customer.updateOne()`.

---

## Browser DevTools Checklist

1. ✅ Network tab shows `__v` in response bodies
2. ✅ Network tab shows `ETag` header in responses  
3. ✅ PUT requests include `__v` in body or `If-Match` header
4. ✅ 428 errors appear when version missing
5. ✅ 409 errors appear when version conflicts
6. ✅ Frontend shows user-friendly error messages

