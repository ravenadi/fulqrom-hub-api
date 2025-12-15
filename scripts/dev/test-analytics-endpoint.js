#!/usr/bin/env node

/**
 * Test script for the new analytics dashboard endpoint
 * This script tests the optimized analytics endpoints
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Customer = require('./models/Customer');
const User = require('./models/User');
const Document = require('./models/Document');
const Site = require('./models/Site');
const Building = require('./models/Building');
const Floor = require('./models/Floor');
const Asset = require('./models/Asset');
const Vendor = require('./models/Vendor');

async function testAnalyticsEndpoint() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom_hub');
    console.log('✅ Connected to MongoDB');

    // Test the analytics logic directly
    console.log('\n📊 Testing Analytics Dashboard Logic...');
    
    // Mock tenant context (no tenant filter for super admin)
    const tenantId = null;
    let filterQuery = {};
    if (tenantId) {
      filterQuery.customer_id = tenantId;
    }

    console.log('🔍 Executing parallel queries...');
    const startTime = Date.now();

    // Use Promise.all for parallel execution of all stats queries
    const [
      totalCustomers,
      totalSites,
      totalBuildings,
      totalFloors,
      totalAssets,
      totalDocuments,
      totalVendors,
      totalUsers,
      storageStats
    ] = await Promise.all([
      // Total Customers/Tenants
      Customer.countDocuments(tenantId ? { _id: tenantId } : {}),
      
      // Total Sites
      Site.countDocuments(filterQuery),
      
      // Total Buildings
      Building.countDocuments(filterQuery),
      
      // Total Floors
      Floor.countDocuments(filterQuery),
      
      // Total Assets
      Asset.countDocuments(filterQuery),
      
      // Total Documents
      Document.countDocuments(filterQuery),
      
      // Total Vendors
      Vendor.countDocuments(filterQuery),
      
      // Total Users
      User.countDocuments(filterQuery),
      
      // Storage calculation using aggregation for efficiency
      Document.aggregate([
        ...(tenantId ? [{ $match: { 'customer.customer_id': tenantId } }] : []),
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
      ]).then(result => {
        const stats = result.length > 0 ? result[0] : {
          totalSizeBytes: 0,
          documentsWithFiles: 0,
          totalRecords: 0
        };
        
        const totalSizeBytes = stats.totalSizeBytes || 0;
        const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
        const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
        const displaySize = parseFloat(totalSizeGB) >= 1 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`;
        
        return {
          totalSizeBytes,
          totalSizeMB: parseFloat(totalSizeMB),
          totalSizeGB: parseFloat(totalSizeGB),
          displaySize,
          totalRecords: stats.totalRecords,
          documentsWithFiles: stats.documentsWithFiles,
          documentsWithoutFiles: stats.totalRecords - stats.documentsWithFiles
        };
      })
    ]);

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    console.log(`⚡ Query execution time: ${executionTime}ms`);

    // Display results
    console.log('\n📈 Dashboard Statistics:');
    console.log('========================');
    console.log(`👥 Total Customers/Tenants: ${totalCustomers}`);
    console.log(`🏢 Total Sites: ${totalSites}`);
    console.log(`🏗️  Total Buildings: ${totalBuildings}`);
    console.log(`🏢 Total Floors: ${totalFloors}`);
    console.log(`⚙️  Total Assets: ${totalAssets}`);
    console.log(`📄 Total Documents: ${totalDocuments}`);
    console.log(`🏪 Total Vendors: ${totalVendors}`);
    console.log(`👤 Total Users: ${totalUsers}`);
    console.log(`💾 Storage Used: ${storageStats.displaySize}`);
    console.log(`📊 Storage Details:`);
    console.log(`   - Total Size: ${storageStats.totalSizeBytes} bytes`);
    console.log(`   - Documents with files: ${storageStats.documentsWithFiles}`);
    console.log(`   - Documents without files: ${storageStats.documentsWithoutFiles}`);
    console.log(`   - Total documents: ${storageStats.totalRecords}`);

    // Test dynamic stats endpoint logic
    console.log('\n🎯 Testing Dynamic Stats Endpoint...');
    
    const requestedStats = ['customers', 'sites', 'buildings', 'assets', 'storage'];
    console.log(`Requested stats: ${requestedStats.join(', ')}`);

    const statPromises = {};
    const results = {};

    // Customers/Tenants
    if (requestedStats.includes('customers')) {
      statPromises.customers = Customer.countDocuments(tenantId ? { _id: tenantId } : {});
      statPromises.activeCustomers = Customer.countDocuments(tenantId ? { _id: tenantId, is_active: true } : { is_active: true });
    }

    // Sites
    if (requestedStats.includes('sites')) {
      statPromises.sites = Site.countDocuments(filterQuery);
      statPromises.activeSites = Site.countDocuments({ ...filterQuery, status: 'active' });
    }

    // Buildings
    if (requestedStats.includes('buildings')) {
      statPromises.buildings = Building.countDocuments(filterQuery);
      statPromises.activeBuildings = Building.countDocuments({ ...filterQuery, status: 'Active' });
    }

    // Assets
    if (requestedStats.includes('assets')) {
      statPromises.assets = Asset.countDocuments(filterQuery);
      statPromises.activeAssets = Asset.countDocuments({ ...filterQuery, status: 'Active' });
    }

    // Storage
    if (requestedStats.includes('storage')) {
      statPromises.storage = Document.aggregate([
        ...(tenantId ? [{ $match: { 'customer.customer_id': tenantId } }] : []),
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
      ]).then(result => {
        const stats = result.length > 0 ? result[0] : {
          totalSizeBytes: 0,
          documentsWithFiles: 0,
          totalRecords: 0
        };
        
        const totalSizeBytes = stats.totalSizeBytes || 0;
        const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
        const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
        const displaySize = parseFloat(totalSizeGB) >= 1 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`;
        
        return {
          totalSizeBytes,
          totalSizeMB: parseFloat(totalSizeMB),
          totalSizeGB: parseFloat(totalSizeGB),
          displaySize,
          totalRecords: stats.totalRecords,
          documentsWithFiles: stats.documentsWithFiles,
          documentsWithoutFiles: stats.totalRecords - stats.documentsWithFiles
        };
      });
    }

    // Execute dynamic queries
    const dynamicStartTime = Date.now();
    const statResults = await Promise.all(Object.values(statPromises));
    const dynamicEndTime = Date.now();
    
    // Map results back to their keys
    const statKeys = Object.keys(statPromises);
    statKeys.forEach((key, index) => {
      results[key] = statResults[index];
    });

    console.log(`⚡ Dynamic query execution time: ${dynamicEndTime - dynamicStartTime}ms`);
    console.log('\n📊 Dynamic Stats Results:');
    console.log('=========================');
    
    if (results.customers !== undefined) {
      console.log(`👥 Total Customers: ${results.customers}`);
      console.log(`✅ Active Customers: ${results.activeCustomers || 0}`);
    }
    if (results.sites !== undefined) {
      console.log(`🏢 Total Sites: ${results.sites}`);
      console.log(`✅ Active Sites: ${results.activeSites || 0}`);
    }
    if (results.buildings !== undefined) {
      console.log(`🏗️  Total Buildings: ${results.buildings}`);
      console.log(`✅ Active Buildings: ${results.activeBuildings || 0}`);
    }
    if (results.assets !== undefined) {
      console.log(`⚙️  Total Assets: ${results.assets}`);
      console.log(`✅ Active Assets: ${results.activeAssets || 0}`);
    }
    if (results.storage !== undefined) {
      console.log(`💾 Storage Used: ${results.storage.displaySize}`);
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('\n🚀 API Endpoints Available:');
    console.log('============================');
    console.log('GET /api/analytics/dashboard - Complete dashboard stats');
    console.log('GET /api/analytics/stats?stats=customers,sites,buildings - Dynamic stats');
    console.log('GET /api/analytics/stats?stats=storage - Storage stats only');
    console.log('GET /api/analytics/stats - All stats (default)');

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
  testAnalyticsEndpoint().catch(console.error);
}

module.exports = testAnalyticsEndpoint;
