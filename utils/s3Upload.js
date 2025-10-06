const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
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

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB in bytes
const ALLOWED_FILE_TYPES = [
  // PDF
  'application/pdf',
  // CAD/DWG files
  'image/dwg',
  'image/vnd.dwg',
  'application/acad',
  'application/x-autocad',
  'image/x-dwg',
  'application/dwg',
  'application/x-dwg',
  'application/x-autocad',
  'image/vnd.dxf',
  'application/dxf',
  'application/x-dxf',
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'image/webp',
  'image/x-icon',
  'image/tiff',
  // Word documents
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  // Excel spreadsheets
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  // Text/CSV
  'text/plain',
  'text/csv',
  // BIM files
  'application/x-step',
  'application/step',
  'model/iges',
  'application/iges',
  'application/sat',
  'application/x-sat'
];

const ALLOWED_EXTENSIONS = [
  // PDF
  '.pdf',
  // CAD files
  '.dwg', '.dws', '.dwt', '.dxf', '.stl', '.step', '.stp', '.iges', '.igs', '.sat',
  // BIM files
  '.rvt', '.rfa', '.rte', '.rft', '.ifc', '.nwd', '.nwc', '.nwf',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif',
  // Word documents
  '.docx', '.doc', '.docm', '.odt', '.rtf',
  // Excel spreadsheets
  '.xlsx', '.xls', '.xlsm', '.xlsb', '.csv', '.ods',
  // Text files
  '.txt',
  // Backup files
  '.bak', '.backup'
];

/**
 * Validate file before upload
 * @param {Object} file - Multer file object
 * @returns {Object} - Validation result
 */
function validateFile(file) {
  const errors = [];

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`);
  }

  // Check file extension (primary validation)
  const fileExtension = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
    errors.push(`File extension '${fileExtension}' is not allowed`);
  }

  // Check MIME type only if extension is valid and MIME is not octet-stream
  // octet-stream is a generic binary type that browsers use when they can't determine the actual type
  if (fileExtension && ALLOWED_EXTENSIONS.includes(fileExtension)) {
    if (file.mimetype !== 'application/octet-stream' && !ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      errors.push(`File type '${file.mimetype}' is not allowed`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Generate S3 key for file
 * @param {string} customerId - Customer ID
 * @param {string} originalname - Original filename
 * @param {string} customPath - Optional custom path prefix (default: uses year/month structure)
 * @returns {string} - S3 key
 */
function generateS3Key(customerId, originalname, customPath = null) {
  const uuid = uuidv4();
  const extension = path.extname(originalname);
  const cleanFilename = path.basename(originalname, extension).replace(/[^a-zA-Z0-9-_]/g, '_');

  // If custom path is provided, use it; otherwise use date-based structure
  if (customPath) {
    return `${customPath}/${uuid}-${cleanFilename}${extension}`;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const timestamp = now.getTime();

  return `documents/${customerId}/${year}/${month}/${day}/${timestamp}-${uuid}-${cleanFilename}${extension}`;
}

/**
 * Upload file to S3
 * @param {Object} file - Multer file object
 * @param {string} customerId - Customer ID
 * @param {string} customPath - Optional custom path prefix for versioning
 * @returns {Promise<Object>} - Upload result
 */
async function uploadFileToS3(file, customerId, customPath = null) {
  try {
    // Validate file
    const validation = validateFile(file);
    if (!validation.isValid) {
      throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
    }

    // Generate S3 key
    const s3Key = generateS3Key(customerId, file.originalname, customPath);

    // S3 upload command
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentDisposition: `attachment; filename="${file.originalname}"`,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'original-filename': file.originalname,
        'customer-id': customerId,
        'upload-date': new Date().toISOString()
      }
    });

    // Upload to S3
    const uploadResult = await s3Client.send(uploadCommand);

    // Generate file URL
    const fileUrl = `${process.env.AWS_URL}/${s3Key}`;

    // Generate file metadata
    const fileExtension = path.extname(file.originalname).toLowerCase().replace('.', '');

    const fileMetadata = {
      file_meta: {
        file_name: file.originalname,
        file_size: file.size,
        file_type: file.mimetype,
        file_extension: fileExtension,
        file_url: fileUrl,
        file_path: s3Key,
        file_key: s3Key,
        version: '1.0',
        file_mime_type: file.mimetype
      }
    };

    return {
      success: true,
      data: fileMetadata,
      s3Result: uploadResult
    };

  } catch (error) {
    console.error('S3 Upload Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete file from S3
 * @param {string} s3Key - S3 key of file to delete
 * @returns {Promise<Object>} - Delete result
 */
async function deleteFileFromS3(s3Key) {
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: s3Key
    });

    await s3Client.send(deleteCommand);

    return {
      success: true,
      message: 'File deleted successfully'
    };

  } catch (error) {
    console.error('S3 Delete Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate presigned URL for file access
 * @param {string} s3Key - S3 key of file
 * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns {Promise<Object>} - Presigned URL result
 */
async function generatePresignedUrl(s3Key, expiresIn = 3600) {
  try {
    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: s3Key
    });

    const url = await getSignedUrl(s3Client, getObjectCommand, { expiresIn });

    return {
      success: true,
      url: url
    };

  } catch (error) {
    console.error('S3 Presigned URL Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate presigned URL for document preview (inline display)
 * @param {string} s3Key - S3 key of file
 * @param {string} fileName - Original file name
 * @param {string} contentType - File content type
 * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns {Promise<Object>} - Presigned URL result
 */
async function generatePreviewUrl(s3Key, fileName, contentType, expiresIn = 3600) {
  try {
    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: s3Key,
      ResponseContentType: contentType,
      ResponseContentDisposition: 'inline'
    });

    const url = await getSignedUrl(s3Client, getObjectCommand, { expiresIn });

    return {
      success: true,
      url: url
    };

  } catch (error) {
    console.error('S3 Preview URL Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if S3 bucket exists and is accessible
 * @returns {Promise<Object>} - Health check result
 */
async function checkS3Health() {
  try {
    const headBucketCommand = new HeadBucketCommand({
      Bucket: process.env.AWS_BUCKET
    });

    await s3Client.send(headBucketCommand);

    return {
      success: true,
      message: 'S3 bucket is accessible'
    };

  } catch (error) {
    console.error('S3 Health Check Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  uploadFileToS3,
  deleteFileFromS3,
  generatePresignedUrl,
  generatePreviewUrl,
  checkS3Health,
  validateFile,
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES,
  ALLOWED_EXTENSIONS
};