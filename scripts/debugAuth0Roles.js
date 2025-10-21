/**
 * Debug script to see what roles Auth0 actually returns
 * 
 * Usage: node scripts/debugAuth0Roles.js
 */

const { ManagementClient } = require('auth0');

// Load environment variables
require('dotenv').config();

async function debugAuth0Roles() {
  try {
    console.log('🔍 Debugging Auth0 roles...');

    const management = new ManagementClient({
      domain: process.env.AUTH0_DOMAIN,
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      scope: 'read:users create:users update:users delete:users read:roles create:roles update:roles delete:roles'
    });

    console.log('📋 Fetching all Auth0 roles...');
    const result = await management.roles.list();
    
    console.log('📊 Auth0 API Response:');
    console.log('Result structure:', Object.keys(result));
    console.log('Total roles:', result.total || result.length || 'unknown');
    
    if (result.roles) {
      console.log('\n📋 All Auth0 roles:');
      result.roles.forEach((role, index) => {
        console.log(`${index + 1}. ${role.name} (${role.id})`);
      });
      
      // Look for Admin role specifically
      const adminRole = result.roles.find(role => 
        role.name && role.name.toLowerCase().includes('admin')
      );
      
      if (adminRole) {
        console.log(`\n✅ Found Admin-like role: ${adminRole.name} (${adminRole.id})`);
      } else {
        console.log('\n❌ No Admin-like role found');
      }
    } else {
      console.log('❌ No roles array in response');
      console.log('Full response:', JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugAuth0Roles().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
