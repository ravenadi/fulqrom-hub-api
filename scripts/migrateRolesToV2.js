#!/usr/bin/env node

/**
 * Migration Script: Legacy Roles → RoleV2
 * 
 * This script migrates roles from the legacy Role collection to the new RoleV2 collection
 * and updates user role assignments accordingly.
 * 
 * Usage: node scripts/migrateRolesToV2.js
 */

const mongoose = require('mongoose');
const LegacyRole = require('../models/Role');
const RoleV2 = require('../models/v2/Role');
const User = require('../models/User');

// Load environment variables
require('dotenv').config();

// Database connection - use same as server
const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom';

async function migrateRolesToV2() {
  try {
    console.log('🔄 Starting role migration from Legacy to V2...');
    console.log(`🔗 Connecting to MongoDB: ${MONGODB_URI ? 'MONGODB_CONNECTION found' : 'Using fallback'}`);
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Step 1: Initialize predefined roles in RoleV2
    console.log('📋 Initializing predefined roles in RoleV2...');
    await RoleV2.initializePredefinedRoles();
    console.log('✅ Predefined roles initialized');

    // Step 2: Get all legacy roles
    const legacyRoles = await LegacyRole.find({});
    console.log(`📊 Found ${legacyRoles.length} legacy roles`);

    // Step 3: Create mapping from legacy role names to V2 role IDs
    const roleMapping = new Map();
    
    for (const legacyRole of legacyRoles) {
      console.log(`🔍 Processing legacy role: ${legacyRole.name}`);
      
      // Try to find matching V2 role by name
      const v2Role = await RoleV2.findOne({ name: legacyRole.name });
      
      if (v2Role) {
        roleMapping.set(legacyRole._id.toString(), v2Role._id.toString());
        console.log(`✅ Mapped legacy role "${legacyRole.name}" to V2 role ID: ${v2Role._id}`);
      } else {
        console.log(`⚠️  No V2 role found for legacy role: ${legacyRole.name}`);
        
        // Map legacy role names to valid V2 role names
        const roleNameMapping = {
          'Site Manager': 'Building Manager', // Map Site Manager to Building Manager
          'Property Manager': 'Property Manager',
          'Admin': 'Admin',
          'Contractor': 'Contractor',
          'Tenant': 'Tenants'
        };
        
        const mappedName = roleNameMapping[legacyRole.name] || 'Building Manager'; // Default fallback
        
        // Check if the mapped role already exists (from predefined roles)
        const existingMappedRole = await RoleV2.findOne({ name: mappedName });
        if (existingMappedRole) {
          roleMapping.set(legacyRole._id.toString(), existingMappedRole._id.toString());
          console.log(`✅ Mapped legacy role "${legacyRole.name}" to existing V2 role "${mappedName}" with ID: ${existingMappedRole._id}`);
        } else {
          // Create a new V2 role for unmapped legacy roles
          // Convert legacy permissions to V2 format
          const v2Permissions = [];
          if (legacyRole.permissions && Array.isArray(legacyRole.permissions)) {
            // Legacy permissions have different structure, create basic permissions
            const entities = ['org', 'sites', 'buildings', 'floors', 'tenants', 'documents', 'assets', 'vendors', 'customers', 'users', 'analytics'];
            entities.forEach(entity => {
              v2Permissions.push({
                entity: entity,
                view: true, // Give basic view access
                create: mappedName === 'Admin' || mappedName === 'Property Manager',
                edit: mappedName === 'Admin' || mappedName === 'Property Manager',
                delete: mappedName === 'Admin'
              });
            });
          }
          
          const newV2Role = new RoleV2({
            name: mappedName,
            description: legacyRole.description || `Migrated from legacy: ${legacyRole.name}`,
            is_active: legacyRole.is_active !== false,
            permissions: v2Permissions
          });
          
          await newV2Role.save();
          roleMapping.set(legacyRole._id.toString(), newV2Role._id.toString());
          console.log(`🆕 Created new V2 role for "${legacyRole.name}" with ID: ${newV2Role._id}`);
        }
      }
    }

    // Step 4: Update user role assignments
    console.log('👥 Updating user role assignments...');
    const users = await User.find({ role_ids: { $exists: true, $ne: [] } });
    console.log(`📊 Found ${users.length} users with role assignments`);

    let updatedUsers = 0;
    for (const user of users) {
      const newRoleIds = user.role_ids.map(roleId => {
        const legacyRoleId = roleId.toString();
        return roleMapping.get(legacyRoleId) || roleId; // Keep original if no mapping found
      });

      // Only update if role IDs changed
      if (JSON.stringify(newRoleIds.sort()) !== JSON.stringify(user.role_ids.map(id => id.toString()).sort())) {
        user.role_ids = newRoleIds;
        await user.save();
        updatedUsers++;
        console.log(`✅ Updated user ${user.email} role assignments`);
      }
    }

    console.log(`✅ Updated ${updatedUsers} users with new role assignments`);

    // Step 5: Summary
    console.log('\n📊 Migration Summary:');
    console.log(`- Legacy roles processed: ${legacyRoles.length}`);
    console.log(`- Role mappings created: ${roleMapping.size}`);
    console.log(`- Users updated: ${updatedUsers}`);
    console.log(`- Total users checked: ${users.length}`);

    console.log('\n🎉 Role migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateRolesToV2()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateRolesToV2 };
