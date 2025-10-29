# prod-p0.md — P0 Data Safety Cutover

This document is the P0 implementation guide. It is blunt, backend-first, and designed to stop dirty reads/writes immediately.

## P0.0

### Optimistic Concurrency Control (OCC)
- Enable optimistic concurrency globally.
  - Edit `server.js` after DB connect:
```js
mongoose.set('optimisticConcurrency', true);
```
- Enforce version-checked writes on all mutation endpoints:
  - Require client version via `If-Match` header or `__v` in body.
  - For `PUT/PATCH/DELETE`, filter with `{ _id, __v: clientVersion }`; if `modifiedCount === 0`, respond `409 Conflict`.
```js
// Example in routes/vendors.js
const { id } = req.params;
const version = req.get('If-Match')?.replace(/^W\/"v(\d+)\"$/, '$1') || req.body.__v;
if (version === undefined) return res.status(428).json({ success:false, message:'Precondition required (If-Match or __v)' });
const result = await Vendor.updateOne({ _id: id, __v: Number(version) }, { $set: payload });
if (result.modifiedCount === 0) return res.status(409).json({ success:false, message:'Version conflict' });
```
- Add ETag on read responses that include a single `data` object with `__v`.
  - New: `middleware/etagVersion.js` to set `ETag: W/"v{__v}"`.
  - Wire after controller sets body.

### Tenant Guard — Strict multi-tenant isolation
- Kill the leaky `middleware/mongooseTenantScope.js` (remove usage and file after rollout).
- Enforce tenant at the model layer using AsyncLocalStorage (ALS) powered plugin hooks.
  - New: `utils/requestContext.js` with ALS get/set for `tenantId`.
  - Edit `middleware/tenantContext.js`: after resolving tenant, call `setTenant(req.tenant.tenantId)`.
  - Edit `plugins/tenantPlugin.js`:
    - Inject `{ tenant_id: getTenant() }` in pre hooks for: `find`, `findOne`, `findById`, `findOneAndUpdate`, `findByIdAndUpdate`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `count`, `countDocuments`, `aggregate`.
    - On `save`, if missing `tenant_id`, set it to `getTenant()`.
    - If `getTenant()` is missing in production and not explicitly bypassed, `throw 403` to block cross-tenant access.
    - Restrict `withoutTenantFilter()` to super admins only; disallow in production otherwise.
- Validate cross-collection references stay within tenant: use existing `validateRelatedTenant` where applicable in create/update flows.

### BFF cookies + Single active session
- New server session auth; stop sending tokens to browsers.
  - New: `routes/auth.js`
    - `POST /auth/login` (server-side exchange or Auth0 session bridge): create `UserSession` in Redis (preferred) or Mongo; single-session: invalidate other sessions for the user.
    - `POST /auth/refresh`: rotate session; extend TTL.
    - `POST /auth/logout`: delete session; clear cookies.
  - New: `middleware/sessionAuth.js`: read `sid` HttpOnly cookie → load session → set `req.user`.
  - New: `middleware/csrf.js`: require `x-csrf-token` matching `csrf` cookie for non-GET.
  - Edit `server.js`:
    - Add `cookie-parser`.
    - CORS with `credentials:true` and strict whitelist (`https://hub.ravenlabs.biz`, staging hosts only).
    - Set cookies: `sid` (HttpOnly, Secure, SameSite=Lax), `csrf` (not HttpOnly, SameSite=Lax).
  - Edit `middleware/authMiddleware.js`: delegate to `sessionAuth`; allow legacy Bearer only if `process.env.ALLOW_BEARER==='true'` for one release.
- Env/config to add: `SESSION_SECRET`, `REDIS_URL` (or fallback to Mongo), `COOKIE_DOMAIN`, `ALLOW_BEARER` (temporary), `CSRF_SALT`.

## P0.1 — Concurrency control: OCC + ETags
- New: `middleware/requireIfMatch.js` — for `PUT/PATCH/DELETE`, enforce presence of `If-Match` or `__v`; map to `clientVersion`.
- Controllers: switch from `findOneAndUpdate` to version-checked pattern or `doc.__v` guarded `save()`.
- Standardize responses:
  - `409 Conflict` with `{ code:'VERSION_CONFLICT', latestVersion, message }` on mismatch.
  - `428 Precondition Required` if missing `If-Match`/`__v`.
- Return ETag on all single-resource GETs. FE must replay `If-Match` on writes.

## P0.2 — Minimal FE changes (cookie/CSRF)
- Remove `Authorization` header; no tokens in JS.
- Enable credentials on all API calls.
```ts
// axios
axios.defaults.withCredentials = true;
// fetch
fetch(url, { credentials: 'include' })
```
- On app bootstrap, read `csrf` cookie and send as `x-csrf-token` on non-GET requests only.
- Handle auth and conflict UX:
  - `401/419`: redirect to login.
  - `409`: show conflict banner, refetch entity, merge, retry with new ETag.

## File-level TODOs (P0 only)
- server
  - [ ] `server.js`: add `cookie-parser`, set `mongoose.set('optimisticConcurrency', true)`, harden CORS/Helmet.
  - [ ] `middleware/etagVersion.js`: add ETag injector.
  - [ ] `middleware/requireIfMatch.js`: enforce preconditions on writes.
  - [ ] `middleware/csrf.js`: CSRF guard for non-GET.
  - [ ] `middleware/sessionAuth.js`: cookie session validator.
  - [ ] `routes/auth.js`: login/refresh/logout; single-session logic.
  - [ ] `utils/requestContext.js`: ALS context helpers.
  - [ ] `plugins/tenantPlugin.js`: inject ALS tenant for all hooks; block if absent; set on save.
  - [ ] Remove `middleware/mongooseTenantScope.js` usage; delete file after Phase 3.
  - [ ] Refactor writes in `routes/vendors.js`, `routes/assets.js`, `routes/documents.js` to version-checked updates.
- infra
  - [ ] Add Redis (or confirm Mongo fallback) and envs: `SESSION_SECRET`, `REDIS_URL`, `COOKIE_DOMAIN`, `ALLOW_BEARER=false` post-cutover.

## Acceptance criteria (must pass)
- Multi-tenant queries without tenant context fail in prod; super admin bypass only.
- Concurrent PUT from two tabs returns one success and one 409.
- Browser has no `Authorization` header; cookies are `HttpOnly`/`Secure`/`SameSite=Lax`.
- Non-GET without `x-csrf-token` is blocked (403).
- Single active session enforced: new login invalidates previous session.

## Rollback
- Flip `ALLOW_BEARER=true` to re-enable Bearer.
- Disable `requireIfMatch` middleware if FE not ready yet.
- Revert tenant plugin strictness by allowing `_bypassTenantFilter` for emergency queries (admin-only).

