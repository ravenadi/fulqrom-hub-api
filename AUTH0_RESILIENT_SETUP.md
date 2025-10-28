# Resilient Authentication Setup Guide

This guide explains how to configure Auth0 and your application for fully resilient authentication that ensures users can always log in if they exist in MongoDB.

## Overview

The resilient authentication system provides:
- **Auto-sync** between MongoDB and Auth0 during login
- **Email verification bypass** for admin-created users
- **Password reset resilience** that works even with Auth0/MongoDB mismatches
- **Comprehensive error handling** and audit logging
- **User recovery** for blocked or missing Auth0 accounts

## Architecture

```
┌─────────────────┐
│   Frontend      │
│   Login Form    │
└────────┬────────┘
         │
         │ 1. Call /api/auth/prepare-login
         ▼
┌─────────────────────────────────────────────┐
│   Resilient Service                         │
│   - Check MongoDB user                      │
│   - Create/update Auth0 user if needed     │
│   - Auto-verify email                       │
│   - Unblock if blocked                      │
│   - Sync roles and metadata                 │
└────────┬────────────────────────────────────┘
         │
         │ 2. Proceed to Auth0 login
         ▼
┌─────────────────┐
│   Auth0 Login   │
│   (Universal    │
│    Login)       │
└────────┬────────┘
         │
         │ 3. After successful Auth0 auth
         ▼
┌─────────────────┐        ┌──────────────────┐
│   Auth0 Action  │───────▶│ POST /auth/      │
│   (Post-Login)  │        │ prepare-login    │
└────────┬────────┘        └──────────────────┘
         │
         │ 4. Return to frontend with tokens
         ▼
┌─────────────────┐
│   Frontend      │
│   Call /api/    │
│   auth/sync-user│
└─────────────────┘
```

## API Endpoints

### 1. POST /api/auth/prepare-login
**Purpose**: Pre-login user sync to ensure authentication will succeed

**Request**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "User prepared for login",
  "status": "SYNCED_AND_SUCCESS",
  "actions": [
    "Auto-verified email in Auth0",
    "Unblocked user in Auth0",
    "Synced roles"
  ],
  "warnings": []
}
```

**When to call**:
- BEFORE initiating Auth0 login
- On the login page when user clicks "Login" button
- Ensures user exists in Auth0 before authentication

### 2. POST /api/auth/password-reset
**Purpose**: Resilient password reset with auto-sync

**Request**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password reset email sent",
  "actions": [
    "Created user in Auth0",
    "Auto-verified email in Auth0"
  ],
  "warnings": []
}
```

**When to call**:
- When user clicks "Forgot Password"
- Automatically creates Auth0 user if missing
- Sends password reset email from Auth0

### 3. POST /api/auth/sync-user
**Purpose**: Post-login sync to update MongoDB with Auth0 data

**Request**:
```json
{
  "auth0_id": "auth0|123456",
  "email": "user@example.com",
  "full_name": "John Smith",
  "phone": "+61 400 000 000",
  "roles": ["admin"]
}
```

**Response**:
```json
{
  "success": true,
  "message": "User synced successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "full_name": "John Smith",
    "auth0_id": "auth0|123456",
    "is_active": true,
    "role_ids": [...],
    "tenant_id": "...",
    "organisations": [...]
  }
}
```

**When to call**:
- After successful Auth0 authentication
- Called automatically by frontend after login redirect

## Auth0 Dashboard Configuration

### Step 1: Create Post-Login Action

1. **Navigate to Auth0 Dashboard**
   - Go to https://manage.auth0.com
   - Select your tenant
   - Navigate to **Actions** → **Flows** → **Login**

2. **Create Custom Action**
   - Click **"Build Custom"** or **"+"**
   - Name: `Resilient User Sync`
   - Trigger: `Login / Post Login`

3. **Add Action Code** (see below)

