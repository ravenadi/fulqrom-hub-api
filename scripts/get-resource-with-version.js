#!/usr/bin/env node

/**
 * Helper script to fetch a resource and extract its version for use in PUT requests
 * 
 * Usage:
 *   node scripts/get-resource-with-version.js <resource-type> <resource-id>
 * 
 * Example:
 *   node scripts/get-resource-with-version.js customers 68d3929ae4c5d9b3e920a9df
 * 
 * This will:
 * 1. Fetch the resource
 * 2. Show the current version (__v)
 * 3. Show the ETag header
 * 4. Generate example curl command with __v included
 */

const http = require('http');
const https = require('https');

const resourceType = process.argv[2];
const resourceId = process.argv[3];
const baseUrl = process.env.API_URL || 'http://localhost:30001';

if (!resourceType || !resourceId) {
  console.error('Usage: node scripts/get-resource-with-version.js <resource-type> <resource-id>');
  console.error('Example: node scripts/get-resource-with-version.js customers 68d3929ae4c5d9b3e920a9df');
  process.exit(1);
}

const url = `${baseUrl}/api/${resourceType}/${resourceId}`;

console.log(`\n📥 Fetching ${resourceType}/${resourceId}...\n`);

const urlObj = new URL(url);
const client = urlObj.protocol === 'https:' ? https : http;

const options = {
  hostname: urlObj.hostname,
  port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
  path: urlObj.pathname + urlObj.search,
  method: 'GET',
  headers: {
    'Accept': 'application/json',
    'Cookie': process.env.COOKIES || '', // Set COOKIES env var if needed
    'x-csrf-token': process.env.CSRF_TOKEN || '' // Set CSRF_TOKEN env var if needed
  }
};

const req = client.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      const etag = res.headers.etag;

      if (!response.success) {
        console.error('❌ Request failed:', response.message);
        console.error('Response:', JSON.stringify(response, null, 2));
        process.exit(1);
      }

      const resource = response.data;
      const version = resource.__v;

      console.log('✅ Resource fetched successfully!\n');
      console.log('📊 Version Information:');
      console.log(`   __v: ${version}`);
      if (etag) {
        console.log(`   ETag: ${etag}`);
      }
      console.log(`   Resource ID: ${resourceId}\n`);

      console.log('💡 To update this resource, include __v in your PUT request body:\n');
      console.log(`curl '${url}' \\`);
      console.log(`  -X 'PUT' \\`);
      console.log(`  -H 'Content-Type: application/json' \\`);
      console.log(`  --data-raw '{`);
      console.log(`    "__v": ${version},`);
      console.log(`    ...your update fields...`);
      console.log(`  }'\n`);

      if (etag) {
        console.log('   OR use If-Match header:\n');
        console.log(`curl '${url}' \\`);
        console.log(`  -X 'PUT' \\`);
        console.log(`  -H 'If-Match: ${etag}' \\`);
        console.log(`  -H 'Content-Type: application/json' \\`);
        console.log(`  --data-raw '{...your update fields...}'\n`);
      }

      console.log('📋 Current resource data (first 200 chars):');
      console.log(JSON.stringify(resource, null, 2).substring(0, 200) + '...\n');

    } catch (error) {
      console.error('❌ Error parsing response:', error.message);
      console.error('Raw response:', data.substring(0, 500));
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
  process.exit(1);
});

req.end();
