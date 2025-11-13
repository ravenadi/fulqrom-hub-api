const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Document = require('../models/Document');
const BuildingTenant = require('../models/BuildingTenant');
const { S3Client, PutObjectTaggingCommand } = require('@aws-sdk/client-s3');

// Configure AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  forcePathStyle: process.env.AWS_USE_PATH_STYLE_ENDPOINT === 'true'
});

/**
 * Tag S3 file for automatic expiry (90 days)
 * @param {string} bucketName - Bucket name
 * @param {string} s3Key - S3 key
 * @returns {Promise<Object>} - Tagging result
 */
async function tagS3FileForExpiry(bucketName, s3Key) {
  try {
    const tagCommand = new PutObjectTaggingCommand({
      Bucket: bucketName,
      Key: s3Key,
      Tagging: {
        TagSet: [
          {
            Key: 'Status',
            Value: 'SoftDeleted'
          },
          {
            Key: 'DeletedAt',
            Value: new Date().toISOString()
          },
          {
            Key: 'ExpiryDays',
            Value: '90'
          }
        ]
      }
    });

    await s3Client.send(tagCommand);

    return {
      success: true,
      bucket: bucketName,
      key: s3Key,
      message: 'File tagged for expiry in 90 days'
    };
  } catch (error) {
    console.error(`Failed to tag S3 file for expiry: ${s3Key}`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Tag S3 files for assets
 * @param {Array} assets - Array of asset documents
 */
async function tagAssetsS3Files(assets) {
  for (const asset of assets) {
    // Check for attachments/documents on the asset
    if (asset.documents && Array.isArray(asset.documents)) {
      for (const doc of asset.documents) {
        if (doc.file_meta) {
          const { bucket_name, file_key, file_path } = doc.file_meta;
          const s3Key = file_key || file_path;
          if (bucket_name && s3Key) {
            try {
              await tagS3FileForExpiry(bucket_name, s3Key);
              console.log(`        Tagged asset S3 file for expiry: ${s3Key}`);
            } catch (error) {
              console.error(`        Failed to tag asset S3 file: ${s3Key}`, error.message);
            }
          }
        }
      }
    }
  }
}

/**
 * Cascade soft-delete for Customer
 * Customer → Sites → Buildings → Floors → Assets, Documents, BuildingTenants
 *
 * @param {ObjectId} customerId - Customer ID to soft-delete
 * @param {ObjectId} tenantId - Tenant ID for scope
 */
async function cascadeCustomerDelete(customerId, tenantId) {
  try {
    const mongoose = require('mongoose');
    console.log(`Cascading soft-delete for Customer ${customerId}`);

    // Convert to ObjectId if it's a string
    const customerObjectId = typeof customerId === 'string'
      ? new mongoose.Types.ObjectId(customerId)
      : customerId;
    const tenantObjectId = typeof tenantId === 'string'
      ? new mongoose.Types.ObjectId(tenantId)
      : tenantId;

    // Get all sites for this customer
    const sites = await Site.find({
      customer_id: customerObjectId,
      tenant_id: tenantObjectId,
      is_delete: false
    });

    console.log(`  Found ${sites.length} sites to soft-delete`);

    // Cascade to each site
    for (const site of sites) {
      await cascadeSiteDelete(site._id, tenantObjectId);
    }

    // Soft-delete all sites
    const siteResult = await Site.updateMany(
      { customer_id: customerObjectId, tenant_id: tenantObjectId },
      { is_delete: true }
    );
    console.log(`  Soft-deleted ${siteResult.modifiedCount} sites`);

    // Soft-delete all documents for this customer and tag S3 files
    // NOTE: Document stores customer_id as STRING, not ObjectId
    const customerIdStr = customerObjectId.toString();

    // Find documents to tag their S3 files before soft-deleting
    const documents = await Document.find({
      'customer.customer_id': customerIdStr,
      tenant_id: tenantObjectId,
      is_delete: false
    });

    // Tag S3 files for expiry
    for (const doc of documents) {
      if (doc.file && doc.file.file_meta) {
        const { bucket_name, file_key, file_path } = doc.file.file_meta;
        const s3Key = file_key || file_path;
        if (bucket_name && s3Key) {
          try {
            await tagS3FileForExpiry(bucket_name, s3Key);
            console.log(`    Tagged document S3 file for expiry: ${s3Key}`);
          } catch (error) {
            console.error(`    Failed to tag document S3 file: ${s3Key}`, error.message);
          }
        }
      }
    }

    // Soft-delete documents
    const docResult = await Document.updateMany(
      { 'customer.customer_id': customerIdStr, tenant_id: tenantObjectId, is_delete: false  },
      { is_delete: true }
    );

    console.log(`  Soft-deleted ${docResult.modifiedCount} documents`);
    console.log(`✓ Cascade completed for Customer ${customerId}`);
  } catch (error) {
    console.error(`❌ Error cascading delete for Customer ${customerId}:`, error);
    throw error;
  }
}

/**
 * Cascade soft-delete for Site
 * Site → Buildings → Floors → Assets, BuildingTenants, Documents
 *
 * @param {ObjectId} siteId - Site ID to soft-delete
 * @param {ObjectId} tenantId - Tenant ID for scope
 */
async function cascadeSiteDelete(siteId, tenantId) {
  try {
    const mongoose = require('mongoose');
    console.log(`  Cascading soft-delete for Site ${siteId}`);

    // Convert to ObjectId if it's a string
    const siteObjectId = typeof siteId === 'string'
      ? new mongoose.Types.ObjectId(siteId)
      : siteId;
    const tenantObjectId = typeof tenantId === 'string'
      ? new mongoose.Types.ObjectId(tenantId)
      : tenantId;

    // Get all buildings for this site
    const buildings = await Building.find({
      site_id: siteObjectId,
      tenant_id: tenantObjectId,
      is_delete: false
    });

    console.log(`    Found ${buildings.length} buildings to soft-delete`);

    // Cascade to each building
    for (const building of buildings) {
      await cascadeBuildingDelete(building._id, tenantObjectId);
    }

    // Soft-delete all buildings
    const buildingResult = await Building.updateMany(
      { site_id: siteObjectId, tenant_id: tenantObjectId },
      { is_delete: true }
    );
    console.log(`    Soft-deleted ${buildingResult.modifiedCount} buildings`);

    // Soft-delete all documents for this site and tag S3 files
    // NOTE: Document stores site_id as STRING in location.site.site_id
    const siteIdStr = siteObjectId.toString();

    // Find documents to tag their S3 files before soft-deleting
    const documents = await Document.find({
      'location.site.site_id': siteIdStr,
      tenant_id: tenantObjectId,
      is_delete: false
    });

    console.log(`    Found ${documents.length} documents to soft-delete`);

    // Tag S3 files for expiry
    for (const doc of documents) {
      if (doc.file && doc.file.file_meta) {
        const { bucket_name, file_key, file_path } = doc.file.file_meta;
        const s3Key = file_key || file_path;
        if (bucket_name && s3Key) {
          try {
            await tagS3FileForExpiry(bucket_name, s3Key);
            console.log(`    Tagged document S3 file for expiry: ${s3Key}`);
          } catch (error) {
            console.error(`    Failed to tag document S3 file: ${s3Key}`, error.message);
          }
        }
      }
    }

    // Soft-delete documents
    const docResult = await Document.updateMany(
      { 'location.site.site_id': siteIdStr, tenant_id: tenantObjectId, is_delete: false },
      { is_delete: true }
    );

    console.log(`    Soft-deleted ${docResult.modifiedCount} documents`);
  } catch (error) {
    console.error(`❌ Error cascading delete for Site ${siteId}:`, error);
    throw error;
  }
}

/**
 * Cascade soft-delete for Building
 * Building → Floors → Assets, BuildingTenants, Documents
 *
 * @param {ObjectId} buildingId - Building ID to soft-delete
 * @param {ObjectId} tenantId - Tenant ID for scope
 */
async function cascadeBuildingDelete(buildingId, tenantId) {
  const mongoose = require('mongoose');
  console.log(`    Cascading soft-delete for Building ${buildingId}`);

  // Convert to ObjectId if it's a string
  const buildingObjectId = typeof buildingId === 'string'
    ? new mongoose.Types.ObjectId(buildingId)
    : buildingId;
  const tenantObjectId = typeof tenantId === 'string'
    ? new mongoose.Types.ObjectId(tenantId)
    : tenantId;

  // Get all floors for this building
  const floors = await Floor.find({
    building_id: buildingObjectId,
    tenant_id: tenantObjectId,
    is_delete: false
  });

  console.log(`      Found ${floors.length} floors to soft-delete`);

  // Cascade to each floor
  for (const floor of floors) {
    await cascadeFloorDelete(floor._id, tenantObjectId);
  }

  // Soft-delete all floors
  await Floor.updateMany(
    { building_id: buildingObjectId, tenant_id: tenantObjectId },
    { is_delete: true }
  );

  // Find and tag S3 files for assets in this building before soft-deleting
  const buildingAssets = await Asset.find({
    building_id: buildingObjectId,
    tenant_id: tenantObjectId,
    is_delete: false
  });

  await tagAssetsS3Files(buildingAssets);

  // Soft-delete all assets in this building (not on a specific floor)
  const assetResult = await Asset.updateMany(
    { building_id: buildingObjectId, tenant_id: tenantObjectId, is_delete: false },
    { is_delete: true }
  );

  console.log(`      Soft-deleted ${assetResult.modifiedCount} assets`);

  // Get all building tenants and soft-delete them
  const buildingTenants = await BuildingTenant.find({
    building_id: buildingObjectId,
    tenant_id: tenantObjectId,
    is_delete: false
  });

  console.log(`      Found ${buildingTenants.length} building tenants to soft-delete`);

  // Cascade to each building tenant
  for (const buildingTenant of buildingTenants) {
    await deleteBuildingTenant(buildingTenant._id, tenantObjectId);
  }

  // Soft-delete all documents for this building and tag S3 files
  // NOTE: Document stores building_id as STRING in location.building.building_id
  const buildingIdStr = buildingObjectId.toString();

  // Find documents to tag their S3 files before soft-deleting
  const documents = await Document.find({
    'location.building.building_id': buildingIdStr,
    tenant_id: tenantObjectId,
    is_delete: false
  });

  console.log(`      Found ${documents.length} documents to soft-delete`);

  // Tag S3 files for expiry
  for (const doc of documents) {
    if (doc.file && doc.file.file_meta) {
      const { bucket_name, file_key, file_path } = doc.file.file_meta;
      const s3Key = file_key || file_path;
      if (bucket_name && s3Key) {
        try {
          await tagS3FileForExpiry(bucket_name, s3Key);
          console.log(`      Tagged document S3 file for expiry: ${s3Key}`);
        } catch (error) {
          console.error(`      Failed to tag document S3 file: ${s3Key}`, error.message);
        }
      }
    }
  }

  // Soft-delete documents
  const docResult = await Document.updateMany(
    { 'location.building.building_id': buildingIdStr, tenant_id: tenantObjectId, is_delete: false },
    { is_delete: true }
  );

  console.log(`      Soft-deleted ${docResult.modifiedCount} documents`);
}

//delete building tenant
async function deleteBuildingTenant(buildingTenantObjectId, tenantId) {
  const mongoose = require('mongoose');
  try {
    // Convert to ObjectId if it's a string
    const tenantObjectId = typeof tenantId === 'string'
      ? new mongoose.Types.ObjectId(tenantId)
      : tenantId;

    // Soft-delete building tenant
    const tenantResult = await BuildingTenant.updateOne(
      { _id: buildingTenantObjectId, tenant_id: tenantObjectId },
      { is_delete: true }
    );

    console.log(`        Soft-deleted building tenant ${buildingTenantObjectId}`);
  } catch (error) {
    console.error(`❌ Error deleting building tenant ${buildingTenantObjectId}:`, error);
    throw error;
  }
}



/**
 * Cascade soft-delete for Floor
 * Floor → Assets, BuildingTenants, Documents
 *
 * @param {ObjectId} floorId - Floor ID to soft-delete
 * @param {ObjectId} tenantId - Tenant ID for scope
 */
async function cascadeFloorDelete(floorId, tenantId) {
  const mongoose = require('mongoose');

  // Convert to ObjectId if it's a string
  const floorObjectId = typeof floorId === 'string'
    ? new mongoose.Types.ObjectId(floorId)
    : floorId;
  const tenantObjectId = typeof tenantId === 'string'
    ? new mongoose.Types.ObjectId(tenantId)
    : tenantId;

  // Find and tag S3 files for assets on this floor before soft-deleting
  const floorAssets = await Asset.find({
    floor_id: floorObjectId,
    tenant_id: tenantObjectId,
    is_delete: false
  });

  await tagAssetsS3Files(floorAssets);

  // Soft-delete all assets on this floor
  const assetResult = await Asset.updateMany(
    { floor_id: floorObjectId, tenant_id: tenantObjectId, is_delete: false },
    { is_delete: true }
  );

  console.log(`        Soft-deleted ${assetResult.modifiedCount} assets on floor`);

  // Soft-delete all building tenants on this floor
  const tenantResult = await BuildingTenant.updateMany(
    { floor_id: floorObjectId, tenant_id: tenantObjectId },
    { is_delete: true }
  );

  console.log(`        Soft-deleted ${tenantResult.modifiedCount} building tenants on floor`);

  // Soft-delete all documents for this floor and tag S3 files
  // NOTE: Document stores floor_id as STRING in location.floor.floor_id
  const floorIdStr = floorObjectId.toString();

  // Find documents to tag their S3 files before soft-deleting
  const documents = await Document.find({
    'location.floor.floor_id': floorIdStr,
    tenant_id: tenantObjectId,
    is_delete: false
  });

  console.log(`        Found ${documents.length} documents to soft-delete`);

  // Tag S3 files for expiry
  for (const doc of documents) {
    if (doc.file && doc.file.file_meta) {
      const { bucket_name, file_key, file_path } = doc.file.file_meta;
      const s3Key = file_key || file_path;
      if (bucket_name && s3Key) {
        try {
          await tagS3FileForExpiry(bucket_name, s3Key);
          console.log(`        Tagged document S3 file for expiry: ${s3Key}`);
        } catch (error) {
          console.error(`        Failed to tag document S3 file: ${s3Key}`, error.message);
        }
      }
    }
  }

  // Soft-delete documents
  const docResult = await Document.updateMany(
    { 'location.floor.floor_id': floorIdStr, tenant_id: tenantObjectId, is_delete: false },
    { is_delete: true }
  );

  console.log(`        Soft-deleted ${docResult.modifiedCount} documents`);
}

module.exports = {
  cascadeCustomerDelete,
  cascadeSiteDelete,
  cascadeBuildingDelete,
  cascadeFloorDelete
};
