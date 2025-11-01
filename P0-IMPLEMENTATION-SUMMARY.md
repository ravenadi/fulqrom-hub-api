# P0 Implementation Summary

## What Has Been Implemented

### ✅ 1. Optimistic Concurrency Control (OCC)

**Files Modified:**
- `server.js`: Added `mongoose.set('optimisticConcurrency', true)`
- `middleware/etagVersion.js` (NEW): ETag generation and parsing
  - `attachETag()`: Sets `ETag: W/"v{__v}"` on responses
  - `parseIfMatch()`: Parses `If-Match` header to `req.clientVersion`
  - `requireIfMatch()`: Enforces precondition for PUT/PATCH/DELETE
  - `sendVersionConflict()`: Standardized 409 response helper

**How It Works:**
- Mongoose automatically adds `__v` version field to all documents
- GET responses include `ETag: W/"v0"` header
- PUT/PATCH/DELETE require `If-Match: W/"v0"` header or `__v` in body
- Update filters include `{ _id, __v }` to detect concurrent modifications
- If version mismatch → 409 Conflict response

**Next Steps:**
- Refactor existing `findOneAndUpdate` calls to version-checked pattern
- Add `requireIfMatch` middleware to specific routes (vendors, assets, documents)

### ✅ 2. Strict Multi-Tenant Isolation (ALS-Powered)

**Files Created:**
- `utils/requestContext.js` (NEW): AsyncLocalStorage helpers
  - `runWithContext()`: Wrap request in ALS
  - `setTenant()` / `getTenant()`: Tenant context
  - `setUser()` / `getUser()`: User context

**Files Modified:**
- `plugins/tenantPlugin.js`: Rewritten to use ALS instead of `_tenantId` options
  - All pre-hooks (find/update/delete/count) now read tenant from ALS
  - Strict enforcement: throws error if tenant missing in ALL environments
  - Pre-save hook: auto-sets `tenant_id` on new documents
  - User model uses `autoFilter: false` to allow auth lookups without tenant context

- `middleware/tenantContext.js`:
  - Calls `setTenant(tenant._id)` to populate ALS context
  - Super admins MUST provide `x-tenant-id` header to access tenant data (no bypass)

- `server.js`:
  - Wraps all requests in `runWithContext({})` for ALS isolation

**How It Works:**
- Every request runs in isolated ALS context
- Tenant middleware sets `tenantId` in ALS after auth
- All Mongoose queries automatically inject `{ tenant_id: <from ALS> }`
- No manual `_tenantId` options needed
- Cross-tenant queries blocked in production

**Migration Path:**
- Old code using `.setOptions({ _tenantId })` still works (fallback)
- Eventually remove `middleware/mongooseTenantScope.js` (obsolete)

### ✅ 3. BFF Cookie + Single Active Session

**Files Created:**
- `models/UserSession.js` (NEW): Session storage model
  - Stores: session_id, user_id, csrf_token, expiry, metadata
  - Methods: `invalidate()`, `touch()`, `isValid()`
  - Statics: `createSession()`, `findActiveSession()`, `invalidateAllForUser()`
  - TTL index for auto-cleanup
  
- `middleware/sessionAuth.js` (NEW): Cookie-based authentication
  - `authenticateSession()`: Reads `sid` cookie, validates, loads user
  - `optionalSession()`: Non-failing variant
  - Updates `last_activity` on each request
  
- `middleware/csrf.js` (NEW): CSRF protection
  - `validateCSRF()`: Double-submit cookie pattern
  - `optionalCSRF()`: Migration-friendly variant (used now)
  - `generateCSRFToken()`: Crypto-random token generation
  - Constant-time comparison to prevent timing attacks
  
- `routes/auth.js` (NEW): Auth endpoints
  - `POST /auth/login`: Server-side session creation from Auth0 token
  - `POST /auth/refresh`: Extend session TTL
  - `POST /auth/logout`: Invalidate session, clear cookies
  - `GET /auth/me`: Get current user info
  - `POST /auth/logout-all`: Invalidate all sessions (security feature)

**Files Modified:**
- `middleware/authMiddleware.js`: Dual auth support
  - Checks for `sid` cookie first (preferred)
  - Falls back to `Authorization: Bearer` if `ALLOW_BEARER=true`
  - Rejects Bearer if `ALLOW_BEARER=false`
  
