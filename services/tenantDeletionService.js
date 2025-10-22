const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Document = require('../models/Document');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Vendor = require('../models/Vendor');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const EmailNotification = require('../models/EmailNotification');
const DocumentComment = require('../models/DocumentComment');
const ApprovalHistory = require('../models/ApprovalHistory');
const TenantS3Service = require('./tenantS3Service');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand, PutBucketTaggingCommand, GetBucketTaggingCommand, PutBucketLifecycleConfigurationCommand } = require('@aws-sdk/client-s3');

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
 * Comprehensive Tenant Deletion Service
 * Handles complete cleanup of tenant data including:
 * - All database records (in correct order to maintain referential integrity)
 * - S3 bucket and all files
 * - Audit logs
 */
class TenantDeletionService {
  constructor() {
    this.deletionLog = [];
    this.errors = [];
  }

  /**
   * Log a deletion step
   * @param {string} step - Step description
   * @param {Object} details - Additional details
   */
  log(step, details = {}) {
    const logEntry = {
      step,
      timestamp: new Date(),
      ...details
    };
    this.deletionLog.push(logEntry);
    console.log(`[TenantDeletion] ${step}`, details);
  }

  /**
   * Log an error
   * @param {string} step - Step where error occurred
   * @param {Error} error - Error object
   */
  logError(step, error) {
    const errorEntry = {
      step,
      error: error.message,
      stack: error.stack,
      timestamp: new Date()
    };
    this.errors.push(errorEntry);
    console.error(`[TenantDeletion Error] ${step}:`, error);
  }

  /**
   * Mark S3 bucket for auto-deletion after 90 days (3 months)
   * Tags bucket as "PendingDeletion" and sets lifecycle policy for auto-cleanup
   * @param {string} tenantId - Tenant ID
   * @param {string} tenantName - Tenant name
   * @returns {Promise<Object>} - Result
   */
  async markS3BucketForDeletion(tenantId, tenantName) {
    let tenantS3Service;
    let bucketName;

    try {
      tenantS3Service = new TenantS3Service(tenantId);
      bucketName = tenantS3Service.generateBucketName(tenantName, tenantId);

      this.log('Checking S3 bucket existence', { bucket_name: bucketName });

      // Check if bucket exists
      const bucketExists = await tenantS3Service.bucketExists(bucketName);
      if (!bucketExists) {
        this.log('S3 bucket does not exist, skipping S3 marking', { bucket_name: bucketName });
        return {
          success: true,
          message: 'No S3 bucket to mark for deletion',
          bucket_name: bucketName
        };
      }

      this.log('S3 bucket exists, marking for deletion', { bucket_name: bucketName });

      // Calculate deletion date (90 days from now)
      const deletionDate = new Date();
      deletionDate.setDate(deletionDate.getDate() + 90);

      // Get existing tags
      let existingTags = [];
      try {
        const getTagsCommand = new GetBucketTaggingCommand({ Bucket: bucketName });
        const tagsResponse = await s3Client.send(getTagsCommand);
        existingTags = tagsResponse.TagSet || [];
      } catch (error) {
        // No tags exist yet, that's fine
        this.log('No existing tags found, will create new tags');
      }

      // Add or update deletion tags
      const updatedTags = existingTags.filter(
        tag => !['Status', 'DeletionScheduled', 'DeletionDate'].includes(tag.Key)
      );
      updatedTags.push(
        { Key: 'Status', Value: 'PendingDeletion' },
        { Key: 'DeletionScheduled', Value: 'true' },
        { Key: 'DeletionDate', Value: deletionDate.toISOString() },
        { Key: 'DeletedAt', Value: new Date().toISOString() }
      );

      // Update bucket tags
      const putTagsCommand = new PutBucketTaggingCommand({
        Bucket: bucketName,
        Tagging: { TagSet: updatedTags }
      });
      await s3Client.send(putTagsCommand);

      this.log('Bucket tagged for deletion', {
        bucket_name: bucketName,
        deletion_date: deletionDate.toISOString()
      });

      // Set lifecycle policy to expire all objects after 90 days
      const lifecycleConfig = {
        Rules: [
          {
            ID: 'DeleteTenantBucketAfter90Days',
            Status: 'Enabled',
            Filter: {},
            Expiration: {
              Days: 90
            },
            NoncurrentVersionExpiration: {
              NoncurrentDays: 90
            },
            AbortIncompleteMultipartUpload: {
              DaysAfterInitiation: 1
            }
          }
        ]
      };

      const putLifecycleCommand = new PutBucketLifecycleConfigurationCommand({
        Bucket: bucketName,
        LifecycleConfiguration: lifecycleConfig
      });

      await s3Client.send(putLifecycleCommand);

      this.log('Lifecycle policy set for auto-deletion', {
        bucket_name: bucketName,
        days_until_deletion: 90
      });

      return {
        success: true,
        message: 'S3 bucket marked for automatic deletion after 90 days',
        bucket_name: bucketName,
        deletion_date: deletionDate.toISOString(),
        days_until_deletion: 90
      };
    } catch (error) {
      this.logError('Failed to mark S3 bucket for deletion', error);
      return {
        success: false,
        error: error.message,
        bucket_name: bucketName || null
      };
    }
  }

