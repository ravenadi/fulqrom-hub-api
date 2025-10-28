# Resource Access Debug Guide

## Current Status

✅ **Database Storage:** Working - resource_access entries are being saved correctly
✅ **API Endpoint:** Available - requires authentication token
⚠️  **Frontend Display:** Needs verification

## Current Database State

User: `68f75211ab9d0946c112721e` (mchetan@gkblabs.com)
- **Has 1 resource_access entry:**
  - Type: `building`
  - ID: `test-building-123`
  - Name: `Test Building`
  - Permissions: view + edit

## Testing Steps

### 1. Open the User Edit Page

```
URL: http://localhost:8080/hub/users/edit/68f75211ab9d0946c112721e
```

### 2. Open Browser Console

Press `F12` or `Cmd+Option+I` (Mac) to open Developer Tools

### 3. Look for These Console Logs

When the page loads, you should see:

```
📥 Raw user data from API: {
  userId: "68f75211ab9d0946c112721e",
  hasResourceAccess: true,
  resourceAccessCount: 1,
  rawResourceAccess: [{ resource_type: "building", ... }]
}

📤 Transformed user data: {
  userId: "68f75211ab9d0946c112721e",
  hasResourceAccess: true,
  resourceAccessCount: 1,
  transformedResourceAccess: [{ resourceType: "building", ... }]
}

🔍 ResourceAccessManager received: {
  userId: "68f75211ab9d0946c112721e",
  existingAccessCount: 1,
  existingAccess: [{ resourceType: "building", ... }]
}
```

### 4. Navigate to Resource Access Tab

Click on the "Resource Access" tab in the page.

### 5. Check What's Displayed

**EXPECTED:**
- Should show 1 resource access entry
- Building icon
- "test-building-123"
- "Test Building"
- Edit badge
- Delete button

**IF YOU SEE:**
- "No resource access assigned" - Data not reaching component
- Empty list - Transformation issue
- Error message - Check console for errors

## Possible Issues & Solutions

### Issue 1: Console shows resourceAccessCount: 0

**Problem:** API not returning resource_access data

**Solution:**
```bash
# Check if data exists in DB
cd rest-api
node -e "
const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_CONNECTION).then(() => {
  const User = require('./models/User');
  return User.findById('68f75211ab9d0946c112721e');
}).then(user => {
  console.log('Resource Access:', user.resource_access);
  process.exit(0);
});
"
```

### Issue 2: transformedResourceAccess is empty array

**Problem:** Transformation logic issue

**Fix:** Check `src/services/userManagementApi.ts:45-69` - transformUser method

### Issue 3: ResourceAccessManager shows count but no entries

**Problem:** UI rendering issue

**Fix:** Check `src/components/admin/ResourceAccessManager.tsx:143-174` - mapping logic

### Issue 4: "Authorization token is missing"

**Problem:** Not logged in or token expired

**Solution:**
1. Log out
2. Log back in
3. Retry

## Quick Fix: Clear and Re-add Test Data

If you want to start fresh:

```bash
cd rest-api

# Remove existing test data
node -e "
const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_CONNECTION).then(() => {
  const User = require('./models/User');
  return User.findByIdAndUpdate(
    '68f75211ab9d0946c112721e',
    { \$set: { resource_access: [] } }
  );
}).then(() => {
  console.log('Cleared resource_access');
  process.exit(0);
});
"

# Add new test data via UI:
# 1. Go to Resource Access tab
# 2. Click "Add Resource Access"
# 3. Select Building
# 4. Choose a building (or select one from dropdown)
# 5. Select access level: Edit
# 6. Click "Add Access"
# 7. Check console for: "📤 Assigning resource access"
# 8. Should see entry appear immediately
```

## API Testing (With Authentication)

To test the API directly, you need a valid auth token:

1. **Get Token from Browser:**
   - Open http://localhost:8080
   - Open DevTools > Application > Local Storage
   - Find `authToken` or similar
   - Copy the token value

2. **Test API:**
```bash
# Get resource access
curl -X GET http://localhost:30001/api/users/68f75211ab9d0946c112721e/resource-access \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"

# Add resource access
curl -X POST http://localhost:30001/api/users/resource-access \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "68f75211ab9d0946c112721e",
    "resource_type": "building",
    "resource_id": "building-999",
    "resource_name": "API Test Building",
    "permissions": {
      "can_view": true,
      "can_edit": true,
      "can_create": false,
      "can_delete": false
    }
  }'
```

## Expected Data Flow

```
1. User opens page
   ↓
2. loadUserData() called (UserEditPage.tsx:69)
   ↓
3. userManagementApi.getUserById() (userManagementApi.ts:104)
   ↓
4. API request to GET /api/users/:id
   ↓
5. Response includes resource_access array
   ↓
6. transformUser() converts snake_case to camelCase (userManagementApi.ts:41)
   ↓
7. User state updated with resourceAccess
   ↓
8. ResourceAccessManager receives existingAccess prop (UserEditPage.tsx:483)
   ↓
9. Component renders list of access entries
```

## Console Checklist

When you visit the page, check browser console for:

- [x] `📥 Raw user data from API:` - Shows API response
- [x] `📤 Transformed user data:` - Shows transformed data
- [x] `🔍 ResourceAccessManager received:` - Shows component props
- [x] No red error messages
- [x] `resourceAccessCount` > 0 in all logs

## Adding New Resource Access (UI Test)

1. **Navigate to Resource Access tab**
2. **Click "Add Resource Access"**
3. **Fill form:**
   - Resource Type: Building
   - Select Building: (choose from dropdown)
   - Access Level: Edit
4. **Click "Add Access"**
5. **Check console for:**
   ```
   📤 Assigning resource access: {
     userId: "68f75211ab9d0946c112721e",
     resourceType: "document_category",
     resourceId: "Technical",
     permissions: { can_view: true, can_edit: true, ... }
   }
   ✅ Resource access assigned
   ```
6. **Entry should appear immediately** in the list

## Current Files with Debug Logging

1. `src/services/userManagementApi.ts:107-121` - API fetch logging
2. `src/services/userManagementApi.ts:227-239` - Assign logging
3. `src/services/userManagementApi.ts:249-255` - Remove logging
4. `src/components/admin/ResourceAccessManager.tsx:41-45` - Component props logging

## Verification Script

```bash
cd rest-api
node -e "
const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_CONNECTION).then(() => {
  const User = require('./models/User');
  return User.findById('68f75211ab9d0946c112721e');
}).then(user => {
  console.log('========================================');
  console.log('USER RESOURCE ACCESS VERIFICATION');
  console.log('========================================');
  console.log('User:', user.email);
  console.log('Count:', user.resource_access?.length || 0);
  console.log('Entries:');
  user.resource_access?.forEach((entry, i) => {
    console.log(\`  \${i + 1}. \${entry.resource_type} - \${entry.resource_id}\`);
  });
  console.log('========================================');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
"
```

## Next Steps

1. **Visit the page** with browser console open
2. **Check all console logs** match expected format
3. **Report back** what you see in console
4. **Try adding** a new resource access via UI
5. **Verify** it appears in the list and console shows success

The logging will tell us exactly where the data flow breaks, if at all!
