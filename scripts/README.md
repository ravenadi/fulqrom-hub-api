# Tenant Data Management Scripts

This directory contains scripts for managing tenant data in the Fulqrom Hub platform.

## Available Scripts

### 1. Copy Tenant Data (`copyTenantData.js`)

Copies all data from one tenant to another, maintaining referential integrity.

**What gets copied:**
- ✅ Customers
- ✅ Sites
- ✅ Buildings
- ✅ Floors
- ✅ Assets
- ✅ Vendors
- ✅ Building Tenants (occupants)
- ✅ Documents (metadata only)

**What does NOT get copied:**
- ❌ Users
- ❌ S3 files (document attachments)

**Usage:**
```bash
cd rest-api
node scripts/copyTenantData.js <source_tenant_id> <target_tenant_id>
```

**Example:**
```bash
# Copy all data from tenant A to tenant B
node scripts/copyTenantData.js 507f1f77bcf86cd799439011 507f191e810c19729de860ea
```

**Output:**
```
🚀 Starting tenant data copy...
   Source Tenant: 507f1f77bcf86cd799439011
   Target Tenant: 507f191e810c19729de860ea
   Note: Users and S3 files will NOT be copied

📋 Copying Customers...
  ✓ Copied: GKB Labs Properties
  ✓ Copied: Metro Holdings
✅ Copied 2 customers

🏢 Copying Sites...
  ✓ Copied: Sydney Office Complex
✅ Copied 1 sites

...

✅ All data copied successfully!
```

**How it works:**
1. Queries all non-deleted records from source tenant
2. Creates new records with new IDs in target tenant
3. Maps old IDs to new IDs to maintain relationships
4. Updates all foreign key references (customer_id, site_id, building_id, etc.)
5. Preserves all data except:
   - MongoDB `_id` fields (new IDs generated)
   - Timestamps (new timestamps created)
   - S3 file URLs (cleared to avoid conflicts)

**Notes:**
- Script runs in a single transaction-like flow
- If a reference cannot be mapped (e.g., customer not found), the record is skipped with a warning
- All counts (buildings_count, assets_count, etc.) are reset to 0
- Vendor performance metrics are reset to 0

---

### 2. Generate Dummy Data (`generateDummyData.js`)

Creates realistic sample data for a tenant for testing and demo purposes.

**What gets generated:**
- Customers (configurable count)
- Sites (2 per customer)
- Buildings (2 per site)
- Floors (based on building configuration)
- Vendors (5 contractors)
- Assets (3 per floor)
- Building Tenants (2 per building)
- Documents (comprehensive set, metadata only):
  - Building compliance certificates (Fire Safety, Electrical Safety)
  - Building plans and drawings
  - Asset manuals and warranties
  - Vendor service agreements
  - Site safety and environmental plans
  - HVAC maintenance reports

**Usage:**
```bash
cd rest-api
node scripts/generateDummyData.js <tenant_id> [customer_count]
```

**Example:**
```bash
# Generate data with 3 customers (default)
node scripts/generateDummyData.js 507f1f77bcf86cd799439011

# Generate data with 5 customers
node scripts/generateDummyData.js 507f1f77bcf86cd799439011 5
```

**Output:**
```
🚀 Starting dummy data generation...
   Tenant ID: 507f1f77bcf86cd799439011
   Customers: 3

📋 Generating 3 Customers...
  ✓ Created: Summit Properties
  ✓ Created: Harbour Real Estate
  ✓ Created: Pacific Developments
✅ Generated 3 customers

...

✅ All dummy data generated successfully!

📊 Summary:
   Customers:        3
   Sites:            6
   Buildings:        12
   Floors:           60
   Vendors:          5
   Assets:           ~180
   Building Tenants: ~24
   Documents:        ~15
```

**Generated Data Features:**
- **Realistic Australian data:**
  - Valid ABN numbers (11 digits)
  - Australian addresses with states (NSW, VIC, QLD, etc.)
  - 4-digit postcodes
  - Australian business naming conventions
  - AU email domains (.com.au)
  - Australian phone numbers (02 format)

- **Hierarchical relationships:**
  - All foreign keys properly linked
  - Sites linked to customers
  - Buildings linked to sites
  - Floors linked to buildings and sites
  - Assets linked to floors, buildings, sites, and customers

- **Varied data:**
  - Random building types (Office, Retail, Warehouse, Mixed Use)
  - Random floor counts (3-20 floors)
  - Random NABERS ratings (0-6 stars)
  - Random asset categories (Chillers, Boilers, AHUs, Pumps, etc.)
  - Random vendor specialisations (HVAC, Electrical, Fire Safety, etc.)

