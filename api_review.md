# Fulqrom Hub REST API - Security & Architecture Review

**Review Date:** 2025-10-23
**Focus Areas:** Tenant Isolation, Security, Duplicates, Conflicts, Best Practices

---

## 🔒 **1. TENANT ISOLATION REVIEW**

### ✅ **Properly Isolated Endpoints** (Tenant-scoped by default)

These endpoints correctly filter by `tenant_id` automatically:

- **Analytics**
  - `GET /analytics/dashboard` ✅ (tenant-scoped)
  - `GET /analytics/reports` ✅ (tenant-scoped)
  - `GET /analytics/kpis` ✅ (tenant-scoped)

- **Assets**
  - `GET /assets` ✅ (tenant-scoped)
  - `GET /assets/:id` ✅ (tenant-scoped)
  - `POST /assets` ✅ (auto-assigns tenant_id)
  - `PUT /assets/:id` ✅ (validates tenant ownership)
  - `DELETE /assets/:id` ✅ (validates tenant ownership)

- **Buildings**
  - `GET /buildings` ✅ (tenant-scoped)
  - `GET /buildings/:id` ✅ (tenant-scoped)
  - `POST /buildings` ✅ (auto-assigns tenant_id)
  - `PUT /buildings/:id` ✅ (validates tenant ownership)
  - `DELETE /buildings/:id` ✅ (validates tenant ownership)

- **Customers**
  - `GET /customers` ✅ (tenant-scoped)
  - `GET /customers/:id` ✅ (tenant-scoped)
  - `POST /customers` ✅ (auto-assigns tenant_id)
  - `PUT /customers/:id` ✅ (validates tenant ownership)
  - `DELETE /customers/:id` ✅ (validates tenant ownership)

- **Floors**
  - `GET /floors` ✅ (tenant-scoped)
  - `GET /floors/:id` ✅ (tenant-scoped)
  - `POST /floors` ✅ (auto-assigns tenant_id)
  - `PUT /floors/:id` ✅ (validates tenant ownership)
  - `DELETE /floors/:id` ✅ (validates tenant ownership)

- **Sites**
  - `GET /sites` ✅ (tenant-scoped)
  - `GET /sites/:id` ✅ (tenant-scoped)
  - `POST /sites` ✅ (auto-assigns tenant_id)
  - `PUT /sites/:id` ✅ (validates tenant ownership)
  - `DELETE /sites/:id` ✅ (validates tenant ownership)

- **Building Tenants**
  - `GET /tenants` ✅ (tenant-scoped)
  - `GET /tenants/:id` ✅ (tenant-scoped)
  - `POST /tenants` ✅ (auto-assigns tenant_id)
  - `PUT /tenants/:id` ✅ (validates tenant ownership)
  - `DELETE /tenants/:id` ✅ (validates tenant ownership)

- **Vendors**
  - `GET /vendors` ✅ (tenant-scoped)
  - `GET /vendors/:id` ✅ (tenant-scoped)
  - `POST /vendors` ✅ (auto-assigns tenant_id)
  - `PUT /vendors/:id` ✅ (validates tenant ownership)
  - `DELETE /vendors/:id` ✅ (validates tenant ownership)

- **Documents**
  - `GET /documents` ✅ (tenant-scoped)
  - `GET /documents/:id` ✅ (tenant-scoped)
  - `POST /documents` ✅ (auto-assigns tenant_id)
  - `PUT /documents/:id` ✅ (validates tenant ownership)
  - `DELETE /documents/:id` ✅ (validates tenant ownership)

- **Users**
  - `GET /users` ✅ (tenant-scoped)
  - `GET /users/:id` ✅ (tenant-scoped)
  - `POST /users` ✅ (auto-assigns tenant_id)
  - `PUT /users/:id` ✅ (validates tenant ownership)
  - `DELETE /users/:id` ✅ (validates tenant ownership)

- **Notifications**
  - `GET /notifications` ✅ (user-scoped + tenant-scoped)
  - `PUT /notifications/:id/read` ✅ (user-scoped)
  - `DELETE /notifications/:id` ✅ (user-scoped)

