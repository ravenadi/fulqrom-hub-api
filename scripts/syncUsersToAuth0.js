/**
 * Sync existing MongoDB users to Auth0
 * This script handles users that were created before Auth0 integration
 */

const User = require('../models/User');
const auth0Service = require('../services/auth0Service');
const mongoose = require('mongoose');
require('dotenv').config();

const syncUsersToAuth0 = async (options = {}) => {
  const {
    tenantId = null,
    dryRun = false,
    limit = null,
    skipExisting = true
  } = options;

  try {
    console.log('🚀 Starting Auth0 user sync...');
    console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}`);
    console.log(`   Skip existing: ${skipExisting ? 'YES' : 'NO'}`);
    console.log(`   Tenant filter: ${tenantId || 'ALL'}`);
    console.log(`   Limit: ${limit || 'NONE'}\n`);

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('✅ Connected to MongoDB\n');

    // Build query
    const query = {};
    if (tenantId) {
      query.tenant_id = tenantId;
    }
    if (skipExisting) {
      query.$or = [
        { auth0_id: { $exists: false } },
        { auth0_id: null },
        { auth0_id: '' }
      ];
    }

    // Get users
    let usersQuery = User.find(query).sort({ created_at: -1 });
    if (limit) {
      usersQuery = usersQuery.limit(limit);
    }

    const users = await usersQuery;
    console.log(`📊 Found ${users.length} users to process\n`);

    if (users.length === 0) {
      console.log('✨ No users need syncing!');
      await mongoose.connection.close();
      return { synced: 0, skipped: 0, failed: 0 };
    }

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`\n[${i + 1}/${users.length}] Processing: ${user.email}`);
      console.log(`   MongoDB ID: ${user._id}`);
      console.log(`   Auth0 ID: ${user.auth0_id || 'NONE'}`);
      console.log(`   Tenant ID: ${user.tenant_id}`);

      try {
        // Skip if already has Auth0 ID and skipExisting is true
        if (skipExisting && user.auth0_id) {
          console.log(`   ⏭️  Skipped (already has Auth0 ID)`);
          skipped++;
          continue;
        }

        if (dryRun) {
          console.log(`   🔍 [DRY RUN] Would create Auth0 user`);
          synced++;
          continue;
        }

        // Check if user already exists in Auth0 by email
        const existingAuth0User = await auth0Service.getAuth0UserByEmail(user.email);

        if (existingAuth0User) {
          console.log(`   🔗 Found existing Auth0 user: ${existingAuth0User.user_id}`);

          // Update MongoDB with Auth0 ID
          user.auth0_id = existingAuth0User.user_id;
          await user.save();

          // Sync roles
          if (user.role_ids && user.role_ids.length > 0) {
            console.log(`   🔄 Syncing ${user.role_ids.length} roles...`);
            await auth0Service.syncUserRoles(existingAuth0User.user_id, user.role_ids);
          }

          console.log(`   ✅ Linked existing Auth0 user`);
          synced++;
        } else {
          // Create new Auth0 user
          console.log(`   🆕 Creating new Auth0 user...`);

          const auth0User = await auth0Service.createAuth0User({
            email: user.email,
            full_name: user.full_name,
            phone: user.phone || '',
            is_active: user.is_active !== undefined ? user.is_active : true,
            role_ids: user.role_ids || [],
            _id: user._id
          });

          // Assign roles
          if (user.role_ids && user.role_ids.length > 0) {
            console.log(`   🔄 Assigning ${user.role_ids.length} roles...`);
            await auth0Service.assignRolesToUser(auth0User.user_id, user.role_ids);
          }

          // Update MongoDB with Auth0 ID
          user.auth0_id = auth0User.user_id;
          await user.save();

          console.log(`   ✅ Created Auth0 user: ${auth0User.user_id}`);
          synced++;
        }
      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Sync Summary:');
    console.log(`   Total processed: ${users.length}`);
    console.log(`   ✅ Synced: ${synced}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log('='.repeat(60));

    await mongoose.connection.close();
    console.log('\n✅ MongoDB connection closed');

    return { synced, skipped, failed };
  } catch (error) {
    console.error('\n❌ Sync failed:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    throw error;
  }
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    skipExisting: !args.includes('--include-existing'),
    tenantId: null,
    limit: null
  };

  // Parse tenant ID
  const tenantIndex = args.indexOf('--tenant');
  if (tenantIndex !== -1 && args[tenantIndex + 1]) {
    options.tenantId = args[tenantIndex + 1];
  }

  // Parse limit
  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    options.limit = parseInt(args[limitIndex + 1]);
  }

  syncUsersToAuth0(options)
    .then((result) => {
      console.log('\n✨ Sync completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Sync failed:', error.message);
      process.exit(1);
    });
}

module.exports = syncUsersToAuth0;
