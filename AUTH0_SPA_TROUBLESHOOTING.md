# Auth0 SPA Client 401 Error Troubleshooting

## Error: `POST https://dev-ml7pxvj6vg32j740.au.auth0.com/oauth/token 401 (Unauthorized)`

This error occurs when your frontend SPA (Single Page Application) tries to get a token from Auth0's `/oauth/token` endpoint.

## Root Cause

**SPA applications are PUBLIC clients** and cannot use certain grant types or authentication methods. The most common issue is trying to use `client_credentials` grant type or including a `client_secret` in the request.

## Critical Auth0 Configuration for SPA

### 1. Application Type Must Be "Single Page Application"

In Auth0 Dashboard:
1. Go to **Applications** → **Applications**
2. Select your frontend client
3. Verify **Application Type** is set to **"Single Page Application"** (not "Regular Web Application" or "Machine to Machine")

### 2. Grant Types Allowed for SPA

SPA applications should ONLY use:
- ✅ **Authorization Code** (with PKCE) - **RECOMMENDED**
- ✅ **Implicit** - Legacy, use Authorization Code instead
- ✅ **Refresh Token** - For token refresh

**NOT allowed for SPA:**
- ❌ **Client Credentials** - This is for Machine-to-Machine only
- ❌ **Password Grant** - Deprecated and not recommended

### 3. No Client Secret

**SPA applications MUST NOT have or use a client_secret.** They are public clients that run in the browser.

## Common Issues and Solutions

### Issue 1: Trying to Use `/oauth/token` Directly

**❌ WRONG - Don't do this:**
```javascript
// This will fail with 401 for SPA
fetch('https://dev-ml7pxvj6vg32j740.au.auth0.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: 'YOUR_SPA_CLIENT_ID',
    client_secret: 'SOME_SECRET', // ❌ SPAs don't have secrets!
    grant_type: 'client_credentials', // ❌ Not allowed for SPA
    audience: 'YOUR_AUDIENCE'
  })
});
```

**✅ CORRECT - Use Auth0 SDK:**
```javascript
import { createAuth0Client } from '@auth0/auth0-spa-js';

const auth0Client = await createAuth0Client({
  domain: 'dev-ml7pxvj6vg32j740.au.auth0.com',
  clientId: 'YOUR_SPA_CLIENT_ID',
  authorizationParams: {
    audience: 'YOUR_AUDIENCE',
    redirect_uri: window.location.origin + '/callback'
  }
});

// This uses Authorization Code + PKCE flow
await auth0Client.loginWithRedirect();
```

### Issue 2: Missing Callback URLs

Auth0 requires callback URLs to be whitelisted.

**In Auth0 Dashboard:**
1. Go to **Applications** → **Applications** → **[Your SPA Client]**
2. Scroll to **Allowed Callback URLs**
3. Add your callback URLs:
   - Development: `http://localhost:8080/callback`
   - Production: `https://yourdomain.com/callback`
4. Add to **Allowed Logout URLs**:
   - Development: `http://localhost:8080`
   - Production: `https://yourdomain.com`
5. Add to **Allowed Web Origins** (for CORS):
   - Development: `http://localhost:8080`
   - Production: `https://yourdomain.com`

### Issue 3: Wrong Grant Types Enabled

**In Auth0 Dashboard:**
1. Go to **Applications** → **Applications** → **[Your SPA Client]**
2. Scroll to **Application URIs**
3. Under **Advanced Settings** → **Grant Types**:
   - ✅ Enable: **Authorization Code**
   - ✅ Enable: **Implicit** (if using legacy flow)
   - ✅ Enable: **Refresh Token**
   - ❌ Disable: **Client Credentials**
   - ❌ Disable: **Password** (if enabled)

### Issue 4: Missing or Incorrect Environment Variables

Check your `.env` file has these set correctly:

```env
# Frontend SPA Client Configuration
FRONTEND_AUTH0_DOMAIN=dev-ml7pxvj6vg32j740.au.auth0.com
FRONTEND_AUTH0_CLIENT_ID=your_spa_client_id_here
FRONTEND_AUTH0_AUDIENCE=https://api.fulqrom.com.au

# Backend API Client (Machine-to-Machine) - Different from SPA
AUTH0_DOMAIN=dev-ml7pxvj6vg32j740.au.auth0.com
AUTH0_CLIENT_ID=your_m2m_client_id_here
AUTH0_CLIENT_SECRET=your_m2m_client_secret_here
AUTH0_AUDIENCE=https://api.fulqrom.com.au
```

**Important:** 
- `FRONTEND_AUTH0_CLIENT_ID` is your **SPA application** (no secret)
- `AUTH0_CLIENT_ID` is your **Machine-to-Machine application** (has secret)

## Correct Frontend Implementation

### Using Auth0 SPA SDK (Recommended)

