# Vendors Module - Frontend Implementation Requirements

## Issue
The vendors module is not aligned with other modules (buildings, sites, floors, assets, documents) in terms of:
- Pagination handling
- Loading states during API calls
- Automatic data reload after save operations
- Proper API integration

## Current Backend API Support
The vendors API (`/api/vendors`) already supports:
✅ Pagination (`page`, `limit` parameters, returns pagination metadata)
✅ Tenant filtering (automatic based on logged-in user)
✅ Search functionality (`search` parameter)
✅ Multiple filters (category, status, rating, state, compliance, is_active)
✅ Sorting (`sort_by`, `sort_order` parameters)
✅ Comprehensive response structure

## Required Frontend Implementation

### 1. API Service Integration (`src/services/vendorsApi.ts`)

```typescript
import { useApi } from '@/hooks/useApi';

interface VendorListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  status?: string;
  rating?: number;
  state?: string;
  compliance?: string;
  is_active?: boolean;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

interface VendorListResponse {
  success: boolean;
  data: Vendor[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export const vendorsApi = {
  getVendors: async (params: VendorListParams = {}) => {
    const queryParams = new URLSearchParams();
    
    // Add all parameters to query string
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });
    
    const url = queryParams.toString() 
      ? `/api/vendors?${queryParams.toString()}` 
      : '/api/vendors';
    
    return useApi().get<VendorListResponse>(url);
  },

  getVendor: async (id: string) => {
    return useApi().get(`/api/vendors/${id}`);
  },

  createVendor: async (data: any) => {
    return useApi().post('/api/vendors', data);
  },

  updateVendor: async (id: string, data: any) => {
    return useApi().put(`/api/vendors/${id}`, data);
  },

  deleteVendor: async (id: string) => {
    return useApi().delete(`/api/vendors/${id}`);
  },

  getStats: async () => {
    return useApi().get('/api/vendors/stats');
  }
};
```

### 2. Component with Loading States

```typescript
import { useState, useEffect } from 'vue';
import { vendorsApi } from '@/services/vendorsApi';

export default {
  setup() {
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({
      page: 1,
      limit: 20,
      total: 0,
      total_pages: 0
    });
    const [filters, setFilters] = useState({
      search: '',
      category: '',
      status: '',
      rating: '',
      state: '',
      compliance: '',
      is_active: undefined,
      sort_by: 'name',
      sort_order: 'asc'
    });

    const fetchVendors = async () => {
      setLoading(true);
      try {
        const response = await vendorsApi.getVendors({
          ...filters,
          page: pagination.page,
          limit: pagination.limit
        });
        
        if (response.data.success) {
          setVendors(response.data.data);
          setPagination(response.data.pagination);
        }
      } catch (error) {
        console.error('Error fetching vendors:', error);
        // Handle error appropriately
      } finally {
        setLoading(false);
      }
    };

    const handleSave = async (vendorData: any) => {
      try {
        if (vendorData._id) {
          await vendorsApi.updateVendor(vendorData._id, vendorData);
        } else {
          await vendorsApi.createVendor(vendorData);
        }
        
        // Reload data after save
        await fetchVendors();
      } catch (error) {
        console.error('Error saving vendor:', error);
        throw error; // Re-throw for error handling
      }
    };

    const handleDelete = async (id: string) => {
      try {
        await vendorsApi.deleteVendor(id);
        
        // Reload data after delete
        await fetchVendors();
      } catch (error) {
        console.error('Error deleting vendor:', error);
        throw error;
      }
    };

    // Fetch vendors on component mount and when filters/pagination change
    useEffect(() => {
      fetchVendors();
    }, [filters, pagination.page, pagination.limit]);

    return {
      vendors,
      loading,
      pagination,
      filters,
      setFilters,
      setPagination,
      fetchVendors,
      handleSave,
      handleDelete
    };
  }
};
```

### 3. Template with Loading Indicator

