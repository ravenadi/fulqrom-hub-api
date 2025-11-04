# Cookie Fix for PUT/POST/DELETE Requests

## Problem

PUT/POST/DELETE requests from the frontend (`http://localhost:8080`) to the API (`http://localhost:30001`) were failing with **401 "NO_AUTH"** error because cookies were not being sent.

GET requests worked fine, but mutating requests (PUT/POST/DELETE) did not include the session cookie.

## Root Cause

The issue was the `sameSite: 'lax'` cookie setting in the authentication routes.

- **SameSite=Lax**: Cookies are sent with top-level navigation and GET requests, but NOT with cross-origin PUT/POST/DELETE requests
- **Cross-origin**: Frontend on `localhost:8080` and API on `localhost:30001` are considered cross-origin (different ports)

## Solution

### Backend Changes (✅ COMPLETED)

Updated `routes/auth.js` to use `sameSite: 'none'` in development:

```javascript
sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none'
```

This allows cookies to be sent with all request types in development.

**Changed files:**
- `routes/auth.js` (lines 106, 171, 231)

### Frontend Changes (⚠️ REQUIRED)

The frontend must be configured to send credentials (cookies) with API requests.

#### If using Axios:

```javascript
// In your axios configuration
axios.defaults.withCredentials = true;

// Or per-request
axios.put('/api/documents/123', data, {
  withCredentials: true
});
```

#### If using Fetch API:

```javascript
fetch('http://localhost:30001/api/documents/123', {
  method: 'PUT',
  credentials: 'include',  // This is critical!
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': tenantId
  },
  body: JSON.stringify(data)
});
```

#### If using a global fetch wrapper:

Look for your API service file (e.g., `api.js`, `http.js`, `axios.config.js`) and add:

```javascript
// For axios
const apiClient = axios.create({
  baseURL: 'http://localhost:30001',
  withCredentials: true,  // Add this line
  headers: {
    'Content-Type': 'application/json'
  }
});

// For fetch
const apiFetch = (url, options = {}) => {
  return fetch(url, {
    ...options,
    credentials: 'include',  // Add this line
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
};
```

## Testing

### Step 1: Restart the Backend Server

```bash
cd /path/to/rest-api
# If running with npm/node
pkill -f "node.*server.js"
npm start
# Or
node server.js
```

### Step 2: Test from Browser Console

After logging in, test in browser console:

```javascript
// Test PUT request with credentials
fetch('http://localhost:30001/api/documents/YOUR_DOCUMENT_ID', {
  method: 'PUT',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'YOUR_TENANT_ID'
  },
  body: JSON.stringify({
    name: 'Test Document',
    // ... other fields
  })
})
.then(r => r.json())
.then(d => console.log('Success:', d))
.catch(e => console.error('Error:', e));
```

If this works, the backend is fixed. If it still fails, check the frontend configuration.

### Step 3: Verify Cookies in Network Tab

In browser DevTools → Network tab:
1. Make a PUT request
2. Check the Request Headers
3. You should see: `Cookie: sid=...; csrf=...`

If you don't see the Cookie header, the frontend is NOT configured to send credentials.

## Security Notes

- **Development**: `sameSite: 'none'` allows cross-origin cookies (needed for localhost:8080 → localhost:30001)
- **Production**: `sameSite: 'lax'` provides better security when frontend and API are on the same domain
- The `secure` flag is disabled in development (HTTP) but enabled in production (HTTPS)

## Checklist

- [x] Backend: Update `sameSite` setting in auth routes
- [ ] Restart backend server
- [ ] Frontend: Add `withCredentials: true` (axios) or `credentials: 'include'` (fetch)
- [ ] Test PUT/POST/DELETE requests from browser
- [ ] Verify cookies are being sent in Network tab

## Related Files

- `routes/auth.js` - Cookie configuration
- `middleware/authMiddleware.js` - Authentication logic
- `middleware/sessionAuth.js` - Session validation
- `server.js` - CORS configuration (already has `credentials: true`)