```javascript
// Install: npm install @auth0/auth0-spa-js

import { createAuth0Client } from '@auth0/auth0-spa-js';

let auth0Client = null;

async function initAuth0() {
  auth0Client = await createAuth0Client({
    domain: 'dev-ml7pxvj6vg32j740.au.auth0.com',
    clientId: 'YOUR_SPA_CLIENT_ID',
    authorizationParams: {
      audience: 'https://api.fulqrom.com.au',
      redirect_uri: window.location.origin + '/callback'
    },
    cacheLocation: 'localstorage',
    useRefreshTokens: true
  });

  // Check if user is authenticated
  const isAuthenticated = await auth0Client.isAuthenticated();
  
  if (!isAuthenticated) {
    // Handle callback or show login
    await auth0Client.handleRedirectCallback();
  }
}

// Login
async function login() {
  await auth0Client.loginWithRedirect();
}

// Get token
async function getToken() {
  const token = await auth0Client.getTokenSilently();
  return token;
}

// Logout
async function logout() {
  await auth0Client.logout({
    logoutParams: {
      returnTo: window.location.origin
    }
  });
}
```

### Manual Implementation (Not Recommended)

If you must implement manually, use Authorization Code + PKCE:

```javascript
// Step 1: Generate code verifier and challenge (PKCE)
const codeVerifier = base64URLEncode(crypto.randomBytes(32));
const codeChallenge = base64URLEncode(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
);

// Step 2: Redirect to Auth0
const authUrl = `https://dev-ml7pxvj6vg32j740.au.auth0.com/authorize?` +
  `client_id=${CLIENT_ID}&` +
  `response_type=code&` +
  `redirect_uri=${encodeURIComponent(CALLBACK_URL)}&` +
  `scope=openid profile email&` +
  `audience=${AUDIENCE}&` +
  `code_challenge=${codeChallenge}&` +
  `code_challenge_method=S256`;

window.location.href = authUrl;

// Step 3: On callback, exchange code for token
const code = new URLSearchParams(window.location.search).get('code');
const tokenResponse = await fetch('https://dev-ml7pxvj6vg32j740.au.auth0.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code', // ✅ Correct for SPA
    client_id: CLIENT_ID,
    code: code,
    redirect_uri: CALLBACK_URL,
    code_verifier: codeVerifier // ✅ PKCE
    // ❌ NO client_secret!
  })
});
```

## Verification Steps

### 1. Check Auth0 Application Settings

```bash
# Verify your SPA client settings in Auth0 Dashboard:
Application Type: Single Page Application
Token Endpoint Authentication Method: None (public client)
Allowed Callback URLs: [your callback URLs]
Allowed Logout URLs: [your logout URLs]
Allowed Web Origins: [your origins]
Grant Types: Authorization Code, Refresh Token (NOT Client Credentials)
```

### 2. Test Configuration Endpoint

Your backend provides a config endpoint to verify settings:

```javascript
// Get Auth0 config from your backend
const response = await fetch('http://localhost:30001/api/auth/config');
const config = await response.json();

console.log('Auth0 Config:', config);
// Should return:
// {
//   success: true,
//   data: {
//     domain: 'dev-ml7pxvj6vg32j740.au.auth0.com',
//     clientId: 'YOUR_SPA_CLIENT_ID',
//     audience: 'https://api.fulqrom.com.au',
//     callbackUrl: 'http://localhost:8080/callback'
//   }
// }
```

### 3. Check Browser Console

Look for specific error messages:
- `invalid_client`: Client ID is wrong or application type is incorrect
- `invalid_grant`: Grant type not allowed or code expired
- `unauthorized_client`: Application not allowed to use this grant type
- `invalid_request`: Missing required parameters or callback URL mismatch

## Auth0 Dashboard Checklist

- [ ] Application Type is "Single Page Application"
- [ ] Token Endpoint Authentication Method is "None"
- [ ] Client Credentials grant is **DISABLED**
- [ ] Authorization Code grant is **ENABLED**
- [ ] Refresh Token grant is **ENABLED**
- [ ] Allowed Callback URLs includes your callback URL
- [ ] Allowed Logout URLs includes your logout URL
- [ ] Allowed Web Origins includes your origin
- [ ] Allowed Origins (CORS) includes your origin

## Quick Fix

If you're still getting 401, try this:

1. **Delete and recreate the SPA application** in Auth0:
   - Create new application
   - Select "Single Page Application"
   - Configure URLs and grant types as above

2. **Update your `.env` file** with the new client ID:
   ```env
   FRONTEND_AUTH0_CLIENT_ID=new_client_id_here
   ```

3. **Restart your backend server** to load new env vars

4. **Clear browser cache and localStorage**

5. **Test with Auth0's test login page**:
   ```
   https://dev-ml7pxvj6vg32j740.au.auth0.com/authorize?
     client_id=YOUR_SPA_CLIENT_ID&
     response_type=code&
     redirect_uri=http://localhost:8080/callback&
     scope=openid profile email&
     audience=https://api.fulqrom.com.au
   ```

## Still Having Issues?

1. Check Auth0 logs: **Monitoring** → **Logs** in Auth0 Dashboard
2. Check browser Network tab for exact request/response
3. Verify the client ID matches between:
   - Auth0 Dashboard
   - `.env` file
   - Frontend code
4. Ensure you're using the SPA client ID, not the M2M client ID

## Summary

**Remember:**
- SPA = Public Client = No client_secret
- SPA = Authorization Code + PKCE flow
- SPA ≠ Client Credentials grant
- Always use Auth0 SDK for SPAs (don't manually call `/oauth/token`)

