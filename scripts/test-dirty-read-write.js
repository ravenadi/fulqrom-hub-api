#!/usr/bin/env node

/**
 * Test script to verify dirty read and dirty write protections
 * 
 * Tests:
 * 1. Dirty Write: Concurrent updates should trigger 409 Conflict
 * 2. Dirty Read: Unauthorized access should be denied (401/403)
 * 3. Version checking: Updates without version should return 428
 */

const http = require('http');

const API_BASE_URL = process.env.API_URL || 'http://localhost:30001';
const API_ENDPOINT = '/api/customers';

// Test configuration
const TEST_CONFIG = {
  // Use a real customer ID from your database (or create one first)
  customerId: process.env.TEST_CUSTOMER_ID || '68d3929ae4c5d9b3e920a9df',
  
  // Session cookie (you'll need to update this with a valid session)
  sessionCookie: process.env.TEST_SESSION_COOKIE || 'sid=d37a2d4fcc64644a03fe2c133c42db90d51016246af8a045dbb078caa6b39e2f',
  csrfToken: process.env.TEST_CSRF_TOKEN || '14796e83496ba40325d08ca142ca6920c04275cdc9c907b521e4299238dd88a2',
};

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedBody = body ? JSON.parse(body) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedBody,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body,
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test 1: Get customer and extract version
async function testGetCustomer() {
  log('\n📖 TEST 1: Get Customer (Extract Version)', 'cyan');
  
  const options = {
    hostname: 'localhost',
    port: 30001,
    path: `${API_ENDPOINT}/${TEST_CONFIG.customerId}`,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Cookie': TEST_CONFIG.sessionCookie,
      'x-csrf-token': TEST_CONFIG.csrfToken,
    },
  };
  
  try {
    const response = await makeRequest(options);
    
    if (response.statusCode === 200 && response.body.success) {
      const version = response.body.data?.__v;
      const etag = response.headers.etag;
      
      log(`✅ Customer fetched successfully`, 'green');
      log(`   Version (__v): ${version}`, 'blue');
      log(`   ETag: ${etag || 'Not set'}`, 'blue');
      
      return { version, etag, data: response.body.data };
    } else {
      log(`❌ Failed to fetch customer: ${response.statusCode}`, 'red');
      log(`   Response: ${JSON.stringify(response.body, null, 2)}`, 'yellow');
      return null;
    }
  } catch (error) {
    log(`❌ Error fetching customer: ${error.message}`, 'red');
    return null;
  }
}

// Test 2: Update without version (should fail with 428)
async function testUpdateWithoutVersion() {
  log('\n🚫 TEST 2: Update Without Version (Should Fail)', 'cyan');
  
  const updateData = {
    organisation: {
      organisation_name: 'Test Customer (No Version)',
      notes: 'This should fail - no version provided',
    },
  };
  
  const options = {
    hostname: 'localhost',
    port: 30001,
    path: `${API_ENDPOINT}/${TEST_CONFIG.customerId}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cookie': TEST_CONFIG.sessionCookie,
      'x-csrf-token': TEST_CONFIG.csrfToken,
      // NO __v in body, NO If-Match header
    },
  };
  
  try {
    const response = await makeRequest(options, updateData);
    
    if (response.statusCode === 428) {
      log(`✅ Correctly rejected: 428 Precondition Required`, 'green');
      log(`   Message: ${response.body.message}`, 'blue');
      return true;
    } else {
      log(`❌ Expected 428, got ${response.statusCode}`, 'red');
      log(`   Response: ${JSON.stringify(response.body, null, 2)}`, 'yellow');
      return false;
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return false;
  }
}

// Test 3: Update with correct version (should succeed)
async function testUpdateWithVersion(version) {
  log('\n✅ TEST 3: Update With Version (Should Succeed)', 'cyan');
  
  if (!version && version !== 0) {
    log(`⚠️  No version available, skipping test`, 'yellow');
    return false;
  }
  
  const updateData = {
    organisation: {
      organisation_name: 'Test Customer (With Version)',
      notes: `Updated at ${new Date().toISOString()}`,
    },
    __v: version, // Include version in body
  };
  
  const options = {
    hostname: 'localhost',
    port: 30001,
    path: `${API_ENDPOINT}/${TEST_CONFIG.customerId}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cookie': TEST_CONFIG.sessionCookie,
      'x-csrf-token': TEST_CONFIG.csrfToken,
    },
  };
  
  try {
    const response = await makeRequest(options, updateData);
    
    if (response.statusCode === 200 && response.body.success) {
      log(`✅ Update succeeded with version ${version}`, 'green');
      log(`   New version: ${response.body.data.__v}`, 'blue');
      return { success: true, newVersion: response.body.data.__v };
    } else {
      log(`❌ Update failed: ${response.statusCode}`, 'red');
      log(`   Response: ${JSON.stringify(response.body, null, 2)}`, 'yellow');
      return { success: false };
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return { success: false };
  }
}

