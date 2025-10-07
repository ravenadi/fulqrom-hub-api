# Asset Floor ID Migration

## Purpose
This migration sets `floor_id` for all assets based on their `level` field by intelligently matching level names to existing floor records.

## Problem
Assets have a `level` field (e.g., "Lvl 05", "Floor 3", "Basement 2") but many are missing the `floor_id` reference. This migration automatically links assets to their correct floors.

## Solution
The migration script handles **all common floor naming variations**:

### Supported Patterns

#### Numbered Floors
- `Floor 05` → `Floor 5`
- `Lvl 05` → `Level 5`
- `Level 5` → `Level 5`
- `05` → `Level 5`

#### Basements
- `Basement 2` → `Basement 2`
- `B2` → `Basement 2`
- `basement 1` → `Basement 1`

#### Ground Floor
- `GF` → `Ground Floor`
- `Ground Floor` → `Ground Floor`
- `G/F` → `Ground Floor`
- `Ground` → `Ground Floor`

#### Special Levels
- `Plaza` → `Plaza`
- `Terrace` → `Terrace`
- `Roof` / `Rooftop` → `Roof`
- `Mezzanine` / `Mezz` → `Mezzanine`
- `Lower Ground` / `LG` → `Lower Ground`
- `Upper Ground` / `UG` → `Upper Ground`
- `Podium` → `Podium`
- `Penthouse` / `PH` → `Penthouse`

## Usage

### Run the migration:
```bash
node migrations/migrate-all-asset-floor-ids.js
```

### Expected Output:
```
🚀 Starting comprehensive floor_id migration for ALL assets...

✅ Connected to MongoDB

📊 Found 1250 assets with level field

✓ Updated ASSET-001: "Lvl 05" → "Level 5" (68e3a...)
✓ Updated ASSET-002: "Basement 2" → "Basement 2" (68e3b...)
⏭  Skipped ASSET-003: floor_id already set
✗ No match for ASSET-004: "Custom Floor" in building 68db8...

======================================================================
📈 OVERALL MIGRATION SUMMARY
======================================================================
Total assets processed:         1250
Already had floor_id:           350
Successfully matched & updated: 850
Not matched:                    50
======================================================================

📊 PER-BUILDING SUMMARY:
======================================================================

Building 68db8aad7b1a05816224c53e:
  Total:         600
  Already set:   200
  Updated:       380
  Not matched:   20

Building 68d3e1de1bfdc3d6bd004643:
  Total:         650
  Already set:   150
  Updated:       470
  Not matched:   30

⚠️  UNMATCHED LEVELS BY BUILDING:
======================================================================

Building 68db8aad7b1a05816224c53e:
  Available floors (25):
    - Basement 2 (floor_number: -2)
    - Basement 1 (floor_number: -1)
    - Ground Floor (floor_number: 0)
    - Level 1 (floor_number: 1)
    - Level 2 (floor_number: 2)
    ...

  Unmatched levels:
    - "Custom Floor" (10 assets)
    - "Unknown Level" (10 assets)

✅ Migration completed successfully!

🔌 Database connection closed
✨ Done!
```

## What it does:
1. ✅ Finds all assets with a `level` field and `building_id`
2. ✅ Skips assets that already have `floor_id` set
3. ✅ Generates all possible floor name variations for each level
4. ✅ Searches for matching floor in the same building
5. ✅ Updates asset with `floor_id` when match found
6. ✅ Reports unmatched levels per building
7. ✅ Shows available floors for each building with unmatched levels

## Safe to Run:
- ✅ Only processes assets with `level` field
- ✅ Skips assets that already have `floor_id`
- ✅ Only updates when exact floor match found
- ✅ Shows detailed logs for every asset
- ✅ Provides building-specific summaries
- ✅ Lists available floors for manual review
- ✅ Idempotent (safe to run multiple times)

## After Migration:

### Review Unmatched Levels
If any levels couldn't be matched, you have two options:

1. **Create missing floor records** for the unmatched levels
2. **Manually update** assets with custom SQL if the floor exists but name doesn't match

### Verify Results
```bash
# Count assets without floor_id
db.assets.countDocuments({ floor_id: { $exists: false } })

# Count assets with floor_id
db.assets.countDocuments({ floor_id: { $exists: true } })

# Check specific building
db.assets.find({ building_id: "68db8aad7b1a05816224c53e", floor_id: { $exists: false } }).count()
```

## Building-Specific Migrations

If you only want to migrate specific buildings, use these files instead:
- `migrate-530-collins-floor-ids.js` - For 530 Collins building only
- `migrate-qbe-house-floor-ids.js` - For QBE House building only
- `migrate-basement2-floor-id.js` - For Basement 2 level only

## Notes:
- Always backup your database before running migrations
- The script is idempotent (safe to run multiple times)
- Already-set floor_ids are never modified
- Only exact matches are updated (no guessing)
- Case-insensitive matching is used
- Leading zeros are normalized (05 → 5)
