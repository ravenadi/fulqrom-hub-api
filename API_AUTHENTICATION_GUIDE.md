# API Authentication Guide

## How to Send Authentication Token in API Requests

All protected API endpoints require a valid JWT Bearer token in the Authorization header.

## Format

```
Authorization: Bearer <your-jwt-token>
```

## Methods to Send Token

### 1. Using cURL

```bash
curl -X GET http://localhost:30001/api/v2/roles \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

### 2. Using Postman

1. Open your request
2. Go to **Authorization** tab
3. Select **Type**: `Bearer Token`
4. Paste your JWT token in the **Token** field
5. Send the request

### 3. Using JavaScript/Fetch

```javascript
const token = 'YOUR_JWT_TOKEN_HERE';

fetch('http://localhost:30001/api/v2/roles', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
```

### 4. Using Axios

```javascript
const token = 'YOUR_JWT_TOKEN_HERE';

axios.get('http://localhost:30001/api/v2/roles', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(response => console.log(response.data))
.catch(error => console.error('Error:', error));
```

### 5. Using Vue.js (Composition API)

```javascript
import { ref } from 'vue';
import axios from 'axios';

const token = ref(localStorage.getItem('auth_token'));

// Create axios instance with default auth header
const api = axios.create({
  baseURL: 'http://localhost:30001/api',
  headers: {
    'Authorization': `Bearer ${token.value}`
  }
});

// Use it
api.get('/v2/roles')
  .then(response => console.log(response.data))
  .catch(error => console.error('Error:', error));
```

### 6. Using Vue.js (Options API)

```javascript
export default {
  methods: {
    async fetchRoles() {
      try {
        const token = this.$store.state.auth.token; // or wherever you store token
        const response = await this.$http.get('/v2/roles', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        return response.data;
      } catch (error) {
        console.error('Error fetching roles:', error);
      }
    }
  }
};
```

## Getting Your JWT Token

### Option 1: From Frontend Login Response

When you log in through your frontend, Auth0 returns a JWT token. Store it and use it in subsequent requests:

```javascript
// After successful login
const loginResponse = await auth0.login();
const token = loginResponse.access_token;
localStorage.setItem('auth_token', token);
```

### Option 2: Direct Auth0 Login (for testing)

Get token from Auth0:

```bash
curl -X POST https://YOUR_AUTH0_DOMAIN/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "audience": "https://api.fulqrom.com.au",
    "grant_type": "client_credentials"
  }'
```

### Option 3: Use Browser DevTools

1. Open browser DevTools (F12)
2. Go to **Application** or **Storage** tab
3. Check **Local Storage** for your token key
4. Copy the token value

## Common Headers for Multi-Tenant APIs

Some endpoints require additional headers:

```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'X-Tenant-Id': 'your-tenant-id',  // Optional: for super admin cross-tenant access
  'Content-Type': 'application/json'
}
```

## Example: Complete API Request

```javascript
const token = localStorage.getItem('auth_token');
const tenantId = localStorage.getItem('tenant_id');

fetch('http://localhost:30001/api/v2/roles', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
})
.then(response => {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
})
.then(data => {
  console.log('Success:', data);
})
.catch(error => {
  console.error('Error:', error);
});
```

## Troubleshooting

### Error: "Authorization token is missing or invalid"

**Causes:**
1. Token not included in request
2. Token expired
3. Token format incorrect
4. Token not prefixed with "Bearer "

**Solutions:**
- Ensure header is: `Authorization: Bearer <token>` (with space after "Bearer")
- Check token hasn't expired (JWT tokens typically expire after 1 hour)
- Verify token is from correct Auth0 audience
- Make sure token is stored and retrieved correctly

### Error: "401 Unauthorized"

**Causes:**
1. Invalid or expired token
2. Token from wrong Auth0 domain
3. Wrong audience in token

**Solutions:**
- Get a new token from Auth0
- Verify `AUTH0_AUDIENCE` and `AUTH0_DOMAIN` environment variables
- Check token payload in https://jwt.io

## Testing with cURL (Complete Example)

```bash
# 1. Get token (replace with your actual credentials)
TOKEN=$(curl -X POST https://YOUR_AUTH0_DOMAIN/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "audience": "https://api.fulqrom.com.au",
    "grant_type": "client_credentials"
  }' | jq -r '.access_token')

# 2. Use token to make API request
curl -X GET http://localhost:30001/api/v2/roles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

## Quick Reference

| Method | Header Format |
|--------|--------------|
| cURL | `-H "Authorization: Bearer TOKEN"` |
| Postman | Auth Type: Bearer Token |
| JavaScript Fetch | `headers: { 'Authorization': 'Bearer TOKEN' }` |
| Axios | `headers: { 'Authorization': 'Bearer TOKEN' }` |
| Vue HTTP | `headers: { 'Authorization': 'Bearer TOKEN' }` |

## Environment Variables

Make sure these are set in your `.env` file:

```env
AUTH0_DOMAIN=dev-ml7pxvj6vg32j740.au.auth0.com
AUTH0_AUDIENCE=https://api.fulqrom.com.au
AUTH0_CLIENT_ID=your_client_id
```

---

**Note:** Never commit tokens to version control. Always use environment variables or secure storage (like localStorage/sessionStorage for frontend, environment variables for backend).

