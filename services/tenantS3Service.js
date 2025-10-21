const { S3Client, CreateBucketCommand, PutBucketVersioningCommand, PutBucketLifecycleConfigurationCommand, HeadBucketCommand, PutBucketTaggingCommand, GetBucketTaggingCommand } = require('@aws-sdk/client-s3');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

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
 * Tenant-specific S3 Service
 * Manages S3 buckets for each tenant (similar to Laravel version)
 */
class TenantS3Service {
  constructor(tenantId = null) {
    this.tenantId = tenantId;
    this.region = process.env.AWS_DEFAULT_REGION || 'ap-southeast-2';
    this.baseBucketName = process.env.AWS_BUCKET;
    this.bucketPrefix = 'fulq-org';
  }

  /**
   * Generate tenant-specific bucket name
   * Format: fulq-org-{org-slug}-{tenant-id}
   * @param {string} organisationName - Organisation name
   * @param {string} tenantId - Tenant ID
   * @returns {string} - Bucket name
   */
  generateBucketName(organisationName, tenantId) {
    // Generate org slug from organisation name (same logic as Laravel)
    let orgSlug = organisationName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    return `${this.bucketPrefix}-${orgSlug}-${tenantId}`;
  }

  /**
   * Create S3 bucket for tenant if it doesn't exist
   * @param {string} organisationName - Organisation name
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} - Bucket creation result
   */
  async createTenantBucketIfNotExists(organisationName, tenantId) {
    const bucketName = this.generateBucketName(organisationName, tenantId);
    
    try {
      // Check if bucket already exists
      const bucketExists = await this.bucketExists(bucketName);
      if (bucketExists) {
        console.log(`✅ S3 bucket already exists: ${bucketName}`);
        return {
          success: true,
          bucket_name: bucketName,
          status: 'already_exists',
          message: 'Bucket already exists'
        };
      }

      // Create the bucket
      const createResult = await this.createBucket(bucketName);
      
      if (createResult.success) {
        // Enable versioning
        await this.enableBucketVersioning(bucketName);
        
        // Set lifecycle policy
        await this.setBucketLifecyclePolicy(bucketName);
        
        // Tag the bucket
        await this.tagBucket(bucketName, tenantId, organisationName);

        console.log(`✅ S3 bucket created successfully: ${bucketName}`);
        return {
          success: true,
          bucket_name: bucketName,
          org_slug: this.generateOrgSlug(organisationName),
          region: this.region,
          status: 'created',
          message: 'Bucket created successfully with versioning and lifecycle policies'
        };
      }

      return createResult;
    } catch (error) {
      console.error(`❌ Failed to create S3 bucket: ${bucketName}`, error);
      return {
        success: false,
        bucket_name: bucketName,
        error: error.message,
        status: 'creation_failed'
      };
    }
  }

  /**
   * Create a new S3 bucket
   * @param {string} bucketName - Bucket name
   * @returns {Promise<Object>} - Creation result
   */
  async createBucket(bucketName) {
    try {
      const createBucketCommand = new CreateBucketCommand({
        Bucket: bucketName,
        CreateBucketConfiguration: this.region !== 'us-east-1' ? {
          LocationConstraint: this.region
        } : undefined
      });

      await s3Client.send(createBucketCommand);
      
      // Wait for bucket to be ready
      await this.waitForBucketExists(bucketName);

      return {
        success: true,
        bucket_name: bucketName,
        region: this.region
      };
    } catch (error) {
      console.error(`Failed to create bucket ${bucketName}:`, error);
      return {
        success: false,
        bucket_name: bucketName,
        error: error.message
      };
    }
  }

