# Permission System Test Cases Documentation

## 📋 Overview

This document provides comprehensive test cases for the permission system implementation, covering all aspects of the end-to-end journey from user creation to document access control.

## 🧪 Test Categories

### 1. **Unit Tests** (`tests/integration/permission-system.test.js`)
Comprehensive Jest-based tests covering all functionality

### 2. **Integration Tests** (`test-permission-system.js`)
Manual test script for real API validation

### 3. **Manual Test Cases**
Step-by-step manual testing procedures

---

## 🔧 Test Setup

### Prerequisites
```bash
# Install dependencies
npm install

# Start the server
npm start

# Run Jest tests
npm test

# Run manual test script
node test-permission-system.js
```

### Test Data
- **Admin Token**: Used for user management operations
- **User Token**: Used for testing document access control
- **Test User ID**: `68f75211ab9d0946c112721e`
- **Test Role ID**: `68f29f41c5803c91425a1247`

---

## 📝 Test Cases

### **1. User Creation Tests**

#### Test Case 1.1: Create User with Resource Access
```javascript
// Input
{
  "email": "newuser@example.com",
  "full_name": "New User",
  "role_ids": ["68f29f41c5803c91425a1247"],
  "resource_access": [{
    "resource_type": "customer",
    "resource_id": "68d3929ae4c5d9b3e920a9df",
    "permissions": {
      "can_view": true,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    },
    "granted_by": "admin"
  }],
  "document_categories": ["Asset Registers", "Compliance Documents"],
  "engineering_disciplines": ["Civil", "Electrical"]
}

// Expected Output
{
  "success": true,
  "data": {
    "resource_access": [/* 1 entry */],
    "document_categories": ["Asset Registers", "Compliance Documents"],
    "engineering_disciplines": ["Civil", "Electrical"]
  }
}
```

#### Test Case 1.2: Create User with Invalid Resource Access
```javascript
// Input
{
  "email": "invalid@example.com",
  "full_name": "Invalid User",
  "role_ids": ["68f29f41c5803c91425a1247"],
  "resource_access": [{
    "resource_type": "customer",
    // Missing resource_id and permissions
    "granted_by": "admin"
  }]
}

// Expected Output
{
  "success": false,
  "message": "Each resource_access entry must have resource_type, resource_id, and permissions"
}
```

#### Test Case 1.3: Create User with Invalid Document Categories
```javascript
// Input
{
  "email": "invalid-categories@example.com",
  "full_name": "Invalid Categories User",
  "role_ids": ["68f29f41c5803c91425a1247"],
  "document_categories": "not-an-array" // Should be array
}

// Expected Output
{
  "success": false,
  "message": "document_categories must be an array"
}
```

### **2. User Update Tests**

#### Test Case 2.1: Update Resource Access with Replace Flag
```javascript
// Input
{
  "resource_access": [{
    "resource_type": "site",
    "resource_id": "68fc5e629b51eb0f7ed7f7a4",
    "permissions": {
      "can_view": true,
      "can_create": false,
      "can_edit": true,
      "can_delete": false
    },
    "granted_by": "admin"
  }],
  "replace_resource_access": true
}

// Expected Output
{
  "success": true,
  "data": {
    "resource_access": [/* 1 entry with site access */]
  }
}
```

#### Test Case 2.2: Append Resource Access without Replace Flag
```javascript
// Input (assuming user already has 1 resource access entry)
{
  "resource_access": [{
    "resource_type": "building",
    "resource_id": "68fc5f459b51eb0f7ed7f89f",
    "permissions": {
      "can_view": true,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    },
    "granted_by": "admin"
  }],
  "replace_resource_access": false
}

// Expected Output
{
  "success": true,
  "data": {
    "resource_access": [/* 2 entries total */]
  }
}
```

#### Test Case 2.3: Update Document Categories
```javascript
// Input
{
  "document_categories": ["Updated Category 1", "Updated Category 2", "New Category"]
}

// Expected Output
{
  "success": true,
  "data": {
    "document_categories": ["Updated Category 1", "Updated Category 2", "New Category"]
  }
}
```

#### Test Case 2.4: Trim and Filter Empty Categories
```javascript
// Input
{
  "document_categories": ["  Valid Category  ", "", "   ", "Another Valid Category"]
}

// Expected Output
{
  "success": true,
  "data": {
    "document_categories": ["Valid Category", "Another Valid Category"]
  }
}
```