- **Audit Logs**
  - `GET /audit-logs` ✅ (tenant-scoped - documented in latest update)
  - `POST /audit-logs` ✅ (auto-assigns tenant_id)

### ⚠️ **SECURITY CONCERNS - Endpoints That Need Review**

#### **HIGH PRIORITY - Potential Tenant Data Leakage**

1. **`GET /sites` with `tenant_id` parameter**
   ```
   Line 471: "tenant_id": "string (optional, super admin only)"
   ```
   - ⚠️ **RISK:** If not properly enforced, regular users could pass `tenant_id` to access other tenants
   - ✅ **FIX:** Ensure middleware blocks non-super-admin users from using this parameter
   - 🔧 **RECOMMENDATION:** Remove parameter for non-admin users, or validate user.is_super_admin

2. **`GET /dropdowns/entities/*` endpoints**
   ```
   Lines 797-903: Customer, Site, Building, Floor, Asset, Tenant, Vendor dropdowns
   ```
   - ⚠️ **RISK:** Dropdown endpoints might return cross-tenant data if not filtered
   - ✅ **FIX:** All dropdown queries MUST include `tenant_id` filter
   - 🔧 **RECOMMENDATION:** Add explicit tenant isolation documentation

3. **`GET /hierarchy/:customer_id`**
   ```
   Lines 911-959: Hierarchy endpoints
   ```
   - ⚠️ **RISK:** Could expose customer data from other tenants
   - ✅ **FIX:** Validate `customer_id` belongs to current user's tenant
   - 🔧 **RECOMMENDATION:** Add tenant validation middleware

4. **`POST /organizations/register` (Public endpoint)**
   ```
   Line 418: "Register new organization (public endpoint)"
   ```
   - ✅ **OK:** This should be public for tenant registration
   - 🔧 **RECOMMENDATION:** Add rate limiting and CAPTCHA to prevent abuse

5. **`GET /organizations/current`**
   ```
   Line 432: "Get current user's organization"
   ```
   - ✅ **OK:** Returns only current user's org
   - ✅ **SECURE:** Properly scoped

---

## 🔄 **2. DUPLICATE & REDUNDANT ENDPOINTS**

### **Duplicate Functionality**

1. **User Creation Endpoints (2 variations)**
   ```
   POST /users                           (Line 560)
   POST /admin/tenants/:tenant/users     (Line 1668)
   POST /admin/users                     (Line 1747)
   ```
   - 📋 **ISSUE:** Three different endpoints for creating users
   - 🔧 **RECOMMENDATION:**
     - Keep `POST /users` for regular user creation within tenant
     - Keep `POST /admin/tenants/:tenant/users` for super admin creating users in specific tenant
     - **REMOVE** `POST /admin/users` (redundant with tenant-specific endpoint)

2. **Audit Log Creation (2 locations)**
   ```
   POST /users/audit-logs                (Line 637 - OLD)
   POST /audit-logs                      (Line 660 - NEW)
   ```
   - 📋 **ISSUE:** Audit logs nested under users endpoint doesn't make sense
   - 🔧 **RECOMMENDATION:**
     - **REMOVE** `/users/audit-logs`
     - Use `/audit-logs` as primary endpoint

3. **Role Management (2 versions)**
   ```
   /roles/*              (Lines 1395-1454 - LEGACY)
   /v2/roles/*           (Lines 1457-1501 - NEW)
   ```
   - 📋 **ISSUE:** Legacy endpoints still documented
   - 🔧 **RECOMMENDATION:**
     - Add deprecation warnings to legacy endpoints
     - Set sunset date for `/roles/*` endpoints
     - Document migration path in API docs

4. **Statistics Endpoints (Multiple patterns)**
   ```
   GET /assets/summary/stats             (Line 153)
   GET /buildings/summary/stats          (Line 224)
   GET /floors/summary/stats             (Line 397)
   GET /tenants/summary/stats            (Line 1118)
   GET /documents/summary/stats          (Line 1369)
   GET /vendors/stats                    (Line 1167) ⚠️ Different pattern
   ```
   - 📋 **ISSUE:** Inconsistent URL patterns (`/summary/stats` vs `/stats`)
   - 🔧 **RECOMMENDATION:** Standardize to `/summary/stats` across all modules

