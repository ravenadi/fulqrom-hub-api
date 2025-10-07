/**
 * Migration: Standardize Document Categories to Human-Readable Format
 *
 * Purpose: Convert all document categories from snake_case or inconsistent formats
 * to the standard human-readable format used in /api/dropdowns
 *
 * Run with: node migrations/standardize-document-categories.js
 */

const mongoose = require('mongoose');
const Document = require('../models/Document');

const MONGODB_CONNECTION = process.env.MONGODB_CONNECTION ||
  'mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/fulqrom-hub';

// Standard categories from /api/dropdowns (document_categories)
const STANDARD_CATEGORIES = [
  'Operations & Maintenance (O&M) Manuals',
  'Commissioning Data (Air & Water Balance Reports)',
  'Egress Report',
  'Fire Safety Reports',
  'HVAC Drawings',
  'Electrical Schematics',
  'Plumbing & Hydraulics Drawings',
  'Mechanical Services Drawings',
  'Waste Services',
  'Building Management & Control Diagrams',
  'Construction Drawings',
  'Tender Drawings & Specifications',
  'Shop Drawings',
  'Certification Reports',
  'Warranty Certificates',
  'Service Reports',
  'Asset Registers',
  'Drawing Register',
  'Drawing Schedules',
  'Compliance Documents',
  'Project Management Documentation',
  'NABERS & Energy Reporting',
  'Device Register'
];

// Mapping from old formats to new human-readable format
const CATEGORY_MAPPING = {
  // Snake_case variants
  'drawing_register': 'Drawing Register',
  'drawing_schedules': 'Drawing Schedules',
  'fire_safety_reports': 'Fire Safety Reports',
  'hvac_drawings': 'HVAC Drawings',
  'electrical_schematics': 'Electrical Schematics',
  'plumbing_hydraulics_drawings': 'Plumbing & Hydraulics Drawings',
  'mechanical_services_drawings': 'Mechanical Services Drawings',
  'waste_services': 'Waste Services',
  'building_management_control_diagrams': 'Building Management & Control Diagrams',
  'construction_drawings': 'Construction Drawings',
  'tender_drawings_specifications': 'Tender Drawings & Specifications',
  'shop_drawings': 'Shop Drawings',
  'certification_reports': 'Certification Reports',
  'warranty_certificates': 'Warranty Certificates',
  'service_reports': 'Service Reports',
  'asset_registers': 'Asset Registers',
  'compliance_documents': 'Compliance Documents',
  'project_management_documentation': 'Project Management Documentation',
  'nabers_energy_reporting': 'NABERS & Energy Reporting',
  'device_register': 'Device Register',
  'egress_report': 'Egress Report',
  'om_manuals': 'Operations & Maintenance (O&M) Manuals',
  'o_m_manuals': 'Operations & Maintenance (O&M) Manuals',
  'commissioning_data': 'Commissioning Data (Air & Water Balance Reports)',

  // Seed data variants (Title Case)
  'Architectural': 'Construction Drawings',
  'Engineering': 'Mechanical Services Drawings',
  'Safety': 'Fire Safety Reports',
  'Compliance': 'Compliance Documents',
  'Legal': 'Compliance Documents',
  'Financial': 'Project Management Documentation',
  'Operational': 'Operations & Maintenance (O&M) Manuals',

  // Other common variants
  'Drawing': 'Drawing Register',
  'Drawings': 'Drawing Schedules',
  'Fire Safety': 'Fire Safety Reports',
  'HVAC': 'HVAC Drawings',
  'Electrical': 'Electrical Schematics',
  'Plumbing': 'Plumbing & Hydraulics Drawings',
  'Mechanical': 'Mechanical Services Drawings',

  // URL-encoded variants (in case they got stored)
  'Drawing%20Register': 'Drawing Register',
  'Fire%20Safety%20Reports': 'Fire Safety Reports',
  'Electrical%20Schematics': 'Electrical Schematics'
};

async function migrateCategories() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_CONNECTION);
    console.log('✅ Connected to MongoDB\n');

    // Get all distinct categories currently in use
    const currentCategories = await Document.distinct('category');

    console.log('📊 Current Categories in Database:');
    console.log('='.repeat(60));

    if (currentCategories.length === 0) {
      console.log('ℹ️  No documents found in database');
      await mongoose.connection.close();
      return;
    }

    // Get counts for each category
    const categoryCounts = await Document.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const countsMap = {};
    categoryCounts.forEach(({ _id, count }) => {
      countsMap[_id] = count;
    });

    currentCategories.sort().forEach((cat) => {
      const count = countsMap[cat] || 0;
      const isStandard = STANDARD_CATEGORIES.includes(cat);
      const needsMigration = !isStandard && CATEGORY_MAPPING[cat];
      const status = isStandard ? '✅' : needsMigration ? '🔄' : '⚠️';

      console.log(`${status} "${cat}" (${count} docs)${needsMigration ? ` → "${CATEGORY_MAPPING[cat]}"` : ''}`);
    });

    // Find categories that need migration
    const categoriesToMigrate = currentCategories.filter(cat =>
      !STANDARD_CATEGORIES.includes(cat) && CATEGORY_MAPPING[cat]
    );

    if (categoriesToMigrate.length === 0) {
      console.log('\n✅ All categories are already in standard format!');
      await mongoose.connection.close();
      return;
    }

    console.log('\n🔄 Starting Migration...');
    console.log('='.repeat(60));

    let totalUpdated = 0;

    for (const oldCategory of categoriesToMigrate) {
      const newCategory = CATEGORY_MAPPING[oldCategory];

      console.log(`\n📝 Migrating: "${oldCategory}" → "${newCategory}"`);

      const result = await Document.updateMany(
        { category: oldCategory },
        { $set: { category: newCategory } }
      );

      console.log(`   ✅ Updated ${result.modifiedCount} documents`);
      totalUpdated += result.modifiedCount;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Migration Complete!`);
    console.log(`   Total documents updated: ${totalUpdated}`);

    // Show categories that couldn't be mapped
    const unmappedCategories = currentCategories.filter(cat =>
      !STANDARD_CATEGORIES.includes(cat) && !CATEGORY_MAPPING[cat]
    );

    if (unmappedCategories.length > 0) {
      console.log('\n⚠️  Warning: The following categories could not be automatically mapped:');
      unmappedCategories.forEach(cat => {
        console.log(`   - "${cat}" (${countsMap[cat]} docs)`);
      });
      console.log('   Please review these manually and update the CATEGORY_MAPPING if needed.');
    }

    // Verify final state
    console.log('\n📊 Final Category Distribution:');
    console.log('='.repeat(60));
    const finalCategoryCounts = await Document.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    finalCategoryCounts.forEach(({ _id, count }) => {
      const isStandard = STANDARD_CATEGORIES.includes(_id);
      const status = isStandard ? '✅' : '⚠️';
      console.log(`${status} "${_id}": ${count} documents`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
console.log('🚀 Document Category Standardization Migration');
console.log('='.repeat(60));
console.log('This script will update all document categories to the');
console.log('standard human-readable format used in /api/dropdowns\n');

migrateCategories();
