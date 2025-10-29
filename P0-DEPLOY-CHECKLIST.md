# P0 Deployment Checklist

Use this checklist to deploy P0 data safety features step-by-step.

## Pre-Deployment

### 1. Install Dependencies
```bash
cd /Users/devensitapara/Documents/development/GKBLabs/falcrom/fulqrom-hub/rest-api
npm install cookie-parser
```
- [ ] `cookie-parser` installed
- [ ] No package installation errors

### 2. Generate Secrets
```bash
# Run these and save the outputs
echo "SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
echo "COOKIE_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
echo "CSRF_SALT=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
```
- [ ] SESSION_SECRET generated (64 chars)
- [ ] COOKIE_SECRET generated (64 chars, different)
- [ ] CSRF_SALT generated (32 chars)

### 3. Update .env File
Add to `.env`:
```env
SESSION_SECRET=<paste-from-step-2>
COOKIE_SECRET=<paste-from-step-2>
CSRF_SALT=<paste-from-step-2>
SESSION_TTL_SECONDS=86400
ALLOW_BEARER=true
ALLOW_MULTI_SESSION=false
CLIENT_URL=https://hub.ravenlabs.biz
COOKIE_DOMAIN=.ravenlabs.biz
```
- [ ] All secrets added to .env
- [ ] ALLOW_BEARER=true (for migration)
- [ ] CLIENT_URL matches production frontend
- [ ] COOKIE_DOMAIN matches your domain (or leave blank for same-domain)

### 4. Local Testing
```bash
# Start server
npm run dev
```
- [ ] Server starts without errors
- [ ] See log: "✓ Optimistic Concurrency Control enabled"
- [ ] See log: "✓ Database connected successfully"
- [ ] No tenant context warnings on startup

### 5. Test Session Auth Locally
```bash
# Get Auth0 token from your frontend (copy from browser devtools)
AUTH0_TOKEN="your-token-here"

# Test login
curl -X POST http://localhost:30001/api/auth/login \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  -c cookies.txt \
  -v

# Check cookies were set
cat cookies.txt
# Should see: sid and csrf cookies

# Test authenticated request
curl http://localhost:30001/api/auth/me \
  -b cookies.txt

# Should return your user info
```
- [ ] Login returns 200 OK
- [ ] cookies.txt contains `sid` cookie
- [ ] cookies.txt contains `csrf` cookie
- [ ] `/api/auth/me` returns user info
- [ ] `/api/auth/me` works without Bearer token

### 6. Test CSRF Protection
```bash
# Extract CSRF token from cookie
CSRF_TOKEN=$(grep csrf cookies.txt | awk '{print $NF}')

# Try POST without CSRF (should warn but allow in optional mode)
curl -X POST http://localhost:30001/api/vendors \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"contractor_name":"Test","contractor_type":"Contractor"}'

# Should succeed (optionalCSRF mode)

# POST with CSRF token
curl -X POST http://localhost:30001/api/vendors \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"contractor_name":"Test2","contractor_type":"Contractor"}'
```
- [ ] POST works with CSRF token
- [ ] POST works without CSRF token (optional mode active)

### 7. Test OCC/ETag
```bash
# Create a vendor
VENDOR_JSON=$(curl -X POST http://localhost:30001/api/vendors \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"contractor_name":"OCC Test","contractor_type":"Contractor"}')

VENDOR_ID=$(echo $VENDOR_JSON | jq -r '.data._id')

# GET with ETag
curl -i http://localhost:30001/api/vendors/$VENDOR_ID -b cookies.txt
# Look for: ETag: W/"v0"

# PUT without If-Match (should warn)
curl -X PUT http://localhost:30001/api/vendors/$VENDOR_ID \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{"contractor_name":"Updated"}'
# Currently succeeds (requireIfMatch not on vendor route yet)

# PUT with If-Match
curl -X PUT http://localhost:30001/api/vendors/$VENDOR_ID \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -H "If-Match: W/\"v0\"" \
  -d '{"contractor_name":"Updated Again"}'
```
- [ ] GET returns ETag header
- [ ] PUT with If-Match works
- [ ] PUT increments version (check response __v field)

## Deployment to Staging/Production

### 8. Commit Changes
```bash
git status
git add .
git commit -m "feat: P0 data safety - OCC, ALS tenant isolation, BFF sessions"
git push origin main
```
- [ ] All new files committed
- [ ] Modified files committed
- [ ] Pushed to repository

