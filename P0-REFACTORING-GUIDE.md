# P0 Refactoring Guide - OCC Pattern for Routes

This guide shows how to refactor existing routes to use optimistic concurrency control (OCC) with version checking.

## Pattern 1: Load-Modify-Save (Recommended)

### Before (Unsafe - Lost Updates Possible)

```javascript
// routes/vendors.js - OLD PATTERN
router.put('/:id', async (req, res) => {
  const vendor = await Vendor.findOneAndUpdate(
    { _id: req.params.id, tenant_id: tenantId },
    req.body,
    { new: true, runValidators: true }
  );
  
  if (!vendor) {
    return res.status(404).json({ message: 'Not found' });
  }
  
  res.json({ data: vendor });
});
```

**Problem:** Two concurrent requests both read version 0, both update, second one overwrites first → lost update.

### After (Safe - Version Checked)

```javascript
// routes/vendors.js - NEW PATTERN
const { sendVersionConflict } = require('../middleware/etagVersion');

router.put('/:id', async (req, res) => {
  try {
    // 1. Get version from If-Match header (parsed by parseIfMatch middleware)
    //    or from request body
    const clientVersion = req.clientVersion ?? req.body.__v;
    
    if (clientVersion === undefined) {
      return res.status(428).json({
        success: false,
        message: 'Precondition required. Include If-Match header or __v in body.',
        code: 'PRECONDITION_REQUIRED'
      });
    }
    
    // 2. Find document (tenant-scoped automatically via plugin)
    const vendor = await Vendor.findById(req.params.id);
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    // 3. Check version match
    if (vendor.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: vendor.__v,
        resource: 'Vendor',
        id: req.params.id
      });
    }
    
    // 4. Apply updates
    Object.assign(vendor, req.body);
    
    // 5. Save (Mongoose auto-increments __v)
    await vendor.save();
    
    // Response includes new __v, attachETag middleware sets ETag header
    res.status(200).json({
      success: true,
      message: 'Vendor updated successfully',
      data: vendor // __v is now incremented
    });
    
  } catch (error) {
    // Handle Mongoose VersionError (shouldn't happen with manual check above)
    if (error.name === 'VersionError') {
      return sendVersionConflict(res, {
        clientVersion: req.clientVersion,
        currentVersion: error.version,
        resource: 'Vendor',
        id: req.params.id
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating vendor',
      error: error.message
    });
  }
});
```

## Pattern 2: Update with Version Filter (Efficient for Simple Updates)

### Use Case: Simple field updates without complex logic

```javascript
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const clientVersion = req.clientVersion ?? req.body.__v;
  
  if (clientVersion === undefined) {
    return res.status(428).json({ code: 'PRECONDITION_REQUIRED' });
  }
  
  // Update with version in filter
  const result = await Vendor.updateOne(
    {
      _id: req.params.id,
      __v: clientVersion
      // tenant_id auto-injected by plugin
    },
    {
      $set: { status },
      $inc: { __v: 1 } // Manually increment version
    }
  );
  
  if (result.matchedCount === 0) {
    // Either not found or version mismatch
    const vendor = await Vendor.findById(req.params.id);
    
    if (!vendor) {
      return res.status(404).json({ message: 'Not found' });
    }
    
    // Found but version mismatch
    return sendVersionConflict(res, {
      clientVersion,
      currentVersion: vendor.__v,
      resource: 'Vendor',
      id: req.params.id
    });
  }
  
  // Fetch updated document to return with new __v
  const vendor = await Vendor.findById(req.params.id);
  
  res.json({
    success: true,
    data: vendor
  });
});
```

## Pattern 3: DELETE with Version Check

