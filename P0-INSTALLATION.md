# P0 Installation & Environment Setup

## Required NPM Packages

Install the cookie-parser package:

```bash
npm install cookie-parser
```

All other dependencies are already present in package.json.

## Environment Variables

Add these to your `.env` file:

```env
# Session Configuration
SESSION_SECRET=your-strong-random-secret-at-least-32-chars
SESSION_TTL_SECONDS=86400
COOKIE_SECRET=another-strong-random-secret-32-chars
COOKIE_DOMAIN=.ravenlabs.biz
ALLOW_BEARER=true

# CSRF Configuration  
CSRF_SALT=random-salt-for-csrf-tokens

# Optional: Redis for session storage (fallback to MongoDB if not set)
REDIS_URL=redis://localhost:6379

# Client URL for CORS (production)
CLIENT_URL=https://hub.ravenlabs.biz

# Multi-session control
ALLOW_MULTI_SESSION=false
```

## Generate Secrets

Use these commands to generate strong secrets:

```bash
# Session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Cookie secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# CSRF salt
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

## Migration Phases

### Phase 0: Deployment (Current)
- Deploy server with dual auth (Bearer + Session)
- Set `ALLOW_BEARER=true`
- Frontend still uses Bearer tokens
- New `/api/auth/login` endpoint available

### Phase 1: Frontend Migration
- Update frontend to use `/api/auth/login`
- Set `withCredentials: true` on axios
- Remove `Authorization` header
- Add `x-csrf-token` header for writes
- Test thoroughly

### Phase 2: Disable Bearer (1-2 weeks after Phase 1)
- Set `ALLOW_BEARER=false`
- Monitor for any Bearer usage
- Force all clients to cookies

### Phase 3: Strict Enforcement
- Remove Bearer code entirely
- Enable strict tenant plugin checks in production
- Full OCC enforcement via `requireIfMatch` middleware

## Database Indexes

The UserSession model will auto-create indexes. Verify with:

```bash
mongo
use your-database
db.usersessions.getIndexes()
```

Expected indexes:
- `session_id_1` (unique)
- `user_id_1`
- `auth0_id_1`
- `user_id_1_is_active_1`
- `expires_at_1` (TTL index)

## Testing P0 Implementation

### 1. Test Session Login

```bash
# Login with Auth0 token
curl -X POST http://localhost:30001/api/auth/login \
  -H "Authorization: Bearer YOUR_AUTH0_TOKEN" \
  -H "Content-Type: application/json" \
  -c cookies.txt

# Check that cookies were set
cat cookies.txt
# Should see: sid and csrf cookies
```

### 2. Test Session Auth

```bash
# Use session to access protected endpoint
curl http://localhost:30001/api/auth/me \
  -b cookies.txt
```

### 3. Test CSRF Protection

```bash
# Try write without CSRF token (should fail)
curl -X POST http://localhost:30001/api/vendors \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"contractor_name":"Test"}'

# Should get 403 CSRF error
```

### 4. Test Optimistic Concurrency

```bash
# Get a resource
curl http://localhost:30001/api/vendors/VENDOR_ID \
  -b cookies.txt

# Note the ETag header (e.g., W/"v0")

# Try update without If-Match (should fail with 428)
curl -X PUT http://localhost:30001/api/vendors/VENDOR_ID \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: CSRF_FROM_COOKIE" \
  -d '{"contractor_name":"Updated"}'

# Should get 428 Precondition Required

# Update with If-Match (should succeed)
curl -X PUT http://localhost:30001/api/vendors/VENDOR_ID \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: CSRF_FROM_COOKIE" \
  -H "If-Match: W/\"v0\"" \
  -d '{"contractor_name":"Updated"}'

# Should get 200 OK
```

### 5. Test Tenant Isolation

Check logs for any `⚠️ Query without tenant context` warnings. In production mode with strict enforcement, these should become errors.

## Rollback Plan

If issues arise:

1. **Disable session auth**: Set `ALLOW_BEARER=true`
2. **Disable CSRF**: Comment out `app.use('/api', optionalCSRF)` in server.js
3. **Disable OCC**: Comment out `mongoose.set('optimisticConcurrency', true)`
4. **Disable strict tenant**: Set `NODE_ENV=development` temporarily

## Monitoring

Watch for:
- `❌ SECURITY: Query without tenant context blocked` in production
- `409 Conflict` responses (version conflicts)
- `403 CSRF` errors
- Session creation/invalidation logs
- ETag header presence on GET responses

## Next Steps After P0

- Add rate limiting
- Add transaction support for multi-doc writes
- Add idempotency keys for POSTs
- Generate JSON schemas for FE
- Add integration tests

