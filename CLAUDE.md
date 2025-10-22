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