```vue
<template>
  <div class="vendors-container">
    <!-- Filters Section with Loading State -->
    <div v-if="loading && vendors.length === 0" class="loading-state">
      <LoadingSpinner />
      <p>Loading vendors...</p>
    </div>

    <!-- Search and Filters -->
    <div class="filters">
      <input 
        v-model="filters.search" 
        @input="fetchVendors"
        placeholder="Search vendors..."
        :disabled="loading"
      />
      
      <!-- Add other filters (category, status, etc.) -->
    </div>

    <!-- Vendors List -->
    <div v-if="!loading || vendors.length > 0">
      <VendorCard 
        v-for="vendor in vendors" 
        :key="vendor._id"
        :vendor="vendor"
        @edit="handleEdit"
        @delete="handleDelete"
      />
    </div>

    <!-- Pagination Controls -->
    <div class="pagination">
      <button 
        @click="setPagination({ ...pagination, page: pagination.page - 1 })"
        :disabled="pagination.page === 1 || loading"
      >
        Previous
      </button>
      
      <span>{{ pagination.page }} / {{ pagination.total_pages }}</span>
      <span>Total: {{ pagination.total }} vendors</span>
      
      <button 
        @click="setPagination({ ...pagination, page: pagination.page + 1 })"
        :disabled="pagination.page >= pagination.total_pages || loading"
      >
        Next
      </button>
    </div>

    <!-- Save/Edit Dialog -->
    <VendorDialog 
      v-if="showDialog"
      :vendor="selectedVendor"
      @save="handleSave"
      @close="showDialog = false"
    />
  </div>
</template>
```

## Key Requirements

### 1. **Loading States**
- Show loading spinner while fetching data
- Disable buttons/filters during API calls
- Display "Loading..." message when fetching initial data
- Show skeleton loaders while reloading data

### 2. **Pagination**
- Use `page` and `limit` parameters (default: page=1, limit=20)
- Display total count and page numbers
- Navigate between pages
- Reload data when page changes

### 3. **Search & Filters**
- Implement real-time search (debounced input)
- Apply multiple filters simultaneously
- Show loading state while filtering
- Clear filters functionality
- **Hide Fields filter for now** (not a priority)

### 4. **Auto-Reload After Save**
- After creating vendor: reload list to show new vendor
- After updating vendor: reload list to show updated data
- After deleting vendor: reload list to remove deleted vendor
- Show success message after operations

### 5. **Error Handling**
- Display error messages if API calls fail
- Retry mechanism for failed requests
- Handle network errors gracefully

### 6. **Performance Optimization**
- Debounce search input (300-500ms delay)
- Cache vendor data when appropriate
- Avoid unnecessary re-renders
- Use virtual scrolling for large lists (100+ vendors)

## Example Integration Pattern

```typescript
// In your component or composable
const { data, loading, error, execute } = useAsyncData(
  'vendors',
  () => vendorsApi.getVendors(filters.value),
  {
    watch: [filters, pagination],
    immediate: true
  }
);

// Handle save with auto-reload
const handleSave = async (vendorData) => {
  try {
    await vendorsApi.saveVendor(vendorData);
    
    // Refresh the data
    await execute();
    
    // Show success message
    toast.success('Vendor saved successfully');
  } catch (error) {
    toast.error('Failed to save vendor');
  }
};
```

## Testing Checklist

- [ ] Loading spinner shows during initial fetch
- [ ] Pagination controls work correctly
- [ ] Search filters vendors in real-time
- [ ] After save, list reloads automatically
- [ ] After delete, item is removed from list
- [ ] Error messages display correctly
- [ ] Tenant filtering works (users only see their vendors)
- [ ] Performance is acceptable with 100+ vendors
- [ ] Fields filter is hidden/disabled for now

## Backend Endpoints Reference

- `GET /api/vendors` - List vendors with pagination and filters
- `GET /api/vendors/:id` - Get single vendor
- `POST /api/vendors` - Create new vendor
- `PUT /api/vendors/:id` - Update vendor
- `DELETE /api/vendors/:id` - Delete vendor (soft delete)
- `GET /api/vendors/stats` - Get vendor statistics

All endpoints automatically filter by the logged-in user's `tenant_id`.

