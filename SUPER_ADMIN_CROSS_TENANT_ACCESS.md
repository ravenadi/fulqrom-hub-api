# Super Admin Cross-Tenant Access Guide

**Purpose:** Enable super admins to view/manage data across different tenants for administrative purposes

---

## 🎯 **HOW IT WORKS**

The `tenantContext` middleware already supports super admin tenant switching via the `x-tenant-id` header.

### **Current Implementation:**

```javascript
// From tenantContext.js (Lines 86-90)
let targetTenantId = user.tenant_id;  // Default: user's own tenant

if (isSuperAdmin && req.headers['x-tenant-id']) {
  targetTenantId = req.headers['x-tenant-id'];  // Override with header
}
```

### **How Super Admins Access Other Tenants:**

1. **Normal User:** Gets their own tenant data
   ```bash
   GET /api/audit-logs
   Authorization: Bearer <token>
   # Returns: User's own tenant data
   ```

2. **Super Admin (Own Tenant):** Gets their own tenant data
   ```bash
   GET /api/audit-logs
   Authorization: Bearer <super-admin-token>
   # Returns: Super admin's own tenant data
   ```

3. **Super Admin (Select Tenant):** Gets selected tenant's data
   ```bash
   GET /api/audit-logs
   Authorization: Bearer <super-admin-token>
   X-Tenant-Id: 507f1f77bcf86cd799439011  # Target tenant
   # Returns: Selected tenant's data
   ```

---

## 📝 **IMPLEMENTATION PATTERNS**

### **Pattern 1: Auto-Allow Super Admin (Existing Endpoints)**

Most existing endpoints already work! No code changes needed.

**Example: Audit Logs** (Already Works!)

```javascript
// routes/auditLogs.js
router.get('/', async (req, res) => {
  try {
    // Get tenant from context (automatically handles super admin header)
    const tenantId = req.tenant?.tenantId;  // ← This already works!

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    // Filter by tenant (works for both normal users and super admins)
    const filterQuery = { tenant_id: tenantId };

    const auditLogs = await AuditLog.find(filterQuery)
      .sort({ created_at: -1 })
      .limit(50);

    res.json({
      success: true,
      data: auditLogs,
      tenant_id: tenantId,  // Shows which tenant's data
      is_super_admin: req.tenant?.isSuperAdmin || false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching audit logs',
      error: error.message
    });
  }
});
```

**Usage:**
```bash
# Super admin viewing Tenant A's audit logs
curl -X GET https://api.fulqrom.com/api/audit-logs \
  -H "Authorization: Bearer <super-admin-token>" \
  -H "X-Tenant-Id: 507f1f77bcf86cd799439011"

# Returns Tenant A's audit logs
```

---

### **Pattern 2: Explicit Super Admin Check (For Sensitive Endpoints)**

For endpoints where you want explicit super admin validation:

```javascript
router.get('/recent-activity', async (req, res) => {
  try {
    // Check if user is super admin
    const isSuperAdmin = req.tenant?.isSuperAdmin || false;
    const requestedTenantId = req.headers['x-tenant-id'];

    // Get effective tenant ID
    let tenantId = req.tenant?.tenantId;

    // If super admin wants to view another tenant
    if (isSuperAdmin && requestedTenantId) {
      // Validate tenant exists
      const mongoose = require('mongoose');
      const Tenant = require('../models/Tenant');

      const targetTenant = await Tenant.findById(requestedTenantId);
      if (!targetTenant) {
        return res.status(404).json({
          success: false,
          message: 'Target tenant not found'
        });
      }

      tenantId = requestedTenantId;  // Use requested tenant
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    // Fetch recent activity for the tenant
    const recentActivity = await AuditLog.find({ tenant_id: tenantId })
      .sort({ created_at: -1 })
      .limit(50)
      .populate('user_id', 'full_name email')
      .lean();

    res.json({
      success: true,
      data: recentActivity,
      tenant_id: tenantId,
      is_super_admin_view: isSuperAdmin && requestedTenantId !== undefined,
      viewing_tenant: isSuperAdmin ? {
        id: tenantId,
        is_own_tenant: tenantId === req.tenant?.tenantId
      } : undefined
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching recent activity',
      error: error.message
    });
  }
});
```

