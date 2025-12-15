// Test script for bulk update API endpoint
// This tests that all fields are being properly handled

const testPayload = {
  document_ids: ["68f76c63273f6a14ca24124f"],
  updates: {
    // Customer
    customer_id: "68f4f0bb3d9225bef0e0096e",

    // Location fields
    site_id: "68d3dc07d910b6e73ca387b9",
    building_id: "68d3e1de1bfdc3d6bd004643",
    floor_id: "68d3e1de1bfdc3d6bd004644",

    // Multiple assets
    asset_ids: [
      "68e243b840665be20920a070",
      "68e243b840665be20920a071",
      "68e243b840665be20920a075",
      "68e243b840665be20920a073"
    ],

    // Other location fields
    tenant_id: "68d3e1de1bfdc3d6bd004645",
    vendor_id: "68d3e1de1bfdc3d6bd004646",

    // Document properties
    tags: ["test-tag-1", "test-tag-2", "bulk-update"],
    status: "Approved",
    category: "shop_drawings",
    type: "Image",
    engineering_discipline: "HVAC"
  }
};

console.log('Testing Bulk Update API Endpoint');
console.log('=================================\n');
console.log('Payload to send:');
console.log(JSON.stringify(testPayload, null, 2));
console.log('\n=================================\n');

// Make the API call
fetch('http://localhost:30001/api/documents/bulk-update', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IkFDQ3M2d2FBbEpPZ0pDeUg4eXVCRSJ9.eyJodHRwczovL2Z1bHFyb20uY29tLmF1L3JvbGVzIjpbIkFkbWluIl0sImlzcyI6Imh0dHBzOi8vZGV2LW1sN3B4dmo2dmczMmo3NDAuYXUuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDY4ZmIxMjE3NmExMzUxYWYyNDUzYmIzYiIsImF1ZCI6WyJodHRwczovL2FwaS5mdWxxcm9tLmNvbS5hdSIsImh0dHBzOi8vZGV2LW1sN3B4dmo2dmczMmo3NDAuYXUuYXV0aDAuY29tL3VzZXJpbmZvIl0sImlhdCI6MTc2MTI4NDY2NiwiZXhwIjoxNzYxMzcxMDY2LCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwiYXpwIjoiODd3NzF6VVdHSml3TFI5R0xOajdLd3hCMzIycW1GWjQiLCJwZXJtaXNzaW9ucyI6W119.I2BwxP1h32UvKEwtyFEGyz8cfqj5ot79dtr2tQUaHM5Oi6xqdBj3guC94bJ1Tp8o6JU4mqjSRfPEBPldPSizwmEFlimfTfIxvZBiPedFJcytXbvfrtvAONTV7qtxJ75AQIN8Q5gq0eTWvi-yf23bzxkV2YOddnzUJF7Ezat7l0mljfoK6gNTXualMTyn1WISh89NxJ8ScpYNKUiaZGygdn-dQT0GeJyycsaZVt-FjMZnuQ7kzvukPfbbdvSCM4THfwGp2sDobUflgi5dCK1DI0HFlyjNfPtmIBH_IdWQlsbb_QTFpPfUvf7U_SmR8UBJ-if0FdH9w4FmVpMUskoWvQ',
    'x-tenant-id': '68f7d0db3c5ae331c086199c'
  },
  body: JSON.stringify(testPayload)
})
  .then(response => response.json())
  .then(data => {
    console.log('API Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n=================================\n');

    if (data.success) {
      console.log('✅ Bulk update successful!');
      console.log(`   Matched: ${data.matched_count} documents`);
      console.log(`   Modified: ${data.modified_count} documents`);

      // Now fetch the document to verify all fields were saved
      console.log('\nFetching updated document to verify...\n');

      return fetch('http://localhost:30001/api/documents/68f76c63273f6a14ca24124f', {
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IkFDQ3M2d2FBbEpPZ0pDeUg4eXVCRSJ9.eyJodHRwczovL2Z1bHFyb20uY29tLmF1L3JvbGVzIjpbIkFkbWluIl0sImlzcyI6Imh0dHBzOi8vZGV2LW1sN3B4dmo2dmczMmo3NDAuYXUuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDY4ZmIxMjE3NmExMzUxYWYyNDUzYmIzYiIsImF1ZCI6WyJodHRwczovL2FwaS5mdWxxcm9tLmNvbS5hdSIsImh0dHBzOi8vZGV2LW1sN3B4dmo2dmczMmo3NDAuYXUuYXV0aDAuY29tL3VzZXJpbmZvIl0sImlhdCI6MTc2MTI4NDY2NiwiZXhwIjoxNzYxMzcxMDY2LCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwiYXpwIjoiODd3NzF6VVdHSml3TFI5R0xOajdLd3hCMzIycW1GWjQiLCJwZXJtaXNzaW9ucyI6W119.I2BwxP1h32UvKEwtyFEGyz8cfqj5ot79dtr2tQUaHM5Oi6xqdBj3guC94bJ1Tp8o6JU4mqjSRfPEBPldPSizwmEFlimfTfIxvZBiPedFJcytXbvfrtvAONTV7qtxJ75AQIN8Q5gq0eTWvi-yf23bzxkV2YOddnzUJF7Ezat7l0mljfoK6gNTXualMTyn1WISh89NxJ8ScpYNKUiaZGygdn-dQT0GeJyycsaZVt-FjMZnuQ7kzvukPfbbdvSCM4THfwGp2sDobUflgi5dCK1DI0HFlyjNfPtmIBH_IdWQlsbb_QTFpPfUvf7U_SmR8UBJ-if0FdH9w4FmVpMUskoWvQ',
          'x-tenant-id': '68f7d0db3c5ae331c086199c'
        }
      });
    } else {
      console.error('❌ Bulk update failed:', data.message);
      process.exit(1);
    }
  })
  .then(response => response.json())
  .then(doc => {
    console.log('Updated Document:');
    console.log(JSON.stringify(doc.data, null, 2));
    console.log('\n=================================\n');

    // Verify all fields
    const document = doc.data;
    const issues = [];

    // Check customer
    if (document.customer?.customer_id !== testPayload.updates.customer_id) {
      issues.push(`❌ Customer ID mismatch: expected ${testPayload.updates.customer_id}, got ${document.customer?.customer_id}`);
    } else {
      console.log('✅ Customer ID updated correctly');
    }

    // Check site
    if (document.location?.site?.site_id !== testPayload.updates.site_id) {
      issues.push(`❌ Site ID mismatch: expected ${testPayload.updates.site_id}, got ${document.location?.site?.site_id}`);
    } else {
      console.log('✅ Site ID updated correctly');
    }

    // Check building
    if (document.location?.building?.building_id !== testPayload.updates.building_id) {
      issues.push(`❌ Building ID mismatch: expected ${testPayload.updates.building_id}, got ${document.location?.building?.building_id}`);
    } else {
      console.log('✅ Building ID updated correctly');
    }

    // Check assets
    const assetIds = document.location?.assets?.map(a => a.asset_id) || [];
    const expectedAssetIds = testPayload.updates.asset_ids;
    if (assetIds.length !== expectedAssetIds.length || !expectedAssetIds.every(id => assetIds.includes(id))) {
      issues.push(`❌ Assets mismatch: expected ${expectedAssetIds.length} assets, got ${assetIds.length}`);
    } else {
      console.log(`✅ Assets updated correctly (${assetIds.length} assets)`);
    }

    // Check tags
    const docTags = document.tags?.tags || [];
    if (docTags.length !== testPayload.updates.tags.length || !testPayload.updates.tags.every(t => docTags.includes(t))) {
      issues.push(`❌ Tags mismatch: expected ${testPayload.updates.tags.length} tags, got ${docTags.length}`);
    } else {
      console.log(`✅ Tags updated correctly (${docTags.length} tags)`);
    }

    // Check status
    if (document.status !== testPayload.updates.status) {
      issues.push(`❌ Status mismatch: expected ${testPayload.updates.status}, got ${document.status}`);
    } else {
      console.log('✅ Status updated correctly');
    }

    // Check category
    if (document.category !== testPayload.updates.category) {
      issues.push(`❌ Category mismatch: expected ${testPayload.updates.category}, got ${document.category}`);
    } else {
      console.log('✅ Category updated correctly');
    }

    // Check type
    if (document.type !== testPayload.updates.type) {
      issues.push(`❌ Type mismatch: expected ${testPayload.updates.type}, got ${document.type}`);
    } else {
      console.log('✅ Type updated correctly');
    }

    // Check engineering discipline
    if (document.engineering_discipline !== testPayload.updates.engineering_discipline) {
      issues.push(`❌ Engineering Discipline mismatch: expected ${testPayload.updates.engineering_discipline}, got ${document.engineering_discipline}`);
    } else {
      console.log('✅ Engineering Discipline updated correctly');
    }

    console.log('\n=================================\n');

    if (issues.length > 0) {
      console.log('❌ TEST FAILED - Issues found:\n');
      issues.forEach(issue => console.log(issue));
      process.exit(1);
    } else {
      console.log('✅ ALL TESTS PASSED - Bulk update is working correctly!');
      process.exit(0);
    }
  })
  .catch(error => {
    console.error('❌ Test failed with error:', error.message);
    process.exit(1);
  });
