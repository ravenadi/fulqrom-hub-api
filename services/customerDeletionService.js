const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const BuildingTenant = require('../models/BuildingTenant');
const Document = require('../models/Document');
const TenantS3Service = require('./tenantS3Service');
const { S3Client, ListObjectsV2Command, DeleteObjectCommand, PutObjectTaggingCommand } = require('@aws-sdk/client-s3');

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
 * Customer Deletion Service
 * Handles comprehensive deletion of customer and all related data
 */
class CustomerDeletionService {
  constructor() {
    this.s3Service = new TenantS3Service();
  }

  /**
   * Delete customer completely with all cascading deletions
   * @param {string} customerId - Customer ID
   * @param {string} tenantId - Tenant ID
   * @param {Object} options - Deletion options
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteCustomerCompletely(customerId, tenantId, options = {}) {
    const {
      deleteS3Files = true,
      setS3Expiry = true,
      deleteDatabase = true,
      adminUserId = null,
      adminEmail = null
    } = options;

    const deletionLog = [];
    const errors = [];
    const counts = {
      sites: 0,
      buildings: 0,
      floors: 0,
      assets: 0,
      building_tenants: 0,
      documents: 0,
      s3_files: 0,
      contacts: 0
    };

    try {
      console.log(`🗑️  Starting customer deletion: ${customerId}`);
      deletionLog.push(`Started customer deletion at ${new Date().toISOString()}`);

      // 1. Verify customer exists and belongs to tenant
      const customer = await Customer.findOne({ _id: customerId, tenant_id: tenantId });
      if (!customer) {
        return {
          success: false,
          message: 'Customer not found or does not belong to this tenant',
          customer_id: customerId
        };
      }

      const customerName = customer.organisation?.organisation_name || 'Unknown';
      console.log(`📋 Customer found: ${customerName}`);
      deletionLog.push(`Customer: ${customerName} (ID: ${customerId})`);

      // 2. Delete Documents and S3 Files
      if (deleteS3Files || setS3Expiry) {
        const s3Result = await this.deleteCustomerDocuments(customerId, tenantId, {
          deleteFiles: deleteS3Files,
          setExpiry: setS3Expiry
        });
        counts.documents = s3Result.documentsDeleted;
        counts.s3_files = s3Result.filesDeleted;
        deletionLog.push(...s3Result.log);
        if (s3Result.errors.length > 0) {
          errors.push(...s3Result.errors);
        }
      }

      // 3. Delete Assets (must be deleted before buildings/floors)
      if (deleteDatabase) {
        const assetsResult = await Asset.deleteMany({ customer_id: customerId, tenant_id: tenantId });
        counts.assets = assetsResult.deletedCount;
        console.log(`✅ Deleted ${counts.assets} assets`);
        deletionLog.push(`Deleted ${counts.assets} assets`);
      }

      // 4. Delete Building Tenants (must be deleted before floors/buildings)
      if (deleteDatabase) {
        const buildingTenantsResult = await BuildingTenant.deleteMany({ customer_id: customerId, tenant_id: tenantId });
        counts.building_tenants = buildingTenantsResult.deletedCount;
        console.log(`✅ Deleted ${counts.building_tenants} building tenants`);
        deletionLog.push(`Deleted ${counts.building_tenants} building tenants`);
      }

      // 5. Delete Floors (must be deleted before buildings)
      if (deleteDatabase) {
        const floorsResult = await Floor.deleteMany({ customer_id: customerId, tenant_id: tenantId });
        counts.floors = floorsResult.deletedCount;
        console.log(`✅ Deleted ${counts.floors} floors`);
        deletionLog.push(`Deleted ${counts.floors} floors`);
      }

      // 6. Delete Buildings (must be deleted before sites)
      if (deleteDatabase) {
        const buildingsResult = await Building.deleteMany({ customer_id: customerId, tenant_id: tenantId });
        counts.buildings = buildingsResult.deletedCount;
        console.log(`✅ Deleted ${counts.buildings} buildings`);
        deletionLog.push(`Deleted ${counts.buildings} buildings`);
      }

      // 7. Delete Sites
      if (deleteDatabase) {
        const sitesResult = await Site.deleteMany({ customer_id: customerId, tenant_id: tenantId });
        counts.sites = sitesResult.deletedCount;
        console.log(`✅ Deleted ${counts.sites} sites`);
        deletionLog.push(`Deleted ${counts.sites} sites`);
      }

      // 8. Count contacts (embedded in customer document)
      counts.contacts = customer.contact_methods?.length || 0;
      deletionLog.push(`Customer had ${counts.contacts} contacts (deleted with customer record)`);

      // 9. Delete Customer Record
      if (deleteDatabase) {
        await Customer.deleteOne({ _id: customerId, tenant_id: tenantId });
        console.log(`✅ Deleted customer record: ${customerName}`);
        deletionLog.push(`Deleted customer record: ${customerName}`);
      }

      deletionLog.push(`Customer deletion completed at ${new Date().toISOString()}`);

      return {
        success: true,
        message: `Customer "${customerName}" and all related data deleted successfully`,
        customer_id: customerId,
        customer_name: customerName,
        deletion_type: 'complete',
        counts,
        deletion_log: deletionLog,
        errors: errors.length > 0 ? errors : null
      };

    } catch (error) {
      console.error('❌ Error during customer deletion:', error);
      deletionLog.push(`ERROR: ${error.message}`);

      return {
        success: false,
        message: 'Error deleting customer: ' + error.message,
        customer_id: customerId,
        counts,
        deletion_log: deletionLog,
        errors: [...errors, error.message]
      };
    }
  }

  /**
   * Delete all customer documents and S3 files
   * @param {string} customerId - Customer ID
   * @param {string} tenantId - Tenant ID
   * @param {Object} options - Deletion options
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteCustomerDocuments(customerId, tenantId, options = {}) {
    const { deleteFiles = true, setExpiry = true } = options;
    const log = [];
    const errors = [];
    let documentsDeleted = 0;
    let filesDeleted = 0;

    try {
      // Find all documents for this customer
      const documents = await Document.find({
        'customer.customer_id': customerId,
        tenant_id: tenantId
      });

      console.log(`📄 Found ${documents.length} documents for customer`);
      log.push(`Found ${documents.length} documents to process`);

      if (documents.length === 0) {
        return {
          documentsDeleted: 0,
          filesDeleted: 0,
          log,
          errors
        };
      }

      // Process each document's S3 files
      for (const doc of documents) {
        try {
          if (doc.file && doc.file.file_meta) {
            const { bucket_name, file_key, file_path } = doc.file.file_meta;
            const s3Key = file_key || file_path;

            if (bucket_name && s3Key) {
              if (setExpiry && !deleteFiles) {
                // Tag file for expiry (90 days)
                const tagResult = await this.tagS3FileForExpiry(bucket_name, s3Key);
                if (tagResult.success) {
                  log.push(`Tagged S3 file for expiry: ${s3Key}`);
                  filesDeleted++;
                } else {
                  errors.push(`Failed to tag S3 file: ${s3Key} - ${tagResult.error}`);
                }
              } else if (deleteFiles) {
                // Delete file immediately
                const deleteResult = await this.s3Service.deleteFileFromTenantBucket(bucket_name, s3Key);
                if (deleteResult.success) {
                  log.push(`Deleted S3 file: ${s3Key}`);
                  filesDeleted++;
                } else {
                  errors.push(`Failed to delete S3 file: ${s3Key} - ${deleteResult.error}`);
                }
              }
            }
          }
        } catch (fileError) {
          errors.push(`Error processing document ${doc._id}: ${fileError.message}`);
        }
      }

      // Delete document records from database
      const deleteResult = await Document.deleteMany({
        'customer.customer_id': customerId,
        tenant_id: tenantId
      });
      documentsDeleted = deleteResult.deletedCount;

      console.log(`✅ Deleted ${documentsDeleted} document records`);
      console.log(`✅ Processed ${filesDeleted} S3 files`);
      log.push(`Deleted ${documentsDeleted} document records from database`);
      log.push(`Processed ${filesDeleted} S3 files`);

      return {
        documentsDeleted,
        filesDeleted,
        log,
        errors
      };

    } catch (error) {
      console.error('❌ Error deleting customer documents:', error);
      errors.push(`Document deletion error: ${error.message}`);
      return {
        documentsDeleted,
        filesDeleted,
        log,
        errors
      };
    }
  }

  /**
   * Tag S3 file for automatic expiry (90 days)
   * @param {string} bucketName - Bucket name
   * @param {string} s3Key - S3 key
   * @returns {Promise<Object>} - Tagging result
   */
  async tagS3FileForExpiry(bucketName, s3Key) {
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
   * Get customer deletion preview (what will be deleted)
   * @param {string} customerId - Customer ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} - Preview data
   */
  async getCustomerDeletionPreview(customerId, tenantId) {
    try {
      const customer = await Customer.findOne({ _id: customerId, tenant_id: tenantId });
      if (!customer) {
        return {
          success: false,
          message: 'Customer not found'
        };
      }

      const [sitesCount, buildingsCount, floorsCount, assetsCount, tenantsCount, documentsCount] = await Promise.all([
        Site.countDocuments({ customer_id: customerId, tenant_id: tenantId }),
        Building.countDocuments({ customer_id: customerId, tenant_id: tenantId }),
        Floor.countDocuments({ customer_id: customerId, tenant_id: tenantId }),
        Asset.countDocuments({ customer_id: customerId, tenant_id: tenantId }),
        BuildingTenant.countDocuments({ customer_id: customerId, tenant_id: tenantId }),
        Document.countDocuments({ 'customer.customer_id': customerId, tenant_id: tenantId })
      ]);

      const contactsCount = customer.contact_methods?.length || 0;

      return {
        success: true,
        customer_id: customerId,
        customer_name: customer.organisation?.organisation_name || 'Unknown',
        counts: {
          sites: sitesCount,
          buildings: buildingsCount,
          floors: floorsCount,
          assets: assetsCount,
          building_tenants: tenantsCount,
          documents: documentsCount,
          contacts: contactsCount
        },
        total_records: sitesCount + buildingsCount + floorsCount + assetsCount + tenantsCount + documentsCount + contactsCount + 1 // +1 for customer record
      };
    } catch (error) {
      console.error('Error getting deletion preview:', error);
      return {
        success: false,
        message: 'Error getting deletion preview: ' + error.message
      };
    }
  }
}

module.exports = CustomerDeletionService;
