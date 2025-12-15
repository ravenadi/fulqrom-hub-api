#!/usr/bin/env node

/**
 * Fix Demo User Tenant Assignment
 * Assigns the demo user to a tenant and creates sample audit logs
 */

const mongoose = require('mongoose');
const User = require('./models/User');
const Tenant = require('./models/Tenant');
const AuditLog = require('./models/AuditLog');

async function fixDemoUserTenant() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom_hub');
    console.log('Connected to MongoDB');

    // Find demo user
    const demoUser = await User.findOne({ email: 'demo@fulqrom.com.au' });
    if (!demoUser) {
      console.log('❌ Demo user not found!');
      return;
    }

    console.log('📋 Demo User Found:', {
      email: demoUser.email,
      full_name: demoUser.full_name,
      tenant_id: demoUser.tenant_id || 'NOT SET'
    });

    // Find or create a default tenant
    let tenant = await Tenant.findOne({});
    if (!tenant) {
      console.log('📋 Creating default tenant...');
      tenant = await Tenant.create({
        tenant_name: 'Demo Tenant',
        display_name: 'Demo Tenant',
        email: 'demo@fulqrom.com.au',
        phone: '+61 2 9000 0000',
        subscription_status: 'active',
        is_active: true,
        plan_id: null,
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log('✅ Default tenant created:', tenant._id);
    } else {
      console.log('📋 Using existing tenant:', tenant._id);
    }

    // Assign demo user to tenant
    if (!demoUser.tenant_id) {
      demoUser.tenant_id = tenant._id;
      await demoUser.save();
      console.log('✅ Demo user assigned to tenant:', tenant._id);
    } else {
      console.log('ℹ️  Demo user already has tenant_id:', demoUser.tenant_id);
    }

    // Create some sample audit logs for the demo user
    console.log('📋 Creating sample audit logs...');
    
    const sampleAuditLogs = [
      {
        user_id: demoUser._id.toString(),
        user_email: demoUser.email,
        user_name: demoUser.full_name,
        action: 'login',
        resource_type: 'user',
        resource_id: demoUser._id.toString(),
        resource_name: demoUser.full_name,
        details: { login_method: 'auth0', tenant_id: tenant._id.toString() },
        status: 'success',
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        tenant_id: tenant._id,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      },
      {
        user_id: demoUser._id.toString(),
        user_email: demoUser.email,
        user_name: demoUser.full_name,
        action: 'create',
        resource_type: 'document',
        resource_id: 'doc_001',
        resource_name: 'Building Safety Certificate',
        details: { buildingName: 'QBE House', documentType: 'compliance' },
        status: 'success',
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        tenant_id: tenant._id,
        created_at: new Date(Date.now() - 4 * 60 * 60 * 1000) // 4 hours ago
      },
      {
        user_id: demoUser._id.toString(),
        user_email: demoUser.email,
        user_name: demoUser.full_name,
        action: 'update',
        resource_type: 'asset',
        resource_id: 'asset_001',
        resource_name: 'HVAC Unit A-01',
        details: { buildingName: '530 Collins', maintenanceType: 'routine' },
        status: 'success',
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        tenant_id: tenant._id,
        created_at: new Date(Date.now() - 6 * 60 * 60 * 1000) // 6 hours ago
      },
      {
        user_id: demoUser._id.toString(),
        user_email: demoUser.email,
        user_name: demoUser.full_name,
        action: 'create',
        resource_type: 'building',
        resource_id: 'building_001',
        resource_name: 'Collins Street Tower',
        details: { address: '123 Collins Street, Melbourne', floors: 25 },
        status: 'success',
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        tenant_id: tenant._id,
        created_at: new Date(Date.now() - 8 * 60 * 60 * 1000) // 8 hours ago
      },
      {
        user_id: demoUser._id.toString(),
        user_email: demoUser.email,
        user_name: demoUser.full_name,
        action: 'update',
        resource_type: 'document',
        resource_id: 'doc_002',
        resource_name: 'Fire Safety Inspection Report',
        details: { buildingName: 'Martin Place Complex', inspectionDate: '2025-01-15' },
        status: 'success',
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        tenant_id: tenant._id,
        created_at: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
      },
      {
        user_id: demoUser._id.toString(),
        user_email: demoUser.email,
        user_name: demoUser.full_name,
        action: 'create',
        resource_type: 'asset',
        resource_id: 'asset_002',
        resource_name: 'Elevator System B-02',
        details: { buildingName: 'Flinders Street Retail', assetType: 'elevator' },
        status: 'success',
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        tenant_id: tenant._id,
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
      }
    ];

    // Check if audit logs already exist for this user
    const existingLogs = await AuditLog.countDocuments({ 
      user_id: demoUser._id.toString(),
      tenant_id: tenant._id 
    });

    if (existingLogs === 0) {
      await AuditLog.insertMany(sampleAuditLogs);
      console.log('✅ Created 6 sample audit logs for demo user');
    } else {
      console.log(`ℹ️  ${existingLogs} audit logs already exist for demo user`);
    }

    // Verify the fix
    const updatedUser = await User.findOne({ email: 'demo@fulqrom.com.au' }).populate('role_ids');
    const auditLogsCount = await AuditLog.countDocuments({ 
      user_id: demoUser._id.toString(),
      tenant_id: tenant._id 
    });

    console.log('\n🎉 Fix Complete!');
    console.log('Updated Demo User:', {
      email: updatedUser.email,
      full_name: updatedUser.full_name,
      tenant_id: updatedUser.tenant_id,
      role: updatedUser.role_ids?.[0]?.name || 'No role'
    });
    console.log(`Audit Logs Count: ${auditLogsCount}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the fix
fixDemoUserTenant();
