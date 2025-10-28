# Audit Logging System - Documentation

## Overview
Complete audit logging system using WordPress-style action hooks for tracking all CRUD operations and user authentication events.

### **Core System**
- ✅ WordPress-style action hook system (`utils/actionHooks.js`)
- ✅ Audit log schema simplified (`models/AuditLog.js`)
- ✅ Hook utility with non-blocking execution (`utils/auditHook.js`)
- ✅ Centralized hook registration (`hooks/index.js`)

### **All Modules with Audit Logging**

| Module | Model | Hook File | Status |
|--------|-------|-----------|--------|
| Customer | `models/Customer.js` | `hooks/customerHooks.js` | ✅ Complete |
| Site | `models/Site.js` | `hooks/siteHooks.js` | ✅ Complete |
| Building | `models/Building.js` | `hooks/buildingHooks.js` | ✅ Complete |
| Floor | `models/Floor.js` | `hooks/floorHooks.js` | ✅ Complete |
| Asset | `models/Asset.js` | `hooks/assetHooks.js` | ✅ Complete |
| Document | `models/Document.js` | `hooks/documentHooks.js` | ✅ Complete |
| Building Tenant | `models/BuildingTenant.js` | `hooks/buildingTenantHooks.js` | ✅ Complete |
| Tenant (Org) | `models/Tenant.js` | `hooks/tenantHooks.js` | ✅ Complete |
| User | `models/User.js` | `hooks/userHooks.js` | ✅ Complete |

### **Action Types**
- ✅ `create` - When record is created
- ✅ `read` - When record is viewed (optional)
- ✅ `update` - When record is updated
- ✅ `delete` - When record is deleted
- ✅ `auth` - When user logs in (only on actual login, not page refresh)

### **Login Logging Fixes**
- ✅ Login logs only for fresh tokens (< 60 seconds)
- ✅ Login logs only on GET requests (not CRUD operations)
- ✅ Duplicate prevention (same token tracked)
- ✅ No login logs on page refresh
- ✅ No login logs on create/update/delete operations

### **Features**
- ✅ Non-blocking execution (uses `setImmediate`)
- ✅ Automatic tenant isolation
- ✅ IP address and user agent tracking
- ✅ Full resource object in `detail` field for debugging
- ✅ Scalable hook system (WordPress-style)
- ✅ Centralized hook registration

### **Route Integration**
All routes properly set audit context:
- ✅ `$setAuditContext(req, 'create')` on create
- ✅ `$setAuditContext(req, 'update')` on update
- ✅ `$setAuditContext(req, 'delete')` on delete

### **Database Schema**
```javascript
{
  action: 'create' | 'read' | 'update' | 'delete' | 'auth',
  description: String,
  module: 'auth' | 'customer' | 'site' | 'building' | 'floor' | 
          'asset' | 'tenant' | 'building_tenant' | 'document' | 
          'user' | 'vendor',
  module_id: ObjectId,
  user: { id: ObjectId, name: String },
  ip: String,
  agent: String,
  detail: Object (optional),
  tenant_id: ObjectId,
  created_at: Date
}
```

### **API Endpoint**
- ✅ `GET /api/audit-logs` - List audit logs with filters
- ✅ Supports pagination (page, limit)
- ✅ Supports filtering (action, module, user_id, date range)
- ✅ Default sort: newest first (`created_at: -1`)
- ✅ User population included

## ✅ Cleanup Done
- ✅ Removed old hook registry system
- ✅ Removed duplicate login logging from sync-user endpoint
- ✅ Removed debug console logs
- ✅ Simplified action enum
- ✅ All modules have consistent implementation

## 🎯 Result
**Complete audit logging system** tracking all CRUD operations and login events across all modules, with proper duplicate prevention and non-blocking execution.

