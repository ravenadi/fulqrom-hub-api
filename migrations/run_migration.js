#!/usr/bin/env node

/**
 * Migration Runner for Tenant Structure
 * 
 * This script runs the tenant structure migration
 * Usage: node migrate_tenant_structure.js
 */

const mongoose = require('mongoose');
const migrateTenantStructure = require('./migrate_tenant_structure');

// Database configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom_hub';

async function runMigration() {
  try {
    console.log('🚀 Starting Tenant Structure Migration');
    console.log('📡 Connecting to MongoDB...');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');
    
    // Run the migration
    await migrateTenantStructure();
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('📡 Database connection closed');
    process.exit(0);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⚠️  Migration interrupted by user');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Migration terminated');
  await mongoose.connection.close();
  process.exit(0);
});

// Run the migration
runMigration();
