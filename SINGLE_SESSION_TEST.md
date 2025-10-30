# Single Session Enforcement - Testing Guide

## Overview
The system now enforces single-session per user. When a user logs in from a new device/browser, all previous sessions are automatically invalidated and the user is logged out from those devices.

## Implementation Details

### What Happens:
1. User logs in from Device A → Creates Session A
2. User logs in from Device B → Creates Session B and **invalidates Session A**
3. Device A makes any API request → Receives `SESSION_REPLACED` error and cookies are cleared
4. Device A is automatically logged out and must login again

### Configuration
- **Location**: `rest-api/routes/auth.js:29`
- **Setting**: `SINGLE_SESSION = true` (hardcoded, always enabled)
- **Environment Variable**: Previously `ALLOW_MULTI_SESSION` (now always false)

## Testing Steps

### Test 1: Basic Single-Session Enforcement

1. **Login from Browser 1**
   ```bash
   # Use Postman, curl, or browser DevTools
   POST http://localhost:30001/api/auth/login
   Headers: Authorization: Bearer <auth0_token>

   # Response: Sets 'sid' and 'csrf' cookies
   ```

2. **Verify Session Works**
   ```bash
   GET http://localhost:30001/api/auth/me
   # Should return user info
   ```

3. **Login from Browser 2 (different browser or incognito)**
   ```bash
   POST http://localhost:30001/api/auth/login
   Headers: Authorization: Bearer <auth0_token>

   # Server logs should show:
   # 🔐 Single-session enforcement: Invalidating 1 existing session(s) for user: user@example.com
   # 🔒 Invalidated 1 previous session(s) for user: user@example.com
   ```

4. **Try to Use Browser 1 Session**
   ```bash
   GET http://localhost:30001/api/auth/me
   # (using cookies from Browser 1)

   # Should return 401 with:
   {
     "success": false,
     "message": "You have been logged out because a new login was detected from another device or browser.",
     "code": "SESSION_REPLACED",
     "reason": "new_session"
   }

   # Cookies are automatically cleared
   ```

### Test 2: Multiple Quick Logins

1. **Login 3 times rapidly from different browsers/devices**
   - Each login should invalidate all previous sessions
   - Only the most recent login should have a valid session

2. **Check server logs**
   ```
   🔐 Single-session enforcement: Invalidating 0 existing session(s)...
   🔐 User logged in: user@example.com (session: 1a2b3c4d...)

   🔐 Single-session enforcement: Invalidating 1 existing session(s)...
   🔒 Invalidated 1 previous session(s) for user: user@example.com
   🔐 User logged in: user@example.com (session: 5e6f7g8h...)

   🔐 Single-session enforcement: Invalidating 1 existing session(s)...
   🔒 Invalidated 1 previous session(s) for user: user@example.com
   🔐 User logged in: user@example.com (session: 9i0j1k2l...)
   ```

### Test 3: Session Validation on Every Request

1. **Login and get a valid session**

2. **Make any API request** (e.g., GET /api/customers)
   - Should work fine

3. **Login from another device**
   - Previous session is invalidated

4. **Try the first device again** (any API endpoint)
   - Should receive `SESSION_REPLACED` error
   - Cookies cleared automatically
   - User must login again

### Test 4: Logout All Sessions

1. **Login from multiple devices** (for testing, disable single-session temporarily)

2. **Call logout-all endpoint**
   ```bash
   POST http://localhost:30001/api/auth/logout-all
   # Requires valid session

   # Server logs:
   # 🚪🔒 All sessions invalidated for user: user@example.com
   ```

3. **Try any request from any device**
   - All should receive `SESSION_INVALIDATED` error with reason: `logout_all`

## Expected Error Codes

| Code | Reason | When It Happens |
|------|--------|----------------|
| `NO_SESSION` | No session cookie found | User never logged in or cookies expired |
| `SESSION_REPLACED` | New login from another device | User logged in elsewhere (single-session enforcement) |
| `SESSION_INVALIDATED` | Session manually invalidated | Logout-all, admin revocation, security event |
| `SESSION_EXPIRED` | Session TTL exceeded | Normal session expiry (24 hours default) |
| `INVALID_SESSION` | Session not found | Corrupted/deleted session |

## Database Verification

Check the `usersessions` collection:

```javascript
// Find all sessions for a user
db.usersessions.find({
  email: "user@example.com"
}).sort({ created_at: -1 })

// Check invalidated sessions
db.usersessions.find({
  email: "user@example.com",
  is_active: false,
  invalidation_reason: "new_session"
})
```

## Frontend Integration

The frontend should handle `SESSION_REPLACED` error code:

```typescript
// Example error handling
if (error.response?.data?.code === 'SESSION_REPLACED') {
  // Show specific message
  toast.error('You have been logged out because you logged in from another device.');

  // Redirect to login
  window.location.href = '/login';
}
```

## Configuration Notes

- **Session TTL**: 24 hours (configurable via `SESSION_TTL_SECONDS` env var)
- **Remember Me**: 7x longer (7 days)
- **Cookie Security**:
  - HttpOnly (prevents XSS)
  - Secure in production (HTTPS only)
  - SameSite=none in development, lax in production
- **TTL Index**: MongoDB automatically deletes expired sessions after 24 hours past expiry

## Security Benefits

1. ✅ Prevents session hijacking across devices
2. ✅ Forces re-authentication if account is compromised
3. ✅ User knows if someone else logs into their account
4. ✅ Reduces active session exposure window
5. ✅ Clear audit trail of session invalidations

## Troubleshooting

### Issue: User keeps getting logged out
- Check if they have multiple tabs/windows open
- Each login invalidates previous sessions
- Solution: Use single browser/device or disable single-session mode

### Issue: Session not invalidated
- Check `SINGLE_SESSION` constant in auth.js:29
- Verify MongoDB connection
- Check server logs for invalidation messages

### Issue: Cookies not cleared
- Check cookie domain configuration
- Verify cookie options match between set and clear
- Check browser cookie storage in DevTools