- **Comprehensive document generation:**
  - **Building Compliance** (per building):
    - Fire Safety Certificate (with expiry dates)
    - Electrical Safety Certificate (AS/NZS 3000:2018)
    - As-Built Plans (Drawing Register with approval workflow)
  - **Asset Documentation** (for sample assets):
    - Operation & Maintenance Manuals
    - Warranty Certificates (for recently installed assets)
  - **Vendor Contracts** (per vendor):
    - Service Agreements with expiry dates
  - **Site Documents** (per site):
    - Site Safety Management Plans
    - Environmental Management Plans
  - **Technical Reports** (for sample assets):
    - HVAC Maintenance Reports with current date
  - All documents linked to appropriate locations (customer, site, building, floor, asset, vendor)
  - Realistic compliance frameworks (Building Code of Australia, EPA Guidelines, etc.)
  - Issue dates, expiry dates, and review dates for compliance tracking

**Notes:**
- No actual files are created (documents are metadata only)
- Data is suitable for demos and testing
- All records are marked as `is_delete: false` and `is_active: true`
- Generates realistic Australian business data

---

## Prerequisites

1. **Environment Configuration:**
   - Ensure `.env` file is configured with `MONGODB_CONNECTION`
   - MongoDB connection string should have proper permissions

2. **Dependencies:**
   ```bash
   cd rest-api
   npm install
   ```

3. **Tenant IDs:**
   - Get valid tenant IDs from your database
   - Tenant must exist before running these scripts
   - For copy script: both source and target tenants must exist
   - For generate script: target tenant must exist

---

## Finding Tenant IDs

To find tenant IDs in your database:

```javascript
// Using MongoDB shell or Compass
db.tenants.find({}, { _id: 1, tenant_name: 1 })

// Or using Node.js
const Tenant = require('./models/Tenant');
const tenants = await Tenant.find({}, '_id tenant_name');
console.log(tenants);
```

---

## Common Use Cases

### Use Case 1: Clone Production Tenant for Testing
```bash
# Copy prod tenant to test tenant
node scripts/copyTenantData.js 507f1f77bcf86cd799439011 507f191e810c19729de860ea
```

### Use Case 2: Set Up Demo Environment
```bash
# Generate sample data for demo tenant
node scripts/generateDummyData.js 507f1f77bcf86cd799439011 5
```

### Use Case 3: Migrate Customer Between Tenants
```bash
# First, manually query and note customer_id
# Then copy specific customer data using modified script
# (Would require script modification to filter by customer)
```

---

## Troubleshooting

**Error: "Tenant context required for database queries"**
- Solution: Scripts use `skipTenantFilter: true` option to bypass tenant isolation
- If this fails, check tenant plugin configuration

**Error: "Invalid source/target tenant ID"**
- Solution: Ensure tenant IDs are valid MongoDB ObjectIds (24 hex characters)

**Warning: "Customer not found for site"**
- This is normal if relationships are broken in source data
- Record will be skipped, script continues

**Documents show "Document has file attachment (not copied)"**
- This is expected - S3 files are not copied
- Only metadata is copied/created

---

## Safety Features

Both scripts include:
- ✅ Tenant ID validation (must be valid ObjectId)
- ✅ MongoDB connection error handling
- ✅ Transaction-like execution (all or nothing approach)
- ✅ Detailed progress logging
- ✅ Summary statistics on completion
- ✅ Skip deleted records (`is_delete: false`)
- ✅ Warnings for missing references

---

## Performance Considerations

- **Copy Script:** Time depends on data volume
  - ~1000 records: ~30 seconds
  - ~10,000 records: ~5 minutes
  - ~100,000 records: ~30-60 minutes

- **Generate Script:** Time depends on customer count
  - 3 customers: ~10 seconds
  - 10 customers: ~30 seconds
  - 50 customers: ~2-3 minutes

---

## Future Enhancements

Potential improvements:
- [ ] Progress bar for long operations
- [ ] Resume capability for interrupted copies
- [ ] Selective module copying (e.g., only customers and sites)
- [ ] Parallel processing for large datasets
- [ ] S3 file copying option
- [ ] Customer-level filtering
- [ ] Dry-run mode to preview changes
- [ ] Export to JSON for backup

---

## Support

For issues or questions:
1. Check the error message details
2. Review MongoDB logs
3. Verify tenant IDs exist
4. Check database permissions
5. Contact development team

---

Last updated: 2025-01-05
