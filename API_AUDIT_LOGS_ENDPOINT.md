# Audit Logs API Endpoint

## GET /api/audit-logs

Returns audit logs sorted by **time descending (newest first)** by default.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Items per page (max: 200) |
| `action` | string | - | Filter by action: `create`, `read`, `update`, `delete`, `auth` |
| `resource_type` | string | - | Filter by module (maps to `module` field) |
| `user_id` | string | - | Filter by user ID |
| `start_date` | string | - | Start date (ISO format) |
| `end_date` | string | - | End date (ISO format) |
| `sort_by` | string | `created_at` | Sort field |
| `sort_order` | string | `desc` | Sort order: `asc` or `desc` |

### Default Behavior

- **Sort**: `created_at` descending (newest first)
- **Limit**: 50 records per page
- **Page**: 1

### Example Request

```bash
# Get first 20 records (newest first)
GET /api/audit-logs?page=1&limit=20&sort_by=created_at&sort_order=desc

# Filter by action
GET /api/audit-logs?action=create&limit=20

# Filter by module and date range
GET /api/audit-logs?resource_type=customer&start_date=2025-01-01&limit=20
```

### Example Response

```json
{
  "success": true,
  "count": 20,
  "total": 150,
  "page": 1,
  "pages": 8,
  "data": [
    {
      "_id": "...",
      "action": "auth",
      "description": "ana logged in",
      "module": "auth",
      "module_id": null,
      "user": {
        "id": "...",
        "name": "ana"
      },
      "ip": "127.0.0.1",
      "agent": "Mozilla/5.0...",
      "tenant_id": "...",
      "created_at": "2025-01-25T10:30:00.000Z"
    }
  ]
}
```

### "Load More" Pattern

For frontend "Load More" functionality:

1. **Initial Load**: `GET /api/audit-logs?page=1&limit=20`
2. **Load More**: `GET /api/audit-logs?page=2&limit=20`
3. **Continue**: Increment page number for each load

Results are automatically sorted newest first, so each page loads the next oldest records.

### Headers Required

```
Authorization: Bearer YOUR_JWT_TOKEN
```

