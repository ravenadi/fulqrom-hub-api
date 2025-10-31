# Auth0 SPA 401 Error - Quick Fix Checklist

## Immediate Steps to Fix 401 Unauthorized Error

### Step 1: Verify Auth0 Application Configuration

1. **Go to Auth0 Dashboard**: https://manage.auth0.com
2. **Navigate to**: Applications → Applications
3. **Find your SPA client** (the one with `FRONTEND_AUTH0_CLIENT_ID`)
4. **Verify these settings:**

#### Application Type
- Must be: **"Single Page Application"** 
- NOT: "Regular Web Application" or "Machine to Machine"

#### Token Endpoint Authentication Method
- Must be: **"None"**
- This confirms it's a public client (no client_secret)

#### Grant Types
- ✅ **Authorization Code**: Enabled
- ✅ **Refresh Token**: Enabled  
- ❌ **Client Credentials**: DISABLED (this causes 401!)
- ❌ **Password**: DISABLED

#### Application URIs
- **Allowed Callback URLs**: 
  ```
  http://localhost:8080/callback
  https://yourdomain.com/callback
  ```
- **Allowed Logout URLs**:
  ```
  http://localhost:8080
  https://yourdomain.com
  ```
- **Allowed Web Origins**:
  ```
  http://localhost:8080
  https://yourdomain.com
  ```

### Step 2: Verify Environment Variables

Check your `.env` file has these variables:

```env
# Frontend SPA Client (NO SECRET!)
FRONTEND_AUTH0_DOMAIN=dev-ml7pxvj6vg32j740.au.auth0.com
FRONTEND_AUTH0_CLIENT_ID=your_spa_client_id_here
FRONTEND_AUTH0_AUDIENCE=https://api.fulqrom.com.au

# Backend M2M Client (HAS SECRET - Different from SPA!)
AUTH0_DOMAIN=dev-ml7pxvj6vg32j740.au.auth0.com
AUTH0_CLIENT_ID=your_m2m_client_id_here
AUTH0_CLIENT_SECRET=your_m2m_secret_here
AUTH0_MANAGEMENT_API_AUDIENCE=https://dev-ml7pxvj6vg32j740.au.auth0.com/api/v2/
```

**Important**: 
- `FRONTEND_AUTH0_CLIENT_ID` is different from `AUTH0_CLIENT_ID`
- SPA client has NO secret
- M2M client HAS secret

### Step 3: Fix Frontend Code

**❌ WRONG - Don't call `/oauth/token` directly:**

```javascript
// This will fail with 401
fetch('https://dev-ml7pxvj6vg32j740.au.auth0.com/oauth/token', {
  method: 'POST',
  body: JSON.stringify({
    client_id: 'xxx',
    client_secret: 'xxx', // ❌ SPAs don't have secrets!
    grant_type: 'client_credentials' // ❌ Not allowed!
  })
});
```

**✅ CORRECT - Use Auth0 SDK:**

```javascript
import { createAuth0Client } from '@auth0/auth0-spa-js';

const auth0Client = await createAuth0Client({
  domain: 'dev-ml7pxvj6vg32j740.au.auth0.com',
  clientId: 'YOUR_SPA_CLIENT_ID', // From FRONTEND_AUTH0_CLIENT_ID
  authorizationParams: {
    audience: 'https://api.fulqrom.com.au',
    redirect_uri: window.location.origin + '/callback'
  }
});

// This uses Authorization Code + PKCE (correct for SPA)
await auth0Client.loginWithRedirect();
```

### Step 4: Test Configuration

1. **Restart your backend server** (to load env vars)
2. **Clear browser cache and localStorage**
3. **Test the config endpoint**:

```bash
curl http://localhost:30001/api/auth/config
```

Should return:
```json
{
  "success": true,
  "data": {
    "domain": "dev-ml7pxvj6vg32j740.au.auth0.com",
    "clientId": "your_spa_client_id",
    "audience": "https://api.fulqrom.com.au",
    "callbackUrl": "http://localhost:8080/callback"
  }
}
```

### Step 5: Common Mistakes to Avoid

1. ❌ **Don't use client_credentials grant** for SPA
2. ❌ **Don't include client_secret** in frontend requests
3. ❌ **Don't call `/oauth/token` directly** - use Auth0 SDK
4. ❌ **Don't mix SPA and M2M client IDs**
5. ✅ **Do use Authorization Code + PKCE flow**
6. ✅ **Do use Auth0 SPA SDK** (`@auth0/auth0-spa-js`)

## Still Getting 401?

1. **Check Auth0 Logs**: 
   - Dashboard → Monitoring → Logs
   - Look for errors related to your client ID

2. **Verify Client ID matches**:
   - Auth0 Dashboard → Your SPA Application
   - `.env` file → `FRONTEND_AUTH0_CLIENT_ID`
   - Frontend code → Auth0 configuration

3. **Test with Auth0's test page**:
   ```
   https://dev-ml7pxvj6vg32j740.au.auth0.com/authorize?
     client_id=YOUR_SPA_CLIENT_ID&
     response_type=code&
     redirect_uri=http://localhost:8080/callback&
     scope=openid profile email&
     audience=https://api.fulqrom.com.au
   ```

4. **Check browser console** for specific error:
   - `invalid_client`: Wrong client ID or type
   - `invalid_grant`: Grant type not allowed
   - `unauthorized_client`: Application can't use this grant

## Need More Help?

See [AUTH0_SPA_TROUBLESHOOTING.md](./AUTH0_SPA_TROUBLESHOOTING.md) for detailed troubleshooting guide.

