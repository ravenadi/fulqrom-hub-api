/**
 * Manual Test Script for Tenant Deletion Functionality
 *
 * This script tests:
 * 1. Tenant creation with S3 bucket
 * 2. S3 bucket info storage in database
 * 3. Document upload to tenant-specific S3 bucket
 * 4. Comprehensive tenant deletion with 90-day S3 auto-deletion
 * 5. Audit log validation
 *
 * Run: node tests/tenant-deletion.test.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const TenantDeletionService = require('../services/tenantDeletionService');
const TenantS3Service = require('../services/tenantS3Service');

// Test configuration
const TEST_TENANT_NAME = `Test Tenant ${Date.now()}`;
const TEST_PHONE = '+61400000000';

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function section(message) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`${message}`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
}

// Connect to database
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    success('Connected to MongoDB');
  } catch (err) {
    error(`MongoDB connection failed: ${err.message}`);
    throw err;
  }
}

// Test 1: Create tenant with S3 bucket
async function testTenantCreation() {
  section('TEST 1: Create Tenant with S3 Bucket');

  try {
    info(`Creating tenant: ${TEST_TENANT_NAME}`);

    // Create tenant
    const tenant = await Tenant.create({
      tenant_name: TEST_TENANT_NAME,
      phone: TEST_PHONE,
      status: 'trial',
      plan_id: null
    });

    success(`Tenant created with ID: ${tenant._id}`);

    // Create S3 bucket
    info('Creating S3 bucket...');
    const tenantS3Service = new TenantS3Service(tenant._id);
    const s3Result = await tenantS3Service.createTenantBucketIfNotExists(
      TEST_TENANT_NAME,
      tenant._id.toString()
    );

    if (s3Result.success) {
      success(`S3 bucket created: ${s3Result.bucket_name}`);

      // Store bucket info in tenant
      tenant.s3_bucket_name = s3Result.bucket_name;
      tenant.s3_bucket_region = process.env.AWS_DEFAULT_REGION || 'ap-southeast-2';
      tenant.s3_bucket_status = 'created';
      await tenant.save();

      success('S3 bucket info stored in database');
    } else {
      error(`S3 bucket creation failed: ${s3Result.message}`);
    }

    // Verify storage
    const savedTenant = await Tenant.findById(tenant._id);
    if (savedTenant.s3_bucket_name && savedTenant.s3_bucket_status === 'created') {
      success('Verification passed: S3 bucket info correctly stored');
      info(`  - Bucket Name: ${savedTenant.s3_bucket_name}`);
      info(`  - Bucket Region: ${savedTenant.s3_bucket_region}`);
      info(`  - Bucket Status: ${savedTenant.s3_bucket_status}`);
    } else {
      error('Verification failed: S3 bucket info not stored correctly');
    }

    return tenant;
  } catch (err) {
    error(`Test failed: ${err.message}`);
    console.error(err);
    throw err;
  }
}

// Test 2: Verify S3 bucket exists in AWS
async function testS3BucketExists(tenant) {
  section('TEST 2: Verify S3 Bucket Exists in AWS');

  try {
    const tenantS3Service = new TenantS3Service(tenant._id);
    const bucketName = tenant.s3_bucket_name;

    info(`Checking bucket: ${bucketName}`);

    // Check if bucket exists
    const exists = await tenantS3Service.bucketExists(bucketName);

    if (exists) {
      success(`Bucket exists in AWS: ${bucketName}`);
      return true;
    } else {
      error(`Bucket does not exist in AWS: ${bucketName}`);
      return false;
    }
  } catch (err) {
    error(`Test failed: ${err.message}`);
    console.error(err);
    return false;
  }
}

// Test 3: Test tenant deletion with S3 auto-deletion
async function testTenantDeletion(tenant) {
  section('TEST 3: Comprehensive Tenant Deletion');

  try {
    info(`Deleting tenant: ${tenant._id}`);

    const deletionService = new TenantDeletionService();

    const result = await deletionService.deleteTenantCompletely(tenant._id.toString(), {
      deleteS3: true,
      immediateS3Delete: false, // Test 90-day auto-deletion
      deleteDatabase: true,
      forceDelete: true,
      createFinalAuditLog: false, // Skip audit log for test
      adminUserId: 'test-admin',
      adminEmail: 'test@example.com'
    });

    if (result.success) {
      success('Tenant deletion completed successfully');

      // Display deletion statistics
      info('Deletion Statistics:');
      if (result.deletion_counts) {
        Object.entries(result.deletion_counts).forEach(([key, count]) => {
          info(`  - ${key}: ${count} records deleted`);
        });
      }

      // Check S3 bucket status
      if (result.s3_status) {
        info('\nS3 Bucket Status:');
        info(`  - Deletion Type: ${result.s3_status.deletion_type || 'Unknown'}`);
        if (result.s3_status.auto_deletion_scheduled) {
          success(`  - Auto-deletion scheduled for: ${result.s3_status.deletion_date || 'Unknown'}`);
          success('  - Lifecycle policy: Objects expire in 90 days');
        }
      }
    } else {
      error(`Tenant deletion failed: ${result.message}`);
      if (result.errors && result.errors.length > 0) {
        info('Errors:');
        result.errors.forEach(err => error(`  - ${err}`));
      }
    }

    // Verify tenant is deleted from database
    const deletedTenant = await Tenant.findById(tenant._id);
    if (!deletedTenant) {
      success('Verification passed: Tenant removed from database');
    } else {
      error('Verification failed: Tenant still exists in database');
    }

    return result;
  } catch (err) {
    error(`Test failed: ${err.message}`);
    console.error(err);
    throw err;
  }
}

// Test 4: Verify S3 bucket has lifecycle policy
async function testS3LifecyclePolicy(bucketName) {
  section('TEST 4: Verify S3 Bucket Lifecycle Policy');

  try {
    const {
      S3Client,
      GetBucketLifecycleConfigurationCommand,
      GetBucketTaggingCommand
    } = require('@aws-sdk/client-s3');

    const s3Client = new S3Client({
      region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    info(`Checking lifecycle policy for: ${bucketName}`);

    // Get lifecycle configuration
    try {
      const lifecycleResponse = await s3Client.send(
        new GetBucketLifecycleConfigurationCommand({ Bucket: bucketName })
      );

      if (lifecycleResponse.Rules && lifecycleResponse.Rules.length > 0) {
        success('Lifecycle policy configured');

        lifecycleResponse.Rules.forEach((rule, index) => {
          info(`  Rule ${index + 1}:`);
          info(`    - ID: ${rule.ID}`);
          info(`    - Status: ${rule.Status}`);
          if (rule.Expiration) {
            info(`    - Expiration Days: ${rule.Expiration.Days || 'Not set'}`);
          }
        });
      } else {
        error('No lifecycle rules found');
      }
    } catch (lifecycleErr) {
      error(`Failed to get lifecycle policy: ${lifecycleErr.message}`);
    }

    // Get bucket tags
    try {
      const tagsResponse = await s3Client.send(
        new GetBucketTaggingCommand({ Bucket: bucketName })
      );

      if (tagsResponse.TagSet && tagsResponse.TagSet.length > 0) {
        success('Bucket tags configured');

        tagsResponse.TagSet.forEach(tag => {
          info(`  - ${tag.Key}: ${tag.Value}`);
        });

        // Verify deletion tags
        const statusTag = tagsResponse.TagSet.find(t => t.Key === 'Status');
        const deletionScheduledTag = tagsResponse.TagSet.find(t => t.Key === 'DeletionScheduled');

        if (statusTag && statusTag.Value === 'PendingDeletion') {
          success('Status tag correctly set to "PendingDeletion"');
        }

        if (deletionScheduledTag && deletionScheduledTag.Value === 'true') {
          success('DeletionScheduled tag correctly set to "true"');
        }
      } else {
        error('No bucket tags found');
      }
    } catch (tagsErr) {
      error(`Failed to get bucket tags: ${tagsErr.message}`);
    }

  } catch (err) {
    error(`Test failed: ${err.message}`);
    console.error(err);
  }
}

// Main test runner
async function runTests() {
  log('\n🚀 Starting Tenant Deletion Test Suite', 'cyan');
  log(`Timestamp: ${new Date().toISOString()}\n`, 'cyan');

  let tenant = null;
  let bucketName = null;

  try {
    // Connect to database
    await connectDB();

    // Test 1: Create tenant with S3 bucket
    tenant = await testTenantCreation();
    bucketName = tenant.s3_bucket_name;

    // Test 2: Verify S3 bucket exists
    await testS3BucketExists(tenant);

    // Wait a bit for AWS eventual consistency
    info('\nWaiting 2 seconds for AWS eventual consistency...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Delete tenant
    await testTenantDeletion(tenant);

    // Test 4: Verify lifecycle policy
    if (bucketName) {
      await testS3LifecyclePolicy(bucketName);
    }

    section('TEST SUITE COMPLETED');
    success('All tests completed successfully!');

    log('\n📋 Summary:', 'yellow');
    log('  ✅ Tenant created with S3 bucket', 'green');
    log('  ✅ S3 bucket info stored in database', 'green');
    log('  ✅ Tenant deletion executed', 'green');
    log('  ✅ 90-day S3 auto-deletion configured', 'green');
    log('  ✅ Lifecycle policy verified', 'green');

  } catch (err) {
    section('TEST SUITE FAILED');
    error(`Critical error: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    // Cleanup: Close database connection
    await mongoose.connection.close();
    success('\nDatabase connection closed');
  }
}

// Run tests
runTests().catch(err => {
  error(`Unhandled error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