5. **Primary Contact Endpoints (2 locations)**
   ```
   GET /customers/:id/contacts/primary                      (Line 275)
   GET /customers/:customerId/contacts/primary              (Line 656)
   ```
   - 📋 **ISSUE:** Same endpoint listed twice with different parameter names
   - 🔧 **RECOMMENDATION:** Remove duplicate, standardize on `:customerId`

---

## ⚡ **3. ROUTING CONFLICTS & AMBIGUITIES**

### **Path Parameter Conflicts**

1. **Roles Endpoints - Name vs ID Collision**
   ```
   GET /v2/roles/:id                     (Line 1473)
   GET /v2/roles/name/:name              (Line 1484)
   ```
   - ⚠️ **CONFLICT:** If someone creates role with id "name", routing breaks
   - 🔧 **RECOMMENDATION:** Use query parameter instead:
     ```
     GET /v2/roles?name=Admin
     GET /v2/roles/:id
     ```

2. **Summary/Stats vs ID Collision**
   ```
   GET /assets/summary/stats             (Line 153)
   GET /assets/:id                       (Line 88)
   ```
   - ⚠️ **CONFLICT:** If asset has ID "summary", collision occurs
   - 🔧 **RECOMMENDATION:** Prefix with underscore or use separate route:
     ```
     GET /assets/_stats
     GET /assets/:id
     ```

3. **By-Category vs By-Building Pattern**
   ```
   GET /assets/by-building/:buildingId   (Line 132)
   GET /assets/by-category               (Line 142)
   ```
   - ⚠️ **CONFLICT:** If building ID is "by-category", collision occurs
   - 🔧 **RECOMMENDATION:** Use query parameters:
     ```
     GET /assets?building_id=:id
     GET /assets?group_by=category
     ```

4. **Admin Endpoints - Resource Type Ambiguity**
   ```
   GET /admin/tenants/:tenant            (Line 1549)
   GET /admin/users/:user                (Line 1738)
   GET /admin/roles/:role                (Line 1820)
   GET /admin/plans/:plan                (Line 1891)
   ```
   - ⚠️ **AMBIGUITY:** Parameter names don't indicate if UUID, slug, or name
   - 🔧 **RECOMMENDATION:** Document what type of identifier is expected
     ```
     GET /admin/tenants/:tenantId         (UUID)
     GET /admin/tenants/slug/:slug        (Slug)
     ```

---

## 🚫 **4. BAD PRACTICES & ANTI-PATTERNS**

### **HTTP Method Misuse**

1. **PATCH for Status Updates**
   ```
   PATCH /vendors/:id/status                    (Line 1225)
   PATCH /admin/tenants/:tenant/status          (Line 1617)
   PATCH /admin/subscription/:id/status         (Line 1971)
   ```
   - ✅ **GOOD:** PATCH is correct for partial updates
   - 🔧 **RECOMMENDATION:** Be consistent - use PATCH for all status updates

2. **PUT for Marking as Read**
   ```
   PUT /notifications/:id/read                  (Line 985)
   PUT /notifications/mark-read                 (Line 995)
   PUT /notifications/mark-all-read             (Line 1005)
   ```
   - ⚠️ **INCONSISTENT:** Should use PATCH for partial updates
   - 🔧 **RECOMMENDATION:** Change to PATCH or POST

3. **PATCH for Setting Primary Contact**
   ```
   PATCH /customers/:customerId/contacts/:id/primary (Line 729)
   ```
   - ✅ **GOOD:** Correct use of PATCH

### **Nested Resource Anti-Patterns**

1. **Overly Deep Nesting**
   ```
   POST /customers/:customerId/contacts/:id/methods                (Line 751)
   PUT /customers/:customerId/contacts/:id/methods/:methodId       (Line 767)
   DELETE /customers/:customerId/contacts/:id/methods/:methodId    (Line 779)
   ```
   - ⚠️ **TOO DEEP:** 4-level nesting is hard to maintain
   - 🔧 **RECOMMENDATION:** Flatten to:
     ```
     POST /contact-methods
     PUT /contact-methods/:methodId
     DELETE /contact-methods/:methodId
     ```
     (Include `contact_id` in request body)

