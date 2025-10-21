/**
 * Script to automatically apply tenant plugin to all models
 *
 * This script adds the tenant plugin to all Mongoose models that require
 * tenant isolation, except for global models like Organization, Plan, and UserOrganization.
 *
 * Usage:
 *   node scripts/apply-tenant-plugin.js
 */

const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '../models');

// Models that should NOT have the tenant plugin
const EXCLUDED_MODELS = [
  'Organization.js',      // This IS the tenant
  'Plan.js'              // Global subscription plans
];

// Models that need tenant plugin
const INCLUDED_MODELS = [
  'Customer.js',
  'User.js',
  'Site.js',
  'Building.js',
  'Floor.js',
  'Asset.js',
  'BuildingTenant.js',
  'Vendor.js',
  'Document.js',
  'DocumentComment.js',
  'Role.js',
  'AuditLog.js',
  'Notification.js',
  'EmailNotification.js',
  'ApprovalHistory.js',
  'Settings.js'  // Might need to be tenant-scoped
];

function applyTenantPlugin() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   Apply Tenant Plugin to Mongoose Models        ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  const results = {
    success: [],
    skipped: [],
    errors: [],
    alreadyApplied: []
  };

  // Get all model files
  const modelFiles = fs.readdirSync(MODELS_DIR).filter(file => file.endsWith('.js'));

  console.log(`Found ${modelFiles.length} model files\n`);

  for (const modelFile of modelFiles) {
    const modelPath = path.join(MODELS_DIR, modelFile);
    const modelName = modelFile.replace('.js', '');

    // Skip excluded models
    if (EXCLUDED_MODELS.includes(modelFile)) {
      console.log(`⊘ Skipping ${modelFile} (excluded)`);
      results.skipped.push(modelFile);
      continue;
    }

    // Only process included models
    if (!INCLUDED_MODELS.includes(modelFile)) {
      console.log(`⊘ Skipping ${modelFile} (not in included list)`);
      results.skipped.push(modelFile);
      continue;
    }

    try {
      // Read the file
      let content = fs.readFileSync(modelPath, 'utf8');

      // Check if plugin is already applied
      if (content.includes('tenantPlugin') || content.includes('tenant_id')) {
        console.log(`✓ ${modelFile} - Already has tenant plugin`);
        results.alreadyApplied.push(modelFile);
        continue;
      }

      // Find the mongoose require statement
      const mongooseRequireRegex = /const mongoose = require\('mongoose'\);/;
      if (!mongooseRequireRegex.test(content)) {
        console.log(`⚠️  ${modelFile} - No mongoose require found`);
        results.errors.push(`${modelFile}: No mongoose require`);
        continue;
      }

      // Add tenant plugin require after mongoose require
      content = content.replace(
        mongooseRequireRegex,
        `const mongoose = require('mongoose');\nconst tenantPlugin = require('../plugins/tenantPlugin');`
      );

      // Find the module.exports statement
      const moduleExportsRegex = /module\.exports\s*=\s*mongoose\.model\(['"](\w+)['"],\s*(\w+Schema)\);/;
      const match = content.match(moduleExportsRegex);

      if (!match) {
        console.log(`⚠️  ${modelFile} - No module.exports found`);
        results.errors.push(`${modelFile}: No module.exports`);
        continue;
      }

      const schemaName = match[2];

      // Add plugin before module.exports
      content = content.replace(
        moduleExportsRegex,
        `// Apply tenant plugin for multi-tenancy support\n${schemaName}.plugin(tenantPlugin);\n\nmodule.exports = mongoose.model('${match[1]}', ${schemaName});`
      );

      // Write the updated content back
      fs.writeFileSync(modelPath, content, 'utf8');

      console.log(`✓ ${modelFile} - Tenant plugin applied`);
      results.success.push(modelFile);

    } catch (error) {
      console.error(`❌ ${modelFile} - Error: ${error.message}`);
      results.errors.push(`${modelFile}: ${error.message}`);
    }
  }

  // Print summary
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║                    Summary                        ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  console.log(`✓ Successfully applied: ${results.success.length}`);
  if (results.success.length > 0) {
    results.success.forEach(f => console.log(`  - ${f}`));
  }

  console.log(`\n⊘ Skipped: ${results.skipped.length}`);
  if (results.skipped.length > 0) {
    results.skipped.forEach(f => console.log(`  - ${f}`));
  }

  console.log(`\n✓ Already applied: ${results.alreadyApplied.length}`);
  if (results.alreadyApplied.length > 0) {
    results.alreadyApplied.forEach(f => console.log(`  - ${f}`));
  }

  if (results.errors.length > 0) {
    console.log(`\n❌ Errors: ${results.errors.length}`);
    results.errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log('\n✅ Done!\n');

  // Save results to JSON
  const reportPath = path.join(__dirname, `plugin-application-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`Report saved to: ${reportPath}\n`);

  return results;
}

// Run if called directly
if (require.main === module) {
  try {
    const results = applyTenantPlugin();
    process.exit(results.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

module.exports = { applyTenantPlugin };
