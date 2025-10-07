/**
 * Check Script: Preview floor_id matches for assets
 *
 * This script shows what matches would be made without updating the database.
 * Use this to verify the matching logic before running the full migration.
 *
 * Usage: node migrations/check-level-floor-matches.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Asset = require('../models/Asset');
const Floor = require('../models/Floor');
const Building = require('../models/Building');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_CONNECTION;

/**
 * Normalize level string to match with floor names
 */
function getPossibleFloorNames(level) {
  if (!level) return [];

  const normalized = level.trim();
  const possibilities = [normalized];

  // Match "Lvl 05" → "Level 5"
  const lvlMatch = normalized.match(/^Lvl\s*(\d+)$/i);
  if (lvlMatch) {
    const levelNum = parseInt(lvlMatch[1], 10);
    possibilities.push(`Level ${levelNum}`);
    possibilities.push(`level ${levelNum}`);
    possibilities.push(`LEVEL ${levelNum}`);
    possibilities.push(`${levelNum} Level`); // Reversed naming
  }

  // Match "Level 05" → "Level 5"
  const levelMatch = normalized.match(/^Level\s*(\d+)$/i);
  if (levelMatch) {
    const levelNum = parseInt(levelMatch[1], 10);
    possibilities.push(`Level ${levelNum}`);
    possibilities.push(`Lvl ${levelNum}`);
    possibilities.push(`Lvl ${String(levelNum).padStart(2, '0')}`);
    possibilities.push(`${levelNum} Level`); // Reversed naming
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

  if (normalized.toLowerCase() === 'terrace') {
    possibilities.push('Terrace', 'terrace', 'TERRACE');
  }

  return [...new Set(possibilities)];
}

/**
 * Main check function
 */
async function checkMatches() {
  try {
    console.log('🔍 Checking floor_id matches for assets...\n');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get unique levels from assets
    const uniqueLevels = await Asset.distinct('level', {
      level: { $exists: true, $ne: null, $ne: '' },
      building_id: { $exists: true, $ne: null }
    });

    console.log(`📊 Found ${uniqueLevels.length} unique level values\n`);

    const matchSummary = [];

    for (const level of uniqueLevels.sort()) {
      const possibleFloorNames = getPossibleFloorNames(level);

      // Count assets with this level
      const assetCount = await Asset.countDocuments({ level });

      // Find matching floors across all buildings
      const matchingFloors = await Floor.find({
        floor_name: { $in: possibleFloorNames }
      })
        .populate('building_id', 'building_name building_code')
        .select('_id floor_name building_id');

      matchSummary.push({
        level,
        assetCount,
        possibleMatches: possibleFloorNames,
        matchingFloors: matchingFloors.map(f => ({
          floorName: f.floor_name,
          floorId: f._id,
          building: f.building_id ? `${f.building_id.building_name} (${f.building_id.building_code})` : 'Unknown'
        }))
      });
    }

    // Display results
    console.log('='.repeat(80));
    console.log('MATCHING SUMMARY');
    console.log('='.repeat(80));

    for (const item of matchSummary) {
      const status = item.matchingFloors.length > 0 ? '✓' : '✗';
      const statusColor = item.matchingFloors.length > 0 ? '✅' : '❌';

      console.log(`\n${statusColor} Level: "${item.level}" (${item.assetCount} assets)`);

      if (item.matchingFloors.length > 0) {
        item.matchingFloors.forEach(floor => {
          console.log(`   → Matches: "${floor.floorName}" in ${floor.building}`);
          console.log(`      Floor ID: ${floor.floorId}`);
        });
      } else {
        console.log(`   → No matching floor found`);
        console.log(`   → Tried: ${item.possibleMatches.slice(0, 5).join(', ')}...`);
      }
    }

    console.log('\n' + '='.repeat(80));

    // Summary statistics
    const matched = matchSummary.filter(m => m.matchingFloors.length > 0).length;
    const unmatched = matchSummary.filter(m => m.matchingFloors.length === 0).length;

    console.log('STATISTICS:');
    console.log(`Total unique levels:  ${uniqueLevels.length}`);
    console.log(`Matched:              ${matched}`);
    console.log(`Unmatched:            ${unmatched}`);
    console.log('='.repeat(80));

    // Show unmatched levels
    if (unmatched > 0) {
      console.log('\n⚠️  UNMATCHED LEVELS (need floor records):');
      matchSummary
        .filter(m => m.matchingFloors.length === 0)
        .forEach(m => {
          console.log(`   - "${m.level}" (${m.assetCount} assets)`);
        });
    }

    console.log('\n✅ Check completed!\n');

  } catch (error) {
    console.error('❌ Check failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

// Run the check
checkMatches()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
