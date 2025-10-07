# Asset Criticality Level Field Implementation

## Summary
Added `criticality_level` field to the Asset model to support asset criticality classification.

## Changes Made

### 1. Asset Model (`models/Asset.js`)
- **Added field**: `criticality_level` (String, optional)
- **Added index**: Performance index on `criticality_level` field
- **Field location**: Under "Classification & Status" section

```javascript
criticality_level: {
  type: String,
  trim: true
  // Low, Medium, High, Critical - loaded from GET /api/dropdowns
}
```

### 2. Asset Validation (`middleware/assetValidation.js`)
- **Added to `createAssetSchema`**: Accepts `criticality_level` during asset creation
- **Added to `updateAssetSchema`**: Accepts `criticality_level` during asset updates
- **Validation**: `Joi.string().trim().allow('', null).optional()`

### 3. Asset Routes (`routes/assets.js`)
- **Query parameter**: Added `criticality_level` filter support
- **Multiple values**: Supports comma-separated criticality levels (e.g., `?criticality_level=High,Critical`)
- **Sorting**: Added `criticality_level` to valid sort fields
- **Response metadata**: Included in `filters_applied` response

## API Usage

### Update Asset with Criticality Level
```bash
PUT /api/assets/:id
Content-Type: application/json

{
  "criticality_level": "Medium"
}
```

### Filter Assets by Criticality Level
```bash
# Single value
GET /api/assets?criticality_level=High

# Multiple values
GET /api/assets?criticality_level=High,Critical

# Combined with other filters
GET /api/assets?customer_id=xxx&criticality_level=Medium&status=Active
```

### Sort Assets by Criticality Level
```bash
GET /api/assets?sort_by=criticality_level&sort_order=asc
```

## Expected Values
Values are loaded from the dropdowns API (`GET /api/dropdowns`):
- Low
- Medium
- High
- Critical

## Database Indexes
- Single field index: `{ criticality_level: 1 }`

## Testing
After server restart, test the following:

1. **Update existing asset**:
   ```bash
   curl -X PUT http://localhost:30001/api/assets/68e243b840665be20920a070 \
     -H "Content-Type: application/json" \
     -d '{"criticality_level": "Medium"}'
   ```

2. **Create new asset with criticality level**:
   ```bash
   curl -X POST http://localhost:30001/api/assets \
     -H "Content-Type: application/json" \
     -d '{
       "customer_id": "xxx",
       "criticality_level": "High"
     }'
   ```

3. **Filter by criticality level**:
   ```bash
   curl http://localhost:30001/api/assets?criticality_level=Medium
   ```

## Notes
- Field is optional and can be null or empty string
- No backend validation of specific values (values loaded from dropdowns)
- Frontend should use `GET /api/dropdowns` to populate criticality level options
- Supports filtering by multiple criticality levels using comma separation
