# Auth0 Integration Guide

## Overview
The Fulqrom Hub API now synchronizes user management operations with Auth0. When users are created, updated, or deleted in the MongoDB database, corresponding operations are performed in Auth0.

## Setup Instructions

### 1. Auth0 Configuration

#### Create a Machine-to-Machine Application
1. Log in to your [Auth0 Dashboard](https://manage.auth0.com/)
2. Navigate to **Applications** → **Applications**
3. Click **Create Application**
4. Name it "Fulqrom Hub API" and select **Machine to Machine Applications**
5. Authorize it to access the **Auth0 Management API**
6. Grant the following permissions:
   - `read:users`
   - `create:users`
   - `update:users`
   - `delete:users`

#### Database Connection
1. Navigate to **Authentication** → **Database**
2. Note your database connection name (default: `Username-Password-Authentication`)
3. Configure password policies and email verification settings as needed

### 2. Environment Variables

Add the following to your `.env` file:

```env
# Auth0 Configuration
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your_machine_to_machine_client_id
AUTH0_CLIENT_SECRET=your_machine_to_machine_client_secret
AUTH0_MANAGEMENT_API_AUDIENCE=https://your-tenant.auth0.com/api/v2/
AUTH0_CONNECTION=Username-Password-Authentication
```

**How to find these values:**
- **AUTH0_DOMAIN**: Your Auth0 tenant domain (e.g., `mycompany.auth0.com`)
- **AUTH0_CLIENT_ID**: Found in your M2M application settings
- **AUTH0_CLIENT_SECRET**: Found in your M2M application settings (keep this secret!)
- **AUTH0_MANAGEMENT_API_AUDIENCE**: `https://{YOUR_DOMAIN}/api/v2/`
- **AUTH0_CONNECTION**: Your database connection name

## Features

### User Creation (`POST /api/users`)
- Creates user in MongoDB
- Creates corresponding user in Auth0 with:
  - Temporary password (user must reset on first login)
  - Email verification requirement
  - User metadata (full_name, phone, mongodb_id)
  - App metadata (is_active, role_ids)
- Sends verification email automatically
- Stores Auth0 user ID in MongoDB for future operations

**Response includes:**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": { /* user object */ },
  "auth0_synced": true
}
```

### User Update (`PUT /api/users/:id`)
- Updates user in MongoDB
- Syncs changes to Auth0:
  - Email updates (triggers re-verification)
  - Name updates
  - Phone number updates
  - Active status (blocks/unblocks in Auth0)
  - Role assignments

**Response includes:**
```json
{
  "success": true,
  "message": "User updated successfully",
  "data": { /* user object */ },
  "auth0_synced": true
}
```

### User Deletion (`DELETE /api/users/:id`)
- Deletes user from MongoDB
- Deletes user from Auth0
- Protected: Cannot delete demo user (`demo@fulqrom.com.au`)

**Response includes:**
```json
{
  "success": true,
  "message": "User deleted successfully",
  "auth0_synced": true
}
```

### User Deactivation (`POST /api/users/:id/deactivate`)
- Marks user as inactive in MongoDB
- Blocks user in Auth0 (prevents login)
- Protected: Cannot deactivate demo user

**Response includes:**
```json
{
  "success": true,
  "message": "User deactivated successfully",
  "data": { /* user object */ },
  "auth0_synced": true
}
```

## User Model Changes

The User model now includes an `auth0_id` field:

```javascript
{
  email: String,
  full_name: String,
  phone: String,
  auth0_id: String,  // NEW: Stores Auth0 user ID
  is_active: Boolean,
  role_ids: [ObjectId],
  resource_access: [...],
  created_at: Date,
  updated_at: Date
}
```

## Error Handling

The integration uses **graceful degradation**:

1. **Primary Operation First**: MongoDB operations are performed first
2. **Auth0 Sync Second**: Auth0 operations happen after
3. **Failure Tolerance**: If Auth0 operation fails:
   - Error is logged to console
   - Response includes `auth0_synced: false`
   - MongoDB operation still succeeds
   - Application continues normally

This ensures your API remains functional even if:
- Auth0 is temporarily unavailable
- Configuration is incorrect
- Rate limits are exceeded

## Audit Logging

All Auth0 sync operations are logged in the audit trail with:
- `auth0_synced`: Whether the sync succeeded
- `auth0_id`: The Auth0 user ID (if applicable)

## Password Management

### Initial User Creation
- Users are created with a temporary random password
- Email verification is required
- Users will receive a password reset email

### Password Reset Flow
You can trigger password reset emails using the Auth0 service:

```javascript
const { sendPasswordResetEmail } = require('../services/auth0Service');

await sendPasswordResetEmail('user@example.com');
```

## Testing

### Test User Creation
```bash
curl -X POST http://localhost:30001/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "full_name": "Test User",
    "phone": "0412345678",
    "is_active": true
  }'
```

### Check Auth0 Dashboard
1. Navigate to **User Management** → **Users**
2. Find the newly created user
3. Verify metadata is populated correctly

## Security Considerations

1. **Environment Variables**: Never commit `.env` file to version control
2. **Client Secret**: Keep AUTH0_CLIENT_SECRET secure
3. **Permissions**: Only grant necessary Management API scopes
4. **Rate Limits**: Auth0 has rate limits on Management API calls
5. **Production**: Use separate Auth0 tenants for dev/staging/production

## Troubleshooting

### "Failed to create user in Auth0"
- Check Auth0 credentials in `.env`
- Verify M2M app has correct permissions
- Check Auth0 logs in dashboard

### "auth0_synced: false" in response
- Check console logs for detailed error
- Verify Auth0 connection name matches
- Check internet connectivity to Auth0

### User exists in MongoDB but not Auth0
- Run a sync script to create missing Auth0 users
- Or manually create in Auth0 dashboard
- Future updates will sync if `auth0_id` is set

## Advanced: Bulk Sync Script

If you need to sync existing MongoDB users to Auth0:

```javascript
const User = require('./models/User');
const { createAuth0User } = require('./services/auth0Service');

async function syncUsersToAuth0() {
  const users = await User.find({ auth0_id: { $exists: false } });

  for (const user of users) {
    try {
      const auth0User = await createAuth0User({
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        is_active: user.is_active,
        role_ids: user.role_ids
      });

      user.auth0_id = auth0User.user_id;
      await user.save();
      console.log(`Synced user: ${user.email}`);
    } catch (error) {
      console.error(`Failed to sync ${user.email}:`, error.message);
    }
  }
}
```

## Support

For Auth0-specific issues:
- [Auth0 Documentation](https://auth0.com/docs)
- [Auth0 Management API Reference](https://auth0.com/docs/api/management/v2)
- [Auth0 Community](https://community.auth0.com/)
