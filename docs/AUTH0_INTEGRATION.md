# Auth0 Integration Guide

## Overview
The Fulqrom Hub API synchronizes both user and role management operations with Auth0. When users or roles are created, updated, or deleted in the MongoDB database, corresponding operations are performed in Auth0.

## Setup Instructions

### 1. Auth0 Configuration

#### Create a Machine-to-Machine Application
1. Log in to your [Auth0 Dashboard](https://manage.auth0.com/)
2. Navigate to **Applications** → **Applications**
3. Click **Create Application**
4. Name it "Fulqrom Hub API" and select **Machine to Machine Applications**
5. Authorize it to access the **Auth0 Management API**
6. Grant the following permissions:
   - **User Management:**
     - `read:users`
     - `create:users`
     - `update:users`
     - `delete:users`
   - **Role Management:**
     - `read:roles`
     - `create:roles`
     - `update:roles`
     - `delete:roles`

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

## Role Management

### Role Creation (`POST /api/roles`)
- Creates role in MongoDB
- Creates corresponding role in Auth0 with:
  - Role name
  - Role description
- Stores Auth0 role ID in MongoDB for future operations

**Response includes:**
```json
{
  "success": true,
  "message": "Role created successfully",
  "data": { /* role object with auth0_id */ },
  "auth0_synced": true
}
```

### Role Update (`PUT /api/roles/:id`)
- Updates role in MongoDB
- Syncs changes to Auth0:
  - Role name updates
  - Description updates

**Response includes:**
```json
{
  "success": true,
  "message": "Role updated successfully",
  "data": { /* role object */ },
  "auth0_synced": true
}
```

### Role Deletion (`DELETE /api/roles/:id`)
- Deletes role from MongoDB
- Deletes role from Auth0
- Protected: Cannot delete "Site Manager" role
- Protected: Cannot delete roles assigned to users

**Response includes:**
```json
{
  "success": true,
  "message": "Role deleted successfully",
  "auth0_synced": true
}
```

## Data Model Changes

### User Model Changes

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

### Role Model Changes

The Role model now includes an `auth0_id` field:

```javascript
{
  name: String,
  description: String,
  is_active: Boolean,
  permissions: [...],
  auth0_id: String,  // NEW: Stores Auth0 role ID
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

### Test Role Creation
```bash
curl -X POST http://localhost:30001/api/roles \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Project Manager",
    "description": "Manages projects and teams",
    "is_active": true,
    "permissions": [
      {
        "module_name": "customers",
        "can_view": true,
        "can_create": true,
        "can_edit": true,
        "can_delete": false
      }
    ]
  }'
```

### Check Auth0 Roles
1. Navigate to **User Management** → **Roles**
2. Find the newly created role
3. Verify name and description are correct

## Security Considerations

1. **Environment Variables**: Never commit `.env` file to version control
2. **Client Secret**: Keep AUTH0_CLIENT_SECRET secure
3. **Permissions**: Only grant necessary Management API scopes
4. **Rate Limits**: Auth0 has rate limits on Management API calls
5. **Production**: Use separate Auth0 tenants for dev/staging/production

## Troubleshooting

### "Failed to create user/role in Auth0"
- Check Auth0 credentials in `.env`
- Verify M2M app has correct permissions (users AND roles)
- Check Auth0 logs in dashboard
- Ensure the Auth0 Management API scopes include both user and role permissions

### "auth0_synced: false" in response
- Check console logs for detailed error
- Verify Auth0 connection name matches (for users)
- Verify the M2M application has role management permissions (for roles)
- Check internet connectivity to Auth0
- Check Auth0 rate limits haven't been exceeded

### User/Role exists in MongoDB but not Auth0
- Run a sync script to create missing Auth0 users/roles
- Or manually create in Auth0 dashboard
- Future updates will sync if `auth0_id` is set

### Role update/delete fails but user operations work
- Check that your Auth0 M2M application has been granted role permissions
- Navigate to **Applications** → **[Your M2M App]** → **APIs** → **Auth0 Management API**
- Ensure these scopes are enabled:
  - `read:roles`
  - `create:roles`
  - `update:roles`
  - `delete:roles`

## Advanced: Bulk Sync Scripts

### Sync Users to Auth0

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

### Sync Roles to Auth0

If you need to sync existing MongoDB roles to Auth0:

```javascript
const Role = require('./models/Role');
const { createAuth0Role } = require('./services/auth0Service');

async function syncRolesToAuth0() {
  const roles = await Role.find({ auth0_id: { $exists: false } });

  for (const role of roles) {
    try {
      const auth0Role = await createAuth0Role({
        name: role.name,
        description: role.description
      });

      role.auth0_id = auth0Role.id;
      await role.save();
      console.log(`Synced role: ${role.name}`);
    } catch (error) {
      console.error(`Failed to sync ${role.name}:`, error.message);
    }
  }
}
```

## Support

For Auth0-specific issues:
- [Auth0 Documentation](https://auth0.com/docs)
- [Auth0 Management API Reference](https://auth0.com/docs/api/management/v2)
- [Auth0 Community](https://community.auth0.com/)
