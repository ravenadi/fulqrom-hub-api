# Database Cleanup Scripts

## Floor Duplicate Cleanup

### Purpose
Removes duplicate floors with the same `floor_name` for each `customer_id`, keeping only the oldest record.

### Files

1. **cleanup-duplicate-floors.js** - Main cleanup script
2. **find-duplicate-floors.js** - Find and report duplicates (no deletion)
3. **check-floors.js** - Inspect floor data
4. **check-collections.js** - List all collections

### Usage

#### 1. Check for duplicates (recommended first step)
```bash
node scripts/find-duplicate-floors.js
```

#### 2. Run cleanup (deletes duplicates)
```bash
node scripts/cleanup-duplicate-floors.js
```

### How It Works

The cleanup script:
1. Groups all floors by `customer_id` + `floor_name`
2. For each group with multiple floors:
   - Sorts by `createdAt` (oldest first)
   - Keeps the oldest record
   - Deletes all newer duplicates
3. Reports what was kept and deleted

### Prevention

A unique index has been added to the Floor model:
```javascript
FloorSchema.index({ customer_id: 1, floor_name: 1 }, { unique: true });
```

This will prevent duplicate floor names per customer from being created in the future.

### Example Output

```
Connecting to MongoDB...
Connected to MongoDB

Total floors in database: 49

Found 3 groups of duplicate floors

Customer ID: 68d3929ae4c5d9b3e920a9df
Floor Name: "Level 1"
Total records: 7
✓ Keeping: 68db8c624732849c7019b0c6 (created: 2025-09-29T10:15:24.420Z)
✗ Deleting 6 duplicate(s):
  - 68de88fc19db3d885705ab6b (created: 2025-10-02T14:15:24.420Z)
  - 68de88fc19db3d885705ab89 (created: 2025-10-02T14:15:24.422Z)
  ...

✅ Cleanup complete!
Total floors deleted: 15
Total floors remaining: 34
```

### Safety

- The script only deletes newer duplicates
- The oldest record (by `createdAt`) is always preserved
- Run `find-duplicate-floors.js` first to preview what will be deleted
- The database is currently empty (0 floors), so cleanup will not delete anything until floors are added
