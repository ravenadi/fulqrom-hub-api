const mongoose = require('mongoose');

/**
 * Rollback Migration: Restore legacy customers and remove new collections
 * 
 * This rollback:
 * 1. Renames 'legacy_customers' back to 'customers'
 * 2. Drops the new collections (tenants, tenant_organisations, addresses, company_profiles)
 * 3. Restores the original structure
 */

async function rollbackTenantStructure() {
  try {
    console.log('🔄 Starting tenant structure rollback...');
    
    const db = mongoose.connection.db;
    
    // Step 1: Check if legacy_customers exists
    const collections = await db.listCollections().toArray();
    const legacyExists = collections.some(col => col.name === 'legacy_customers');
    const customersExists = collections.some(col => col.name === 'customers');
    
    if (!legacyExists) {
      console.log('ℹ️  No legacy_customers collection found, nothing to rollback');
      return;
    }
    
    if (customersExists) {
      console.log('⚠️  customers collection already exists, cannot rollback');
      console.log('💡 Please manually remove the customers collection first');
      return;
    }
    
    // Step 2: Rename legacy_customers back to customers
    console.log('📦 Renaming legacy_customers back to customers');
    await db.collection('legacy_customers').rename('customers');
    console.log('✅ Successfully renamed legacy_customers back to customers');
    
    // Step 3: Drop new collections
    console.log('📦 Dropping new collections');
    
    const collectionsToDrop = ['tenants', 'tenant_organisations', 'addresses', 'company_profiles'];
    
    for (const collectionName of collectionsToDrop) {
      const exists = collections.some(col => col.name === collectionName);
      if (exists) {
        await db.collection(collectionName).drop();
        console.log(`✅ Dropped ${collectionName} collection`);
      } else {
        console.log(`ℹ️  ${collectionName} collection does not exist, skipping`);
      }
    }
    
    console.log('✅ Rollback completed successfully!');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = rollbackTenantStructure;
