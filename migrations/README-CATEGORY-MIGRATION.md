# Document Category Standardization Migration

## Purpose
This migration standardizes all document categories in the database to use human-readable format matching the dropdown values from `/api/dropdowns`.

## Problem
Document categories were being stored inconsistently:
- ❌ Snake_case: `drawing_register`, `fire_safety_reports`
- ❌ Title Case: `Architectural`, `Engineering`
- ❌ URL-encoded: `Drawing%20Register`
- ✅ Human-readable: `Drawing Register`, `Fire Safety Reports`

## Solution
The migration script converts all non-standard categories to the standard human-readable format.

## Standard Categories
All categories should match this list from `/api/dropdowns`:
- Operations & Maintenance (O&M) Manuals
- Commissioning Data (Air & Water Balance Reports)
- Egress Report
- Fire Safety Reports
- HVAC Drawings
- Electrical Schematics
- Plumbing & Hydraulics Drawings
- Mechanical Services Drawings
- Waste Services
- Building Management & Control Diagrams
- Construction Drawings
- Tender Drawings & Specifications
- Shop Drawings
- Certification Reports
- Warranty Certificates
- Service Reports
- Asset Registers
- Drawing Register
- Drawing Schedules
- Compliance Documents
- Project Management Documentation
- NABERS & Energy Reporting
- Device Register

## Usage

### Run the migration:
```bash
node migrations/standardize-document-categories.js
```

### Expected Output:
```
🚀 Document Category Standardization Migration
============================================================

📊 Current Categories in Database:
✅ "Fire Safety Reports" (5 docs)
🔄 "fire_safety_reports" (3 docs) → "Fire Safety Reports"
⚠️ "Custom Category" (2 docs)

🔄 Starting Migration...
📝 Migrating: "fire_safety_reports" → "Fire Safety Reports"
   ✅ Updated 3 documents

✅ Migration Complete!
   Total documents updated: 3

⚠️  Warning: The following categories could not be automatically mapped:
   - "Custom Category" (2 docs)
   Please review these manually
```

## What it does:
1. ✅ Connects to MongoDB
2. ✅ Scans all document categories
3. ✅ Shows current state with counts
4. ✅ Maps old formats to standard format
5. ✅ Updates documents in bulk
6. ✅ Reports unmapped categories for manual review
7. ✅ Shows final distribution

## Mapped Conversions:
- `drawing_register` → `Drawing Register`
- `fire_safety_reports` → `Fire Safety Reports`
- `hvac_drawings` → `HVAC Drawings`
- `Architectural` → `Construction Drawings`
- `Engineering` → `Mechanical Services Drawings`
- `Safety` → `Fire Safety Reports`
- And many more (see script for full mapping)

## Safe to Run:
- ✅ Read-only analysis first
- ✅ Shows what will change before updating
- ✅ Only updates non-standard categories
- ✅ Preserves already-correct categories
- ✅ Reports unmapped categories without changing them

## Adding New Mappings:
If you find categories that aren't mapped, edit the `CATEGORY_MAPPING` object in the script:

```javascript
const CATEGORY_MAPPING = {
  'your_old_format': 'Standard Format',
  // ... more mappings
};
```

Then re-run the migration.

## Notes:
- Always backup your database before running migrations
- The script is idempotent (safe to run multiple times)
- Already-standard categories are not modified
- Unmapped categories are reported but not changed
