#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read both files
const apiReference = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'api-reference.json'),
  'utf8'
));

const postmanCollection = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'docs/postman/API.postman_collection.json'),
  'utf8'
));

// Extract endpoints from API reference
function extractApiReferenceEndpoints() {
  const endpoints = [];

  for (const [module, config] of Object.entries(apiReference.endpoints)) {
    if (config.endpoints && Array.isArray(config.endpoints)) {
      config.endpoints.forEach(endpoint => {
        endpoints.push({
          module,
          method: endpoint.method,
          path: endpoint.path,
          description: endpoint.description,
          status: config.status // for deprecated endpoints
        });
      });
    }
  }

  return endpoints;
}

// Extract endpoints from Postman collection (recursive)
function extractPostmanEndpoints(items = postmanCollection.item, folder = '') {
  const endpoints = [];

  for (const item of items) {
    if (item.item) {
      // It's a folder, recurse
      endpoints.push(...extractPostmanEndpoints(item.item, item.name));
    } else if (item.request) {
      // It's a request
      const method = item.request.method;
      let pathRaw = '';

      if (typeof item.request.url === 'string') {
        pathRaw = item.request.url;
      } else if (item.request.url && item.request.url.raw) {
        pathRaw = item.request.url.raw;
      } else if (item.request.url && item.request.url.path) {
        pathRaw = '/' + item.request.url.path.join('/');
      }

      // Extract path from raw URL (remove base URL and query params)
      const path = pathRaw
        .replace(/{{API_BASE_URL}}/g, '')
        .replace(/\?.*$/, '') // Remove query params
        .replace(/^https?:\/\/[^\/]+/, ''); // Remove full URLs

      if (path) {
        endpoints.push({
          folder,
          method,
          path,
          name: item.name
        });
      }
    }
  }

  return endpoints;
}

// Normalize path for comparison (handle path params)
function normalizePath(path) {
  return path
    .replace(/{{[^}]+}}/g, ':id') // Replace {{variable}} with :id
    .replace(/\/+/g, '/') // Normalize multiple slashes
    .replace(/\/$/, ''); // Remove trailing slash
}

// Compare endpoints
function compareEndpoints() {
  const apiEndpoints = extractApiReferenceEndpoints();
  const postmanEndpoints = extractPostmanEndpoints();

  // Create lookup map for Postman endpoints
  const postmanMap = new Set();
  postmanEndpoints.forEach(ep => {
    const key = `${ep.method} ${normalizePath(ep.path)}`;
    postmanMap.add(key);
  });

  // Find missing endpoints
  const missing = [];
  const deprecated = [];

  apiEndpoints.forEach(ep => {
    const key = `${ep.method} ${normalizePath(ep.path)}`;

    if (!postmanMap.has(key)) {
      if (ep.status === 'deprecated') {
        deprecated.push({ ...ep, key });
      } else {
        missing.push({ ...ep, key });
      }
    }
  });

  return { missing, deprecated, totalApi: apiEndpoints.length, totalPostman: postmanEndpoints.length };
}

// Main execution
const results = compareEndpoints();

console.log('\n=== ENDPOINT COMPARISON REPORT ===\n');
console.log(`Total endpoints in API Reference: ${results.totalApi}`);
console.log(`Total endpoints in Postman Collection: ${results.totalPostman}`);
console.log(`\nMissing endpoints: ${results.missing.length}`);
console.log(`Deprecated endpoints (not in Postman): ${results.deprecated.length}\n`);

if (results.missing.length > 0) {
  console.log('=== MISSING ENDPOINTS ===\n');

  // Group by module
  const byModule = {};
  results.missing.forEach(ep => {
    if (!byModule[ep.module]) {
      byModule[ep.module] = [];
    }
    byModule[ep.module].push(ep);
  });

  // Print grouped by module
  Object.entries(byModule).forEach(([module, endpoints]) => {
    console.log(`\n## ${module.toUpperCase()} (${endpoints.length} missing)`);
    endpoints.forEach(ep => {
      console.log(`   ${ep.method.padEnd(7)} ${ep.path}`);
      if (ep.description) {
        console.log(`           ${ep.description}`);
      }
    });
  });
}

if (results.deprecated.length > 0) {
  console.log('\n\n=== DEPRECATED ENDPOINTS (Not in Postman) ===\n');
  results.deprecated.forEach(ep => {
    console.log(`   ${ep.method.padEnd(7)} ${ep.path}`);
  });
}

console.log('\n');

// Save detailed report to file
const report = {
  summary: {
    total_api_endpoints: results.totalApi,
    total_postman_endpoints: results.totalPostman,
    missing_count: results.missing.length,
    deprecated_count: results.deprecated.length,
    generated_at: new Date().toISOString()
  },
  missing_endpoints: results.missing,
  deprecated_endpoints: results.deprecated
};

fs.writeFileSync(
  path.join(__dirname, 'endpoint-comparison-report.json'),
  JSON.stringify(report, null, 2)
);

console.log('📄 Detailed report saved to: endpoint-comparison-report.json\n');