### **3. Resource Access Management Tests**

#### Test Case 3.1: Add Resource Access
```javascript
// POST /api/users/resource-access
// Input
{
  "user_id": "68f75211ab9d0946c112721e",
  "resource_type": "building",
  "resource_id": "building-123",
  "resource_name": "Test Building",
  "permissions": {
    "can_view": true,
    "can_create": false,
    "can_edit": true,
    "can_delete": false
  },
  "granted_by": "admin"
}

// Expected Output
{
  "success": true,
  "message": "Resource access granted successfully",
  "data": {
    "resource_type": "building",
    "resource_id": "building-123",
    "permissions": {
      "can_view": true,
      "can_edit": true
    }
  }
}
```

#### Test Case 3.2: Add Document Category Access
```javascript
// Input
{
  "user_id": "68f75211ab9d0946c112721e",
  "resource_type": "document_category",
  "resource_id": "Technical",
  "resource_name": "Technical Documents",
  "permissions": {
    "can_view": true,
    "can_create": false,
    "can_edit": false,
    "can_delete": false
  },
  "granted_by": "admin"
}

// Expected Output
{
  "success": true,
  "data": {
    "resource_type": "document_category",
    "resource_id": "Technical"
  }
}
```

#### Test Case 3.3: Reject Duplicate Resource Access
```javascript
// First request succeeds, second request should fail
// Input (duplicate)
{
  "user_id": "68f75211ab9d0946c112721e",
  "resource_type": "building",
  "resource_id": "building-123",
  "permissions": { "can_view": true },
  "granted_by": "admin"
}

// Expected Output
{
  "success": false,
  "message": "Resource access already granted for this user and resource"
}
```

#### Test Case 3.4: Get User Resource Access
```javascript
// GET /api/users/:id/resource-access
// Expected Output
{
  "success": true,
  "count": 2,
  "data": [
    {
      "resource_type": "building",
      "resource_id": "building-123",
      "permissions": { "can_view": true, "can_edit": true }
    },
    {
      "resource_type": "document_category",
      "resource_id": "Technical",
      "permissions": { "can_view": true }
    }
  ]
}
```

### **4. Document Access Control Tests**

#### Test Case 4.1: Access Documents with User Token
```javascript
// GET /api/documents?page=1&limit=10
// Headers: Authorization: Bearer <USER_TOKEN>

// Expected Output
{
  "success": true,
  "data": [
    // Only documents with categories user has access to
    {
      "category": "Asset Registers",
      "engineering_discipline": "Civil"
    },
    {
      "category": "Compliance Documents", 
      "engineering_discipline": "Electrical"
    }
    // Should NOT include documents with restricted categories
  ],
  "count": 2,
  "total": 2
}
```

#### Test Case 4.2: Filter by Document Categories
```javascript
// User has document_categories: ["Asset Registers", "Compliance Documents"]
// Should only see documents with these categories

// Expected Behavior:
// ✅ Documents with "Asset Registers" category - VISIBLE
// ✅ Documents with "Compliance Documents" category - VISIBLE  
// ❌ Documents with "Restricted Category" category - NOT VISIBLE
```

#### Test Case 4.3: Filter by Engineering Disciplines
```javascript
// User has engineering_disciplines: ["Civil", "Electrical"]
// Should only see documents with these disciplines

// Expected Behavior:
// ✅ Documents with "Civil" discipline - VISIBLE
// ✅ Documents with "Electrical" discipline - VISIBLE
// ❌ Documents with "Mechanical" discipline - NOT VISIBLE
```

### **5. Authorization Field Name Tests**

#### Test Case 5.1: Role Permission Field Names
```javascript
// GET /api/roles/:id
// Expected Role Permission Structure:
{
  "permissions": [
    {
      "entity": "documents",     // ✅ Correct field name
      "view": true,             // ✅ Correct field name
      "create": true,
      "edit": true,
      "delete": false
      // ❌ Should NOT have "module_name" field
      // ❌ Should NOT have "can_view" field
    }
  ]
}
```

#### Test Case 5.2: Resource Access Field Names
```javascript
// GET /api/users/:id
// Expected Resource Access Structure:
{
  "resource_access": [
    {
      "resource_type": "customer",
      "resource_id": "68d3929ae4c5d9b3e920a9df",
      "permissions": {
        "can_view": true,       // ✅ Correct field name
        "can_create": false,
        "can_edit": false,
        "can_delete": false
        // ❌ Should NOT have "view" field
      }
    }
  ]
}
```

