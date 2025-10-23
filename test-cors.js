#!/usr/bin/env node

/**
 * CORS Test Script
 * Tests CORS configuration for the Fulqrom Hub API
 */

const https = require('https');
const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:30001';
const TEST_ENDPOINTS = [
  '/health',
  '/api/notifications/unread-count'
];

const TEST_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://hub.ravenlabs.biz'
];

/**
 * Test CORS preflight request
 */
function testCorsPreflight(url, origin) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'OPTIONS',
      headers: {
        'Origin': origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization, Content-Type'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Test actual GET request
 */
function testCorsRequest(url, origin) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'GET',
      headers: {
        'Origin': origin,
        'Authorization': 'Bearer test-token'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Run CORS tests
 */
async function runCorsTests() {
  console.log('🧪 Testing CORS Configuration for Fulqrom Hub API\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  for (const endpoint of TEST_ENDPOINTS) {
    const fullUrl = `${BASE_URL}${endpoint}`;
    console.log(`\n📍 Testing endpoint: ${endpoint}`);
    console.log('─'.repeat(50));

    for (const origin of TEST_ORIGINS) {
      try {
        console.log(`\n🔍 Testing origin: ${origin}`);
        
        // Test preflight request
        const preflightResult = await testCorsPreflight(fullUrl, origin);
        const corsOrigin = preflightResult.headers['access-control-allow-origin'];
        const corsMethods = preflightResult.headers['access-control-allow-methods'];
        const corsHeaders = preflightResult.headers['access-control-allow-headers'];
        
        console.log(`   Preflight Status: ${preflightResult.statusCode}`);
        console.log(`   CORS Origin: ${corsOrigin || 'Not set'}`);
        console.log(`   CORS Methods: ${corsMethods || 'Not set'}`);
        console.log(`   CORS Headers: ${corsHeaders || 'Not set'}`);
        
        if (corsOrigin === origin || corsOrigin === '*') {
          console.log('   ✅ CORS Origin: ALLOWED');
        } else {
          console.log('   ❌ CORS Origin: BLOCKED');
        }

        // Test actual request (only for health endpoint to avoid auth issues)
        if (endpoint === '/health') {
          const requestResult = await testCorsRequest(fullUrl, origin);
          console.log(`   Request Status: ${requestResult.statusCode}`);
          
          if (requestResult.statusCode === 200) {
            console.log('   ✅ Request: SUCCESS');
          } else {
            console.log('   ❌ Request: FAILED');
          }
        }

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
  }

  console.log('\n🎯 CORS Test Summary');
  console.log('─'.repeat(50));
  console.log('✅ = Allowed by CORS');
  console.log('❌ = Blocked by CORS');
  console.log('\nIf you see ❌ for expected origins, check your CORS configuration.');
}

// Run the tests
runCorsTests().catch(console.error);