```javascript
router.delete('/:id', async (req, res) => {
  const clientVersion = req.clientVersion ?? req.body.__v;
  
  // Optional: Require version for deletes
  if (clientVersion === undefined) {
    return res.status(428).json({ code: 'PRECONDITION_REQUIRED' });
  }
  
  const vendor = await Vendor.findById(req.params.id);
  
  if (!vendor) {
    return res.status(404).json({ message: 'Not found' });
  }
  
  if (vendor.__v !== clientVersion) {
    return sendVersionConflict(res, {
      clientVersion,
      currentVersion: vendor.__v,
      resource: 'Vendor',
      id: req.params.id
    });
  }
  
  await vendor.deleteOne();
  
  res.json({
    success: true,
    message: 'Deleted successfully'
  });
});
```

## Pattern 4: Complex Multi-Field Updates

```javascript
router.put('/:id', async (req, res) => {
  const clientVersion = req.clientVersion ?? req.body.__v;
  
  if (clientVersion === undefined) {
    return res.status(428).json({ code: 'PRECONDITION_REQUIRED' });
  }
  
  const vendor = await Vendor.findById(req.params.id);
  
  if (!vendor) {
    return res.status(404).json({ message: 'Not found' });
  }
  
  if (vendor.__v !== clientVersion) {
    return sendVersionConflict(res, {
      clientVersion,
      currentVersion: vendor.__v,
      resource: 'Vendor',
      id: req.params.id
    });
  }
  
  // Complex validation/transformation before save
  if (req.body.abn) {
    const cleanedABN = req.body.abn.replace(/\s/g, '');
    const duplicate = await Vendor.findOne({
      abn: cleanedABN,
      _id: { $ne: vendor._id }
    });
    
    if (duplicate) {
      return res.status(400).json({
        message: 'ABN already exists',
        field: 'abn'
      });
    }
  }
  
  // Apply updates
  Object.assign(vendor, req.body);
  
  // Custom business logic
  if (vendor.status === 'suspended') {
    vendor.suspension_date = new Date();
  }
  
  await vendor.save(); // Auto-increments __v
  
  res.json({
    success: true,
    data: vendor
  });
});
```

## Frontend Integration

### Axios Example

```javascript
// Store ETag from GET response
const response = await axios.get('/api/vendors/123');
const vendor = response.data.data;
const etag = response.headers.etag; // e.g., W/"v0"

// Send If-Match on update
await axios.put('/api/vendors/123', {
  contractor_name: 'Updated Name'
}, {
  headers: {
    'If-Match': etag
  }
});

// Or include __v in body
await axios.put('/api/vendors/123', {
  contractor_name: 'Updated Name',
  __v: vendor.__v
});

// Handle 409 Conflict
try {
  await axios.put(...);
} catch (error) {
  if (error.response?.status === 409) {
    // Show conflict UI
    const { currentVersion, clientVersion } = error.response.data.details;
    
    // Option 1: Refetch and retry
    const latest = await axios.get('/api/vendors/123');
    // Merge changes, show diff UI, let user decide
    
    // Option 2: Force overwrite (dangerous!)
    await axios.put('/api/vendors/123', data, {
      headers: { 'If-Match': latest.headers.etag }
    });
  }
}
```

### Fetch Example

```javascript
// GET with credentials
const response = await fetch('/api/vendors/123', {
  credentials: 'include'
});
const data = await response.json();
const etag = response.headers.get('etag');

// PUT with If-Match
const updateResponse = await fetch('/api/vendors/123', {
  method: 'PUT',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'If-Match': etag,
    'x-csrf-token': getCsrfToken() // Read from cookie
  },
  body: JSON.stringify({ contractor_name: 'Updated' })
});

if (updateResponse.status === 409) {
  const conflict = await updateResponse.json();
  // Handle conflict...
}
```

## Routes That Need Refactoring

### High Priority (User-Facing Edits)
1. `routes/vendors.js`
   - `PUT /:id` → Load-Modify-Save pattern
   - `PATCH /:id/status` → Update with version filter
   
2. `routes/assets.js`
   - `PUT /:id` → Load-Modify-Save pattern
   
3. `routes/documents.js`
   - `PUT /:id` → Load-Modify-Save pattern (complex metadata)
   - `PATCH /:id/approval` → Update with version filter
   
4. `routes/sites.js`
   - `PUT /:id` → Load-Modify-Save pattern
   