2. **Inconsistent Nesting**
   ```
   GET /assets/by-building/:buildingId          (Line 132)
   GET /floors/by-building/:buildingId          (Line 386)
   GET /tenants/by-building/:buildingId         (Line 1108)
   ```
   - 📋 **ISSUE:** Some use `/by-building`, others use query params
   - 🔧 **RECOMMENDATION:** Standardize on query parameters:
     ```
     GET /assets?building_id=:id
     GET /floors?building_id=:id
     GET /tenants?building_id=:id
     ```

### **Naming Inconsistencies**

1. **Organization vs Organisation**
   ```
   /organizations/*                             (Line 412)
   organisation_name (in body)                  (Line 421)
   ```
   - ⚠️ **INCONSISTENT:** Mixed American/Australian spelling
   - 🔧 **RECOMMENDATION:** Choose one spelling:
     - **URLs:** Use American spelling (`organizations`)
     - **Data fields:** Use Australian spelling (`organisation_name`)

2. **Tenant Terminology Confusion**
   ```
   /tenants/*           → Building tenants (occupants)
   /admin/tenants/*     → SaaS platform tenants
   tenant_id            → SaaS platform tenant
   building_tenant_id   → Building occupant
   ```
   - ⚠️ **CONFUSING:** "tenant" has two meanings
   - 🔧 **RECOMMENDATION:** Rename building tenants to "occupants":
     ```
     /occupants/*
     /admin/tenants/* (keeps SaaS tenant meaning)
     ```

3. **Contractor vs Vendor**
   ```
   POST /vendors
   Body: { "contractor_name", "contractor_type" }
   ```
   - ⚠️ **INCONSISTENT:** Endpoint says "vendor", fields say "contractor"
   - 🔧 **RECOMMENDATION:** Standardize on "vendor":
     ```
     { "vendor_name", "vendor_type" }
     ```

---

## 📊 **5. MISSING TENANT ISOLATION MIDDLEWARE**

### **Endpoints That Need Explicit Documentation**

1. **Dropdowns** - Must document tenant filtering
   ```json
   {
     "method": "GET",
     "path": "/dropdowns/entities/customers",
     "security": "✅ Auto-filtered by tenant_id"
   }
   ```

2. **Hierarchy** - Must validate customer ownership
   ```json
   {
     "method": "GET",
     "path": "/hierarchy/:customer_id",
     "security": "⚠️ Must validate customer belongs to current tenant"
   }
   ```

3. **Contacts** - Must validate customer ownership
   ```json
   {
     "method": "GET",
     "path": "/customers/:customerId/contacts",
     "security": "⚠️ Must validate customerId belongs to current tenant"
   }
   ```

---

## 🛡️ **6. SECURITY BEST PRACTICES REVIEW**

### ✅ **Good Practices Currently Implemented**

1. **Auth0 JWT Authentication** ✅
2. **Role-based permissions** ✅
4. **Audit logging** ✅
5. **Presigned URLs for S3** ✅
6. **Tenant isolation middleware** ✅

### ⚠️ **Security Gaps**

1. **Rate Limiting**
   ```
   Line 2091: "Not explicitly configured"
   ```
   - 🔧 **CRITICAL:** Implement rate limiting for:
     - Public endpoints (`/organizations/register`)
     - Auth endpoints (`/auth/sync-user`)
     - File upload endpoints (`/documents/:id/upload`)

2. **File Upload Validation**
   ```
   POST /documents/:id/upload
   "max_file_size": "10GB"
   ```
   - ⚠️ **RISK:** 10GB is very large
   - 🔧 **RECOMMENDATION:**
     - Add file type validation
     - Add virus scanning
     - Consider smaller default limit (e.g., 100MB)
     - Allow larger files only for specific document types

3. **No Input Sanitization Documentation**
   - 🔧 **RECOMMENDATION:** Document XSS prevention strategy

