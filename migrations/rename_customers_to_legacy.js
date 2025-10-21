const mongoose = require('mongoose');

/**
 * Migration: Rename customers table to legacy_customers
 * This migration renames the existing customers collection to legacy_customers
 * to preserve existing data while implementing the new simplified schema
 */

async function renameCustomersToLegacy() {
  try {
    console.log('🔄 Starting migration: Rename customers to legacy_customers');
    
    const db = mongoose.connection.db;
    
    // Check if customers collection exists
    const collections = await db.listCollections().toArray();
    const customersExists = collections.some(col => col.name === 'customers');
    
    if (!customersExists) {
      console.log('ℹ️  No customers collection found, skipping rename');
      return;
    }
    
    // Check if legacy_customers already exists
    const legacyExists = collections.some(col => col.name === 'legacy_customers');
    
    if (legacyExists) {
      console.log('⚠️  legacy_customers collection already exists, skipping rename');
      return;
    }
    
    // Rename the collection
    await db.collection('customers').rename('legacy_customers');
    console.log('✅ Successfully renamed customers collection to legacy_customers');
    
    // Update any indexes that might reference the old collection name
    console.log('ℹ️  Migration completed successfully');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = renameCustomersToLegacy;
