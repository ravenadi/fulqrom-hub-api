#!/usr/bin/env node

/**
 * Import Variable Mappings from CSV to TbDevice documents
 *
 * This script parses the device variable mapping CSV file and updates
 * TbDevice documents with variable_mappings field that maps telemetry
 * keys (e.g., "BV 67") to human-readable labels.
 *
 * CSV Structure:
 * - Column 0: DeviceId
 * - Column 1: DeviceType
 * - Column 2: DeviceName
 * - Column 5: I/O (e.g., "Binary value 67", "Analog value 2")
 * - Column 6: Variable name (e.g., "Occupied Mode", "Zone Temp")
 * - Column 7: Telemetry/Unit info (e.g., "Temperature - *C")
 *
 * Usage:
 *   node scripts/import-variable-mappings.js <csv_file_path> [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would be updated without making changes
 *
 * Examples:
 *   node scripts/import-variable-mappings.js ../docs/200SGT-Device-mapping-Book1.csv --dry-run
 *   node scripts/import-variable-mappings.js ../docs/200SGT-Device-mapping-Book1.csv
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const TbDevice = require('../models/TbDevice');

const DRY_RUN = process.argv.includes('--dry-run');
const CSV_FILE = process.argv[2];

/**
 * Convert I/O column value to telemetry key
 * e.g., "Binary value 67" -> "BV 67"
 *       "Analog value 2" -> "AV 2"
 *       "Analog output 0" -> "AO 0"
 */
function ioToTelemetryKey(ioValue) {
  if (!ioValue || typeof ioValue !== 'string') return null;

  const cleaned = ioValue.trim();

  // Match patterns like "Binary value 67", "Analog value 2", "Analog output 0"
  // Handle typos like "BInary" (capital I)
  const patterns = [
    { regex: /^binary\s+value\s+(\d+)/i, prefix: 'BV' },
    { regex: /^analog\s+value\s+(\d+)/i, prefix: 'AV' },
    { regex: /^analog\s+output\s+(\d+)/i, prefix: 'AO' },
    { regex: /^binary\s+output\s+(\d+)/i, prefix: 'BO' },
    { regex: /^analog\s+input\s+(\d+)/i, prefix: 'AI' },
    { regex: /^binary\s+input\s+(\d+)/i, prefix: 'BI' },
    { regex: /^multistate\s+value\s+(\d+)/i, prefix: 'MV' },
  ];

  for (const { regex, prefix } of patterns) {
    const match = cleaned.match(regex);
    if (match) {
      return `${prefix} ${match[1]}`;
    }
  }

  return null;
}

/**
 * Parse CSV content into device mappings
 */
function parseCSV(csvContent) {
  const lines = csvContent.split('\n');
  const deviceMappings = new Map(); // DeviceId -> { mappings }

  let currentDeviceId = null;
  let currentDeviceType = null;
  let currentDeviceName = null;

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse CSV line (handle commas properly)
    const columns = line.split(',').map(col => col.trim());

    // Check if this line has a new device ID
    if (columns[0] && columns[0].match(/^\d+$/)) {
      currentDeviceId = columns[0];
      currentDeviceType = columns[1] || null;
      currentDeviceName = columns[2] || null;
    }

    // Skip if no current device
    if (!currentDeviceId) continue;

    // Get I/O and variable name
    const io = columns[5];
    const variableName = columns[6];
    const telemetryInfo = columns[7] || '';

    // Skip empty rows
    if (!io || !variableName) continue;

    // Convert I/O to telemetry key
    const telemetryKey = ioToTelemetryKey(io);
    if (!telemetryKey) continue;

    // Initialize device mapping if needed
    if (!deviceMappings.has(currentDeviceId)) {
      deviceMappings.set(currentDeviceId, {
        deviceId: currentDeviceId,
        deviceType: currentDeviceType,
        deviceName: currentDeviceName,
        mappings: {}
      });
    }

    // Add mapping
    deviceMappings.get(currentDeviceId).mappings[telemetryKey] = {
      full_name: io.trim(),
      label: variableName.trim(),
      unit: telemetryInfo.trim() || null
    };
  }

  return deviceMappings;
}

/**
 * Create a global mapping (device-agnostic) from all devices
 * This is useful when devices have the same variable patterns
 */
function createGlobalMapping(deviceMappings) {
  const globalMapping = {};

  for (const [, deviceData] of deviceMappings) {
    for (const [key, mapping] of Object.entries(deviceData.mappings)) {
      // Use first occurrence of each key
      if (!globalMapping[key]) {
        globalMapping[key] = mapping;
      }
    }
  }

  return globalMapping;
}

