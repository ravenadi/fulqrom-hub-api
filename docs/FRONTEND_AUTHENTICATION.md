# Frontend Authentication Guide

## Current Setup: Legacy Mode (USE_AUTH0=false)

Your API is currently configured to use **legacy authentication** which requires a `user_id` parameter in every request.

## How to Fix "User not found" Errors in Frontend

The API now requires authentication for ALL endpoints. Your frontend must include a `user_id` parameter in every API request.

### Option 1: Add user_id as Query Parameter (Recommended for GET requests)

```javascript
// Example with fetch
const userId = 'GET_THIS_FROM_YOUR_LOGIN_SYSTEM'; // e.g., from localStorage

// Get customers
fetch(`http://localhost:30001/api/customers?user_id=${userId}`)
  .then(res => res.json())
  .then(data => console.log(data));

// Get assets
fetch(`http://localhost:30001/api/assets?user_id=${userId}`)
  .then(res => res.json())
  .then(data => console.log(data));
```

### Option 2: Add user_id as Header (Works for all request types)

```javascript
const userId = 'GET_THIS_FROM_YOUR_LOGIN_SYSTEM';

// Get customers
fetch('http://localhost:30001/api/customers', {
  headers: {
    'x-user-id': userId,
    'Content-Type': 'application/json'
  }
})
  .then(res => res.json())
  .then(data => console.log(data));

// Create customer (POST)
fetch('http://localhost:30001/api/customers', {
  method: 'POST',
  headers: {
    'x-user-id': userId,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    organisation: {
      organisation_name: 'Test Company'
    }
  })
})
  .then(res => res.json())
  .then(data => console.log(data));
```

### Option 3: Add user_id in Request Body (POST/PUT only)

```javascript
// Create customer
fetch('http://localhost:30001/api/customers', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    user_id: userId, // Add this to every POST/PUT request body
    organisation: {
      organisation_name: 'Test Company'
    }
  })
})
  .then(res => res.json())
  .then(data => console.log(data));
```

## Recommended Approach: Create an API Helper

Create a centralized API helper that automatically adds the user_id to all requests:

### JavaScript/React Example

```javascript
// utils/api.js
const API_BASE_URL = 'http://localhost:30001/api';

// Get user_id from your login system (localStorage, context, etc.)
function getUserId() {
  // Replace this with your actual user authentication logic
  return localStorage.getItem('user_id');
}

// Helper function for GET requests
export async function apiGet(endpoint) {
  const userId = getUserId();

  if (!userId) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}?user_id=${userId}`, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
}

// Helper function for POST/PUT/DELETE requests
export async function apiRequest(endpoint, method = 'POST', body = {}) {
  const userId = getUserId();

  if (!userId) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'x-user-id': userId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
}

// Usage examples:
// Get customers: await apiGet('/customers')
// Create customer: await apiRequest('/customers', 'POST', { organisation: {...} })
// Update customer: await apiRequest('/customers/123', 'PUT', { organisation: {...} })
// Delete customer: await apiRequest('/customers/123', 'DELETE')
```

### Using the API Helper

```javascript
import { apiGet, apiRequest } from './utils/api';

// Get customers
async function loadCustomers() {
  try {
    const response = await apiGet('/customers');
    console.log(response.data);
  } catch (error) {
    console.error('Failed to load customers:', error.message);
  }
}

// Get assets
async function loadAssets() {
  try {
    const response = await apiGet('/assets');
    console.log(response.data);
  } catch (error) {
    console.error('Failed to load assets:', error.message);
  }
}

// Create customer
async function createCustomer(customerData) {
  try {
    const response = await apiRequest('/customers', 'POST', customerData);
    console.log('Customer created:', response.data);
  } catch (error) {
    console.error('Failed to create customer:', error.message);
  }
}
```

## Valid User IDs for Testing

Here are some users you can use for testing (copy one of these IDs):

- **68f0aa216c68289ed0cfd131** - RavenAdi (Site Manager - full access)
- **68e2be35dd7a8c282539f510** - demo@fulqrom.com.au (Site Manager - full access)
- **68f0b3a23ff223c7f4cd2283** - KKK (Site Manager - full access)

## Getting User ID from Login

Your frontend should get the `user_id` from your authentication/login flow. For example:

1. User logs in via your login page
2. Backend returns user information including `_id`
3. Store the `_id` in localStorage or React context:
   ```javascript
   localStorage.setItem('user_id', userData._id);
   ```
4. Use that `user_id` for all subsequent API requests

## Error Responses

### When user_id is missing:
```json
{
  "success": false,
  "message": "Authentication required. Please provide user_id in request.",
  "hint": "Add x-user-id header or user_id query parameter (Legacy mode active)"
}
```

### When user_id is invalid:
```json
{
  "success": false,
  "message": "User not found"
}
```

### When user lacks permissions:
```json
{
  "success": false,
  "message": "Access denied. You don't have view permission for customers.",
  "required_permission": "view:customers"
}
```

## Switching to Auth0 Mode (Future)

When you're ready to use proper Auth0 JWT authentication:

1. Set `USE_AUTH0=true` in `.env`
2. Update frontend to use `Authorization: Bearer <token>` header instead
3. Remove `user_id` parameters
4. See [AUTH0_AUTHENTICATION.md](./AUTH0_AUTHENTICATION.md) for full setup

## Quick Fix for Testing

If you just want to test quickly without updating your entire frontend, you can:

1. Open your browser console on your app
2. Set a user_id in localStorage:
   ```javascript
   localStorage.setItem('user_id', '68f0aa216c68289ed0cfd131');
   ```
3. Update your API calls to read from localStorage:
   ```javascript
   const userId = localStorage.getItem('user_id');
   fetch(`${apiUrl}?user_id=${userId}`)
   ```

## Need Help?

If you're still getting "User not found" errors:

1. Verify the user_id exists by calling: `GET http://localhost:30001/api/users`
2. Check the user has the correct role with permissions
3. Check server logs for detailed error messages
4. Ensure the server has been restarted after making changes