  /**
   * Delete all S3 objects and bucket for tenant (immediate deletion)
   * @param {string} tenantId - Tenant ID
   * @param {string} tenantName - Tenant name
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteS3BucketAndFiles(tenantId, tenantName) {
    let tenantS3Service;
    let bucketName;

    try {
      tenantS3Service = new TenantS3Service(tenantId);
      bucketName = tenantS3Service.generateBucketName(tenantName, tenantId);

      this.log('Checking S3 bucket existence', { bucket_name: bucketName });

      // Check if bucket exists
      const bucketExists = await tenantS3Service.bucketExists(bucketName);
      if (!bucketExists) {
        this.log('S3 bucket does not exist, skipping S3 cleanup', { bucket_name: bucketName });
        return {
          success: true,
          message: 'No S3 bucket to delete',
          bucket_name: bucketName,
          files_deleted: 0
        };
      }

      this.log('S3 bucket exists, starting file deletion', { bucket_name: bucketName });

      // List all objects in the bucket (including all versions)
      let allObjects = [];
      let continuationToken = null;
      let totalFiles = 0;

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken
        });

        const listResponse = await s3Client.send(listCommand);

        if (listResponse.Contents && listResponse.Contents.length > 0) {
          allObjects = allObjects.concat(
            listResponse.Contents.map(obj => ({
              Key: obj.Key
            }))
          );
          totalFiles += listResponse.Contents.length;
        }

        continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : null;
      } while (continuationToken);

      this.log('Listed all S3 objects', { total_files: totalFiles });

      // Delete all objects in batches (S3 allows max 1000 objects per request)
      if (allObjects.length > 0) {
        const batchSize = 1000;
        let deletedCount = 0;

        for (let i = 0; i < allObjects.length; i += batchSize) {
          const batch = allObjects.slice(i, i + batchSize);

          const deleteCommand = new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: batch,
              Quiet: false
            }
          });

          const deleteResponse = await s3Client.send(deleteCommand);
          deletedCount += deleteResponse.Deleted ? deleteResponse.Deleted.length : 0;

          this.log(`Deleted batch of S3 objects`, {
            batch_number: Math.floor(i / batchSize) + 1,
            batch_size: batch.length,
            deleted: deleteResponse.Deleted?.length || 0
          });
        }

        this.log('All S3 objects deleted', { total_deleted: deletedCount });
      }

      // Delete the bucket itself
      const deleteBucketCommand = new DeleteBucketCommand({
        Bucket: bucketName
      });

      await s3Client.send(deleteBucketCommand);
      this.log('S3 bucket deleted successfully', { bucket_name: bucketName });

      return {
        success: true,
        message: 'S3 bucket and all files deleted successfully',
        bucket_name: bucketName,
        files_deleted: totalFiles
      };
    } catch (error) {
      this.logError('S3 deletion failed', error);
      return {
        success: false,
        error: error.message,
        bucket_name: bucketName || null
      };
    }
  }

  /**
   * Delete all database records for a tenant in correct order
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} - Deletion counts
   */
  async deleteDatabaseRecords(tenantId) {
    const deletionCounts = {};

    try {
      // Delete in order of dependencies (child records first)

      // 1. Document Comments (depends on Documents)
      this.log('Deleting document comments');
      const documentCommentsCount = await DocumentComment.deleteMany({ tenant_id: tenantId });
      deletionCounts.document_comments = documentCommentsCount.deletedCount || 0;

      // 2. Approval History
      this.log('Deleting approval history');
      const approvalHistoryCount = await ApprovalHistory.deleteMany({ tenant_id: tenantId });
      deletionCounts.approval_history = approvalHistoryCount.deletedCount || 0;

      // 3. Documents
      this.log('Deleting documents');
      const documentsCount = await Document.deleteMany({ tenant_id: tenantId });
      deletionCounts.documents = documentsCount.deletedCount || 0;

      // 4. Assets (depends on Floors/Buildings)
      this.log('Deleting assets');
      const assetsCount = await Asset.deleteMany({ tenant_id: tenantId });
      deletionCounts.assets = assetsCount.deletedCount || 0;

      // 5. Floors (depends on Buildings)
      this.log('Deleting floors');
      const floorsCount = await Floor.deleteMany({ tenant_id: tenantId });
      deletionCounts.floors = floorsCount.deletedCount || 0;

      // 6. Buildings (depends on Sites)
      this.log('Deleting buildings');
      const buildingsCount = await Building.deleteMany({ tenant_id: tenantId });
      deletionCounts.buildings = buildingsCount.deletedCount || 0;

      // 7. Sites (depends on Customers)
      this.log('Deleting sites');
      const sitesCount = await Site.deleteMany({ tenant_id: tenantId });
      deletionCounts.sites = sitesCount.deletedCount || 0;

      // 8. Customers (use withTenant for proper tenant context)
      this.log('Deleting customers');
      const customersCount = await Customer.deleteMany({ tenant_id: tenantId });
      deletionCounts.customers = customersCount.deletedCount || 0;

      // 9. Vendors
      this.log('Deleting vendors');
      const vendorsCount = await Vendor.deleteMany({ tenant_id: tenantId });
      deletionCounts.vendors = vendorsCount.deletedCount || 0;

      // 10. Email Notifications
      this.log('Deleting email notifications');
      const emailNotificationsCount = await EmailNotification.deleteMany({ tenant_id: tenantId });
      deletionCounts.email_notifications = emailNotificationsCount.deletedCount || 0;

      // 11. Notifications
      this.log('Deleting notifications');
      const notificationsCount = await Notification.deleteMany({ tenant_id: tenantId });
      deletionCounts.notifications = notificationsCount.deletedCount || 0;

      // 12. Settings
      this.log('Deleting settings');
      const settingsCount = await Settings.deleteMany({ tenant_id: tenantId });
      deletionCounts.settings = settingsCount.deletedCount || 0;

      // 13. Users (delete last as they may be referenced in logs)
      this.log('Deleting users');
      const usersCount = await User.deleteMany({ tenant_id: tenantId });
      deletionCounts.users = usersCount.deletedCount || 0;

      // 14. Audit Logs (delete last to preserve audit trail until the end)
      this.log('Deleting audit logs');
      const auditLogsCount = await AuditLog.deleteMany({ tenant_id: tenantId });
      deletionCounts.audit_logs = auditLogsCount.deletedCount || 0;

      this.log('All database records deleted', deletionCounts);

      return {
        success: true,
        counts: deletionCounts
      };
    } catch (error) {
      this.logError('Database deletion failed', error);
      return {
        success: false,
        error: error.message,
        counts: deletionCounts
      };
    }
  }