4. **No CORS Configuration**
   - 🔧 **RECOMMENDATION:** Document allowed origins

5. **Password Requirements Not Documented**
   ```
   POST /organizations/register
   "password": "string (required)"
   ```
   - 🔧 **RECOMMENDATION:** Document password requirements:
     - Minimum length
     - Complexity requirements
     - Password strength meter

---

## 📈 **7. PERFORMANCE & SCALABILITY CONCERNS**

### **Pagination Issues**

1. **Inconsistent Default Page Sizes**
   ```
   Most endpoints: limit: 20
   Admin endpoints: limit: 15
   Audit logs: limit: 50
   Customers: limit: 50
   ```
   - 🔧 **RECOMMENDATION:** Standardize to 20 across all endpoints

2. **No Cursor-based Pagination**
   - 🔧 **RECOMMENDATION:** For large datasets, implement cursor-based pagination:
     ```
     GET /audit-logs?cursor=abc123&limit=50
     ```

3. **Large Default Limits Risk**
   ```
   GET /customers?limit=50
   ```
   - ⚠️ **RISK:** 50 items with full customer data could be heavy
   - 🔧 **RECOMMENDATION:** Reduce to 20 or add lightweight list endpoint

### **N+1 Query Risks**

1. **Hierarchy Endpoints**
   ```
   GET /hierarchy/:customer_id
   Returns: sites → buildings → floors → assets
   ```
   - ⚠️ **RISK:** Could trigger hundreds of queries
   - 🔧 **RECOMMENDATION:** Use aggregation pipeline or eager loading

2. **Statistics with Counts**
   ```
   GET /buildings (returns building counts)
   GET /sites/:id (returns related counts)
   ```
   - ⚠️ **RISK:** Multiple count queries per record
   - 🔧 **RECOMMENDATION:** Use aggregation or caching

---

## 🔧 **8. API DESIGN IMPROVEMENTS**

### **RESTful Improvements**

1. **Use Plural Nouns Consistently**
   ```
   ✅ /customers, /sites, /buildings
   ❌ /analytics/dashboard (should be /analytics/dashboards)
   ```

2. **Avoid Actions in URLs**
   ```
   ❌ POST /users/:id/deactivate
   ✅ PATCH /users/:id/status { "status": "inactive" }

   ❌ POST /admin/tenants/:tenant/subscribe
   ✅ POST /admin/subscriptions { "tenant_id": "..." }
   ```

3. **Use Sub-resources Consistently**
   ```
   ✅ /customers/:id/contacts
   ✅ /buildings/:id/floors

   ❌ /assets/by-building/:buildingId
   ✅ /buildings/:id/assets
   ```

### **Query Parameter Standardization**

1. **Filtering**
   ```
   ✅ Standard: ?status=active&category=hvac
   ⚠️ Inconsistent: ?is_active=true vs ?active=true
   ```
   - 🔧 **RECOMMENDATION:** Use `is_` prefix consistently

2. **Date Range Filtering**
   ```
   ✅ Good: ?start_date=2025-01-01&end_date=2025-12-31
   ⚠️ Missing on many endpoints
   ```
   - 🔧 **RECOMMENDATION:** Add date range filtering to audit logs, documents, etc.

3. **Boolean Parameters**
   ```
   ⚠️ Inconsistent:
   ?is_active=true
   ?active=true
   ?lease_expiring_soon=true
   ```
   - 🔧 **RECOMMENDATION:** Standardize on `is_` prefix or no prefix

---

## 🎯 **9. PRIORITY FIXES SUMMARY**

### **🔴 CRITICAL (Security Issues)**

1. ✅ Validate `tenant_id` parameter cannot be used by non-admin users
2. ✅ Add tenant validation to hierarchy endpoints
3. ✅ Add tenant validation to dropdown endpoints
4. ✅ Implement rate limiting on public endpoints
5. ✅ Add file upload validation and virus scanning

### **🟡 HIGH (Data Integrity)**