  /**
   * Check if bucket exists
   * @param {string} bucketName - Bucket name
   * @returns {Promise<boolean>} - True if bucket exists
   */
  async bucketExists(bucketName) {
    try {
      const headBucketCommand = new HeadBucketCommand({
        Bucket: bucketName
      });
      await s3Client.send(headBucketCommand);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for bucket to exist (with timeout)
   * @param {string} bucketName - Bucket name
   * @param {number} maxWaitTime - Maximum wait time in seconds
   * @returns {Promise<void>}
   */
  async waitForBucketExists(bucketName, maxWaitTime = 30) {
    const startTime = Date.now();
    const maxWaitMs = maxWaitTime * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      if (await this.bucketExists(bucketName)) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }
    
    throw new Error(`Bucket ${bucketName} did not become available within ${maxWaitTime} seconds`);
  }

  /**
   * Enable bucket versioning
   * @param {string} bucketName - Bucket name
   * @returns {Promise<boolean>} - Success status
   */
  async enableBucketVersioning(bucketName) {
    try {
      const putVersioningCommand = new PutBucketVersioningCommand({
        Bucket: bucketName,
        VersioningConfiguration: {
          Status: 'Enabled'
        }
      });

      await s3Client.send(putVersioningCommand);
      console.log(`✅ Versioning enabled for bucket: ${bucketName}`);
      return true;
    } catch (error) {
      console.error(`Failed to enable versioning for bucket ${bucketName}:`, error);
      return false;
    }
  }

  /**
   * Set S3 bucket lifecycle policy for automatic cleanup
   * @param {string} bucketName - Bucket name
   * @returns {Promise<boolean>} - Success status
   */
  async setBucketLifecyclePolicy(bucketName) {
    try {
      const lifecycleConfig = {
        Rules: [
          {
            ID: 'DeleteSoftDeletedObjects',
            Status: 'Enabled',
            Filter: {
              Tag: {
                Key: 'Status',
                Value: 'SoftDeleted'
              }
            },
            Expiration: {
              Days: 90 // Delete soft-deleted objects after 90 days
            }
          },
          {
            ID: 'DeleteIncompleteMultipartUploads',
            Status: 'Enabled',
            Filter: {},
            AbortIncompleteMultipartUpload: {
              DaysAfterInitiation: 7
            }
          },
          {
            ID: 'TransitionToIA',
            Status: 'Enabled',
            Filter: {},
            Transitions: [
              {
                Days: 30,
                StorageClass: 'STANDARD_IA'
              }
            ]
          },
          {
            ID: 'TransitionToGlacier',
            Status: 'Enabled',
            Filter: {},
            Transitions: [
              {
                Days: 90,
                StorageClass: 'GLACIER'
              }
            ]
          }
        ]
      };

      const putLifecycleCommand = new PutBucketLifecycleConfigurationCommand({
        Bucket: bucketName,
        LifecycleConfiguration: lifecycleConfig
      });

      await s3Client.send(putLifecycleCommand);
      console.log(`✅ Lifecycle policy set for bucket: ${bucketName}`);
      return true;
    } catch (error) {
      console.error(`Failed to set lifecycle policy for bucket ${bucketName}:`, error);
      return false;
    }
  }

  /**
   * Tag bucket with metadata
   * @param {string} bucketName - Bucket name
   * @param {string} tenantId - Tenant ID
   * @param {string} organisationName - Organisation name
   * @returns {Promise<boolean>} - Success status
   */
  async tagBucket(bucketName, tenantId, organisationName) {
    try {
      const putTaggingCommand = new PutBucketTaggingCommand({
        Bucket: bucketName,
        Tagging: {
          TagSet: [
            {
              Key: 'TenantId',
              Value: tenantId.toString()
            },
            {
              Key: 'OrganisationName',
              Value: organisationName
            },
            {
              Key: 'CreatedAt',
              Value: new Date().toISOString()
            },
            {
              Key: 'Environment',
              Value: process.env.NODE_ENV || 'development'
            },
            {
              Key: 'Service',
              Value: 'fulqrom-hub-api'
            }
          ]
        }
      });

      await s3Client.send(putTaggingCommand);
      console.log(`✅ Bucket tagged successfully: ${bucketName}`);
      return true;
    } catch (error) {
      console.error(`Failed to tag bucket ${bucketName}:`, error);
      return false;
    }
  }

  /**
   * Upload file to tenant-specific bucket
   * @param {Object} file - Multer file object
   * @param {string} tenantId - Tenant ID
   * @param {string} organisationName - Organisation name
   * @param {string} customPath - Optional custom path
   * @returns {Promise<Object>} - Upload result
   */
  async uploadFileToTenantBucket(file, tenantId, organisationName, customPath = null) {
    try {
      console.log('[tenantS3Service.js] uploadFileToTenantBucket called');
      console.log('[tenantS3Service.js] Parameters:', {
        tenant_id: tenantId,
        organisation: organisationName
      });

      const bucketName = this.generateBucketName(organisationName, tenantId);
      console.log('[tenantS3Service.js] Generated bucket name:', bucketName);

      // Ensure bucket exists
      console.log('[tenantS3Service.js] Checking/creating tenant bucket...');
      await this.createTenantBucketIfNotExists(organisationName, tenantId);

      // Generate S3 key
      const s3Key = this.generateS3Key(file.originalname, customPath);
      console.log('[tenantS3Service.js] Generated S3 key:', s3Key);

      // Upload command
      const uploadCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentDisposition: `attachment; filename="${file.originalname}"`,
        ServerSideEncryption: 'AES256',
        Metadata: {
          'original-filename': file.originalname,
          'tenant-id': tenantId,
          'upload-date': new Date().toISOString(),
          'file-size': file.size.toString()
        }
      });

      console.log('[tenantS3Service.js] Sending upload command to tenant bucket...');
      const uploadResult = await s3Client.send(uploadCommand);
      console.log('[tenantS3Service.js] Tenant S3 upload successful!', {
        ETag: uploadResult.ETag,
        VersionId: uploadResult.VersionId
      });

      // Generate file URL
      const fileUrl = `https://${bucketName}.s3.${this.region}.amazonaws.com/${s3Key}`;

      return {
        success: true,
        data: {
          file_meta: {
            file_name: file.originalname,
            file_size: file.size,
            file_type: file.mimetype,
            file_extension: path.extname(file.originalname).toLowerCase().replace('.', ''),
            file_url: fileUrl,
            file_path: s3Key,
            file_key: s3Key,
            bucket_name: bucketName,
            version_id: uploadResult.VersionId,
            etag: uploadResult.ETag,
            version: '1.0',
            file_mime_type: file.mimetype
          }
        },
        s3Result: uploadResult
      };
    } catch (error) {
      console.error('Failed to upload file to tenant bucket:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate S3 key for file (same logic as existing s3Upload.js)
   * @param {string} originalname - Original filename
   * @param {string} customPath - Optional custom path
   * @returns {string} - S3 key
   */
  generateS3Key(originalname, customPath = null) {
    const uuid = uuidv4();
    const extension = path.extname(originalname);
    const cleanFilename = path.basename(originalname, extension).replace(/[^a-zA-Z0-9-_]/g, '_');

    if (customPath) {
      return `${customPath}/${uuid}-${cleanFilename}${extension}`;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const timestamp = now.getTime();

    return `documents/${year}/${month}/${day}/${timestamp}-${uuid}-${cleanFilename}${extension}`;
  }

  /**
   * Generate presigned URL for tenant bucket file
   * @param {string} bucketName - Bucket name
   * @param {string} s3Key - S3 key
   * @param {number} expiresIn - URL expiration time in seconds
   * @returns {Promise<Object>} - Presigned URL result
   */
  async generatePresignedUrlForTenantBucket(bucketName, s3Key, expiresIn = 3600) {
    try {
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key
      });

      const url = await getSignedUrl(s3Client, getObjectCommand, { expiresIn });

      return {
        success: true,
        url: url,
        bucket_name: bucketName,
        expires_in: expiresIn
      };
    } catch (error) {
      console.error('Failed to generate presigned URL:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete file from tenant bucket
   * @param {string} bucketName - Bucket name
   * @param {string} s3Key - S3 key
   * @param {string} versionId - Optional version ID
   * @returns {Promise<Object>} - Delete result
   */
  async deleteFileFromTenantBucket(bucketName, s3Key, versionId = null) {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        VersionId: versionId
      });

      await s3Client.send(deleteCommand);

      return {
        success: true,
        message: 'File deleted successfully',
        bucket_name: bucketName,
        version_id: versionId
      };
    } catch (error) {
      console.error('Failed to delete file from tenant bucket:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate org slug from organisation name
   * @param {string} organisationName - Organisation name
   * @returns {string} - Org slug
   */
  generateOrgSlug(organisationName) {
    return organisationName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Get bucket information
   * @param {string} bucketName - Bucket name
   * @returns {Promise<Object>} - Bucket info
   */
  async getBucketInfo(bucketName) {
    try {
      const bucketExists = await this.bucketExists(bucketName);
      if (!bucketExists) {
        return {
          success: false,
          error: 'Bucket does not exist'
        };
      }

      return {
        success: true,
        bucket_name: bucketName,
        region: this.region,
        exists: true,
        url: `https://${bucketName}.s3.${this.region}.amazonaws.com`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = TenantS3Service;