- `server.js`:
  - Added `cookie-parser` middleware
  - Hardened CORS: `credentials: true`, strict origin whitelist in production
  - Added `x-csrf-token` to allowed/exposed headers
  - Added `optionalCSRF` to middleware chain
  - Hardened Helmet: CSP, HSTS, frameguard, referrer policy

**How It Works:**
1. Client calls `/api/auth/login` with Auth0 Bearer token
2. Server validates token, creates session in UserSession collection
3. Server invalidates any existing sessions for that user (single-session mode)
4. Server sets cookies: `sid` (HttpOnly, Secure), `csrf` (readable by JS)
5. Client stores cookies automatically; reads `csrf` cookie value
6. Client sends `x-csrf-token: <csrf value>` on POST/PUT/PATCH/DELETE
7. Server validates cookie matches header; validates session on each request
8. Session expires after TTL; server auto-cleans via TTL index

**Migration:**
- Phase 0 (NOW): `ALLOW_BEARER=true`, both auth methods work
- Phase 1: Frontend switches to cookies
- Phase 2: `ALLOW_BEARER=false`, Bearer blocked
- Phase 3: Remove Bearer code entirely

### ✅ 4. Security Hardening

**CORS:**
- Production: strict whitelist (`CLIENT_URL`, `https://hub.ravenlabs.biz`)
- Development: permissive for local dev
- `credentials: true` for cookies
- `maxAge: 86400` for preflight caching

**Helmet:**
- CSP: `default-src 'self'`, restricted script/img/connect sources
- HSTS: 1 year, includeSubDomains, preload
- frameguard: deny
- referrerPolicy: strict-origin-when-cross-origin

**Body Size Limits:**
- Reduced from 10mb to 1mb for JSON/urlencoded
- Prevents DOS via large payloads

**Input Validation:**
- Existing Joi schemas remain
- CSRF tokens validated with constant-time comparison

## Environment Variables Required

