/**
 * Migration: Set floor_id for ALL assets based on their level field
 *
 * This migration handles all floor naming variations:
 * - Floor 05 → Floor 5
 * - Lvl 05 → Level 5
 * - Basement 2
 * - Ground Floor / GF
 * - Plaza, Terrace, Roof
 * - And more variations
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Asset = require('../models/Asset');
const Floor = require('../models/Floor');

const MONGODB_URI = process.env.MONGODB_CONNECTION;

/**
 * Generate all possible floor name variations for a given level
 */
function getPossibleFloorNames(level) {
  if (!level) return [];

  const normalized = level.trim();
  const possibilities = [normalized];

  // Match "Floor 05" → "Floor 5"
  const floorMatch = normalized.match(/^Floor\s*(\d+)$/i);
  if (floorMatch) {
    const levelNum = parseInt(floorMatch[1], 10);
    possibilities.push(`Floor ${levelNum}`);
    possibilities.push(`floor ${levelNum}`);
    possibilities.push(`FLOOR ${levelNum}`);
    possibilities.push(`Level ${levelNum}`);
    possibilities.push(`Lvl ${levelNum}`);
  }

  // Match "Lvl 05" → "Level 5"
  const lvlMatch = normalized.match(/^Lvl\s*(\d+)$/i);
  if (lvlMatch) {
    const levelNum = parseInt(lvlMatch[1], 10);
    possibilities.push(`Level ${levelNum}`);
    possibilities.push(`level ${levelNum}`);
    possibilities.push(`LEVEL ${levelNum}`);
    possibilities.push(`Lvl ${levelNum}`);
    possibilities.push(`lvl ${levelNum}`);
    possibilities.push(`LVL ${levelNum}`);
    possibilities.push(`Floor ${levelNum}`);
    possibilities.push(`${levelNum} Level`);
    // With leading zeros
    possibilities.push(`Lvl ${String(levelNum).padStart(2, '0')}`);
    possibilities.push(`Level ${String(levelNum).padStart(2, '0')}`);
  }

  // Match "Level 05" → "Level 5"
  const levelMatch = normalized.match(/^Level\s*(\d+)$/i);
  if (levelMatch) {
    const levelNum = parseInt(levelMatch[1], 10);
    possibilities.push(`Level ${levelNum}`);
    possibilities.push(`level ${levelNum}`);
    possibilities.push(`LEVEL ${levelNum}`);
    possibilities.push(`Lvl ${levelNum}`);
    possibilities.push(`Floor ${levelNum}`);
    possibilities.push(`${levelNum} Level`);
    // With leading zeros
    possibilities.push(`Lvl ${String(levelNum).padStart(2, '0')}`);
    possibilities.push(`Level ${String(levelNum).padStart(2, '0')}`);
  }

  // Match just numbers "05" → "Level 5"
  const numMatch = normalized.match(/^(\d+)$/);
  if (numMatch) {
    const levelNum = parseInt(numMatch[1], 10);
    possibilities.push(`Level ${levelNum}`);
    possibilities.push(`Lvl ${levelNum}`);
    possibilities.push(`Floor ${levelNum}`);
    possibilities.push(`${levelNum}`);
  }

  // Basement variations
  if (normalized.toLowerCase().includes('basement')) {
    const basementMatch = normalized.match(/Basement\s*(\d+)/i);
    if (basementMatch) {
      const num = basementMatch[1];
      possibilities.push(`Basement ${num}`);
      possibilities.push(`basement ${num}`);
      possibilities.push(`BASEMENT ${num}`);
      possibilities.push(`B${num}`);
    } else {
      possibilities.push('Basement', 'basement', 'BASEMENT');
      possibilities.push('Basement 1', 'basement 1', 'BASEMENT 1');
      possibilities.push('B1');
    }
  }

  // B1, B2, etc.
  const bMatch = normalized.match(/^B(\d+)$/i);
  if (bMatch) {
    const num = bMatch[1];
    possibilities.push(`Basement ${num}`);
    possibilities.push(`basement ${num}`);
    possibilities.push(`B${num}`);
    possibilities.push(`b${num}`);
  }

  // Ground Floor variations
  if (normalized.toLowerCase() === 'gf' || normalized.toLowerCase() === 'ground floor' || normalized.toLowerCase() === 'ground') {
    possibilities.push('Ground Floor', 'ground floor', 'GROUND FLOOR');
    possibilities.push('GF', 'gf', 'G/F');
    possibilities.push('Ground', 'ground', 'GROUND');
    possibilities.push('Level 0', 'Lvl 0', 'Floor 0');
  }

  // Plaza variations
  if (normalized.toLowerCase() === 'plaza') {
    possibilities.push('Plaza', 'plaza', 'PLAZA');
    possibilities.push('Plaza Level');
  }

  // Terrace variations
  if (normalized.toLowerCase() === 'terrace' || normalized.toLowerCase() === 'terrace level') {
    possibilities.push('Terrace', 'terrace', 'TERRACE');
    possibilities.push('Terrace Level', 'terrace level');
  }

  // Roof variations
  if (normalized.toLowerCase() === 'roof' || normalized.toLowerCase() === 'rooftop') {
    possibilities.push('Roof', 'roof', 'ROOF');
    possibilities.push('Rooftop', 'rooftop', 'ROOFTOP');
    possibilities.push('Roof Level', 'roof level');
  }

  // Mezzanine variations
  if (normalized.toLowerCase().includes('mezzanine')) {
    possibilities.push('Mezzanine', 'mezzanine', 'MEZZANINE');
    possibilities.push('Mezzanine Level', 'mezzanine level');
    possibilities.push('Mezz', 'mezz', 'MEZZ');
  }

  // Lower Ground variations
  if (normalized.toLowerCase() === 'lg' || normalized.toLowerCase() === 'lower ground') {
    possibilities.push('Lower Ground', 'lower ground', 'LOWER GROUND');
    possibilities.push('LG', 'lg', 'L/G');
    possibilities.push('Lower Ground Floor');
  }

  // Upper Ground variations
  if (normalized.toLowerCase() === 'ug' || normalized.toLowerCase() === 'upper ground') {
    possibilities.push('Upper Ground', 'upper ground', 'UPPER GROUND');
    possibilities.push('UG', 'ug', 'U/G');
    possibilities.push('Upper Ground Floor');
  }

  // Podium variations
  if (normalized.toLowerCase() === 'podium') {
    possibilities.push('Podium', 'podium', 'PODIUM');
    possibilities.push('Podium Level', 'podium level');
  }

  // Penthouse variations
  if (normalized.toLowerCase() === 'penthouse' || normalized.toLowerCase() === 'ph') {
    possibilities.push('Penthouse', 'penthouse', 'PENTHOUSE');
    possibilities.push('PH', 'ph', 'P/H');
    possibilities.push('Penthouse Level');
  }

  return [...new Set(possibilities)];
}