// Test 4: Concurrent updates (dirty write protection)
async function testConcurrentUpdates(version) {
  log('\n⚔️  TEST 4: Concurrent Updates (Dirty Write Test)', 'cyan');
  
  if (!version && version !== 0) {
    log(`⚠️  No version available, skipping test`, 'yellow');
    return false;
  }
  
  log(`   Simulating two concurrent updates with same version...`, 'blue');
  
  const updateData1 = {
    organisation: {
      organisation_name: 'Update 1',
      notes: 'First concurrent update',
    },
    __v: version,
  };
  
  const updateData2 = {
    organisation: {
      organisation_name: 'Update 2',
      notes: 'Second concurrent update',
    },
    __v: version, // Same old version
  };
  
  const makeUpdateRequest = (data, label) => {
    const options = {
      hostname: 'localhost',
      port: 30001,
      path: `${API_ENDPOINT}/${TEST_CONFIG.customerId}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cookie': TEST_CONFIG.sessionCookie,
        'x-csrf-token': TEST_CONFIG.csrfToken,
      },
    };
    
    return makeRequest(options, data).then(response => ({
      label,
      response,
    }));
  };
  
  try {
    // Launch both requests concurrently
    const [result1, result2] = await Promise.all([
      makeUpdateRequest(updateData1, 'Update 1'),
      makeUpdateRequest(updateData2, 'Update 2'),
    ]);
    
    // Check results
    const success1 = result1.response.statusCode === 200;
    const success2 = result2.response.statusCode === 200;
    const conflict1 = result1.response.statusCode === 409;
    const conflict2 = result2.response.statusCode === 409;
    
    log(`   ${result1.label}: ${result1.response.statusCode} ${result1.response.body.code || ''}`, 'blue');
    log(`   ${result2.label}: ${result2.response.statusCode} ${result2.response.body.code || ''}`, 'blue');
    
    if ((success1 && conflict2) || (success2 && conflict1)) {
      log(`✅ Dirty write protection working! One succeeded, other got 409 Conflict`, 'green');
      return true;
    } else if (conflict1 && conflict2) {
      log(`⚠️  Both got 409 - both detected conflict (might be OK)`, 'yellow');
      return true;
    } else if (success1 && success2) {
      log(`❌ Both updates succeeded - dirty write protection NOT working!`, 'red');
      return false;
    } else {
      log(`❌ Unexpected results`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return false;
  }
}

// Test 5: Unauthorized access (dirty read protection)
async function testUnauthorizedAccess() {
  log('\n🔒 TEST 5: Unauthorized Access (Dirty Read Test)', 'cyan');
  
  // Try to access without authentication
  const options = {
    hostname: 'localhost',
    port: 30001,
    path: `${API_ENDPOINT}/${TEST_CONFIG.customerId}`,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      // NO cookies, NO CSRF token
    },
  };
  
  try {
    const response = await makeRequest(options);
    
    if (response.statusCode === 401 || response.statusCode === 403) {
      log(`✅ Correctly denied unauthorized access: ${response.statusCode}`, 'green');
      log(`   Message: ${response.body.message || 'Access denied'}`, 'blue');
      return true;
    } else if (response.statusCode === 200) {
      log(`❌ Unauthorized access allowed - dirty read protection NOT working!`, 'red');
      return false;
    } else {
      log(`⚠️  Unexpected status: ${response.statusCode}`, 'yellow');
      return false;
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return false;
  }
}

// Test 6: Update with stale version (should fail with 409)
async function testStaleVersion() {
  log('\n⏰ TEST 6: Update With Stale Version (Should Fail)', 'cyan');
  
  // Get current version first
  const customer = await testGetCustomer();
  if (!customer || customer.version === undefined) {
    log(`⚠️  Could not get customer, skipping test`, 'yellow');
    return false;
  }
  
  // First, update to increment version
  const firstUpdate = await testUpdateWithVersion(customer.version);
  if (!firstUpdate.success) {
    log(`⚠️  Could not perform initial update, skipping test`, 'yellow');
    return false;
  }
  
  // Now try to update with the old (stale) version
  const staleVersion = customer.version; // Old version
  const currentVersion = firstUpdate.newVersion; // New version after update
  
  log(`   Attempting update with stale version ${staleVersion} (current is ${currentVersion})...`, 'blue');
  
  const updateData = {
    organisation: {
      organisation_name: 'Should Fail - Stale Version',
      notes: 'This should fail',
    },
    __v: staleVersion, // Stale version
  };
  
  const options = {
    hostname: 'localhost',
    port: 30001,
    path: `${API_ENDPOINT}/${TEST_CONFIG.customerId}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cookie': TEST_CONFIG.sessionCookie,
      'x-csrf-token': TEST_CONFIG.csrfToken,
    },
  };
  
  try {
    const response = await makeRequest(options, updateData);
    
    if (response.statusCode === 409) {
      log(`✅ Correctly rejected stale version: 409 Conflict`, 'green');
      log(`   Expected version: ${currentVersion}, provided: ${staleVersion}`, 'blue');
      return true;
    } else {
      log(`❌ Expected 409, got ${response.statusCode}`, 'red');
      log(`   Response: ${JSON.stringify(response.body, null, 2)}`, 'yellow');
      return false;
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return false;
  }
}

// Main test runner
async function runTests() {
  log('\n🧪 Starting Dirty Read/Write Protection Tests', 'cyan');
  log('='.repeat(60), 'cyan');
  
  const results = {
    'Get Customer': false,
    'Update Without Version': false,
    'Update With Version': false,
    'Concurrent Updates': false,
    'Unauthorized Access': false,
    'Stale Version': false,
  };
  
  // Test 1: Get customer
  const customer = await testGetCustomer();
  results['Get Customer'] = customer !== null;
  
  if (!customer || customer.version === undefined) {
    log(`\n⚠️  Warning: Could not fetch customer or extract version.`, 'yellow');
    log(`   Some tests will be skipped.`, 'yellow');
    log(`   Make sure TEST_CUSTOMER_ID exists and you have valid session cookies.`, 'yellow');
  }
  
  // Test 2: Update without version
  results['Update Without Version'] = await testUpdateWithoutVersion();
  
  // Test 3: Update with version (if we have one)
  if (customer && customer.version !== undefined) {
    results['Update With Version'] = (await testUpdateWithVersion(customer.version)).success;
  }
  
  // Test 4: Concurrent updates
  if (customer && customer.version !== undefined) {
    results['Concurrent Updates'] = await testConcurrentUpdates(customer.version);
  }
  
  // Test 5: Unauthorized access
  results['Unauthorized Access'] = await testUnauthorizedAccess();
  
  // Test 6: Stale version
  if (customer && customer.version !== undefined) {
    results['Stale Version'] = await testStaleVersion();
  }
  
  // Print summary
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 TEST SUMMARY', 'cyan');
  log('='.repeat(60), 'cyan');
  
  let passed = 0;
  let total = 0;
  
  for (const [testName, passedTest] of Object.entries(results)) {
    total++;
    if (passedTest) {
      passed++;
      log(`✅ ${testName}: PASSED`, 'green');
    } else {
      log(`❌ ${testName}: FAILED`, 'red');
    }
  }
  
  log('='.repeat(60), 'cyan');
  log(`Results: ${passed}/${total} tests passed`, passed === total ? 'green' : 'yellow');
  
  if (passed === total) {
    log('\n🎉 All tests passed! Dirty read/write protections are working.', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  Some tests failed. Review the output above.', 'yellow');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

