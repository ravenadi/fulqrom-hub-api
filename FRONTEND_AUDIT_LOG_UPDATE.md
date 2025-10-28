# Frontend Update Guide: Simplified Audit Log Schema

## Overview

The audit log API has been updated with a simplified schema. The frontend needs to be updated to match the new structure.

## Changes Summary

### Old Schema (Deprecated)
```javascript
{
  action: 'login' | 'logout' | 'status_changed' | 'create' | 'update' | 'delete',
  user_id: ObjectId,
  user_email: String,
  user_name: String,
  resource_type: String,
  resource_id: ObjectId,
  resource_name: String,
  status: String,
  ip_address: String,
  user_agent: String
}
```

### New Schema (Current)
```javascript
{
  action: 'create' | 'read' | 'update' | 'delete' | 'auth',
  description: String,
  module: 'auth' | 'customer' | 'site' | 'building' | 'floor' | 'asset' | 'tenant' | 'document' | 'user' | 'vendor',
  module_id: ObjectId,
  user: {
    id: ObjectId,
    name: String
  },
  ip: String,
  agent: String,
  detail: Object,  // Full resource object (optional)
  tenant_id: ObjectId,
  created_at: Date
}
```

## Action Type Changes

| Old Action | New Action | Notes |
|-----------|-----------|-------|
| `login` | `auth` | All authentication events |
| `logout` | `auth` | All authentication events |
| `status_changed` | `update` | Status changes are now tracked as updates |
| `create` | `create` | No change |
| `update` | `update` | No change |
| `delete` | `delete` | No change |
| N/A | `read` | New action for viewing operations |

## API Endpoint Changes

### GET /api/audit-logs

**Query Parameters:**
- `action`: Now accepts `create`, `read`, `update`, `delete`, `auth` (removed: `login`, `logout`, `status_changed`)
- `resource_type`: Now maps to `module` field (values: `auth`, `customer`, `site`, `building`, `floor`, `asset`, `tenant`, `document`, `user`, `vendor`)
- Removed: `status` filter (no longer exists in schema)
- `user_id`: Still supported (now filters by `user.id`)

**Response Structure:**
```javascript
{
  success: true,
  count: 10,
  total: 100,
  page: 1,
  pages: 10,
  data: [
    {
      _id: "...",
      action: "auth",           // Changed from "login"
      description: "ana logged in",  // New field
      module: "auth",           // Changed from "resource_type"
      module_id: null,          // Changed from "resource_id"
      user: {                   // Changed from user_id, user_name, user_email
        id: ObjectId("..."),
        name: "ana"
      },
      ip: "127.0.0.1",         // Changed from "ip_address"
      agent: "Mozilla/5.0...",  // Changed from "user_agent"
      detail: { ... },          // Full resource object (optional)
      tenant_id: ObjectId("..."),
      created_at: "2025-01-25T10:00:00Z"
    }
  ]
}
```

## Frontend Code Updates Required

### 1. Update Action Filters

**Old Code:**
```javascript
const actions = ['login', 'logout', 'create', 'update', 'delete', 'status_changed'];
```

**New Code:**
```javascript
const actions = ['create', 'read', 'update', 'delete', 'auth'];
```

### 2. Update Action Display Labels

**Old Code:**
```javascript
const actionLabels = {
  login: 'Login',
  logout: 'Logout',
  status_changed: 'Status Changed',
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted'
};
```

**New Code:**
```javascript
const actionLabels = {
  create: 'Created',
  read: 'Viewed',
  update: 'Updated',
  delete: 'Deleted',
  auth: 'Authentication'
};
```

### 3. Update Audit Log Display Component

**Old Code:**
```vue
<template>
  <div>
    <p>Action: {{ log.action }}</p>
    <p>User: {{ log.user_name }} ({{ log.user_email }})</p>
    <p>Resource: {{ log.resource_type }} - {{ log.resource_name }}</p>
    <p>IP: {{ log.ip_address }}</p>
    <p>Time: {{ log.created_at }}</p>
  </div>
</template>
```

**New Code:**
```vue
<template>
  <div>
    <p>Action: {{ getActionLabel(log.action) }}</p>
    <p>Description: {{ log.description }}</p>
    <p>User: {{ log.user.name }}</p>
    <p>Module: {{ log.module }}</p>
    <p>IP: {{ log.ip }}</p>
    <p>Time: {{ log.created_at }}</p>
  </div>
</template>

<script>
export default {
  methods: {
    getActionLabel(action) {
      const labels = {
        create: 'Created',
        read: 'Viewed',
        update: 'Updated',
        delete: 'Deleted',
        auth: 'Authentication'
      };
      return labels[action] || action;
    }
  }
};
</script>
```