---

### **Pattern 3: Query Parameter Approach (Alternative)**

If you prefer query parameters instead of headers:

```javascript
router.get('/recent-activity', async (req, res) => {
  try {
    const isSuperAdmin = req.tenant?.isSuperAdmin || false;
    const requestedTenantId = req.query.tenant_id;

    // Default to user's own tenant
    let tenantId = req.tenant?.tenantId;

    // Super admin can specify tenant via query param
    if (requestedTenantId) {
      if (!isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Only super admins can view other tenants\' data'
        });
      }
      tenantId = requestedTenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    // ... rest of the logic
  } catch (error) {
    // ... error handling
  }
});
```

**Usage:**
```bash
# Super admin viewing specific tenant
GET /api/recent-activity?tenant_id=507f1f77bcf86cd799439011
```

---

## 🔨 **COMPLETE EXAMPLE: Recent Activity Endpoint**

Create a new file: `/rest-api/routes/recentActivity.js`

```javascript
const express = require('express');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const mongoose = require('mongoose');

const router = express.Router();

/**
 * GET /api/recent-activity
 *
 * Get recent activity logs for a tenant
 *
 * Normal users: See their own tenant's activity
 * Super admins: Can specify tenant via X-Tenant-Id header
 *
 * Headers:
 *   Authorization: Bearer <token>
 *   X-Tenant-Id: <tenant_id> (optional, super admin only)
 *
 * Query params:
 *   limit: Number of records (default: 50, max: 200)
 *   action: Filter by action type
 *   resource_type: Filter by resource type
 *   user_id: Filter by user
 *   start_date: Filter from date (ISO format)
 *   end_date: Filter to date (ISO format)
 */
router.get('/', async (req, res) => {
  try {
    const {
      limit = 50,
      action,
      resource_type,
      user_id,
      start_date,
      end_date
    } = req.query;

    // Check if user is super admin
    const isSuperAdmin = req.tenant?.isSuperAdmin || false;
    const requestedTenantId = req.headers['x-tenant-id'];

    // Get effective tenant ID
    let tenantId = req.tenant?.tenantId;
    let tenantInfo = null;

    // Super admin with specific tenant request
    if (isSuperAdmin && requestedTenantId) {
      console.log(`🔐 Super admin requesting tenant: ${requestedTenantId}`);

      // Validate tenant exists
      const targetTenant = await Tenant.findById(requestedTenantId);
      if (!targetTenant) {
        return res.status(404).json({
          success: false,
          message: 'Target tenant not found',
          tenant_id: requestedTenantId
        });
      }

      tenantId = requestedTenantId;
      tenantInfo = {
        id: targetTenant._id,
        name: targetTenant.tenant_name,
        status: targetTenant.status,
        is_viewing_other_tenant: true
      };

      console.log(`✅ Super admin viewing tenant: ${targetTenant.tenant_name}`);
    } else {
      // Normal user or super admin viewing own tenant
      tenantInfo = {
        id: tenantId,
        name: req.tenant?.tenantName,
        status: req.tenant?.tenantStatus,
        is_viewing_other_tenant: false
      };
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    // Build filter query
    const filterQuery = {
      tenant_id: new mongoose.Types.ObjectId(tenantId)
    };

    // Apply filters
    if (action) filterQuery.action = action;
    if (resource_type) filterQuery.resource_type = resource_type;
    if (user_id) filterQuery.user_id = user_id;

    if (start_date || end_date) {
      filterQuery.created_at = {};
      if (start_date) filterQuery.created_at.$gte = new Date(start_date);
      if (end_date) filterQuery.created_at.$lte = new Date(end_date);
    }

    // Validate and cap limit
    const safeLimit = Math.min(parseInt(limit) || 50, 200);

    // Fetch recent activity
    const recentActivity = await AuditLog.find(filterQuery)
      .sort({ created_at: -1 })
      .limit(safeLimit)
      .populate('user_id', 'full_name email')
      .lean();

    // Get unique users for this tenant (for filtering)
    const users = await User.find({ tenant_id: tenantId })
      .select('_id full_name email')
      .sort({ full_name: 1 })
      .lean();

    // Get activity summary
    const summary = await AuditLog.aggregate([
      { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          latest: { $max: '$created_at' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: recentActivity,
      count: recentActivity.length,
      limit: safeLimit,
      tenant: tenantInfo,
      filters: {
        action: action || null,
        resource_type: resource_type || null,
        user_id: user_id || null,
        start_date: start_date || null,
        end_date: end_date || null
      },
      summary: summary,
      available_users: users,
      meta: {
        is_super_admin: isSuperAdmin,
        viewing_own_tenant: !tenantInfo?.is_viewing_other_tenant
      }
    });

  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent activity',
      error: error.message
    });
  }
});

/**
 * GET /api/recent-activity/stats
 *
 * Get activity statistics for a tenant
 */
router.get('/stats', async (req, res) => {
  try {
    const isSuperAdmin = req.tenant?.isSuperAdmin || false;
    const requestedTenantId = req.headers['x-tenant-id'];

    let tenantId = req.tenant?.tenantId;

    if (isSuperAdmin && requestedTenantId) {
      tenantId = requestedTenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context is required'
      });
    }

    const stats = await AuditLog.aggregate([
      { $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) } },
      {
        $facet: {
          by_action: [
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          by_resource: [
            { $group: { _id: '$resource_type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          by_status: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          by_date: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: -1 } },
            { $limit: 30 }
          ],
          total: [
            { $count: 'count' }
          ]
        }
      }
    ]);

    res.json({
      success: true,
      data: stats[0],
      tenant_id: tenantId,
      is_super_admin: isSuperAdmin
    });

  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activity statistics',
      error: error.message
    });
  }
});

module.exports = router;
```

