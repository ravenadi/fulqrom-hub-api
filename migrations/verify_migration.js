const mongoose = require('mongoose');

/**
 * Migration Verification Script
 * 
 * This script verifies that the tenant structure migration was successful
 * by checking:
 * 1. Legacy data is preserved
 * 2. New collections exist
 * 3. Data was migrated correctly
 * 4. Indexes were created
 */

async function verifyMigration() {
  try {
    console.log('🔍 Verifying tenant structure migration...');
    
    const db = mongoose.connection.db;
    
    // Step 1: Check collections exist
    console.log('📦 Checking collections...');
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    const requiredCollections = [
      'legacy_customers',
      'tenants', 
      'tenant_organisations',
      'addresses',
      'company_profiles'
    ];
    
    for (const collectionName of requiredCollections) {
      if (collectionNames.includes(collectionName)) {
        console.log(`✅ ${collectionName} collection exists`);
      } else {
        console.log(`❌ ${collectionName} collection missing`);
      }
    }
    
    // Step 2: Check data counts
    console.log('\n📊 Checking data counts...');
    
    const legacyCount = await db.collection('legacy_customers').countDocuments();
    const tenantsCount = await db.collection('tenants').countDocuments();
    const tenantOrgsCount = await db.collection('tenant_organisations').countDocuments();
    
    console.log(`📈 Legacy customers: ${legacyCount}`);
    console.log(`📈 New tenants: ${tenantsCount}`);
    console.log(`📈 Tenant organisations: ${tenantOrgsCount}`);
    
    if (legacyCount === tenantsCount) {
      console.log('✅ All legacy customers migrated to tenants');
    } else {
      console.log(`⚠️  Count mismatch: ${legacyCount} legacy vs ${tenantsCount} tenants`);
    }
    
    if (tenantsCount === tenantOrgsCount) {
      console.log('✅ All tenants have organisation records');
    } else {
      console.log(`⚠️  Count mismatch: ${tenantsCount} tenants vs ${tenantOrgsCount} organisations`);
    }
    
    // Step 3: Check indexes
    console.log('\n🔍 Checking indexes...');
    
    const tenantIndexes = await db.collection('tenants').indexes();
    const tenantOrgIndexes = await db.collection('tenant_organisations').indexes();
    
    console.log(`📈 Tenants collection has ${tenantIndexes.length} indexes`);
    console.log(`📈 Tenant organisations collection has ${tenantOrgIndexes.length} indexes`);
    
    // Step 4: Sample data verification
    console.log('\n🔍 Verifying sample data...');
    
    const sampleTenant = await db.collection('tenants').findOne({});
    const sampleOrg = await db.collection('tenant_organisations').findOne({});
    
    if (sampleTenant) {
      console.log('✅ Sample tenant structure:');
      console.log(`   - Name: ${sampleTenant.tenant_name}`);
      console.log(`   - Status: ${sampleTenant.status}`);
      console.log(`   - Phone: ${sampleTenant.phone || 'Not set'}`);
      console.log(`   - Plan ID: ${sampleTenant.plan_id || 'Not set'}`);
    }
    
    if (sampleOrg) {
      console.log('✅ Sample organisation structure:');
      console.log(`   - Organisation Name: ${sampleOrg.organisation_name}`);
      console.log(`   - Email Domain: ${sampleOrg.email_domain || 'Not set'}`);
      console.log(`   - ABN: ${sampleOrg.organisation_abn || 'Not set'}`);
      console.log(`   - Trading Name: ${sampleOrg.trading_name || 'Not set'}`);
    }
    
    // Step 5: Check relationships
    console.log('\n🔗 Checking relationships...');
    
    const tenantsWithOrgs = await db.collection('tenants').aggregate([
      {
        $lookup: {
          from: 'tenant_organisations',
          localField: '_id',
          foreignField: 'tenant_id',
          as: 'organisation'
        }
      },
      {
        $match: {
          'organisation.0': { $exists: true }
        }
      },
      {
        $count: 'count'
      }
    ]).toArray();
    
    const tenantsWithOrgsCount = tenantsWithOrgs[0]?.count || 0;
    console.log(`📈 Tenants with organisation records: ${tenantsWithOrgsCount}/${tenantsCount}`);
    
    if (tenantsWithOrgsCount === tenantsCount) {
      console.log('✅ All tenants have organisation relationships');
    } else {
      console.log('⚠️  Some tenants missing organisation relationships');
    }
    
    console.log('\n🎉 Migration verification completed!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  }
}

async function runVerification() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom_hub';
    
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');
    
    await verifyMigration();
    
  } catch (error) {
    console.error('💥 Verification failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📡 Database connection closed');
    process.exit(0);
  }
}

// Run verification
runVerification();