async function migrateAllAssetFloorIds() {
  try {
    console.log('🚀 Starting comprehensive floor_id migration for ALL assets...\n');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all assets with level field but no floor_id
    const assets = await Asset.find({
      level: { $exists: true, $ne: null, $ne: '' },
      building_id: { $exists: true, $ne: null }
    }).select('_id level floor_id building_id asset_no customer_id');

    console.log(`📊 Found ${assets.length} assets with level field\n`);

    const stats = {
      total: assets.length,
      matched: 0,
      alreadySet: 0,
      notMatched: 0,
      updated: 0
    };

    const unmatchedLevels = new Map(); // level → count
    const buildingStats = new Map(); // building_id → stats

    // Process each asset
    for (const asset of assets) {
      try {
        // Track per-building stats
        if (!buildingStats.has(asset.building_id)) {
          buildingStats.set(asset.building_id, {
            total: 0,
            updated: 0,
            alreadySet: 0,
            notMatched: 0
          });
        }
        const bStats = buildingStats.get(asset.building_id);
        bStats.total++;

        // Skip if floor_id is already set
        if (asset.floor_id) {
          stats.alreadySet++;
          bStats.alreadySet++;
          console.log(`⏭  Skipped ${asset.asset_no || asset._id}: floor_id already set`);
          continue;
        }

        const possibleFloorNames = getPossibleFloorNames(asset.level);

        // Find matching floor in the same building
        const matchingFloor = await Floor.findOne({
          building_id: asset.building_id,
          floor_name: { $in: possibleFloorNames }
        }).select('_id floor_name building_id');

        if (matchingFloor) {
          // Update the asset with the floor_id
          await Asset.findByIdAndUpdate(asset._id, {
            floor_id: matchingFloor._id
          });

          stats.matched++;
          stats.updated++;
          bStats.updated++;
          console.log(`✓ Updated ${asset.asset_no || asset._id}: "${asset.level}" → "${matchingFloor.floor_name}" (${matchingFloor._id})`);
        } else {
          stats.notMatched++;
          bStats.notMatched++;

          const key = `${asset.building_id}|${asset.level}`;
          unmatchedLevels.set(key, (unmatchedLevels.get(key) || 0) + 1);

          console.log(`✗ No match for ${asset.asset_no || asset._id}: "${asset.level}" in building ${asset.building_id}`);
        }
      } catch (error) {
        console.error(`❌ Error processing asset ${asset._id}:`, error.message);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📈 OVERALL MIGRATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total assets processed:         ${stats.total}`);
    console.log(`Already had floor_id:           ${stats.alreadySet}`);
    console.log(`Successfully matched & updated: ${stats.updated}`);
    console.log(`Not matched:                    ${stats.notMatched}`);
    console.log('='.repeat(70));

    // Per-building summary
    if (buildingStats.size > 0) {
      console.log('\n📊 PER-BUILDING SUMMARY:');
      console.log('='.repeat(70));
      for (const [buildingId, bStats] of buildingStats.entries()) {
        console.log(`\nBuilding ${buildingId}:`);
        console.log(`  Total:         ${bStats.total}`);
        console.log(`  Already set:   ${bStats.alreadySet}`);
        console.log(`  Updated:       ${bStats.updated}`);
        console.log(`  Not matched:   ${bStats.notMatched}`);
      }
    }

    // Show unmatched levels grouped by building
    if (unmatchedLevels.size > 0) {
      console.log('\n⚠️  UNMATCHED LEVELS BY BUILDING:');
      console.log('='.repeat(70));

      const unmatchedByBuilding = new Map();
      for (const [key, count] of unmatchedLevels.entries()) {
        const [buildingId, level] = key.split('|');
        if (!unmatchedByBuilding.has(buildingId)) {
          unmatchedByBuilding.set(buildingId, []);
        }
        unmatchedByBuilding.get(buildingId).push({ level, count });
      }

      for (const [buildingId, levels] of unmatchedByBuilding.entries()) {
        console.log(`\nBuilding ${buildingId}:`);

        // Show available floors in this building
        const availableFloors = await Floor.find({ building_id: buildingId })
          .select('floor_name floor_number')
          .sort({ floor_number: 1 });

        console.log(`  Available floors (${availableFloors.length}):`);
        availableFloors.forEach(f => {
          console.log(`    - ${f.floor_name} (floor_number: ${f.floor_number})`);
        });

        console.log(`  Unmatched levels:`);
        levels.sort((a, b) => a.level.localeCompare(b.level)).forEach(({ level, count }) => {
          console.log(`    - "${level}" (${count} assets)`);
        });
      }
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
migrateAllAssetFloorIds()
  .then(() => {
    console.log('✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
