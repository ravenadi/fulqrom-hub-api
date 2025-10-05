/**
 * Migration Script: Add Document Versioning
 *
 * This script adds versioning fields to existing documents in the database.
 * Run this script once to migrate existing documents to the new versioning system.
 *
 * Usage:
 *   node migrations/add_document_versioning.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_CONNECTION;

async function runMigration() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully\n');

    const db = mongoose.connection.db;
    const documentsCollection = db.collection('documents');

    // Find all documents that don't have versioning fields
    const documentsToMigrate = await documentsCollection.find({
      document_group_id: { $exists: false }
    }).toArray();

    console.log(`Found ${documentsToMigrate.length} documents to migrate\n`);

    if (documentsToMigrate.length === 0) {
      console.log('No documents need migration. Exiting.');
      await mongoose.connection.close();
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Migrate each document
    for (const doc of documentsToMigrate) {
      try {
        const updateResult = await documentsCollection.updateOne(
          { _id: doc._id },
          {
            $set: {
              document_group_id: doc._id.toString(),
              version_number: doc.version || '1.0',
              is_current_version: true,
              version_sequence: 1,
              version_metadata: {
                uploaded_by: {
                  user_id: doc.created_by || 'system',
                  user_name: 'System Migration',
                  email: 'system@fulqrom.com'
                },
                upload_timestamp: doc.created_at ? new Date(doc.created_at) : new Date(),
                change_notes: 'Initial version - migrated from legacy system',
                file_changes: {
                  original_filename: doc.file?.file_meta?.file_name || doc.name || 'unknown',
                  file_size_bytes: doc.file?.file_meta?.file_size || 0,
                  file_hash: ''
                }
              }
            }
          }
        );

        if (updateResult.modifiedCount > 0) {
          successCount++;
          console.log(`✓ Migrated document: ${doc.name || doc._id} (ID: ${doc._id})`);
        } else {
          console.log(`⚠ Skipped document: ${doc.name || doc._id} (ID: ${doc._id}) - Already migrated or no changes needed`);
        }
      } catch (error) {
        errorCount++;
        console.error(`✗ Error migrating document ${doc._id}:`, error.message);
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total documents found: ${documentsToMigrate.length}`);
    console.log(`Successfully migrated: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('=========================\n');

    // Create indexes for version management
    console.log('Creating indexes for version management...');

    try {
      await documentsCollection.createIndex(
        { document_group_id: 1, version_sequence: -1 },
        { name: 'document_group_version_sequence_idx' }
      );
      console.log('✓ Created index: document_group_id + version_sequence');
    } catch (error) {
      console.log('⚠ Index already exists or error:', error.message);
    }

    try {
      await documentsCollection.createIndex(
        { document_group_id: 1, is_current_version: 1 },
        { name: 'document_group_current_version_idx' }
      );
      console.log('✓ Created index: document_group_id + is_current_version');
    } catch (error) {
      console.log('⚠ Index already exists or error:', error.message);
    }

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed.');
  }
}

// Run the migration
runMigration();
