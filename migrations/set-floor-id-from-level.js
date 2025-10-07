/**
 * Migration Script: Set floor_id in Asset table based on Level field
 *
 * This script matches the asset.level field with floor.floor_name
 * and updates the asset.floor_id accordingly.
 *
 * Matching logic:
 * - "Lvl 05" → "Level 5"
 * - "Lvl 06" → "Level 6"
 * - "Level 10" → "Level 10"
 * - "Plaza" → "Plaza" (if exists)
 * - "Roof" → "Roof" (if exists)
 * - "GF" → "Ground Floor" (if exists)
 *
 * Usage: node migrations/set-floor-id-from-level.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Asset = require('../models/Asset');
const Floor = require('../models/Floor');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_CONNECTION;

/**
 * Normalize level string to match with floor names
 * @param {string} level - The level from asset (e.g., "Lvl 05", "Level 10", "GF")
 * @returns {array} - Array of possible floor name matches
 */
function getPossibleFloorNames(level) {
  if (!level) return [];

  const normalized = level.trim();
  const possibilities = [normalized]; // Include exact match

  // Match "Lvl 05" → "Level 5"
  const lvlMatch = normalized.match(/^Lvl\s*(\d+)$/i);
  if (lvlMatch) {
    const levelNum = parseInt(lvlMatch[1], 10);
    possibilities.push(`Level ${levelNum}`);
    possibilities.push(`level ${levelNum}`);
    possibilities.push(`LEVEL ${levelNum}`);
    // Handle reversed naming (e.g., "18 Level" instead of "Level 18")
    possibilities.push(`${levelNum} Level`);
  }

  // Match "Level 05" → "Level 5"
  const levelMatch = normalized.match(/^Level\s*(\d+)$/i);
  if (levelMatch) {
    const levelNum = parseInt(levelMatch[1], 10);
    possibilities.push(`Level ${levelNum}`);
    possibilities.push(`Lvl ${levelNum}`);
    possibilities.push(`Lvl ${String(levelNum).padStart(2, '0')}`);
    // Handle reversed naming (e.g., "18 Level" instead of "Level 18")
    possibilities.push(`${levelNum} Level`);
  }

  // Special cases
  if (normalized.toLowerCase() === 'gf' || normalized.toLowerCase() === 'ground floor') {
    possibilities.push('Ground Floor', 'ground floor', 'GF', 'gf');
  }

  if (normalized.toLowerCase() === 'plaza') {
    possibilities.push('Plaza', 'plaza', 'PLAZA');
  }

  if (normalized.toLowerCase() === 'roof' || normalized.toLowerCase() === 'rooftop') {
    possibilities.push('Roof', 'roof', 'Rooftop', 'rooftop');
  }

  if (normalized.toLowerCase() === 'basement' || normalized.toLowerCase().match(/^b\d+$/)) {
    possibilities.push('Basement', 'basement', 'Basement 1', 'basement 1');
  }

  return [...new Set(possibilities)]; // Remove duplicates
}

/**
 * Main migration function
 */
async function migrateFloorIds() {
  try {
    console.log('🚀 Starting floor_id migration from asset.level field...\n');

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all assets that have a level but no floor_id
    const assetsWithoutFloorId = await Asset.find({
      level: { $exists: true, $ne: null, $ne: '' },
      building_id: { $exists: true, $ne: null }
    }).select('_id level building_id floor_id customer_id asset_no');

    console.log(`📊 Found ${assetsWithoutFloorId.length} assets with level field\n`);

    const stats = {
      total: assetsWithoutFloorId.length,
      matched: 0,
      alreadySet: 0,
      notMatched: 0,
      updated: 0,
      errors: 0
    };

    const unmatchedLevels = new Map(); // Track unmatched levels by building

    // Process each asset
    for (const asset of assetsWithoutFloorId) {
      try {
        // Skip if floor_id is already set
        if (asset.floor_id) {
          stats.alreadySet++;
          continue;
        }

        const possibleFloorNames = getPossibleFloorNames(asset.level);

        // Find matching floor in the same building
        const matchingFloor = await Floor.findOne({
          building_id: asset.building_id,
          floor_name: { $in: possibleFloorNames }
        }).select('_id floor_name');

        if (matchingFloor) {
          // Update the asset with the floor_id
          await Asset.findByIdAndUpdate(asset._id, {
            floor_id: matchingFloor._id
          });

          stats.matched++;
          stats.updated++;
          console.log(`✓ Updated asset ${asset.asset_no || asset._id}: "${asset.level}" → Floor: "${matchingFloor.floor_name}" (${matchingFloor._id})`);
        } else {
          stats.notMatched++;

          // Track unmatched levels
          const buildingKey = asset.building_id.toString();
          if (!unmatchedLevels.has(buildingKey)) {
            unmatchedLevels.set(buildingKey, new Set());
          }
          unmatchedLevels.get(buildingKey).add(asset.level);

          console.log(`✗ No match for asset ${asset.asset_no || asset._id}: "${asset.level}" in building ${asset.building_id}`);
        }
      } catch (error) {
        stats.errors++;
        console.error(`❌ Error processing asset ${asset._id}:`, error.message);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total assets processed:        ${stats.total}`);
    console.log(`Already had floor_id:          ${stats.alreadySet}`);
    console.log(`Successfully matched & updated: ${stats.updated}`);
    console.log(`Not matched:                   ${stats.notMatched}`);
    console.log(`Errors:                        ${stats.errors}`);
    console.log('='.repeat(60));

    // Show unmatched levels by building
    if (unmatchedLevels.size > 0) {
      console.log('\n📋 UNMATCHED LEVELS BY BUILDING:');
      console.log('='.repeat(60));

      for (const [buildingId, levels] of unmatchedLevels.entries()) {
        const building = await mongoose.model('Building').findById(buildingId).select('building_name building_code');
        const buildingName = building ? `${building.building_name} (${building.building_code})` : buildingId;

        console.log(`\nBuilding: ${buildingName}`);
        console.log(`Building ID: ${buildingId}`);
        console.log('Unmatched levels:', Array.from(levels).sort().join(', '));

        // Show available floors in this building
        const availableFloors = await Floor.find({ building_id: buildingId }).select('floor_name').sort({ floor_name: 1 });
        console.log('Available floors:', availableFloors.map(f => f.floor_name).join(', '));
      }
      console.log('='.repeat(60));
    }

    console.log('\n✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the migration
migrateFloorIds()
  .then(() => {
    console.log('✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
