const mongoose = require('mongoose');

/**
 * Database Migration: Rename existing tenants to legacy and create new tenant_organisations
 * 
 * This migration:
 * 1. Renames the existing 'customers' collection to 'legacy_customers'
 * 2. Creates the new 'tenants' collection with simplified schema
 * 3. Creates the new 'tenant_organisations' collection
 * 4. Creates supporting collections (addresses, company_profiles)
 * 5. Migrates data from legacy_customers to new structure
 */

async function migrateTenantStructure() {
  try {
    console.log('🔄 Starting tenant structure migration...');
    
    const db = mongoose.connection.db;
    
    // Step 1: Rename existing customers collection to legacy_customers
    console.log('📦 Step 1: Renaming customers collection to legacy_customers');
    await renameCustomersToLegacy(db);
    
    // Step 2: Create new collections
    console.log('📦 Step 2: Creating new collections');
    await createNewCollections(db);
    
    // Step 3: Migrate data from legacy to new structure
    console.log('📦 Step 3: Migrating data to new structure');
    await migrateDataToNewStructure(db);
    
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function renameCustomersToLegacy(db) {
  const collections = await db.listCollections().toArray();
  const customersExists = collections.some(col => col.name === 'customers');
  const legacyExists = collections.some(col => col.name === 'legacy_customers');
  
  if (!customersExists) {
    console.log('ℹ️  No customers collection found, skipping rename');
    return;
  }
  
  if (legacyExists) {
    console.log('⚠️  legacy_customers collection already exists, skipping rename');
    return;
  }
  
  await db.collection('customers').rename('legacy_customers');
  console.log('✅ Successfully renamed customers collection to legacy_customers');
}

async function createNewCollections(db) {
  // Create tenants collection
  await db.createCollection('tenants');
  console.log('✅ Created tenants collection');
  
  // Create tenant_organisations collection
  await db.createCollection('tenant_organisations');
  console.log('✅ Created tenant_organisations collection');
  
  // Create addresses collection
  await db.createCollection('addresses');
  console.log('✅ Created addresses collection');
  
  // Create company_profiles collection
  await db.createCollection('company_profiles');
  console.log('✅ Created company_profiles collection');
  
  // Create indexes for tenants
  await db.collection('tenants').createIndex({ tenant_name: 1 });
  await db.collection('tenants').createIndex({ status: 1 });
  await db.collection('tenants').createIndex({ plan_id: 1 });
  await db.collection('tenants').createIndex({ created_at: -1 });
  console.log('✅ Created indexes for tenants collection');
  
  // Create indexes for tenant_organisations
  await db.collection('tenant_organisations').createIndex({ tenant_id: 1 }, { unique: true });
  await db.collection('tenant_organisations').createIndex({ organisation_name: 1 });
  await db.collection('tenant_organisations').createIndex({ email_domain: 1 });
  await db.collection('tenant_organisations').createIndex({ organisation_abn: 1 });
  console.log('✅ Created indexes for tenant_organisations collection');
}

async function migrateDataToNewStructure(db) {
  const legacyCustomers = await db.collection('legacy_customers').find({}).toArray();
  
  if (legacyCustomers.length === 0) {
    console.log('ℹ️  No legacy customers found to migrate');
    return;
  }
  
  console.log(`📊 Found ${legacyCustomers.length} legacy customers to migrate`);
  
  for (const legacyCustomer of legacyCustomers) {
    try {
      // Create new tenant record
      const newTenant = {
        tenant_name: legacyCustomer.organisation?.organisation_name || 'Unknown Tenant',
        phone: extractPhoneFromLegacy(legacyCustomer),
        status: determineStatusFromLegacy(legacyCustomer),
        plan_id: legacyCustomer.plan_id || null,
        created_at: legacyCustomer.createdAt || new Date(),
        updated_at: legacyCustomer.updatedAt || new Date()
      };
      
      const tenantResult = await db.collection('tenants').insertOne(newTenant);
      const tenantId = tenantResult.insertedId;
      
      // Create tenant organisation record
      const tenantOrg = {
        tenant_id: tenantId,
        organisation_name: legacyCustomer.organisation?.organisation_name || 'Unknown Organisation',
        business_address_id: null, // Will be created if needed
        company_profile_id: null, // Will be created if needed
        postal_address_id: null, // Will be created if needed
        email_domain: legacyCustomer.organisation?.email_domain || null,
        organisation_abn: legacyCustomer.company_profile?.business_number || null,
        organisation_acn: legacyCustomer.company_profile?.company_number || null,
        trading_name: legacyCustomer.company_profile?.trading_name || null,
        note: legacyCustomer.organisation?.notes || null,
        created_at: legacyCustomer.createdAt || new Date(),
        updated_at: legacyCustomer.updatedAt || new Date()
      };
      
      await db.collection('tenant_organisations').insertOne(tenantOrg);
      
      // Create address records if they exist
      if (legacyCustomer.business_address) {
        const businessAddress = {
          street: legacyCustomer.business_address.street || '',
          suburb: legacyCustomer.business_address.suburb || '',
          state: legacyCustomer.business_address.state || '',
          postcode: legacyCustomer.business_address.postcode || '',
          country: 'Australia',
          created_at: legacyCustomer.createdAt || new Date(),
          updated_at: legacyCustomer.updatedAt || new Date()
        };
        
        const addressResult = await db.collection('addresses').insertOne(businessAddress);
        
        // Update tenant_organisation with address reference
        await db.collection('tenant_organisations').updateOne(
          { tenant_id: tenantId },
          { $set: { business_address_id: addressResult.insertedId } }
        );
      }
      
      // Create company profile if it exists
      if (legacyCustomer.company_profile) {
        const companyProfile = {
          business_number: legacyCustomer.company_profile.business_number || null,
          company_number: legacyCustomer.company_profile.company_number || null,
          trading_name: legacyCustomer.company_profile.trading_name || null,
          industry_type: legacyCustomer.company_profile.industry_type || null,
          organisation_size: legacyCustomer.company_profile.organisation_size || 'small',
          created_at: legacyCustomer.createdAt || new Date(),
          updated_at: legacyCustomer.updatedAt || new Date()
        };
        
        const profileResult = await db.collection('company_profiles').insertOne(companyProfile);
        
        // Update tenant_organisation with profile reference
        await db.collection('tenant_organisations').updateOne(
          { tenant_id: tenantId },
          { $set: { company_profile_id: profileResult.insertedId } }
        );
      }
      
      console.log(`✅ Migrated tenant: ${newTenant.tenant_name}`);
      
    } catch (error) {
      console.error(`❌ Failed to migrate tenant: ${legacyCustomer.organisation?.organisation_name}`, error);
    }
  }
  
  console.log(`✅ Migration completed for ${legacyCustomers.length} tenants`);
}

function extractPhoneFromLegacy(legacyCustomer) {
  // Try to extract phone from contact methods
  if (legacyCustomer.contact_methods && legacyCustomer.contact_methods.length > 0) {
    const phoneContact = legacyCustomer.contact_methods.find(contact => 
      contact.method_type === 'phone' || 
      contact.contact_methods?.some(method => method.method_type === 'phone')
    );
    
    if (phoneContact) {
      if (phoneContact.method_value) {
        return phoneContact.method_value;
      }
      if (phoneContact.contact_methods) {
        const phoneMethod = phoneContact.contact_methods.find(method => method.method_type === 'phone');
        return phoneMethod?.method_value || null;
      }
    }
  }
  
  return null;
}

function determineStatusFromLegacy(legacyCustomer) {
  // Map legacy status to new status
  if (legacyCustomer.is_trial) {
    return 'trial';
  }
  
  if (legacyCustomer.is_active === false) {
    return 'inactive';
  }
  
  // Check plan status
  if (legacyCustomer.plan_status?.is_active === false) {
    return 'suspended';
  }
  
  return 'active';
}

module.exports = migrateTenantStructure;