4. **Configure Secrets**
   - Click **Settings** icon (⚙️) on the action
   - Add Secrets:
     - `API_BASE_URL`: Your API URL (e.g., `https://api.fulqrom.com` or `http://localhost:3001`)
     - `API_SECRET`: Shared secret for API authentication (optional but recommended)

5. **Add to Flow**
   - Click **Deploy**
   - Drag the action into the Login flow
   - Position: After "Start" and before "Complete"
   - Click **Apply**

### Auth0 Post-Login Action Code

```javascript
/**
 * Post-Login Action: Resilient User Sync
 *
 * This action runs after successful Auth0 authentication and ensures
 * the user is synced between Auth0 and MongoDB.
 *
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {PostLoginAPI} api - Interface for modifying the authentication flow.
 */
exports.onExecutePostLogin = async (event, api) => {
  const axios = require('axios');

  // Configuration - Use secrets for production
  const API_BASE_URL = event.secrets.API_BASE_URL || 'http://localhost:3001';
  const API_SECRET = event.secrets.API_SECRET || '';

  console.log('[Resilient Auth] Post-login action triggered for:', event.user.email);

  try {
    // Extract user information
    const email = event.user.email;
    const auth0UserId = event.user.user_id;

    if (!email) {
      console.error('[Resilient Auth] No email found for user');
      return;
    }

    // Call prepare-login endpoint to ensure sync
    const prepareResponse = await axios.post(
      `${API_BASE_URL}/api/auth/prepare-login`,
      { email },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(API_SECRET && { 'X-API-Secret': API_SECRET })
        },
        timeout: 10000 // 10 second timeout
      }
    );

    if (prepareResponse.data.success) {
      console.log('[Resilient Auth] User sync successful:', {
        email,
        status: prepareResponse.data.status,
        actions: prepareResponse.data.actions
      });

      // Add sync status to user metadata (optional - for debugging)
      api.user.setAppMetadata('last_sync', new Date().toISOString());
      api.user.setAppMetadata('sync_status', prepareResponse.data.status);

      // Add sync actions to ID token (optional)
      if (prepareResponse.data.actions && prepareResponse.data.actions.length > 0) {
        api.idToken.setCustomClaim('sync_actions', prepareResponse.data.actions);
      }
    } else {
      console.warn('[Resilient Auth] User not found in database:', email);

      // User not in MongoDB - deny login for security
      // Only Auth0-only users (like super_admin) should bypass this
      const roles = event.authorization?.roles || [];
      if (!roles.includes('super_admin')) {
        api.access.deny('User not found in system. Please contact support.');
      }
    }

  } catch (error) {
    console.error('[Resilient Auth] Sync failed:', {
      error: error.message,
      email: event.user.email,
      response: error.response?.data
    });

    // IMPORTANT: Don't block login on sync failure
    // The sync will be attempted again on next login
    // This ensures users can still log in even if API is down
    console.log('[Resilient Auth] Allowing login despite sync failure');

    // Add error flag to token for debugging
    api.idToken.setCustomClaim('sync_error', true);
  }
};
```

### Step 2: Test the Action

1. **Test in Auth0 Dashboard**
   - In the Action editor, click **Test**
   - Provide test user data
   - Check console output for sync confirmation

2. **Test with Real Login**
   - Go to your application login page
   - Attempt to log in with a test user
   - Check Auth0 logs: **Monitoring** → **Logs**
   - Verify sync occurred in application logs

### Step 3: Monitor and Debug

1. **Auth0 Logs**
   - Navigate to **Monitoring** → **Logs**
   - Filter by action name: `Resilient User Sync`
   - Check for errors or warnings

2. **Application Logs**
   - Check MongoDB `auditlogs` collection for auth events
   - Look for `🔐 [AUTH]` prefixed logs in application console

3. **Common Issues**
   - **Timeout errors**: Increase action timeout in settings
   - **Network errors**: Check `API_BASE_URL` is correct and accessible
   - **401 errors**: Verify API secret configuration
   - **User not found**: Check MongoDB user exists and is active