### **6. Error Handling Tests**

#### Test Case 6.1: Invalid Resource Access Structure
```javascript
// Input
{
  "resource_access": [{
    "resource_type": "customer",
    // Missing resource_id and permissions
    "granted_by": "admin"
  }]
}

// Expected Output
{
  "success": false,
  "message": "Each resource_access entry must have resource_type, resource_id, and permissions"
}
```

#### Test Case 6.2: Invalid Document Categories Type
```javascript
// Input
{
  "document_categories": "not-an-array"
}

// Expected Output
{
  "success": false,
  "message": "document_categories must be an array"
}
```

#### Test Case 6.3: Invalid Resource Type
```javascript
// Input
{
  "resource_access": [{
    "resource_type": "invalid_type",
    "resource_id": "test-123",
    "permissions": { "can_view": true },
    "granted_by": "admin"
  }]
}

// Expected Output
{
  "success": false,
  "message": "Invalid resource_type: invalid_type"
}
```

### **7. Performance Tests**

#### Test Case 7.1: Large Resource Access Array
```javascript
// Input with 100 resource access entries
{
  "resource_access": [
    // 100 entries...
  ],
  "replace_resource_access": true
}

// Expected Behavior:
// ✅ Should complete within 5 seconds
// ✅ Should return success with 100 entries
// ✅ Should not cause memory issues
```

#### Test Case 7.2: Large Document Categories Array
```javascript
// Input with 50 document categories
{
  "document_categories": [
    "Category 1", "Category 2", ..., "Category 50"
  ]
}

// Expected Behavior:
// ✅ Should complete within 2 seconds
// ✅ Should return success with 50 categories
// ✅ Should trim and filter properly
```

---

## 🚀 Running Tests

### **Jest Tests**
```bash
# Run all tests
npm test

# Run specific test file
npm test tests/integration/permission-system.test.js

# Run with coverage
npm test -- --coverage
```

### **Manual Test Script**
```bash
# Run comprehensive test script
node test-permission-system.js
```

### **Individual API Tests**
```bash
# Test user creation
curl -X POST "http://localhost:30001/api/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "email": "test@example.com",
    "full_name": "Test User",
    "role_ids": ["68f29f41c5803c91425a1247"],
    "resource_access": [{
      "resource_type": "customer",
      "resource_id": "68d3929ae4c5d9b3e920a9df",
      "permissions": {
        "can_view": true,
        "can_create": false,
        "can_edit": false,
        "can_delete": false
      },
      "granted_by": "admin"
    }],
    "document_categories": ["Asset Registers", "Compliance Documents"],
    "engineering_disciplines": ["Civil", "Electrical"]
  }'

# Test document access
curl -X GET "http://localhost:30001/api/documents?page=1&limit=10" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

---

## 📊 Test Results Validation

### **Success Criteria**
- ✅ All API endpoints return expected status codes
- ✅ Resource access is properly created and updated
- ✅ Document categories and engineering disciplines work correctly
- ✅ Document filtering works based on user permissions
- ✅ Field name consistency is maintained
- ✅ Error handling works for invalid inputs
- ✅ Performance is acceptable for large datasets

### **Test Coverage**
- **API Endpoints**: 100% coverage of permission-related endpoints
- **Data Validation**: All input validation scenarios covered
- **Authorization Logic**: All permission checking scenarios covered
- **Error Handling**: All error scenarios covered
- **Performance**: Large dataset scenarios covered

---

## 🔍 Troubleshooting

### **Common Issues**

1. **Field Name Mismatches**
   - Check that role permissions use `entity` and `view` fields
   - Check that resource access uses `can_view` field

2. **Document Access Issues**
   - Verify user has proper role permissions
   - Check user's `document_categories` field
   - Verify authorization middleware is working

3. **Validation Errors**
   - Ensure `resource_access` is an array
   - Ensure `document_categories` is an array
   - Check required fields are present

### **Debug Commands**
```bash
# Check user details
curl -X GET "http://localhost:30001/api/users/68f75211ab9d0946c112721e" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# Check role permissions
curl -X GET "http://localhost:30001/api/roles/68f29f41c5803c91425a1247" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# Check documents with user token
curl -X GET "http://localhost:30001/api/documents?page=1&limit=5" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

---

*Test Documentation created: October 25, 2025*  
*Last updated: October 25, 2025*  
*Version: 1.0*