### 9. Deploy to Staging
- [ ] Trigger deployment (your deploy process)
- [ ] Set environment variables in hosting platform:
  - SESSION_SECRET
  - COOKIE_SECRET
  - CSRF_SALT
  - SESSION_TTL_SECONDS=86400
  - ALLOW_BEARER=true
  - CLIENT_URL
  - COOKIE_DOMAIN (if needed)
- [ ] Deployment successful
- [ ] Application starts without errors

### 10. Verify Staging Deployment
```bash
# Health check
curl https://your-staging-api.com/health

# Test session login
curl -X POST https://your-staging-api.com/api/auth/login \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  -c staging-cookies.txt \
  -v

# Test session auth
curl https://your-staging-api.com/api/auth/me \
  -b staging-cookies.txt
```
- [ ] Health endpoint returns OK
- [ ] Login works on staging
- [ ] Session auth works on staging
- [ ] Cookies are Secure (HTTPS only)

### 11. Monitor Logs
Check staging logs for:
- [ ] "✓ Optimistic Concurrency Control enabled"
- [ ] "✓ Database connected successfully"
- [ ] No unexpected errors
- [ ] Session login/logout events
- [ ] No "❌ SECURITY" errors

### 12. Test with Frontend (Staging)
- [ ] Frontend can still login (Bearer token still works)
- [ ] Create/update operations work
- [ ] No CORS errors in browser console
- [ ] Cookies visible in browser devtools

## Post-Deployment

### 13. Monitor for 24 Hours
Watch for:
- [ ] Any 409 Conflict responses (expected for concurrent edits)
- [ ] Any 428 Precondition Required (expected if ETag enforcement added)
- [ ] Any 403 CSRF failures (shouldn't happen yet with optional mode)
- [ ] Any tenant isolation warnings
- [ ] Performance metrics (should be neutral)

### 14. Deploy to Production
Once staging stable for 24h:
- [ ] Deploy to production
- [ ] Set same environment variables
- [ ] Verify health check
- [ ] Test session auth
- [ ] Monitor logs

### 15. Coordinate Frontend Migration
- [ ] Share `FRONTEND_UPDATE_PROMPT.md` with FE team
- [ ] Schedule FE deployment for cookies
- [ ] Plan testing window

## Phase 2 (After Frontend Migration)

### 16. Disable Bearer Auth
After FE fully migrated and stable:
```env
ALLOW_BEARER=false
```
- [ ] Set in staging first
- [ ] Monitor for any Bearer usage errors
- [ ] Set in production after 48h stable

### 17. Enable Strict Tenant Checks
When confident in tenant isolation:
```env
NODE_ENV=production
```
Monitor logs - queries without tenant context will now ERROR instead of WARN
- [ ] No unexpected tenant errors
- [ ] Super admin ops still work

### 18. Route Refactoring
Start refactoring routes per `P0-REFACTORING-GUIDE.md`:
- [ ] Vendors route refactored
- [ ] Assets route refactored
- [ ] Documents route refactored
- [ ] Other routes as needed

## Rollback Plan

If critical issues:

1. **Immediate (< 5 min)**
   ```env
   ALLOW_BEARER=true
   ```
   Restart server. Bearer tokens work again.

2. **Quick (< 30 min)**
   Comment out in `server.js`:
   ```javascript
   // app.use('/api', optionalCSRF);
   // mongoose.set('optimisticConcurrency', true);
   ```
   Redeploy.

3. **Full (< 2 hours)**
   ```bash
   git revert <commit-hash>
   git push
   ```
   Redeploy previous version.

## Success Criteria

P0 is successfully deployed when:
- [x] Backend code complete (all new files committed)
- [ ] Dependencies installed
- [ ] Environment variables set
- [ ] Local testing passed
- [ ] Staging deployment successful
- [ ] Production deployment successful
- [ ] 24h stable operation
- [ ] No critical errors in logs
- [ ] Frontend still works (Bearer compatibility)

## Next Steps After P0

1. Frontend cookie migration (Week 2)
2. Disable Bearer auth (Week 3)
3. Route refactoring (Week 4+)
4. Add transactions (Week 5+)
5. Add rate limiting (Week 5+)
6. Redis sessions (Week 6+)

---

**Note**: Mark items with ✅ as you complete them. Use this checklist as your deployment runbook.