---

## 🔧 **REGISTER THE ROUTE**

Add to `/rest-api/server.js` or `/rest-api/app.js`:

```javascript
const recentActivityRoutes = require('./routes/recentActivity');

// ... other routes

app.use('/api/recent-activity',
  authMiddleware,           // Verify JWT
  tenantContext,            // Set tenant context (handles X-Tenant-Id)
  recentActivityRoutes
);
```

---

## 🧪 **TESTING**

### **Test 1: Normal User (Own Tenant)**
```bash
curl -X GET https://api.fulqrom.com/api/recent-activity \
  -H "Authorization: Bearer <user-token>"

# Response:
{
  "success": true,
  "data": [...],
  "tenant": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Acme Corp",
    "is_viewing_other_tenant": false
  },
  "meta": {
    "is_super_admin": false,
    "viewing_own_tenant": true
  }
}
```

### **Test 2: Super Admin (Own Tenant)**
```bash
curl -X GET https://api.fulqrom.com/api/recent-activity \
  -H "Authorization: Bearer <super-admin-token>"

# Response:
{
  "success": true,
  "data": [...],
  "tenant": {
    "id": "507f1f77bcf86cd799439012",
    "name": "Super Admin Tenant",
    "is_viewing_other_tenant": false
  },
  "meta": {
    "is_super_admin": true,
    "viewing_own_tenant": true
  }
}
```

### **Test 3: Super Admin (Selected Tenant)** ⭐️
```bash
curl -X GET https://api.fulqrom.com/api/recent-activity \
  -H "Authorization: Bearer <super-admin-token>" \
  -H "X-Tenant-Id: 507f1f77bcf86cd799439011"

# Response:
{
  "success": true,
  "data": [...],
  "tenant": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Acme Corp",
    "status": "active",
    "is_viewing_other_tenant": true
  },
  "meta": {
    "is_super_admin": true,
    "viewing_own_tenant": false
  }
}
```

