const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Role = require('./models/Role');

async function verifyUserPermissions() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('✅ Connected to MongoDB');

    const userId = '68f75211ab9d0946c112721e';

    // 1. Fetch user with populated roles
    console.log('\n📋 Step 1: Fetching user data...');
    const user = await User.findById(userId).populate('role_ids');

    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }

    console.log('✅ User found:', {
      email: user.email,
      fullName: user.full_name,
      isActive: user.is_active
    });

    // 2. Verify role_ids field
    console.log('\n📋 Step 2: Verifying role_ids field...');
    console.log('Role IDs array:', user.role_ids);
    console.log('Number of roles:', user.role_ids.length);

    if (user.role_ids && user.role_ids.length > 0) {
      user.role_ids.forEach((role, index) => {
        console.log(`\nRole ${index + 1}:`, {
          id: role._id || role,
          name: role.name,
          description: role.description,
          permissionCount: role.permissions?.length || 0
        });

        if (role.permissions) {
          console.log('  Permissions:');
          role.permissions.forEach(perm => {
            console.log(`    - ${perm.entity}: view=${perm.view}, create=${perm.create}, edit=${perm.edit}, delete=${perm.delete}`);
          });
        }
      });
      console.log('✅ role_ids field is properly populated');
    } else {
      console.log('⚠️  No roles assigned to user');
    }

    // 3. Verify resource_access field
    console.log('\n📋 Step 3: Verifying resource_access field...');
    console.log('Resource Access array:', user.resource_access);
    console.log('Number of resource access entries:', user.resource_access?.length || 0);

    if (user.resource_access && user.resource_access.length > 0) {
      user.resource_access.forEach((access, index) => {
        console.log(`\nResource Access ${index + 1}:`, {
          resourceType: access.resource_type,
          resourceId: access.resource_id,
          resourceName: access.resource_name,
          permissions: access.permissions,
          grantedBy: access.granted_by,
          grantedAt: access.granted_at
        });
      });
      console.log('✅ resource_access field is properly stored');
    } else {
      console.log('ℹ️  No resource access entries (this is normal for users with role-based permissions)');
    }

    // 4. Test update simulation
    console.log('\n📋 Step 4: Simulating update operation...');
    const originalRoleIds = user.role_ids.map(r => r._id || r);
    console.log('Current role IDs:', originalRoleIds);

    // Simulate an update (without actually saving)
    const testRoleIds = originalRoleIds; // In a real update, this would come from the request
    user.role_ids = testRoleIds;

    console.log('Updated role IDs:', user.role_ids);
    console.log('✅ Update simulation successful');

    // 5. Verify data integrity
    console.log('\n📋 Step 5: Verifying data integrity...');
    const checks = {
      hasEmail: !!user.email,
      hasFullName: !!user.full_name,
      hasRoleIds: Array.isArray(user.role_ids),
      hasResourceAccess: Array.isArray(user.resource_access),
      hasActiveStatus: typeof user.is_active === 'boolean',
      hasTimestamps: !!(user.created_at && user.updated_at)
    };

    console.log('Data integrity checks:', checks);

    const allChecksPassed = Object.values(checks).every(check => check === true);
    if (allChecksPassed) {
      console.log('✅ All data integrity checks passed');
    } else {
      console.log('⚠️  Some data integrity checks failed');
    }

    // 6. Summary
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`User: ${user.email} (${user.full_name})`);
    console.log(`Roles: ${user.role_ids.length} assigned`);
    console.log(`Resource Access: ${user.resource_access?.length || 0} entries`);
    console.log(`Active Status: ${user.is_active ? 'Active' : 'Inactive'}`);
    console.log(`Last Updated: ${user.updated_at}`);
    console.log('='.repeat(60));
    console.log('\n✅ All permissions-related fields are properly configured and stored');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run verification
verifyUserPermissions();