### 4. Update Filter Components

**Old Code:**
```javascript
// Filter by action
const filteredLogs = auditLogs.filter(log => 
  selectedActions.includes(log.action)
);

// Filter by resource type
const filteredLogs = auditLogs.filter(log => 
  log.resource_type === selectedResourceType
);
```

**New Code:**
```javascript
// Filter by action
const filteredLogs = auditLogs.filter(log => 
  selectedActions.includes(log.action)
);

// Filter by module (previously resource_type)
const filteredLogs = auditLogs.filter(log => 
  log.module === selectedModule
);
```

### 5. Update Stats/Analytics Display

**Old Code:**
```javascript
// Old aggregation
const stats = {
  by_resource: [{ _id: 'customer', count: 10 }],
  by_status: [{ _id: 'active', count: 5 }]
};
```

**New Code:**
```javascript
// New aggregation
const stats = {
  by_module: [{ _id: 'customer', count: 10 }]  // Changed from by_resource
  // by_status removed - no longer exists
};
```

### 6. Update TypeScript/PropTypes

**Old TypeScript Interface:**
```typescript
interface AuditLog {
  action: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'status_changed';
  user_id: string;
  user_email: string;
  user_name: string;
  resource_type: string;
  resource_id?: string;
  resource_name?: string;
  status?: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
}
```

**New TypeScript Interface:**
```typescript
interface AuditLog {
  _id: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'auth';
  description: string;
  module: 'auth' | 'customer' | 'site' | 'building' | 'floor' | 'asset' | 'tenant' | 'document' | 'user' | 'vendor';
  module_id?: string;
  user: {
    id: string;
    name: string;
  };
  ip: string;
  agent: string;
  detail?: any;
  tenant_id: string;
  created_at: string;
}
```

## Migration Checklist

- [ ] Update action enum/constants to: `create`, `read`, `update`, `delete`, `auth`
- [ ] Remove `status_changed`, `login`, `logout` from action filters
- [ ] Update action display labels
- [ ] Change `resource_type` to `module` in all components
- [ ] Update user display: `log.user.name` instead of `log.user_name`
- [ ] Update IP field: `log.ip` instead of `log.ip_address`
- [ ] Update agent field: `log.agent` instead of `log.user_agent`
- [ ] Update TypeScript/Type definitions
- [ ] Update API service calls if needed
- [ ] Update filter components
- [ ] Update stats/analytics components
- [ ] Update any unit tests
- [ ] Test all audit log views/filters

## Testing

After updating the frontend:

1. **Test Audit Log List:**
   - Verify all actions display correctly
   - Check user names are shown
   - Verify descriptions are readable
   - Test filtering by action and module

2. **Test Filters:**
   - Filter by action (create, read, update, delete, auth)
   - Filter by module (customer, site, building, etc.)
   - Filter by date range
   - Filter by user

3. **Test Stats:**
   - Verify stats display correctly
   - Check module breakdowns
   - Verify action breakdowns

## Example API Response

```json
{
  "success": true,
  "count": 2,
  "total": 50,
  "page": 1,
  "pages": 25,
  "data": [
    {
      "_id": "65a1b2c3d4e5f6789abcdef0",
      "action": "auth",
      "description": "ana logged in",
      "module": "auth",
      "module_id": null,
      "user": {
        "id": "68f9304d3bc4157210757bb1",
        "name": "ana"
      },
      "ip": "127.0.0.1",
      "agent": "Mozilla/5.0...",
      "tenant_id": "68f8698dd323fdb068d06ba9",
      "created_at": "2025-01-25T10:30:00.000Z"
    },
    {
      "_id": "65a1b2c3d4e5f6789abcdef1",
      "action": "create",
      "description": "Test Customer created",
      "module": "customer",
      "module_id": "65a1b2c3d4e5f6789abcdef2",
      "user": {
        "id": "68f9304d3bc4157210757bb1",
        "name": "ana"
      },
      "ip": "127.0.0.1",
      "agent": "Mozilla/5.0...",
      "detail": {
        "organisation": { "organisation_name": "Test Customer" }
      },
      "tenant_id": "68f8698dd323fdb068d06ba9",
      "created_at": "2025-01-25T10:31:00.000Z"
    }
  ]
}
```

## Need Help?

If you encounter issues during the frontend update:
1. Check the API response structure in browser DevTools
2. Verify the action enum matches the backend
3. Ensure all field names are updated consistently
4. Test with the `/api/audit-logs` endpoint directly

