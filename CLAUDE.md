# Fulqrom Hub REST API


## Fulqrom Hub SaaS platform.
SaaS platform for managing property portfolios and building management.
- Tenant = The SaaS platform subscriber (e.g., "GKB Labs" subscribing to Fulqrom Hub)
- Organisation = Subscription and billing profile for a Tenant (1-to-1 relationship)
- Customer = Property portfolio manager within a Tenant's account (many per Tenant)
- BuildingTenant = Actual building occupant/lessee (e.g., "Acme Accounting" leasing Suite 301)



### Hub Modules ( SaaS User Platform Modules ) : 
1. Customers
2. Sites
3. Buildings
4. Floors
5. Tenants
6. Documents
7. Assets
8. Vendors
9. Users
10. Analytics
11. Organisations
12. Settings
13. Notifications
16. Dashboards

### Super Admin Modules ( SaaS Platform Super Admin Modules ) :
1. Tenants
    1.1 Users
    1.2 Roles
    1.3 Stats, ie. total customers, sites, buildings, documents, users, etc.
2. Plans
3. Roles
    3.1 Admin - Full access to all modules of current tenant.
    3.2 Property Manager
    3.3 Building Manager
    3.4 Contractor
    3.5 Tenant - Building occupant/lessee.
 

## Tech Stack
- Node.js, Express.js, MongoDB (Mongoose)


## Commands
```bash
npm install
npm run dev
npm start
```

## Endpoints
- `GET /health` - Health check
- `GET /api/customers` - List customers
- `GET /api/customers/:id` - Get customer

## Database
```
MONGODB_CONNECTION=mongodb+srv://connection_string/fulqrom-hub
```

## Validation Strategy
- **Comprehensive API Validation**: All business rules, data integrity, security checks
- **Australian Standards**: ABN (11 digits), ACN (9 digits), postcodes (4 digits)
- **Error Responses**: Clear, actionable error messages with field-specific details
- **Data Sanitization**: Input cleaning and SQL injection prevention


## Authentication
- Auth0
- Documentation: https://context7.com/auth0/node-auth0/llms.txt?tokens=10000

## Permission System
- **Role-based permissions**: Users with role permissions (e.g., Property Manager with "sites:view") can access ALL resources of that type
- **Resource-specific permissions**: Fine-grained control for individual resources (optional, overrides role permissions)
- **Fixed issue**: Field name mismatch between resource_access (`can_view`) and role permissions (`view`) preventing role-based access to individual resources 

## How Permission System Works Now
1. User with Role Permission (e.g., Contractor with "buildings:view") → ✅ Can access ALL buildings
2. User with Resource Permission (e.g., specific site access) → ✅ Can access ONLY that site
3. User with NO permissions → ❌ Access denied

## API Architecture Decisions

### `/api` Prefix - REQUIRED (Not Optional)
**Why it exists:**
- **Same-origin deployment**: Frontend (`hub.fulqrom.com/customers`) and API (`hub.fulqrom.com/api/customers`) share same domain
- **Cookie-based auth**: HttpOnly session cookies require same origin (can't use separate subdomain like `api.fulqrom.com`)
- **Route separation**: Prevents conflicts between frontend routes (`/customers`) and API endpoints (`/api/customers`)
- **CORS avoidance**: Same-origin requests don't trigger CORS
- **Vite proxy**: Development proxy at `vite.config.ts:11` forwards `/api/*` to backend port 30001

**Industry examples:** GitHub (`github.com/api/*`), Vercel (`vercel.com/api/*`), Linear (`linear.app/api/*`)

### Dropdown Endpoints - JUSTIFIED (Not Duplicates)
**Why `/dropdowns/entities/*` exists separately from main CRUD endpoints:**

| Aspect | Dropdown Endpoints | CRUD Endpoints |
|--------|-------------------|----------------|
| **Purpose** | UI dropdown/select components | Business entity management |
| **Data Shape** | Minimal: `{id, label, value, parent_id}` | Full object (50+ fields) |
| **Payload Size** | ~150 bytes/item | ~2-5KB/item |
| **Pagination** | None (return ALL for selection) | Yes (10-50 items/page) |
| **Use Case** | Hierarchical cascading dropdowns | CRUD operations |
| **Permissions** | May show selectable items | Shows manageable items |
| **Caching** | 5 minutes | No cache |

**Example flow:**
1. Select Customer → `GET /dropdowns/entities/sites?customer_id=123` → Returns 100 sites (15KB)
2. Select Site → `GET /dropdowns/entities/buildings?site_id=456` → Returns 50 buildings (7.5KB)
3. **vs CRUD:** `GET /sites?page=1&limit=10` → Returns 10 full site objects (50KB)

**Key difference:** Dropdowns return **hierarchical metadata** for cascading filters, not full business objects.

### Rate Limiting
**Status:** ✅ Implemented using `express-rate-limit`

| Tier | Limit | Window | Applied To |
|------|-------|--------|------------|
| General API | 100 req | 15 min | All `/api/*` endpoints |
| Authentication | 5 req | 15 min | `/api/auth/login` |
| File Uploads | 50 req | 1 hour | Document uploads |
| Public | 30 req | 15 min | `/health`, registration |
| Critical Ops | 3 req | 1 hour | Sensitive operations |

**Admin bypass:** Admins automatically bypass general API limits
**Documentation:** See `docs/RATE_LIMITING.md`

### API Versioning (Future)
- Current: `/api/customers` (no version prefix)
- Planned: `/api/v1/customers` (explicit versioning)
- Migration strategy: Maintain backward compatibility with redirects

