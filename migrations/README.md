# Tenant Structure Migration

This migration renames existing tenants to legacy and creates a new simplified tenant structure.

## Overview

The migration performs the following operations:

1. **Renames** `customers` collection to `legacy_customers` (preserves existing data)
2. **Creates** new collections:
   - `tenants` - Simplified tenant data (name, phone, status, plan_id)
   - `tenant_organisations` - Detailed organization information
   - `addresses` - Address information
   - `company_profiles` - Company-specific data
3. **Migrates** data from legacy structure to new structure
4. **Creates** appropriate indexes for performance

## New Schema Structure

### Tenants Collection
```javascript
{
  tenant_name: String (required),
  phone: String (optional),
  status: Enum ['active', 'trial', 'suspended', 'inactive'],
  plan_id: ObjectId (ref: Plan),
  created_at: Date,
  updated_at: Date
}
```

### Tenant Organisations Collection
```javascript
{
  tenant_id: ObjectId (ref: Tenant, unique),
  organisation_name: String (required),
  business_address_id: ObjectId (ref: Address),
  company_profile_id: ObjectId (ref: CompanyProfile),
  postal_address_id: ObjectId (ref: Address),
  email_domain: String,
  organisation_abn: String,
  organisation_acn: String,
  trading_name: String,
  note: String,
  created_at: Date,
  updated_at: Date
}
```

## Running the Migration

### Prerequisites
- MongoDB connection string in environment variable `MONGODB_URI`
- Backup your database before running the migration
- Ensure no active connections to the database

### Execute Migration
```bash
cd rest-api
npm run migrate:tenant-structure
```

### Rollback Migration
If you need to revert the changes:
```bash
cd rest-api
npm run rollback:tenant-structure
```

## Migration Process

### Step 1: Rename Collection
- Renames `customers` → `legacy_customers`
- Preserves all existing data

### Step 2: Create New Collections
- Creates `tenants` collection with indexes
- Creates `tenant_organisations` collection with indexes
- Creates `addresses` collection
- Creates `company_profiles` collection

### Step 3: Data Migration
- Extracts tenant name from `organisation.organisation_name`
- Extracts phone from contact methods
- Maps legacy status to new status enum
- Preserves plan relationships
- Migrates organization data to `tenant_organisations`
- Creates address records if they exist
- Creates company profile records if they exist

## Status Mapping

| Legacy Status | New Status |
|---------------|------------|
| `is_trial: true` | `trial` |
| `is_active: false` | `inactive` |
| `plan_status.is_active: false` | `suspended` |
| Default | `active` |

## Data Extraction

### Phone Number
- Searches contact methods for phone type
- Extracts from nested contact_methods array
- Falls back to null if not found

### Organization Data
- Maps `organisation.organisation_name` → `organisation_name`
- Maps `organisation.email_domain` → `email_domain`
- Maps `company_profile.business_number` → `organisation_abn`
- Maps `company_profile.company_number` → `organisation_acn`
- Maps `company_profile.trading_name` → `trading_name`

## Safety Features

- **Non-destructive**: Original data preserved in `legacy_customers`
- **Rollback support**: Can revert all changes
- **Error handling**: Continues migration even if individual records fail
- **Validation**: Checks for existing collections before operations
- **Logging**: Detailed progress and error reporting

## Post-Migration

After running the migration:

1. Update your application code to use the new `Tenant` model
2. Update API endpoints to use new field names
3. Test all CRUD operations
4. Verify data integrity
5. Consider removing `legacy_customers` after confirming everything works

## Troubleshooting

### Migration Fails
- Check MongoDB connection
- Ensure sufficient disk space
- Verify database permissions
- Check for collection name conflicts

### Data Issues
- Compare record counts between legacy and new collections
- Verify field mappings are correct
- Check for missing required fields
- Validate foreign key relationships

### Performance Issues
- Monitor index creation progress
- Check for large collection sizes
- Consider running during low-traffic periods
- Monitor MongoDB logs for errors