5. `routes/buildings.js`
   - `PUT /:id` → Load-Modify-Save pattern
   
6. `routes/floors.js`
   - `PUT /:id` → Load-Modify-Save pattern

### Medium Priority (Admin/Config)
7. `routes/users.js`
   - `PUT /:id` → Load-Modify-Save pattern
   - `PATCH /:id/roles` → Update with version filter
   
8. `routes/tenants.js` (BuildingTenant)
   - `PUT /:id` → Load-Modify-Save pattern

### Lower Priority (Read-Heavy)
9. `routes/customers.js`
10. `routes/contacts.js`

## Testing Each Refactored Route

```bash
# 1. Create a vendor
VENDOR_ID=$(curl -X POST http://localhost:30001/api/vendors \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -d '{"contractor_name":"Test Vendor","contractor_type":"Contractor"}' \
  | jq -r '.data._id')

# 2. Get vendor (note ETag)
curl -i http://localhost:30001/api/vendors/$VENDOR_ID -b cookies.txt
# Look for: ETag: W/"v0"

# 3. Update without If-Match (should fail)
curl -X PUT http://localhost:30001/api/vendors/$VENDOR_ID \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -d '{"contractor_name":"Updated"}'
# Expected: 428 Precondition Required

# 4. Update with correct If-Match (should succeed)
curl -X PUT http://localhost:30001/api/vendors/$VENDOR_ID \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -H "If-Match: W/\"v0\"" \
  -d '{"contractor_name":"Updated"}'
# Expected: 200 OK, new ETag: W/"v1"

# 5. Simulate concurrent edit (should fail)
curl -X PUT http://localhost:30001/api/vendors/$VENDOR_ID \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -H "If-Match: W/\"v0\"" \
  -d '{"contractor_name":"Conflict"}'
# Expected: 409 Conflict (version is now 1, not 0)
```

## Common Pitfalls

### 1. Forgetting to Increment __v Manually

```javascript
// WRONG - __v not incremented
await Vendor.updateOne({ _id, __v }, { $set: { status } });

// RIGHT
await Vendor.updateOne({ _id, __v }, { $set: { status }, $inc: { __v: 1 } });
```

### 2. Not Handling 404 vs 409

```javascript
// WRONG - client can't tell if not found or version mismatch
const result = await Vendor.updateOne({ _id, __v }, update);
if (result.modifiedCount === 0) {
  return res.status(404).json({ message: 'Not found or version mismatch' });
}

// RIGHT - distinguish between the two
if (result.matchedCount === 0) {
  const doc = await Vendor.findById(_id);
  if (!doc) return res.status(404).json({ message: 'Not found' });
  return sendVersionConflict(res, { ... });
}
```

### 3. Not Returning Updated Document

```javascript
// WRONG - client doesn't know new __v
await vendor.save();
res.json({ success: true });

// RIGHT - return doc with new __v (attachETag sets header)
await vendor.save();
res.json({ success: true, data: vendor });
```

### 4. Not Validating Version Type

```javascript
// WRONG - string "0" !== number 0
if (vendor.__v !== req.body.__v) ...

// RIGHT - parse to number
const clientVersion = parseInt(req.clientVersion || req.body.__v, 10);
if (vendor.__v !== clientVersion) ...
```

## Migration Strategy

1. **Phase 1**: Refactor high-priority routes (vendors, assets, documents)
2. **Phase 2**: Add `requireIfMatch` middleware to refactored routes
3. **Phase 3**: Update frontend to send If-Match headers
4. **Phase 4**: Make If-Match required (remove optional fallback)
5. **Phase 5**: Refactor remaining routes
6. **Phase 6**: Global `requireIfMatch` on all PUT/PATCH/DELETE

## Success Metrics

- [ ] 0 lost updates in production (monitor 409 responses)
- [ ] All user-facing edit routes refactored
- [ ] Frontend sends If-Match on all writes
- [ ] <1% 409 conflict rate (indicates good UX, users not stepping on each other)
- [ ] Conflict resolution UI implemented in frontend