## Frontend Integration

### Login Flow

```typescript
// src/services/authService.ts

export async function loginWithResilientAuth(email: string, password: string) {
  try {
    // Step 1: Prepare user for login (ensures Auth0 sync)
    const prepareResponse = await fetch('/api/auth/prepare-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const prepareResult = await prepareResponse.json();

    if (!prepareResult.success) {
      throw new Error(prepareResult.message || 'User not found in system');
    }

    // Log sync actions (optional)
    if (prepareResult.actions && prepareResult.actions.length > 0) {
      console.log('User sync actions:', prepareResult.actions);
    }

    // Step 2: Proceed with Auth0 login
    // Use your Auth0 SDK to initiate login
    await auth0Client.loginWithRedirect({
      authorizationParams: {
        login_hint: email,
        // Add any other params as needed
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

// After Auth0 callback redirect
export async function handleAuthCallback() {
  // Get Auth0 user
  const auth0User = await auth0Client.getUser();

  if (!auth0User) {
    throw new Error('No user returned from Auth0');
  }

  // Step 3: Sync user to MongoDB
  const syncResponse = await fetch('/api/auth/sync-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth0_id: auth0User.sub,
      email: auth0User.email,
      full_name: auth0User.name,
      phone: auth0User.phone_number
    })
  });

  const userData = await syncResponse.json();

  if (!userData.success) {
    throw new Error('Failed to sync user data');
  }

  return userData.data;
}
```

### Password Reset Flow

```typescript
// src/services/authService.ts

export async function requestPasswordReset(email: string) {
  try {
    // Call resilient password reset endpoint
    const response = await fetch('/api/auth/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to send password reset email');
    }

    // Log sync actions if any
    if (result.actions && result.actions.length > 0) {
      console.log('Password reset sync actions:', result.actions);
    }

    return {
      success: true,
      message: 'Password reset email sent. Please check your inbox.'
    };

  } catch (error) {
    console.error('Password reset error:', error);
    throw error;
  }
}
```

## Testing Scenarios

### Scenario 1: User exists in MongoDB but not in Auth0
1. Create user in MongoDB via admin panel
2. Attempt login with that user's email
3. **Expected**: User automatically created in Auth0, can log in immediately
4. **Verify**: Check Auth0 dashboard for new user

### Scenario 2: User exists in Auth0 but email not verified
1. Create user in Auth0 with `email_verified: false`
2. Attempt login
3. **Expected**: Email automatically verified, login succeeds
4. **Verify**: Check Auth0 user has `email_verified: true`

### Scenario 3: User is blocked in Auth0 but active in MongoDB
1. Block user in Auth0 dashboard
2. Attempt login
3. **Expected**: User automatically unblocked, login succeeds
4. **Verify**: User is no longer blocked in Auth0

### Scenario 4: Password reset with missing Auth0 user
1. Create user in MongoDB only
2. Request password reset
3. **Expected**: User created in Auth0, reset email sent
4. **Verify**: User can complete password reset and log in

### Scenario 5: Auth0/MongoDB metadata mismatch
1. Update user name in MongoDB
2. Attempt login
3. **Expected**: Auth0 metadata updated to match MongoDB
4. **Verify**: Auth0 user has updated name

## Monitoring and Maintenance

### Audit Logs

All authentication events are logged to MongoDB `auditlogs` collection:

```javascript
{
  action: 'authentication',
  resource_type: 'user',
  resource_id: 'user@example.com',
  tenant_id: '...',
  details: {
    event: 'LOGIN_PREPARATION_SUCCESS',
    status: 'SYNCED_AND_SUCCESS',
    actions: ['Auto-verified email in Auth0'],
    timestamp: '2025-10-25T...'
  }
}
```

### Event Types