  /**
   * Main deletion method - orchestrates complete tenant deletion
   * @param {string} tenantId - Tenant ID
   * @param {Object} options - Deletion options
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteTenantCompletely(tenantId, options = {}) {
    const {
      deleteS3 = true,
      immediateS3Delete = false, // If true, delete S3 immediately; if false, mark for deletion after 90 days
      deleteDatabase = true,
      forceDelete = false, // If true, delete even if there are active users
      createFinalAuditLog = true,
      adminUserId = null,
      adminEmail = null
    } = options;

    this.deletionLog = [];
    this.errors = [];

    try {
      this.log('Starting comprehensive tenant deletion', { tenant_id: tenantId });

      // 1. Fetch tenant data
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      this.log('Tenant found', {
        tenant_id: tenantId,
        tenant_name: tenant.tenant_name,
        status: tenant.status
      });

      // 2. Check for active users (unless force delete)
      if (!forceDelete) {
        const activeUsersCount = await User.countDocuments({
          tenant_id: tenantId,
          is_active: true
        });

        if (activeUsersCount > 0) {
          throw new Error(`Cannot delete tenant. ${activeUsersCount} active user(s) found. Please deactivate all users first or use forceDelete option.`);
        }
      }

      // 3. Create final audit log before deletion (if requested)
      if (createFinalAuditLog) {
        try {
          await AuditLog.create({
            action: 'delete',
            resource_type: 'tenant',
            resource_id: tenantId,
            tenant_id: tenantId,
            user_id: adminUserId,
            user_email: adminEmail,
            details: {
              tenant_name: tenant.tenant_name,
              status: tenant.status,
              deletion_type: 'complete',
              force_delete: forceDelete,
              timestamp: new Date()
            }
          });
          this.log('Final audit log created');
        } catch (error) {
          this.logError('Failed to create final audit log', error);
          // Continue with deletion even if audit log fails
        }
      }

      // 4. Delete database records
      let databaseResult = null;
      if (deleteDatabase) {
        this.log('Starting database record deletion');
        databaseResult = await this.deleteDatabaseRecords(tenantId);

        if (!databaseResult.success) {
          throw new Error(`Database deletion failed: ${databaseResult.error}`);
        }
      }

      // 5. Handle S3 bucket - either mark for deletion or delete immediately
      let s3Result = null;
      if (deleteS3) {
        if (immediateS3Delete) {
          this.log('Starting immediate S3 bucket deletion');
          s3Result = await this.deleteS3BucketAndFiles(tenantId, tenant.tenant_name);
        } else {
          this.log('Marking S3 bucket for auto-deletion after 90 days');
          s3Result = await this.markS3BucketForDeletion(tenantId, tenant.tenant_name);
        }

        // Don't fail the entire operation if S3 operation fails
        if (!s3Result.success) {
          this.logError('S3 operation failed but continuing', new Error(s3Result.error));
        }
      }

      // 6. Delete the tenant record itself
      this.log('Deleting tenant record');
      await Tenant.findByIdAndDelete(tenantId);

      this.log('Tenant deletion completed successfully');

      return {
        success: true,
        message: immediateS3Delete
          ? 'Tenant and all dependencies deleted successfully'
          : 'Tenant deleted successfully. S3 bucket marked for auto-deletion after 90 days.',
        tenant_id: tenantId,
        tenant_name: tenant.tenant_name,
        database: databaseResult,
        s3: s3Result,
        s3_deletion_type: immediateS3Delete ? 'immediate' : 'scheduled_90_days',
        deletion_log: this.deletionLog,
        errors: this.errors
      };
    } catch (error) {
      this.logError('Tenant deletion failed', error);

      return {
        success: false,
        message: `Tenant deletion failed: ${error.message}`,
        tenant_id: tenantId,
        error: error.message,
        deletion_log: this.deletionLog,
        errors: this.errors
      };
    }
  }

  /**
   * Soft delete tenant (deactivate instead of deleting)
   * @param {string} tenantId - Tenant ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} - Result
   */
  async softDeleteTenant(tenantId, options = {}) {
    const {
      adminUserId = null,
      adminEmail = null
    } = options;

    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Set status to inactive
      tenant.status = 'inactive';
      await tenant.save();

      // Create audit log
      await AuditLog.create({
        action: 'delete',
        resource_type: 'tenant',
        resource_id: tenantId,
        tenant_id: tenantId,
        user_id: adminUserId,
        user_email: adminEmail,
        details: {
          tenant_name: tenant.tenant_name,
          deletion_type: 'soft',
          previous_status: tenant.status
        }
      });

      return {
        success: true,
        message: 'Tenant deactivated successfully (soft delete)',
        tenant_id: tenantId,
        tenant_name: tenant.tenant_name,
        new_status: tenant.status
      };
    } catch (error) {
      return {
        success: false,
        message: `Soft delete failed: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = TenantDeletionService;