async function importVariableMappings() {
  try {
    // Validate CSV file argument
    if (!CSV_FILE) {
      console.error('Usage: node scripts/import-variable-mappings.js <csv_file_path> [--dry-run]');
      process.exit(1);
    }

    const csvPath = path.resolve(__dirname, CSV_FILE);

    if (!fs.existsSync(csvPath)) {
      console.error(`CSV file not found: ${csvPath}`);
      process.exit(1);
    }

    console.log('='.repeat(60));
    console.log('  Import Variable Mappings to TbDevice');
    console.log('='.repeat(60) + '\n');

    if (DRY_RUN) {
      console.log('DRY RUN MODE - No changes will be made\n');
    }

    // Read and parse CSV
    console.log(`Reading CSV file: ${csvPath}\n`);
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const deviceMappings = parseCSV(csvContent);

    console.log(`Parsed ${deviceMappings.size} devices from CSV\n`);

    // Show sample mappings
    console.log('Sample mappings from first device:');
    const firstDevice = deviceMappings.values().next().value;
    if (firstDevice) {
      console.log(`  Device: ${firstDevice.deviceName} (ID: ${firstDevice.deviceId})`);
      const sampleKeys = Object.keys(firstDevice.mappings).slice(0, 5);
      for (const key of sampleKeys) {
        const m = firstDevice.mappings[key];
        console.log(`    ${key} -> ${m.label} (${m.full_name})`);
      }
      console.log();
    }

    // Create global mapping
    const globalMapping = createGlobalMapping(deviceMappings);
    console.log(`Created global mapping with ${Object.keys(globalMapping).length} unique keys\n`);

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('Connected to MongoDB\n');

    // Find TbDevice documents and update them
    const results = {
      updated: 0,
      notFound: 0,
      errors: 0
    };

    // Update each device with its specific mappings
    for (const [deviceId, deviceData] of deviceMappings) {
      try {
        // Try to find device by name (since CSV has device IDs that may not match MongoDB IDs)
        // Use skipTenantFilter to bypass tenant plugin for migration scripts
        const device = await TbDevice.findOne({
          name: { $regex: deviceData.deviceName, $options: 'i' },
          is_delete: { $ne: true }
        }).setOptions({ skipTenantFilter: true });

        if (device) {
          console.log(`Found device: ${device.name} (MongoDB ID: ${device._id})`);
          console.log(`  Mapping ${Object.keys(deviceData.mappings).length} variables`);

          if (!DRY_RUN) {
            await TbDevice.updateOne(
              { _id: device._id },
              { $set: { variable_mappings: deviceData.mappings } }
            ).setOptions({ skipTenantFilter: true });
            console.log('  Updated\n');
          } else {
            console.log('  Would update (DRY RUN)\n');
          }
          results.updated++;
        } else {
          console.log(`Device not found: ${deviceData.deviceName} (CSV ID: ${deviceId})`);
          results.notFound++;
        }
      } catch (error) {
        console.error(`Error updating device ${deviceData.deviceName}:`, error.message);
        results.errors++;
      }
    }

    // Also update any devices without mappings with the global mapping
    console.log('\nUpdating remaining devices with global mapping...\n');

    const devicesWithoutMappings = await TbDevice.find({
      variable_mappings: { $exists: false },
      is_delete: { $ne: true }
    }).setOptions({ skipTenantFilter: true });

    console.log(`Found ${devicesWithoutMappings.length} devices without mappings`);

    if (!DRY_RUN && devicesWithoutMappings.length > 0) {
      const updateResult = await TbDevice.updateMany(
        {
          variable_mappings: { $exists: false },
          is_delete: { $ne: true }
        },
        { $set: { variable_mappings: globalMapping } }
      ).setOptions({ skipTenantFilter: true });
      console.log(`Updated ${updateResult.modifiedCount} devices with global mapping\n`);
    } else if (devicesWithoutMappings.length > 0) {
      console.log(`Would update ${devicesWithoutMappings.length} devices (DRY RUN)\n`);
    }

    // Summary
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  Devices in CSV: ${deviceMappings.size}`);
    console.log(`  Matched and updated: ${results.updated}`);
    console.log(`  Not found in MongoDB: ${results.notFound}`);
    console.log(`  Errors: ${results.errors}`);
    console.log(`  Global mapping keys: ${Object.keys(globalMapping).length}`);
    console.log('='.repeat(60) + '\n');

    if (DRY_RUN) {
      console.log('This was a DRY RUN. Run without --dry-run to apply changes.\n');
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the import
importVariableMappings();
