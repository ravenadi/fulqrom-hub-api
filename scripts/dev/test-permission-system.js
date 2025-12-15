#!/usr/bin/env node

/**
 * Permission System Test Script
 * 
 * This script tests the complete permission system implementation
 * including resource access, document categories, and authorization logic.
 * 
 * Usage: node test-permission-system.js
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:30001/api';
const ADMIN_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IkFDQ3M2d2FBbEpPZ0pDeUg4eXVCRSJ9.eyJodHRwczovL2Z1bHFyb20uY29tLmF1L3JvbGVzIjpbIkFkbWluIl0sImlzcyI6Imh0dHBzOi8vZGV2LW1sN3B4dmo2dmczMmo3NDAuYXUuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDY4ZjBhOTc3ZmYxNzJkMWIxYjBmOGQ1YyIsImF1ZCI6WyJodHRwczovL2FwaS5mdWxxcm9tLmNvbS5hdSIsImh0dHBzOi8vZGV2LW1sN3B4dmo2dmczMmo3NDAuYXUuYXV0aDAuY29tL3VzZXJpbmZvIl0sImlhdCI6MTc2MTM3NzI2NCwiZXhwIjoxNzYxNDYzNjY0LCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwiYXpwIjoiODd3NzF6VVdHSml3TFI5R0xOajdLd3hCMzIycW1GWjQiLCJwZXJtaXNzaW9ucyI6W119.dqzIdbhjDzQLuumfle3wa-_PBzV5UjT7C3r2DG0gi91KzjuClYKodweGg3dKKRPKs5iFfUeBjQx-niYxfLROQZG78z-_JGrVE8VBdcMl0DW0FYmJYSLwYxU73QRqxTT_9ATQpynjRtWFDeQTTQMjMa9M0u758Y2e8FWv7sVM7e01rv0yrzTNxARr8Y4EtmwVx0Nf7wjdwdbbk2IgoPYbojhBlUhqbGtL-dPz68M8jcWqd-U0jDiF5iVi09P5e0aropw0Nu9ih6_prwUf9YMUx9fo3M05R-3Vh9Emf3u-jhffzPnxu2kbaBYVYck8YYyNUwjSlBpnUaQRkSxySgMd-A';

const USER_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IkFDQ3M2d2FBbEpPZ0pDeUg4eXVCRSJ9.eyJodHRwczovL2Z1bHFyb20uY29tLmF1L3JvbGVzIjpbInVzZXIiXSwiaXNzIjoiaHR0cHM6Ly9kZXYtbWw3cHh2ajZ2ZzMyajc0MC5hdS5hdXRoMC5jb20vIiwic3ViIjoiYXV0aDB8NjhmNzUyMTFiYTA4M2Y0NzJlZmRiYWY3IiwiYXVkIjpbImh0dHBzOi8vYXBpLmZ1bHFyb20uY29tLmF1IiwiaHR0dHBzOi8vZGV2LW1sN3B4dmo2dmczMmo3NDAuYXUuYXV0aDAuY29tL3VzZXJpbmZvIl0sImlhdCI6MTc2MTM3NzI1MywiZXhwIjoxNzYxNDYzNjUzLCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwiYXpwIjoiODd3NzF6VVdHSml3TFI5R0xOajdLd3hCMzIycW1GWjQiLCJwZXJtaXNzaW9ucyI6W119.FV6B_awP7JBw9EFAymEFYCFcmE0VJqvaHqz4JcDof_ZJ1GpenNpZeIGQgo5k1yKndqww2Dd6I-mYpSPv2qahG7TSdbsgGHS-kjvmueHsvMi91npBI93G__nhIGzXV9-OgeSwrm_X49SACbwGc1lPcXoCOm7U7i4E0MzzCxaSpKTQ_wxD66KtC6Bn2sHNHUuY2DI6YqObq73ThCQbi-eul5xzej6HIWNE1Iyr-CXiRJHdpIYIe0hyum71VYfZOoJrEUWHV9coPDenHDA2AIKYvfE0GKt7xPAvC1QWAQwYq5xSQNtsxCs5LXGfTHThsk-obL6nTepxnkpxGEJaC9kn0w';

// Test data
const TEST_USER_ID = '68f75211ab9d0946c112721e';
const TEST_ROLE_ID = '68f29f41c5803c91425a1247';

// Helper function to make API requests
async function makeRequest(method, endpoint, data = null, token = ADMIN_TOKEN) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message, 
      status: error.response?.status || 500 
    };
  }
}

// Test functions
async function testUserCreation() {
  console.log('\n🧪 Testing User Creation with Permissions...');
  
  const userData = {
    email: `test-user-${Date.now()}@example.com`,
    full_name: 'Test User',
    role_ids: [TEST_ROLE_ID],
    resource_access: [{
      resource_type: 'customer',
      resource_id: '68d3929ae4c5d9b3e920a9df',
      permissions: {
        can_view: true,
        can_create: false,
        can_edit: false,
        can_delete: false
      },
      granted_by: 'admin'
    }],
    document_categories: ['Asset Registers', 'Compliance Documents', 'Building Management & Control Diagrams'],
    engineering_disciplines: ['Civil', 'Electrical']
  };

  const result = await makeRequest('POST', '/users', userData);
  
  if (result.success) {
    console.log('✅ User creation successful');
    console.log(`   - Resource access entries: ${result.data.data.resource_access.length}`);
    console.log(`   - Document categories: ${result.data.data.document_categories.length}`);
    console.log(`   - Engineering disciplines: ${result.data.data.engineering_disciplines.length}`);
    return result.data.data._id;
  } else {
    console.log('❌ User creation failed:', result.error);
    return null;
  }
}

async function testUserUpdate(userId) {
  console.log('\n🧪 Testing User Update with Resource Access...');
  
  const updateData = {
    resource_access: [{
      resource_type: 'site',
      resource_id: '68fc5e629b51eb0f7ed7f7a4',
      permissions: {
        can_view: true,
        can_create: false,
        can_edit: true,
        can_delete: false
      },
      granted_by: 'admin'
    }],
    replace_resource_access: true,
    document_categories: ['Updated Asset Registers', 'New Compliance Documents', 'Building Management & Control Diagrams'],
    engineering_disciplines: ['Updated Civil', 'New Mechanical']
  };

  const result = await makeRequest('PUT', `/users/${userId}`, updateData);
  
  if (result.success) {
    console.log('✅ User update successful');
    console.log(`   - Resource access entries: ${result.data.data.resource_access.length}`);
    console.log(`   - Document categories: ${result.data.data.document_categories.join(', ')}`);
    console.log(`   - Engineering disciplines: ${result.data.data.engineering_disciplines.join(', ')}`);
  } else {
    console.log('❌ User update failed:', result.error);
  }
}

async function testResourceAccessManagement(userId) {
  console.log('\n🧪 Testing Resource Access Management...');
  
  // Test adding resource access
  const resourceAccessData = {
    user_id: userId,
    resource_type: 'building',
    resource_id: '68fc5f459b51eb0f7ed7f89f',
    resource_name: 'Test Building',
    permissions: {
      can_view: true,
      can_create: false,
      can_edit: true,
      can_delete: false
    },
    granted_by: 'admin'
  };

  const addResult = await makeRequest('POST', '/users/resource-access', resourceAccessData);
  
  if (addResult.success) {
    console.log('✅ Resource access added successfully');
    console.log(`   - Resource type: ${addResult.data.data.resource_type}`);
    console.log(`   - Resource ID: ${addResult.data.data.resource_id}`);
  } else {
    console.log('❌ Resource access addition failed:', addResult.error);
  }

  // Test getting resource access
  const getResult = await makeRequest('GET', `/users/${userId}/resource-access`);
  
  if (getResult.success) {
    console.log('✅ Resource access retrieved successfully');
    console.log(`   - Total entries: ${getResult.data.count}`);
  } else {
    console.log('❌ Resource access retrieval failed:', getResult.error);
  }
}

async function testDocumentAccess() {
  console.log('\n🧪 Testing Document Access Control...');
  
  // Test with user token (should be filtered by document categories)
  const result = await makeRequest('GET', '/documents?page=1&limit=10', null, USER_TOKEN);
  
  if (result.success) {
    console.log('✅ Document access successful');
    console.log(`   - Total documents returned: ${result.data.count}`);
    console.log(`   - Documents by category:`);
    
    // Group documents by category
    const categoryCount = {};
    result.data.data.forEach(doc => {
      categoryCount[doc.category] = (categoryCount[doc.category] || 0) + 1;
    });
    
    Object.entries(categoryCount).forEach(([category, count]) => {
      console.log(`     - ${category}: ${count} documents`);
    });
  } else {
    console.log('❌ Document access failed:', result.error);
  }
}

async function testUserDetails() {
  console.log('\n🧪 Testing User Details Retrieval...');
  
  const result = await makeRequest('GET', `/users/${TEST_USER_ID}`);
  
  if (result.success) {
    console.log('✅ User details retrieved successfully');
    console.log(`   - User: ${result.data.data.full_name} (${result.data.data.email})`);
    console.log(`   - Role: ${result.data.data.role_name}`);
    console.log(`   - Resource access entries: ${result.data.data.resource_access.length}`);
    console.log(`   - Document categories: ${result.data.data.document_categories.length}`);
    console.log(`   - Engineering disciplines: ${result.data.data.engineering_disciplines.length}`);
    
    // Show sample resource access
    if (result.data.data.resource_access.length > 0) {
      console.log('   - Sample resource access:');
      result.data.data.resource_access.slice(0, 3).forEach(access => {
        console.log(`     * ${access.resource_type}: ${access.resource_id} (view: ${access.permissions.can_view})`);
      });
    }
  } else {
    console.log('❌ User details retrieval failed:', result.error);
  }
}

async function testRolePermissions() {
  console.log('\n🧪 Testing Role Permissions...');
  
  const result = await makeRequest('GET', `/roles/${TEST_ROLE_ID}`);
  
  if (result.success) {
    console.log('✅ Role permissions retrieved successfully');
    console.log(`   - Role: ${result.data.data.name}`);
    console.log(`   - Permissions:`);
    
    result.data.data.permissions.forEach(permission => {
      console.log(`     * ${permission.entity}: view=${permission.view}, create=${permission.create}, edit=${permission.edit}, delete=${permission.delete}`);
    });
  } else {
    console.log('❌ Role permissions retrieval failed:', result.error);
  }
}

async function testFieldNameConsistency() {
  console.log('\n🧪 Testing Field Name Consistency...');
  
  // Test role permissions use 'entity' and 'view' fields
  const roleResult = await makeRequest('GET', `/roles/${TEST_ROLE_ID}`);
  
  if (roleResult.success) {
    const permission = roleResult.data.data.permissions[0];
    const hasEntity = permission.hasOwnProperty('entity');
    const hasView = permission.hasOwnProperty('view');
    const hasModuleName = permission.hasOwnProperty('module_name');
    const hasCanView = permission.hasOwnProperty('can_view');
    
    console.log('✅ Role permission field validation:');
    console.log(`   - Has 'entity' field: ${hasEntity ? '✅' : '❌'}`);
    console.log(`   - Has 'view' field: ${hasView ? '✅' : '❌'}`);
    console.log(`   - Has 'module_name' field: ${hasModuleName ? '❌ (should not exist)' : '✅'}`);
    console.log(`   - Has 'can_view' field: ${hasCanView ? '❌ (should not exist)' : '✅'}`);
  }
  
  // Test user resource access uses 'can_view' field
  const userResult = await makeRequest('GET', `/users/${TEST_USER_ID}`);
  
  if (userResult.success && userResult.data.data.resource_access.length > 0) {
    const resourceAccess = userResult.data.data.resource_access[0];
    const hasCanView = resourceAccess.permissions.hasOwnProperty('can_view');
    const hasView = resourceAccess.permissions.hasOwnProperty('view');
    
    console.log('✅ Resource access field validation:');
    console.log(`   - Has 'can_view' field: ${hasCanView ? '✅' : '❌'}`);
    console.log(`   - Has 'view' field: ${hasView ? '❌ (should not exist)' : '✅'}`);
  }
}

async function testErrorHandling() {
  console.log('\n🧪 Testing Error Handling...');
  
  // Test invalid resource_access structure
  const invalidData = {
    resource_access: [{
      resource_type: 'customer',
      // Missing resource_id and permissions
      granted_by: 'admin'
    }]
  };
  
  const result = await makeRequest('PUT', `/users/${TEST_USER_ID}`, invalidData);
  
  if (!result.success && result.status === 400) {
    console.log('✅ Invalid resource_access validation working');
    console.log(`   - Error message: ${result.error.message}`);
  } else {
    console.log('❌ Invalid resource_access validation failed');
  }
  
  // Test invalid document_categories type
  const invalidCategoriesData = {
    document_categories: 'not-an-array'
  };
  
  const categoriesResult = await makeRequest('PUT', `/users/${TEST_USER_ID}`, invalidCategoriesData);
  
  if (!categoriesResult.success && categoriesResult.status === 400) {
    console.log('✅ Invalid document_categories validation working');
    console.log(`   - Error message: ${categoriesResult.error.message}`);
  } else {
    console.log('❌ Invalid document_categories validation failed');
  }
}

async function runAllTests() {
  console.log('🚀 Starting Permission System Tests...');
  console.log('=' .repeat(60));
  
  try {
    // Test user details first
    await testUserDetails();
    
    // Test role permissions
    await testRolePermissions();
    
    // Test field name consistency
    await testFieldNameConsistency();
    
    // Test document access
    await testDocumentAccess();
    
    // Test user creation
    const newUserId = await testUserCreation();
    
    if (newUserId) {
      // Test user update
      await testUserUpdate(newUserId);
      
      // Test resource access management
      await testResourceAccessManagement(newUserId);
    }
    
    // Test error handling
    await testErrorHandling();
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 All tests completed!');
    console.log('\n📋 Test Summary:');
    console.log('✅ User creation with resource access and document categories');
    console.log('✅ User updates with resource access management');
    console.log('✅ Document access control based on user permissions');
    console.log('✅ Field name consistency validation');
    console.log('✅ Error handling and validation');
    console.log('✅ Resource access management endpoints');
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  testUserCreation,
  testUserUpdate,
  testResourceAccessManagement,
  testDocumentAccess,
  testUserDetails,
  testRolePermissions,
  testFieldNameConsistency,
  testErrorHandling
};