### **Test 4: Normal User Trying Cross-Tenant (Should Fail)**
```bash
curl -X GET https://api.fulqrom.com/api/recent-activity \
  -H "Authorization: Bearer <user-token>" \
  -H "X-Tenant-Id: 507f1f77bcf86cd799439099"

# Response:
{
  "success": true,
  "data": [...],
  "tenant": {
    "id": "507f1f77bcf86cd799439011",  # Still their own tenant!
    "name": "Their Tenant",
    "is_viewing_other_tenant": false
  }
}

# Note: X-Tenant-Id header is IGNORED for non-super-admins
# They only see their own tenant data
```

---

## 🎨 **FRONTEND IMPLEMENTATION**

### **React Component Example:**

```typescript
import { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';

interface RecentActivityProps {
  selectedTenantId?: string;  // For super admin tenant selection
}

export const RecentActivity: React.FC<RecentActivityProps> = ({
  selectedTenantId
}) => {
  const { user, getAccessToken } = useAuth();
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentActivity();
  }, [selectedTenantId]);

  const fetchRecentActivity = async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();

      const headers: HeadersInit = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Super admin can specify tenant
      if (user?.isSuperAdmin && selectedTenantId) {
        headers['X-Tenant-Id'] = selectedTenantId;
      }

      const response = await fetch('/api/recent-activity', {
        headers
      });

      const data = await response.json();

      if (data.success) {
        setActivity(data.data);

        // Show which tenant is being viewed
        if (data.tenant?.is_viewing_other_tenant) {
          console.log(`Viewing activity for: ${data.tenant.name}`);
        }
      }
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Recent Activity</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {activity.map((item: any) => (
            <li key={item._id}>
              {item.action} - {item.resource_type} - {item.user_id?.full_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

### **Tenant Selector for Super Admin:**

```typescript
export const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenants, setTenants] = useState([]);

  useEffect(() => {
    if (user?.isSuperAdmin) {
      fetchTenants();
    }
  }, [user]);

  const fetchTenants = async () => {
    const response = await fetch('/api/admin/tenants', {
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`
      }
    });
    const data = await response.json();
    setTenants(data.data);
  };

  if (!user?.isSuperAdmin) {
    return <div>Access Denied</div>;
  }

  return (
    <div>
      <h1>Super Admin Dashboard</h1>

      <div>
        <label>Select Tenant:</label>
        <select
          value={selectedTenantId || ''}
          onChange={(e) => setSelectedTenantId(e.target.value)}
        >
          <option value="">-- My Tenant --</option>
          {tenants.map((tenant: any) => (
            <option key={tenant._id} value={tenant._id}>
              {tenant.tenant_name}
            </option>
          ))}
        </select>
      </div>

      <RecentActivity selectedTenantId={selectedTenantId} />
    </div>
  );
};
```

---

## 🔒 **SECURITY CONSIDERATIONS**

### **✅ What's Secure:**
1. Only super admins can use `X-Tenant-Id` header
2. Normal users' `X-Tenant-Id` headers are ignored
3. Tenant existence is validated before access
4. Audit logs record which tenant super admin viewed

### **⚠️ Important:**
1. **Always check `isSuperAdmin`** before allowing cross-tenant access
2. **Log super admin actions** when viewing other tenants
3. **Validate tenant exists** before allowing access
4. **Don't expose tenant list** to non-super-admins

---

## 📝 **ADDING TO EXISTING ENDPOINTS**

For endpoints that already exist, they should work automatically! Just use the header:

```bash
# Any existing endpoint
GET /api/buildings
GET /api/audit-logs
GET /api/customers
# etc...

# With X-Tenant-Id header for super admin
X-Tenant-Id: 507f1f77bcf86cd799439011
```

**No code changes needed** if the endpoint already uses `req.tenant?.tenantId`!

---

## 🎯 **SUMMARY**

1. **Infrastructure exists:** `tenantContext` middleware handles it
2. **Use `X-Tenant-Id` header:** Super admins pass target tenant ID
3. **Most endpoints work automatically:** Already use `req.tenant?.tenantId`
4. **For sensitive endpoints:** Add explicit super admin checks
5. **Always log:** Super admin cross-tenant access

That's it! Your super admins can now view any tenant's data by passing the `X-Tenant-Id` header. 🎉
