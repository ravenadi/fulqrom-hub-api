/**
 * Test script to find the correct Auth0 SDK v5 method names
 * 
 * Usage: node scripts/findAuth0Methods.js
 */

const { ManagementClient } = require('auth0');

// Load environment variables
require('dotenv').config();

async function findAuth0Methods() {
  try {
    console.log('🔍 Finding Auth0 SDK v5 method names...');

    const management = new ManagementClient({
      domain: process.env.AUTH0_DOMAIN,
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      scope: 'read:users create:users update:users delete:users read:roles create:roles update:roles delete:roles'
    });

    console.log('📋 Management client methods:');
    console.log(Object.getOwnPropertyNames(management).sort());
    
    console.log('\n📋 Users object methods:');
    console.log(Object.getOwnPropertyNames(management.users).sort());
    
    console.log('\n📋 Users prototype methods:');
    console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(management.users)).sort());
    
    // Try to find methods that might be related to roles
    const allMethods = [
      ...Object.getOwnPropertyNames(management),
      ...Object.getOwnPropertyNames(management.users),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(management.users))
    ];
    
    const roleRelatedMethods = allMethods.filter(method => 
      method.toLowerCase().includes('role') || 
      method.toLowerCase().includes('assign') ||
      method.toLowerCase().includes('permission')
    );
    
    console.log('\n🎯 Role-related methods:');
    console.log(roleRelatedMethods);

  } catch (error) {
    console.error('❌ Failed:', error);
  }
}

findAuth0Methods().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
