#!/usr/bin/env node

/**
 * Test script to verify the analytics endpoint fix
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function testAnalyticsFix() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom_hub');
    console.log('✅ Connected to MongoDB');

    const User = require('./models/User');
    const Customer = require('./models/Customer');
    const Site = require('./models/Site');
    const Building = require('./models/Building');
    const Floor = require('./models/Floor');
    const Asset = require('./models/Asset');
    const Document = require('./models/Document');
    const Vendor = require('./models/Vendor');

    console.log('\n🔍 Testing Analytics Logic...');

    // Test 1: Check if demo user exists and has tenant_id
    const demoUser = await User.findOne({ email: 'demo@fulqrom.com.au' });
    console.log('Demo User:', {
      exists: !!demoUser,
      tenant_id: demoUser?.tenant_id,
      customer_id: demoUser?.customer_id
    });

    if (!demoUser) {
      console.log('❌ Demo user not found. Please run seeding script first.');
      return;
    }

    // Test 2: Check total counts without any filter
    console.log('\n📊 Total counts (no filter):');
    const totalCounts = await Promise.all([
      Customer.countDocuments(),
      Site.countDocuments(),
      Building.countDocuments(),
      Floor.countDocuments(),
      Asset.countDocuments(),
      Document.countDocuments(),
      Vendor.countDocuments(),
      User.countDocuments()
    ]);

    console.log('Customers:', totalCounts[0]);
    console.log('Sites:', totalCounts[1]);
    console.log('Buildings:', totalCounts[2]);
    console.log('Floors:', totalCounts[3]);
    console.log('Assets:', totalCounts[4]);
    console.log('Documents:', totalCounts[5]);
    console.log('Vendors:', totalCounts[6]);
    console.log('Users:', totalCounts[7]);

    // Test 3: Check counts with tenant filtering (if demo user has tenant_id)
    if (demoUser.tenant_id) {
      console.log('\n🎯 Testing tenant filtering...');
      
      const tenantId = demoUser.tenant_id;
      const filterQuery = { customer_id: tenantId };
      const documentFilterQuery = { 'customer.customer_id': tenantId };
      const userFilterQuery = { tenant_id: tenantId };

      const tenantCounts = await Promise.all([
        Customer.countDocuments({ _id: tenantId }),
        Site.countDocuments(filterQuery),
        Building.countDocuments(filterQuery),
        Floor.countDocuments(filterQuery),
        Asset.countDocuments(filterQuery),
        Document.countDocuments(documentFilterQuery),
        Vendor.countDocuments(filterQuery),
        User.countDocuments(userFilterQuery)
      ]);

      console.log('Tenant-filtered counts:');
      console.log('Customers:', tenantCounts[0]);
      console.log('Sites:', tenantCounts[1]);
      console.log('Buildings:', tenantCounts[2]);
      console.log('Floors:', tenantCounts[3]);
      console.log('Assets:', tenantCounts[4]);
      console.log('Documents:', tenantCounts[5]);
      console.log('Vendors:', tenantCounts[6]);
      console.log('Users:', tenantCounts[7]);

      // Test 4: Check storage calculation
      console.log('\n💾 Testing storage calculation...');
      const storageStats = await Document.aggregate([
        { $match: { 'customer.customer_id': tenantId } },
        {
          $group: {
            _id: null,
            totalSizeBytes: { $sum: { $ifNull: ['$file.file_meta.file_size', 0] } },
            documentsWithFiles: { 
              $sum: { 
                $cond: [
                  { $and: [
                    { $ne: ['$file.file_meta.file_size', null] },
                    { $gt: ['$file.file_meta.file_size', 0] }
                  ]}, 
                  1, 
                  0
                ] 
              } 
            },
            totalRecords: { $sum: 1 }
          }
        }
      ]);

      const stats = storageStats.length > 0 ? storageStats[0] : {
        totalSizeBytes: 0,
        documentsWithFiles: 0,
        totalRecords: 0
      };
      
      const totalSizeBytes = stats.totalSizeBytes || 0;
      const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
      const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
      const displaySize = parseFloat(totalSizeGB) >= 1 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`;

      console.log('Storage stats:');
      console.log('Total size:', displaySize);
      console.log('Documents with files:', stats.documentsWithFiles);
      console.log('Total documents:', stats.totalRecords);
    } else {
      console.log('⚠️  Demo user has no tenant_id - will show all data (super admin mode)');
    }

    console.log('\n✅ Analytics fix test completed!');
    console.log('\n🚀 The analytics endpoints should now work correctly:');
    console.log('GET /api/analytics/dashboard - Complete dashboard stats');
    console.log('GET /api/analytics/stats - Dynamic stats');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testAnalyticsFix().catch(console.error);
}

module.exports = testAnalyticsFix;
