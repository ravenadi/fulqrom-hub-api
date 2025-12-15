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
          status: config.status
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
      let cleanPath = pathRaw
        .replace(/{{API_BASE_URL}}/g, '')
        .replace(/\?.*$/, '') // Remove query params
        .replace(/^https?:\/\/[^\/]+/, '') // Remove full URLs
        .replace(/\/+/g, '/'); // Normalize slashes

      if (cleanPath) {
        endpoints.push({
          folder,
          method,
          path: cleanPath,
          name: item.name,
          rawUrl: pathRaw
        });
      }
    }
  }

  return endpoints;
}

// Normalize path for comparison
function normalizePath(path) {
  // Remove /api prefix if present
  let normalized = path.replace(/^\/api\//, '/').replace(/^\/api$/, '/');

  // Replace all common variable patterns with :param
  normalized = normalized
    .replace(/{{[^}]+}}/g, ':param') // {{variable}}
    .replace(/:id\b/g, ':param')     // :id
    .replace(/:user\b/g, ':param')   // :user
    .replace(/:tenant\b/g, ':param') // :tenant
    .replace(/:plan\b/g, ':param')   // :plan
    .replace(/:role\b/g, ':param')   // :role
    .replace(/:customerId\b/g, ':param')   // :customerId
    .replace(/:buildingId\b/g, ':param')   // :buildingId
    .replace(/:sessionId\b/g, ':param')    // :sessionId
    .replace(/:auth0Id\b/g, ':param')      // :auth0Id
    .replace(/:userId\b/g, ':param')       // :userId
    .replace(/:fileId\b/g, ':param')       // :fileId
    .replace(/:methodId\b/g, ':param')     // :methodId
    .replace(/:documentGroupId\b/g, ':param') // :documentGroupId
    .replace(/:versionId\b/g, ':param')    // :versionId
    .replace(/:type\b/g, ':param')         // :type
    .replace(/:customer_id\b/g, ':param')  // :customer_id
    .replace(/:site_id\b/g, ':param')      // :site_id
    .replace(/:building_id\b/g, ':param')  // :building_id
    .replace(/:module\b/g, ':param')       // :module
    .replace(/:field\b/g, ':param')        // :field
    .replace(/\/+/g, '/')                  // Multiple slashes
    .replace(/\/$/, '');                   // Trailing slash

  return normalized;
}

