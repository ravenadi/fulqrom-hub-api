# Frontend Changes Required for Version Handling (OCC)

## Summary

The backend now requires version checking for all PUT/PATCH/DELETE operations to prevent dirty writes. The frontend needs to:

1. **Store `__v` from GET responses** - Every resource fetch should save the version
2. **Include `__v` or `If-Match` in PUT/PATCH requests** - Required for all mutations
3. **Handle 409 Version Conflicts** - Show merge UI when concurrent edits detected
4. **Handle 428 Precondition Required** - Graceful error when version missing

## ✅ What's Already Done

Your `apiClient.ts` already has:
- ✅ `extractETag()` function to get ETag from response headers
- ✅ `createIfMatchHeader()` helper function
- ✅ `put()` and `patch()` helpers that accept `etag` parameter
- ✅ 409 conflict detection in `authenticatedFetch()`
- ✅ `isVersionConflict()` and `getConflictDetails()` helpers

## ❌ What Needs to Change

### 1. Update All API Service Methods

**Current (❌ Won't work):**
```typescript
// customerApi.ts - Current implementation
async updateCustomer(id: string, customerData: UpdateCustomerRequest) {
  return this.request(`/api/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(customerData),
  });
}
```

**Required (✅ Will work):**
```typescript
// Option A: Use __v in request body (Easier)
async updateCustomer(id: string, customerData: UpdateCustomerRequest, version?: number) {
  const body = {
    ...customerData,
    ...(version !== undefined && { __v: version }) // Include version
  };
  
  return this.request(`/api/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// Option B: Use ETag header (Better, more RESTful)
import { put, extractETag } from './apiClient';

async updateCustomer(id: string, customerData: UpdateCustomerRequest, etag?: string | null) {
  return put(`/api/customers/${id}`, customerData, etag);
}
```

### 2. Store Version When Fetching Resources

**In Components/Forms:**
```typescript
// Before editing, fetch and store version
const [resourceVersion, setResourceVersion] = useState<number | null>(null);
const [resourceETag, setResourceETag] = useState<string | null>(null);

useEffect(() => {
  const fetchCustomer = async () => {
    const response = await customerApi.getCustomer(id);
    
    // Option A: Store __v from response body
    setResourceVersion(response.data.__v);
    
    // Option B: Get ETag from response headers (better)
    // Note: Need to use authenticatedFetch directly for headers
    const fetchResponse = await authenticatedFetch(`/api/customers/${id}`);
    const etag = extractETag(fetchResponse);
    setResourceETag(etag);
    
    // Also store __v as fallback
    const data = await fetchResponse.json();
    setResourceVersion(data.data.__v);
  };
  
  fetchCustomer();
}, [id]);
```

### 3. Include Version When Updating

**In Save/Submit Handlers:**
```typescript
const handleSave = async () => {
  try {
    // Option A: Include __v in body
    await customerApi.updateCustomer(id, formData, resourceVersion);
    
    // Option B: Use ETag header
    await customerApi.updateCustomer(id, formData, resourceETag);
    
    // Refresh after successful update
    const updated = await customerApi.getCustomer(id);
    setResourceVersion(updated.data.__v);
    
    toast.success('Customer updated successfully');
  } catch (error: any) {
    // Handle 409 Version Conflict
    if (isVersionConflict(error)) {
      const conflict = getConflictDetails(error);
      showConflictDialog({
        message: 'Someone else modified this customer',
        currentVersion: conflict.currentData,
        yourChanges: formData,
        onResolve: async (resolution) => {
          // Refetch latest and retry
          const latest = await customerApi.getCustomer(id);
          const latestVersion = latest.data.__v;
          
          // Merge based on user's resolution choice
          const mergedData = mergeChanges(formData, latest.data, resolution);
          
          // Retry with new version
          await customerApi.updateCustomer(id, mergedData, latestVersion);
        }
      });
      return;
    }
    
    // Handle 428 Precondition Required
    if (error.message?.includes('Precondition required')) {
      toast.error('Please refresh the page and try again');
      // Refetch to get current version
      const latest = await customerApi.getCustomer(id);
      setResourceVersion(latest.data.__v);
      return;
    }
    
    toast.error(error.message || 'Update failed');
  }
};
```

### 4. Update All API Service Files

Apply these changes to **ALL** API service files that have `update*` methods:

- `services/customerApi.ts`
- `services/vendorsApi.ts`
- `services/assetsApi.ts`
- `services/documentsApi.ts`
- `services/sitesApi.ts`
- `services/buildingsApi.ts`
- `services/floorsApi.ts`
- `services/tenantsApi.ts`
- `services/organisationApi.ts`
- Any other services with PUT/PATCH methods

**Pattern for each:**
```typescript
// Add version parameter to update methods
async updateXXX(id: string, data: UpdateXXXRequest, version?: number) {
  const body = { ...data, ...(version !== undefined && { __v: version }) };
  return this.request(`/api/xxx/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// OR use the put helper with ETag
import { put } from './apiClient';

async updateXXX(id: string, data: UpdateXXXRequest, etag?: string | null) {
  return put(`/api/xxx/${id}`, data, etag);
}
```

### 5. Handle 428 Errors Globally

Update `apiClient.ts` to handle 428 errors better:

```typescript
// In authenticatedFetch, around line 177
if (response.status === 428) {
  const errorData = await response.json().catch(() => ({}));
  const error = new Error(errorData.message || 'Precondition required - version missing');
  (error as any).code = 'PRECONDITION_REQUIRED';
  (error as any).status = 428;
  throw error;
}
```

## Quick Migration Steps

### Step 1: Choose Your Approach

**Option A: Use `__v` in body (Easier, less RESTful)**
- Pros: Simple, works immediately
- Cons: Requires passing version through component state
- Usage: `updateResource(id, data, version)`

**Option B: Use ETag headers (Better, more RESTful)**
- Pros: Follows HTTP standards, cleaner API
- Cons: Need to extract from headers
- Usage: `put(endpoint, data, etag)`

**Recommendation**: Start with Option A for quick migration, then move to Option B.

### Step 2: Update One Service First (CustomerApi as example)

```typescript
// customerApi.ts
import { put, extractETag, authenticatedFetch } from './apiClient';

class CustomerApiService {
  // ... existing methods ...

  // Get customer (returns data + stores version)
  async getCustomer(id: string): Promise<{ 
    success: boolean; 
    data: CustomerResponse;
    version?: number;
    etag?: string;
  }> {
    // Use authenticatedFetch to get headers
    const response = await authenticatedFetch(`/api/customers/${id}`);
    const etag = extractETag(response);
    const jsonData = await response.json();
    
    return {
      ...jsonData,
      version: jsonData.data?.__v,
      etag
    };
  }

  // Update customer with version
  async updateCustomer(
    id: string, 
    customerData: UpdateCustomerRequest,
    versionOrETag?: number | string | null
  ): Promise<{ success: boolean; data: CustomerResponse }> {
    if (typeof versionOrETag === 'number') {
      // Option A: Include __v in body
      return this.request(`/api/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...customerData,
          __v: versionOrETag
        }),
      });
    } else {
      // Option B: Use ETag header
      return put(`/api/customers/${id}`, customerData, versionOrETag as string);
    }
  }
}
```

### Step 3: Update Components to Store and Pass Version

```typescript
// In your customer edit component
const CustomerEditForm = ({ customerId }) => {
  const [customer, setCustomer] = useState(null);
  const [version, setVersion] = useState<number | null>(null);
  const [etag, setETag] = useState<string | null>(null);

  useEffect(() => {
    const fetchCustomer = async () => {
      const result = await customerApi.getCustomer(customerId);
      setCustomer(result.data);
      setVersion(result.version);
      setETag(result.etag);
    };
    fetchCustomer();
  }, [customerId]);

  const handleSave = async (formData) => {
    try {
      await customerApi.updateCustomer(customerId, formData, version);
      // or: await customerApi.updateCustomer(customerId, formData, etag);
      
      // Refresh to get new version
      const updated = await customerApi.getCustomer(customerId);
      setVersion(updated.version);
      setETag(updated.etag);
    } catch (error) {
      handleUpdateError(error);
    }
  };

  // ... rest of component
};
```

### Step 4: Add Conflict Resolution UI

Create a conflict resolution component:

```typescript
// components/ConflictResolutionDialog.tsx
import { isVersionConflict, getConflictDetails } from '@/services/apiClient';

const ConflictResolutionDialog = ({ error, onResolve, onCancel }) => {
  if (!isVersionConflict(error)) return null;
  
  const conflict = getConflictDetails(error);
  
  return (
    <Dialog>
      <DialogTitle>Version Conflict</DialogTitle>
      <DialogContent>
        <p>The record was modified by another user while you were editing.</p>
        <p>Your version: {conflict.clientVersion}</p>
        <p>Current version: {conflict.serverVersion}</p>
        
        <div>
          <Button onClick={() => onResolve('overwrite')}>
            Overwrite (Use my changes)
          </Button>
          <Button onClick={() => onResolve('reload')}>
            Discard (Reload latest)
          </Button>
          <Button onClick={() => onResolve('merge')}>
            Merge manually
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
```

## Testing Checklist

- [ ] GET requests return `__v` in response body
- [ ] GET responses include `ETag` header
- [ ] PUT/PATCH requests include `__v` in body OR `If-Match` header
- [ ] 409 conflicts trigger conflict resolution UI
- [ ] 428 errors show helpful message (refresh and try again)
- [ ] Successful updates refresh version for next edit
- [ ] All resource types updated (customers, vendors, assets, etc.)

## Backward Compatibility

The backend supports **both** methods:
- `__v` in request body ✅
- `If-Match: W/"v{version}"` header ✅

You can mix and match, but prefer one pattern for consistency.

## Questions?

See `P0-COMPLETE.md` for more details on the OCC implementation.