6. ✅ Remove duplicate audit log endpoint (`/users/audit-logs`)
7. ✅ Standardize statistics endpoints to `/summary/stats`
8. ✅ Fix routing conflicts (summary/stats vs :id)
9. ✅ Document deprecation timeline for legacy `/roles/*`
10. ✅ Rename building tenants to "occupants" to avoid confusion

### **🟢 MEDIUM (Code Quality)**

11. ✅ Flatten overly nested routes (contact methods)
12. ✅ Standardize on query parameters vs `/by-resource` pattern
13. ✅ Standardize vendor field names (contractor → vendor)
14. ✅ Standardize boolean parameter naming
15. ✅ Standardize pagination defaults to 20

### **🔵 LOW (Nice to Have)**

16. ✅ Add request/response examples
17. ✅ Implement cursor-based pagination
18. ✅ Add date range filtering to all list endpoints
19. ✅ Document CORS configuration
20. ✅ Add API versioning strategy

---

## 📋 **10. ENDPOINT SECURITY CHECKLIST**

Use this checklist for all endpoints:

```markdown
- [ ] Tenant isolation enforced (no cross-tenant data access)
- [ ] User authorization checked (role-based permissions)
- [ ] Input validation implemented
- [ ] Output sanitization applied
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] Error messages don't leak sensitive info
- [ ] File uploads have size/type restrictions
- [ ] Pagination has reasonable defaults
- [ ] No N+1 query issues
```

---

## 🎓 **11. RECOMMENDED MIDDLEWARE STACK**

For all endpoints, apply in this order:

```javascript
1. rateLimit          // Prevent abuse
2. cors               // CORS policy
3. helmet             // Security headers
4. authMiddleware     // JWT validation
5. tenantContext      // Set tenant_id from token
6. authorizationMiddleware // Check permissions
7. validation         // Input validation
8. routeHandler       // Business logic
9. auditLog           // Log action
10. errorHandler      // Catch errors
```

---

## 📚 **12. DOCUMENTATION IMPROVEMENTS NEEDED**

1. **Add OpenAPI/Swagger Spec**
   - Generate interactive API docs
   - Enable automatic client generation

2. **Add Example Requests/Responses**
   ```json
   // Example for each endpoint
   Request: POST /buildings
   {
     "building_name": "Central Tower",
     "building_code": "CT-001",
     "site_id": "site_123",
     "category": "Commercial"
   }

   Response: 201 Created
   {
     "success": true,
     "data": { "id": "bld_456", ... }
   }
   ```

3. **Add Error Response Examples**
   ```json
   400 Bad Request
   {
     "success": false,
     "message": "Validation failed",
     "errors": [
       {
         "field": "building_code",
         "message": "Building code already exists"
       }
     ]
   }
   ```

4. **Add Rate Limit Documentation**
   ```
   X-RateLimit-Limit: 100
   X-RateLimit-Remaining: 99
   X-RateLimit-Reset: 1640000000
   ```

5. **Add Webhook Documentation** (if applicable)

6. **Add Postman Collection**

---

## ✅ **CONCLUSION**

### **Overall API Quality: 8/10**

**Strengths:**
- ✅ Comprehensive coverage of business domain
- ✅ Good tenant isolation foundation
- ✅ Clear authentication/authorization strategy
- ✅ Consistent use of REST principles
- ✅ Audit logging built-in

**Critical Issues:**
- 🔴 Tenant isolation needs explicit validation in some endpoints
- 🔴 Rate limiting not implemented
- 🔴 File upload validation needs hardening

**Recommended Actions:**
1. Implement critical security fixes first (tenant validation, rate limiting)
2. Remove duplicate endpoints and standardize patterns
3. Fix routing conflicts
4. Add comprehensive documentation with examples
5. Implement performance optimizations (caching, aggregation)

**Estimated Effort:**
- Critical fixes: 2-3 days
- High priority improvements: 1 week
- Medium priority improvements: 1-2 weeks
- Documentation improvements: 3-5 days

---

**Next Steps:**
1. Review and prioritize fixes with team
2. Create tickets for each improvement
3. Implement security fixes immediately
4. Plan refactoring work for next sprint
5. Update API documentation with examples