- `LOGIN_ATTEMPT`: User initiated login
- `LOGIN_PREPARATION_SUCCESS`: Pre-login sync completed
- `LOGIN_PREPARATION_FAILED`: User not found in MongoDB
- `USER_CREATED_IN_AUTH0`: Auth0 user auto-created
- `UPDATED_AUTH0_USER`: Auth0 metadata synced
- `PASSWORD_RESET_REQUEST`: Password reset requested
- `PASSWORD_RESET_EMAIL_SENT`: Reset email sent successfully
- `SYNC_ERROR`: Sync operation failed

### Bulk Sync Tool

For migrations or recovery, use the bulk sync function:

```javascript
const resilientAuthService = require('./services/resilientAuthService');

// Sync all users in a tenant
const result = await resilientAuthService.bulkSyncUsers({
  tenantId: '507f1f77bcf86cd799439011',
  limit: null,  // null = all users
  dryRun: false // true = preview only
});

console.log(result);
// {
//   total: 150,
//   synced: 145,
//   created: 5,
//   failed: 0,
//   errors: []
// }
```

## Security Considerations

### 1. API Authentication
- Add authentication to `/api/auth/prepare-login` endpoint
- Use shared secret or JWT for Auth0 Action → API calls
- Rate limit auth endpoints to prevent abuse

### 2. User Verification
- Only sync users that exist in MongoDB
- Deny login for users not in database (except super_admin)
- Validate tenant membership before allowing access

### 3. Error Handling
- Never expose internal errors to frontend
- Log all auth failures for security monitoring
- Don't block login on non-critical sync failures

### 4. Password Security
- Passwords only stored in Auth0 (hashed by Auth0)
- MongoDB never stores passwords
- Password reset generates Auth0-only tokens

## Troubleshooting

### Login fails with "User not found"
- **Cause**: User doesn't exist in MongoDB
- **Solution**: Create user via admin panel or check tenant assignment

### Auth0 Action timeout
- **Cause**: API endpoint too slow or unreachable
- **Solution**: Increase timeout, check network connectivity, optimize database queries

### User blocked despite active status in MongoDB
- **Cause**: Auth0 sync failed or wasn't triggered
- **Solution**: Check Auth0 Action logs, manually trigger sync via prepare-login

### Password reset email not received
- **Cause**: Auth0 email provider not configured
- **Solution**: Configure Auth0 email provider in **Branding** → **Email Provider**

### Metadata not syncing
- **Cause**: Sync not triggered on login
- **Solution**: Check Auth0 Action is deployed and in Login flow

## Best Practices

1. **Always call prepare-login before Auth0 login**
   - Ensures user is ready for authentication
   - Prevents login failures

2. **Handle sync failures gracefully**
   - Don't block user on non-critical failures
   - Retry sync on next login

3. **Monitor authentication logs**
   - Set up alerts for repeated failures
   - Track sync success rates

4. **Test edge cases**
   - Blocked users
   - Unverified emails
   - Missing Auth0 users
   - Metadata mismatches

5. **Keep Auth0 and MongoDB in sync**
   - Run periodic bulk syncs
   - Alert on sync failures
   - Maintain audit logs

## Environment Variables

Add these to your `.env` file:

```bash
# Auth0 Configuration
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_MANAGEMENT_API_AUDIENCE=https://your-tenant.auth0.com/api/v2/
AUTH0_CONNECTION=Username-Password-Authentication

# API Configuration (for Auth0 Action)
API_BASE_URL=http://localhost:3001
API_SECRET=your-shared-secret-key

# MongoDB
MONGODB_CONNECTION=mongodb+srv://...
```

## Support

For issues or questions:
1. Check Auth0 logs: **Monitoring** → **Logs**
2. Check application logs for `🔐 [AUTH]` entries
3. Review MongoDB auditlogs collection
4. Test individual endpoints with curl/Postman

## Version History

- **v1.0.0** (2025-10-25): Initial resilient authentication implementation
  - Auto-sync service
  - Pre-login preparation
  - Resilient password reset
  - Auth0 Post-Login Action
  - Comprehensive logging and monitoring