```env
# Session Management
SESSION_SECRET=<strong-random-32-chars>
SESSION_TTL_SECONDS=86400
COOKIE_SECRET=<different-strong-32-chars>
COOKIE_DOMAIN=.ravenlabs.biz

# Migration Control
ALLOW_BEARER=true

# CSRF
CSRF_SALT=<random-16-chars>

# Multi-Session
ALLOW_MULTI_SESSION=false

# Optional Redis
REDIS_URL=redis://localhost:6379
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## NPM Packages Required

```bash
npm install cookie-parser
```

All other dependencies already present.

## Files Created (11 New Files)

1. `PROD-P0.md` - Implementation guide
2. `P0-INSTALLATION.md` - Setup instructions
3. `P0-IMPLEMENTATION-SUMMARY.md` - This file
4. `utils/requestContext.js` - ALS context helpers
5. `middleware/etagVersion.js` - OCC/ETag support
6. `middleware/csrf.js` - CSRF protection
7. `middleware/sessionAuth.js` - Cookie authentication
8. `models/UserSession.js` - Session storage model
9. `routes/auth.js` - Auth endpoints

## Files Modified (5 Files)

1. `server.js` - OCC enable, ALS wrapper, cookies, CORS, Helmet, middleware chain
2. `plugins/tenantPlugin.js` - ALS-powered tenant isolation
3. `middleware/tenantContext.js` - ALS context setting
4. `middleware/authMiddleware.js` - Dual auth support
5. `config/routes.config.js` - Already had auth route registered

## Testing Checklist

### Session Auth
- [ ] Login with Bearer → gets sid/csrf cookies
- [ ] Access `/api/auth/me` with cookies (no Bearer)
- [ ] Logout → cookies cleared
- [ ] Second login → first session invalidated

### CSRF
- [ ] POST without `x-csrf-token` → 403
- [ ] POST with `x-csrf-token` → success

### OCC
- [ ] GET resource → receives ETag
- [ ] PUT without If-Match → 428
- [ ] PUT with wrong If-Match → 409
- [ ] PUT with correct If-Match → 200 + new ETag
- [ ] Concurrent PUTs → one succeeds, one gets 409

### Tenant Isolation
- [ ] Queries with tenant context succeed
- [ ] Queries without tenant context fail with `TENANT_CONTEXT_MISSING` error
- [ ] Super admin with `x-tenant-id` header can access specific tenant data
- [ ] Super admin without `x-tenant-id` header gets 400 error
- [ ] Cross-tenant queries fail

### Security
- [ ] CORS blocks non-whitelisted origins in production
- [ ] Helmet headers present (CSP, HSTS, X-Frame-Options)
- [ ] Large payloads (>1mb) rejected

## Migration Timeline

| Week | Phase | Actions |
|------|-------|---------|
| 1 | Deploy P0 | Deploy server, set `ALLOW_BEARER=true`, test dual auth |
| 2 | FE Migration | Update FE to use cookies, test CSRF/OCC, gradual rollout |
| 3 | Bearer Deprecation | Set `ALLOW_BEARER=false`, monitor errors |
| 4 | Strict Mode | Enable tenant plugin production checks, remove Bearer code |

## Known Limitations & Next Steps

### Not Yet Implemented (Post-P0):
1. **Route-level OCC enforcement** - Need to add `requireIfMatch` to specific PUT/PATCH/DELETE routes
2. **Write refactoring** - Many routes still use `findOneAndUpdate` without version checks
3. **Transactions** - Multi-doc updates not wrapped in transactions yet
4. **Idempotency keys** - POST requests don't support `Idempotency-Key` header yet
5. **Rate limiting** - No per-IP or per-user rate limits
6. **Redis sessions** - Currently Mongo-only; Redis integration pending
7. **Frontend code** - FE needs updates for cookies, CSRF, ETag handling

### Backward Compatibility:
- Old routes using `_tenantId` options still work (plugin has fallback)
- Bearer auth still works (`ALLOW_BEARER=true`)
- CSRF is optional (`optionalCSRF` doesn't block)
- ETag optional (`requireIfMatch` not on all routes yet)

### Breaking Changes (When Strict):
- `NODE_ENV=production` + no tenant context → queries fail
- `ALLOW_BEARER=false` → Bearer auth rejected
- `requireIfMatch` middleware → PUT/PATCH/DELETE need If-Match

## Rollback Procedure

If issues occur after deployment:

1. **Revert to Bearer-only:**
   ```env
   ALLOW_BEARER=true
   ```
   Comment out session auth in `authMiddleware.js`

2. **Disable CSRF:**
   Comment out `app.use('/api', optionalCSRF)` in `server.js`

3. **Disable OCC:**
   Comment out `mongoose.set('optimisticConcurrency', true)`

4. **Disable strict tenant:**
   Keep `NODE_ENV=development` (warnings instead of errors)

5. **Full rollback:**
   Git revert to previous commit, redeploy

## Support & Debugging

### Logs to Watch:
- `✓ Optimistic Concurrency Control enabled`
- `🔐 User logged in: user@example.com`
- `🔄 Session refreshed`
- `🚪 User logged out`
- `⚠️ Query without tenant context` (dev mode)
- `❌ SECURITY: Query without tenant context blocked` (prod mode)
- `⛔ CORS blocked origin`

### Common Issues:

**CORS errors in browser:**
- Check `CLIENT_URL` env var matches frontend origin
- Verify `credentials: true` in frontend axios/fetch config

**Session not persisting:**
- Check cookies are `Secure` only in production (HTTP vs HTTPS)
- Verify `COOKIE_DOMAIN` matches your domain structure

**CSRF failures:**
- Frontend must read `csrf` cookie and send as `x-csrf-token` header
- Cookie domain must allow cross-subdomain if needed

**Version conflicts (409):**
- Expected during concurrent edits
- Frontend should refetch, merge, retry with new ETag
- If excessive, review frontend save logic

**Tenant isolation errors:**
- Check ALS context is set in `tenantContext` middleware
- Verify `runWithContext()` wraps requests in `server.js`
- For super admin ops, provide `x-tenant-id` header to access specific tenant data

## Contact & Documentation

- **Plan**: See `PROD-P0.md` for detailed implementation guide
- **Install**: See `P0-INSTALLATION.md` for setup steps
- **Main Plan**: See `prod.plan.md` for full roadmap
- **Code**: All new files documented inline with JSDoc comments