// Create lookup key
function createLookupKey(method, path) {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

// Compare endpoints
function compareEndpoints() {
  const apiEndpoints = extractApiReferenceEndpoints();
  const postmanEndpoints = extractPostmanEndpoints();

  console.log('\n=== DETAILED EXTRACTION ===\n');
  console.log(`API Reference endpoints extracted: ${apiEndpoints.length}`);
  console.log(`Postman endpoints extracted: ${postmanEndpoints.length}\n`);

  // Create lookup map for Postman endpoints with all variations
  const postmanMap = new Map();
  const postmanByKey = new Map();

  postmanEndpoints.forEach(ep => {
    const key = createLookupKey(ep.method, ep.path);
    if (!postmanMap.has(key)) {
      postmanMap.set(key, []);
    }
    postmanMap.get(key).push(ep);
    postmanByKey.set(key, ep);
  });

  // Debug: Show some Postman endpoints
  console.log('Sample Postman endpoints (first 10):');
  Array.from(postmanByKey.entries()).slice(0, 10).forEach(([key, ep]) => {
    console.log(`  ${key}`);
    console.log(`    Original: ${ep.path}`);
    console.log(`    Folder: ${ep.folder}`);
  });

  // Find missing and matched endpoints
  const missing = [];
  const matched = [];
  const deprecated = [];

  apiEndpoints.forEach(ep => {
    const key = createLookupKey(ep.method, ep.path);

    if (postmanByKey.has(key)) {
      matched.push({
        ...ep,
        key,
        postmanFolder: postmanByKey.get(key).folder,
        postmanName: postmanByKey.get(key).name
      });
    } else {
      if (ep.status === 'deprecated') {
        deprecated.push({ ...ep, key });
      } else {
        missing.push({ ...ep, key });
      }
    }
  });

  // Find endpoints in Postman but not in API Reference (extras)
  const apiMap = new Map();
  apiEndpoints.forEach(ep => {
    const key = createLookupKey(ep.method, ep.path);
    apiMap.set(key, ep);
  });

  const extras = [];
  postmanEndpoints.forEach(ep => {
    const key = createLookupKey(ep.method, ep.path);
    if (!apiMap.has(key)) {
      extras.push({ ...ep, key });
    }
  });

  return {
    missing,
    matched,
    deprecated,
    extras,
    totalApi: apiEndpoints.length,
    totalPostman: postmanEndpoints.length
  };
}

// Main execution
const results = compareEndpoints();

console.log('\n\n=== RE-AUDIT REPORT ===\n');
console.log(`Total endpoints in API Reference: ${results.totalApi}`);
console.log(`Total endpoints in Postman Collection: ${results.totalPostman}`);
console.log(`\nMatched endpoints: ${results.matched.length}`);
console.log(`Missing endpoints: ${results.missing.length}`);
console.log(`Deprecated endpoints (correctly not in Postman): ${results.deprecated.length}`);
console.log(`Extra endpoints (in Postman but not in API Reference): ${results.extras.length}\n`);

// Show matched endpoints by module
console.log('\n=== MATCHED ENDPOINTS BY MODULE ===\n');
const matchedByModule = {};
results.matched.forEach(ep => {
  if (!matchedByModule[ep.module]) {
    matchedByModule[ep.module] = [];
  }
  matchedByModule[ep.module].push(ep);
});

Object.entries(matchedByModule).sort((a, b) => a[0].localeCompare(b[0])).forEach(([module, endpoints]) => {
  console.log(`${module.toUpperCase()}: ${endpoints.length} matched`);
  endpoints.forEach(ep => {
    console.log(`  ✓ ${ep.method.padEnd(7)} ${ep.path}`);
    console.log(`    Postman: "${ep.postmanName}" in "${ep.postmanFolder}"`);
  });
  console.log();
});

// Show missing endpoints
if (results.missing.length > 0) {
  console.log('\n=== MISSING ENDPOINTS BY MODULE ===\n');

  // Group by module
  const byModule = {};
  results.missing.forEach(ep => {
    if (!byModule[ep.module]) {
      byModule[ep.module] = [];
    }
    byModule[ep.module].push(ep);
  });

  // Print grouped by module
  Object.entries(byModule).sort((a, b) => b[1].length - a[1].length).forEach(([module, endpoints]) => {
    console.log(`\n## ${module.toUpperCase()} (${endpoints.length} missing)`);
    endpoints.forEach(ep => {
      console.log(`   ✗ ${ep.method.padEnd(7)} ${ep.path}`);
      if (ep.description) {
        console.log(`           ${ep.description}`);
      }
    });
  });
}

// Show extra endpoints
if (results.extras.length > 0) {
  console.log('\n\n=== EXTRA ENDPOINTS (In Postman but not in API Reference) ===\n');
  results.extras.forEach(ep => {
    console.log(`   + ${ep.method.padEnd(7)} ${ep.path}`);
    console.log(`     Name: "${ep.name}" in folder "${ep.folder}"`);
  });
}

// Show deprecated endpoints
if (results.deprecated.length > 0) {
  console.log('\n\n=== DEPRECATED ENDPOINTS (Correctly not in Postman) ===\n');
  results.deprecated.forEach(ep => {
    console.log(`   ~ ${ep.method.padEnd(7)} ${ep.path}`);
  });
}

// Coverage calculation
const coverage = ((results.matched.length / (results.totalApi - results.deprecated.length)) * 100).toFixed(2);
console.log(`\n\n=== COVERAGE ANALYSIS ===`);
console.log(`Coverage: ${results.matched.length} / ${results.totalApi - results.deprecated.length} active endpoints = ${coverage}%`);
console.log(`Missing: ${results.missing.length} endpoints need to be added to Postman`);
console.log(`Extra: ${results.extras.length} endpoints in Postman are not documented in API Reference`);

// Save detailed report
const report = {
  summary: {
    total_api_endpoints: results.totalApi,
    total_postman_endpoints: results.totalPostman,
    matched_count: results.matched.length,
    missing_count: results.missing.length,
    deprecated_count: results.deprecated.length,
    extras_count: results.extras.length,
    coverage_percentage: parseFloat(coverage),
    generated_at: new Date().toISOString()
  },
  matched_endpoints: results.matched,
  missing_endpoints: results.missing,
  deprecated_endpoints: results.deprecated,
  extra_endpoints: results.extras
};

fs.writeFileSync(
  path.join(__dirname, 'endpoint-reaudit-report.json'),
  JSON.stringify(report, null, 2)
);

console.log('\n📄 Detailed re-audit report saved to: endpoint-reaudit-report.json\n');
