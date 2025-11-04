const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Document = require('../models/Document');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const BuildingTenant = require('../models/BuildingTenant');
const Asset = require('../models/Asset');
const Vendor = require('../models/Vendor');
const Plan = require('../models/Plan');
const AuditLog = require('../models/AuditLog');
const tenantRestrictionService = require('../services/tenantRestrictionService');
const TenantS3Service = require('../services/tenantS3Service');
const tenantProvisioningService = require('../services/tenantProvisioningService');

/**
 * Get all tenants with filtering, sorting, and pagination
 * @route GET /api/admin/tenants
 * @access Super Admin only
 */
const getAllTenants = async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 15,
      search,
      active,
      plan_id,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    // Build filter query
    let filter = {};

    // If tenant_id is provided, filter for specific tenant
    // This allows super admin to scope data to a specific tenant when needed
    if (req.query.tenant_id) {
      filter._id = req.query.tenant_id;
    }

    if (search) {
      filter.$or = [
        { 'tenant_name': { $regex: search, $options: 'i' } },
        { 'phone': { $regex: search, $options: 'i' } }
      ];
    }

    if (active !== undefined) {
      filter.status = active === 'true' ? 'active' : 'inactive';
    }

    // For plan_id, we can query the Tenant model directly
    if (plan_id) {
      filter.plan_id = plan_id;
    }

    // Build sort object
    const sort = {};
    sort[sort_by] = sort_order === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(per_page);

    // Super admin can query all tenants without tenant filtering
    const queryOptions = { skipTenantFilter: true };

    const [tenants, total] = await Promise.all([
      Tenant.find(filter)
        .setOptions(queryOptions)
        .populate('plan_id', 'name plan_tier price time_period')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(per_page))
        .lean(),
      Tenant.countDocuments(filter).setOptions(queryOptions)
    ]);

    // Format tenants with additional data

    const formattedTenants = await Promise.all(tenants.map(async (tenant) => {
      const usersCount = await User.countDocuments({ tenant_id: tenant._id }).setOptions(queryOptions);

      // Count customers for this tenant
      const customersCount = await Customer.countDocuments({ tenant_id: tenant._id }).setOptions(queryOptions);

      // Get all customer IDs for this tenant
      const customers = await Customer.find({ tenant_id: tenant._id }).select('_id').setOptions(queryOptions).lean();
      const customerIds = customers.map(c => c._id);

      // Count entities that belong to customers
      const sitesCount = await Site.countDocuments({ customer_id: { $in: customerIds } }).setOptions(queryOptions);
      const buildingsCount = await Building.countDocuments({ customer_id: { $in: customerIds } }).setOptions(queryOptions);
      const floorsCount = await Floor.countDocuments({ customer_id: { $in: customerIds } }).setOptions(queryOptions);
      const buildingTenantsCount = await BuildingTenant.countDocuments({ customer_id: { $in: customerIds } }).setOptions(queryOptions);
      const assetsCount = await Asset.countDocuments({ customer_id: { $in: customerIds } }).setOptions(queryOptions);

      // Count entities that belong directly to tenant
      const documentsCount = await Document.countDocuments({ tenant_id: tenant._id }).setOptions(queryOptions);
      const vendorsCount = await Vendor.countDocuments({ tenant_id: tenant._id }).setOptions(queryOptions);

      // Calculate total storage used (sum of all document file sizes)
      const storageAggregation = await Document.aggregate([
        { $match: { tenant_id: tenant._id } },
        {
          $group: {
            _id: null,
            totalSize: { $sum: { $ifNull: ['$file.file_meta.file_size', 0] } }
          }
        }
      ]).option({ skipTenantFilter: true });
      const totalStorageBytes = storageAggregation.length > 0 ? storageAggregation[0].totalSize : 0;
      const totalStorageMB = (totalStorageBytes / (1024 * 1024)).toFixed(2);

      // Get users list with basic info
      const users = await User.find({ tenant_id: tenant._id })
        .select('full_name email phone is_active created_at')
        .limit(10)
        .setOptions(queryOptions)
        .lean();

      // Get last activity from AuditLog
      const lastActivity = await AuditLog.findOne({
        resource_type: 'tenant',
        resource_id: tenant._id
      })
        .sort({ created_at: -1 })
        .select('action created_at user_email')
        .setOptions(queryOptions)
        .lean();

      return {
        id: tenant._id,
        name: tenant.tenant_name || 'N/A',
        email_domain: 'N/A', // Tenant model doesn't have email_domain
        organisation_id: tenant._id, // Tenant is the top-level entity
        is_active: tenant.status === 'active',
        is_active_label: tenant.status === 'active' ? 'Active' : 'Inactive',
        status: tenant.status,
        plan: tenant.plan_id ? {
          id: tenant.plan_id._id,
          name: tenant.plan_id.name,
          price: tenant.plan_id.price,
          time_period: tenant.plan_id.time_period
        } : null,
        plan_status: tenant.plan_status || {
          is_active: tenant.status === 'active',
          is_trial: tenant.status === 'trial',
          plan_start_date: null,
          plan_end_date: null,
          trial_start_date: null,
          trial_end_date: null,
        },
        users_count: usersCount,
        customers_count: customersCount,
        users: users.map(user => ({
          id: user._id,
          name: user.full_name,
          email: user.email,
          phone: user.phone,
          is_active: user.is_active,
          created_at: user.created_at
        })),
        sites_count: sitesCount,
        buildings_count: buildingsCount,
        documents_count: documentsCount,
        floors_count: floorsCount,
        building_tenants_count: buildingTenantsCount,
        assets_count: assetsCount,
        vendors_count: vendorsCount,
        storage_used_bytes: totalStorageBytes,
        storage_used_mb: totalStorageMB,
        last_activity: lastActivity ? {
          action: lastActivity.action,
          date: lastActivity.created_at,
          user: lastActivity.user_email
        } : null,
        created_at: tenant.created_at,
        updated_at: tenant.updated_at
      };
    }));

    res.status(200).json({
      success: true,
      data: formattedTenants,
      current_page: parseInt(page),
      per_page: parseInt(per_page),
      total: total,
      last_page: Math.ceil(total / parseInt(per_page)),
      from: skip + 1,
      to: skip + formattedTenants.length
    });
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenants: ' + error.message
    });
  }
};

/**
 * Get specific tenant details
 * @route GET /api/admin/tenants/:id
 * @access Super Admin only
 */
const getTenantById = async (req, res) => {
  try {
    const { tenant } = req.params;

    const tenantData = await Tenant.findById(tenant)
      .populate('plan_id', 'name plan_tier price time_period')
      .lean();

    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Get additional statistics and users
    const [usersCount, customersCount, sitesCount, buildingsCount, documentsCount, users] = await Promise.all([
      User.countDocuments({ tenant_id: tenant }),
      Customer.countDocuments({ tenant_id: tenant }),
      Site.countDocuments({ customer_id: tenant }),
      Building.countDocuments({ customer_id: tenant }),
      Document.countDocuments({ tenant_id: tenant }),
      User.find({ tenant_id: tenant }).select('full_name email phone is_active created_at').limit(10).lean()
    ]);

    const formattedTenant = {
      id: tenantData._id,
      name: tenantData.tenant_name || 'N/A',
      email_domain: 'N/A', // Tenant model doesn't have email_domain
      organisation_id: tenantData._id,
      is_active: tenantData.status === 'active',
      is_active_label: tenantData.status === 'active' ? 'Active' : 'Inactive',
      status: tenantData.status,
      plan: tenantData.plan_id ? {
        id: tenantData.plan_id._id,
        name: tenantData.plan_id.name,
        price: tenantData.plan_id.price,
        time_period: tenantData.plan_id.time_period
      } : null,
      plan_status: tenantData.plan_status || {
        is_active: tenantData.status === 'active',
        is_trial: tenantData.status === 'trial',
        plan_start_date: null,
        plan_end_date: null,
        trial_start_date: null,
        trial_end_date: null,
      },
      users_count: usersCount,
      customers_count: customersCount,
      sites_count: sitesCount,
      buildings_count: buildingsCount,
      documents_count: documentsCount,
      created_at: tenantData.created_at,
      updated_at: tenantData.updated_at,
      users: users.map(user => ({
        id: user._id,
        name: user.full_name,
        email: user.email,
        phone: user.phone,
        is_active: user.is_active
      }))
    };

    res.status(200).json({
      success: true,
      data: formattedTenant
    });
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant: ' + error.message
    });
  }
};

/**
 * Create new tenant
 * @route POST /api/admin/tenants
 * @access Super Admin only
 */
const createTenant = async (req, res) => {
  try {
    const {
      name,
      organisation_name,
      email_domain,
      business_number,
      address,
      phone,
      is_active = true,
      status,
      plan_id
    } = req.body;

    // Use status if provided, otherwise use is_active
    const tenantStatus = status !== undefined ? status === 'active' : is_active;

    // Validate required fields (matching current system payload)
    const validationErrors = {};
    
    const tenantName = name || organisation_name;
    if (!tenantName) {
      validationErrors.name = ['The name field is required.'];
    }
    
    // Email domain is optional - not required in current system

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Note: Tenant model doesn't have email_domain field, so we skip this check
    // Email domain validation would need to be handled differently if required

    // Create tenant
    const tenant = new Tenant({
      tenant_name: tenantName,
      phone: phone,
      status: tenantStatus ? 'active' : 'inactive'
    });

    await tenant.save();

    // Create S3 bucket for tenant (like Laravel version)
    let s3BucketInfo = null;
    try {
      console.log(`🚀 Creating S3 bucket for tenant: ${tenant._id}`);
      const tenantS3Service = new TenantS3Service();
      s3BucketInfo = await tenantS3Service.createTenantBucketIfNotExists(
        tenant.tenant_name,
        tenant._id.toString()
      );

      if (s3BucketInfo.success) {
        console.log(`✅ S3 bucket created successfully: ${s3BucketInfo.bucket_name}`);

        // Store S3 bucket info in tenant record
        tenant.s3_bucket_name = s3BucketInfo.bucket_name;
        tenant.s3_bucket_region = process.env.AWS_DEFAULT_REGION || 'ap-southeast-2';
        tenant.s3_bucket_status = s3BucketInfo.status === 'created' ? 'created' : 'pending';
        await tenant.save();

        console.log(`✅ S3 bucket info saved to tenant record`);
      } else {
        console.error(`❌ Failed to create S3 bucket: ${s3BucketInfo.error}`);

        // Mark bucket creation as failed
        tenant.s3_bucket_status = 'failed';
        await tenant.save();
      }
    } catch (s3Error) {
      console.error('S3 bucket creation failed:', s3Error);

      // Mark bucket creation as failed
      tenant.s3_bucket_status = 'failed';
      await tenant.save();

      // Don't fail tenant creation if S3 bucket creation fails
      s3BucketInfo = {
        success: false,
        error: s3Error.message,
        status: 'creation_failed'
      };
    }

    // Update tenant with plan information if plan_id provided
    if (plan_id) {
      tenant.plan_id = plan_id;
      // Note: Tenant model doesn't have plan_start_date or is_trial fields
      // These would need to be added to the Tenant schema if required
      await tenant.save();
    }

    // Setup default dropdown settings for tenant
    try {
      console.log(`🎨 Creating default dropdown settings for tenant: ${tenant._id}`);
      const DROPDOWN_CONSTANTS = require('../constants/dropdownConstants');
      const Settings = require('../models/Settings');

      // Create tenant-specific dropdown settings
      await Settings.create({
        tenant_id: tenant._id,
        setting_key: 'dropdown_values',
        category: 'system',
        setting_type: 'dropdown',
        description: 'Application-wide dropdown values for all modules',
        value: DROPDOWN_CONSTANTS,
        default_value: DROPDOWN_CONSTANTS,
        is_active: true,
        is_editable: true,
        created_by: 'system',
        updated_by: 'system'
      });

      console.log(`✅ Default dropdown settings created successfully for tenant: ${tenant._id}`);
    } catch (dropdownError) {
      console.error('❌ Failed to create default dropdown settings:', dropdownError.message);
      // Don't fail tenant creation if dropdown setup fails
    }

    // Log audit
    // await AuditLog.create({
    //   action: 'create',
    //   resource_type: 'tenant',
    //   resource_id: tenant._id,
    //   tenant_id: tenant._id, // Add tenant_id field
    //   user_id: req.superAdmin?.id,
    //   user_email: req.superAdmin?.email,
    //   details: {
    //     tenant_name: tenantName,
    //     phone: phone
    //   }
    // });

    res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: {
        id: tenant._id,
        name: tenant.tenant_name,
        email_domain: 'N/A', // Tenant model doesn't have email_domain
        organisation_id: tenant._id,
        is_active: tenant.status === 'active',
        is_active_label: tenant.status === 'active' ? 'Active' : 'Inactive',
        status: tenant.status,
        s3_bucket: s3BucketInfo ? {
          bucket_name: s3BucketInfo.bucket_name,
          status: s3BucketInfo.status,
          success: s3BucketInfo.success,
          error: s3BucketInfo.error || null
        } : null,
        created_at: tenant.created_at,
        updated_at: tenant.updated_at
      }
    });
  } catch (error) {
    console.error('Error creating tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating tenant: ' + error.message
    });
  }
};

/**
 * Create new tenant with comprehensive provisioning (like Laravel version)
 * @route POST /api/admin/tenants/provision
 * @access Super Admin only
 */
const provisionTenant = async (req, res) => {
  try {
    const {
      name,
      organisation_name,
      company_name,
      email_domain,
      business_number,
      address,
      phone,
      email,
      password,
      is_active = true,
      plan_id,
      is_trial = true,
      // Provisioning options
      create_user = true,
      create_subscription = true,
      send_welcome_email = true,
      seed_dropdowns = true,
      create_s3_bucket = true,
      send_saas_notification = true,
      initialize_audit_log = true
    } = req.body;

    // Validate required fields
    const validationErrors = {};
    
    if (!name && !organisation_name && !company_name) {
      validationErrors.name = ['The name field is required.'];
    }
    
    if (!email_domain) {
      validationErrors.email_domain = ['The email domain field is required.'];
    }

    if (create_user && (!email || !password)) {
      validationErrors.email = ['Email is required when creating user.'];
      validationErrors.password = ['Password is required when creating user.'];
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Note: Tenant model doesn't have email_domain field
    // Email domain validation would need to be handled differently if required

    // Prepare provisioning data
    const provisioningData = {
      name: name || organisation_name || company_name,
      organisation_name: organisation_name || company_name || name,
      company_name: company_name || organisation_name || name,
      email_domain,
      business_number,
      address,
      phone,
      email,
      password,
      is_active,
      plan_id,
      is_trial
    };

    // Provisioning options
    const provisioningOptions = {
      create_user,
      create_subscription,
      send_welcome_email,
      seed_dropdowns,
      create_s3_bucket,
      send_saas_notification,
      initialize_audit_log,
      use_transaction: true
    };

    console.log('🚀 Starting comprehensive tenant provisioning', {
      tenant_name: provisioningData.name,
      email: provisioningData.email,
      options: provisioningOptions
    });

    // Execute comprehensive provisioning
    const provisioningResult = await tenantProvisioningService.provisionTenant(
      provisioningData,
      provisioningOptions
    );

    // Log audit
    // await AuditLog.create({
    //   action: 'provision_tenant',
    //   resource_type: 'tenant',
    //   resource_id: provisioningResult.tenant._id,
    //   tenant_id: provisioningResult.tenant._id, // Add tenant_id field
    //   user_id: req.superAdmin?.id,
    //   user_email: req.superAdmin?.email,
    //   details: {
    //     tenant_name: provisioningData.name,
    //     email_domain: email_domain,
    //     provisioning_steps_completed: Object.keys(provisioningResult.provisioning_steps).length,
    //     s3_bucket_created: !!(provisioningResult.s3_bucket_info && provisioningResult.s3_bucket_info.success),
    //     user_created: !!provisioningResult.user
    //   }
    // });

    res.status(201).json({
      success: true,
      message: 'Tenant provisioned successfully with comprehensive setup',
      data: {
        id: provisioningResult.tenant._id,
        name: provisioningResult.tenant.organisation.organisation_name,
        email_domain: provisioningResult.tenant.organisation.email_domain,
        organisation_id: provisioningResult.tenant._id,
        is_active: provisioningResult.tenant.is_active,
        is_active_label: provisioningResult.tenant.is_active ? 'Active' : 'Inactive',
        status: provisioningResult.tenant.is_active ? 'active' : 'inactive',
        plan: provisioningResult.plan ? {
          id: provisioningResult.plan._id,
          name: provisioningResult.plan.name,
          price: provisioningResult.plan.price
        } : null,
        role: provisioningResult.role ? {
          id: provisioningResult.role._id,
          name: provisioningResult.role.name,
          operations: provisioningResult.role.operations
        } : null,
        user: provisioningResult.user ? {
          id: provisioningResult.user._id,
          email: provisioningResult.user.email,
          full_name: provisioningResult.user.full_name
        } : null,
        s3_bucket: provisioningResult.s3_bucket_info ? {
          bucket_name: provisioningResult.s3_bucket_info.bucket_name,
          status: provisioningResult.s3_bucket_info.status,
          success: provisioningResult.s3_bucket_info.success,
          error: provisioningResult.s3_bucket_info.error || null
        } : null,
        audit_log_initialized: provisioningResult.audit_log_initialized,
        transaction_id: provisioningResult.transaction_id,
        provisioning_steps: provisioningResult.provisioning_steps,
        created_at: provisioningResult.tenant.created_at,
        updated_at: provisioningResult.tenant.updated_at
      }
    });
  } catch (error) {
    console.error('Error provisioning tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Error provisioning tenant: ' + error.message
    });
  }
};

/**
 * Update tenant
 * @route PUT /api/admin/tenants/:id
 * @access Super Admin only
 */
const updateTenant = async (req, res) => {
  try {
    const { tenant } = req.params;
    const {
      name,
      email_domain,
      business_number,
      address,
      phone,
      is_active,
      status,
      plan_id
    } = req.body;

    // Validate input
    const validationErrors = {};
    
    if (email_domain && !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email_domain)) {
      validationErrors.email_domain = ['The email domain must be a valid domain.'];
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const tenantData = await Tenant.findById(tenant);
    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Note: Tenant model doesn't have email_domain field
    // Email domain validation would need to be handled differently if required

    // Update tenant data
    const updateData = {};
    if (name !== undefined) updateData.tenant_name = name;
    if (phone !== undefined) updateData.phone = phone;

    // Handle status - use status if provided, otherwise use is_active
    if (status !== undefined) {
      updateData.status = status === 'active' ? 'active' : 'inactive';
    } else if (is_active !== undefined) {
      updateData.status = is_active ? 'active' : 'inactive';
    }

    // Handle plan_id
    if (plan_id !== undefined) {
      if (plan_id === '' || plan_id === null) {
        // Remove plan assignment
        updateData.plan_id = null;
      } else {
        // Assign new plan
        updateData.plan_id = plan_id;
      }
    }

    // Handle plan_status if provided
    if (req.body.plan_status !== undefined) {
      updateData.plan_status = {};
      if (req.body.plan_status.is_active !== undefined) {
        updateData.plan_status.is_active = req.body.plan_status.is_active;
      }
      if (req.body.plan_status.is_trial !== undefined) {
        updateData.plan_status.is_trial = req.body.plan_status.is_trial;
      }
      if (req.body.plan_status.plan_start_date !== undefined) {
        updateData.plan_status.plan_start_date = req.body.plan_status.plan_start_date;
      }
      if (req.body.plan_status.plan_end_date !== undefined) {
        updateData.plan_status.plan_end_date = req.body.plan_status.plan_end_date;
      }
      if (req.body.plan_status.trial_start_date !== undefined) {
        updateData.plan_status.trial_start_date = req.body.plan_status.trial_start_date;
      }
      if (req.body.plan_status.trial_end_date !== undefined) {
        updateData.plan_status.trial_end_date = req.body.plan_status.trial_end_date;
      }

      console.log('📋 Received plan_status in request:', req.body.plan_status);
      console.log('✅ Updating tenant with plan_status:', updateData.plan_status);
    }

    const updatedTenant = await Tenant.findByIdAndUpdate(
      tenant,
      updateData,
      { new: true, runValidators: true }
    ).populate('plan_id', 'name price time_period');

    // Log audit
    // await AuditLog.create({
    //   action: 'update',
    //   resource_type: 'tenant',
    //   resource_id: tenant,
    //   tenant_id: tenant, // Add tenant_id field
    //   user_id: req.superAdmin?.id,
    //   user_email: req.superAdmin?.email,
    //   details: updateData
    // });

    res.status(200).json({
      success: true,
      message: 'Tenant updated successfully',
      data: {
        id: updatedTenant._id,
        name: updatedTenant.tenant_name,
        email_domain: 'N/A', // Tenant model doesn't have email_domain
        organisation_id: updatedTenant._id,
        is_active: updatedTenant.status === 'active',
        is_active_label: updatedTenant.status === 'active' ? 'Active' : 'Inactive',
        status: updatedTenant.status,
        plan: updatedTenant.plan_id ? {
          id: updatedTenant.plan_id._id,
          name: updatedTenant.plan_id.name,
          price: updatedTenant.plan_id.price,
          time_period: updatedTenant.plan_id.time_period
        } : null,
        plan_status: updatedTenant.plan_status || {
          is_active: updatedTenant.status === 'active',
          is_trial: updatedTenant.status === 'trial',
          plan_start_date: null,
          plan_end_date: null,
          trial_start_date: null,
          trial_end_date: null,
        },
        created_at: updatedTenant.created_at,
        updated_at: updatedTenant.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating tenant: ' + error.message
    });
  }
};

/**
 * Delete tenant (hard delete - permanently removes tenant and all dependencies)
 * @route DELETE /api/admin/tenants/:id
 * @access Super Admin only
 * @query {boolean} delete_s3 - If true, handle S3 bucket (default: true)
 * @query {boolean} immediate_s3_delete - If true, delete S3 immediately; if false, mark for auto-deletion after 90 days (default: false)
 * @query {boolean} force_delete - If true, delete even with active users (default: false)
 */
const deleteTenant = async (req, res) => {
  try {
    const { tenant } = req.params;
    const {
      delete_s3 = 'true',
      immediate_s3_delete = 'false',
      force_delete = 'false'
    } = req.query;

    // Convert query params to booleans
    const shouldDeleteS3 = delete_s3 === 'true';
    const isImmediateS3Delete = immediate_s3_delete === 'true';
    const isForceDelete = force_delete === 'true';

    const tenantData = await Tenant.findById(tenant);
    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Import deletion service
    const TenantDeletionService = require('../services/tenantDeletionService');
    const deletionService = new TenantDeletionService();

    // Hard delete - permanently remove tenant and all dependencies
    console.log(`🗑️  Starting HARD DELETE for tenant: ${tenant}`);
    console.log(`   S3 Strategy: ${isImmediateS3Delete ? 'IMMEDIATE DELETE' : 'MARK FOR AUTO-DELETION (90 days)'}`);

    const result = await deletionService.deleteTenantCompletely(tenant, {
      deleteS3: shouldDeleteS3,
      immediateS3Delete: isImmediateS3Delete,
      deleteDatabase: true,
      forceDelete: isForceDelete,
      createFinalAuditLog: true,
      adminUserId: req.superAdmin?.id,
      adminEmail: req.superAdmin?.email
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          tenant_id: result.tenant_id,
          tenant_name: result.tenant_name,
          deletion_type: 'hard',
          database_records_deleted: result.database?.counts,
          s3_deletion_type: result.s3_deletion_type,
          s3_bucket_name: result.s3?.bucket_name,
          s3_deletion_date: result.s3?.deletion_date,
          s3_days_until_deletion: result.s3?.days_until_deletion,
          s3_files_deleted: result.s3?.files_deleted || 0,
          deletion_log: result.deletion_log
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
        error: result.error,
        deletion_log: result.deletion_log,
        errors: result.errors
      });
    }
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting tenant: ' + error.message
    });
  }
};

/**
 * Get tenant statistics
 * @route GET /api/admin/tenants/:id/stats
 * @access Super Admin only
 */
const getTenantStats = async (req, res) => {
  try {
    const { tenant } = req.params;

    const tenantData = await Tenant.findById(tenant);
    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const [
      totalUsers, totalCustomers, totalDocuments, totalSites, totalBuildings, totalFloors,
      totalAssets, totalVendors
    ] = await Promise.all([
      User.countDocuments({ tenant_id: tenant }),
      Customer.countDocuments({ tenant_id: tenant }),
      Document.countDocuments({ tenant_id: tenant }),
      Site.countDocuments({ tenant_id: tenant }),
      Building.countDocuments({ tenant_id: tenant }),
      Floor.countDocuments({ tenant_id: tenant }),
      Asset.countDocuments({ tenant_id: tenant }),
      Vendor.countDocuments({ tenant_id: tenant })
    ]);

    res.status(200).json({
      success: true,
      data: {
        tenant_id: tenant,
        tenant_name: tenantData.tenant_name,
        total_users: totalUsers,
        total_customers: totalCustomers,
        total_documents: totalDocuments,
        total_sites: totalSites,
        total_buildings: totalBuildings,
        total_floors: totalFloors,
        total_assets: totalAssets,
        total_vendors: totalVendors,
        subscription: null, // Tenant model doesn't have subscription details
        generated_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching tenant stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant stats: ' + error.message
    });
  }
};

/**
 * Update tenant restrictions
 * @route PUT /api/admin/tenants/:id/restrictions
 * @access Super Admin only
 */
const updateTenantRestrictions = async (req, res) => {
  try {
    const { tenant } = req.params;
    const {
      max_users,
      max_documents,
      max_storage_gb
    } = req.body;

    const tenantData = await Tenant.findById(tenant);
    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Update or create restrictions
    const restrictions = await TenantRestrictions.findOneAndUpdate(
      { tenant_id: tenant },
      {
        tenant_id: tenant,
        max_users: max_users,
        max_documents: max_documents,
        max_storage_gb: max_storage_gb
      },
      { upsert: true, new: true }
    );

    // Log audit
    // await AuditLog.create({
    //   action: 'update_restrictions',
    //   resource_type: 'tenant',
    //   resource_id: tenant,
    //   tenant_id: tenant, // Add tenant_id field
    //   user_id: req.superAdmin?.id,
    //   user_email: req.superAdmin?.email,
    //   details: {
    //     max_users: max_users,
    //     max_documents: max_documents,
    //     max_storage_gb: max_storage_gb
    //   }
    // });

    res.status(200).json({
      success: true,
      message: 'Tenant restrictions updated successfully',
      data: restrictions
    });
  } catch (error) {
    console.error('Error updating tenant restrictions:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating tenant restrictions: ' + error.message
    });
  }
};

/**
 * Update tenant status
 * @route PATCH /api/admin/tenants/:id/status
 * @access Super Admin only
 */
const updateStatus = async (req, res) => {
  try {
    const { tenant } = req.params;
    const { is_active } = req.body;

    // Validate required fields
    if (typeof is_active !== 'boolean') {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: {
          is_active: ['is_active must be a boolean value']
        }
      });
    }

    const tenantData = await Tenant.findById(tenant);
    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    tenantData.status = is_active ? 'active' : 'inactive';
    tenantData.updated_at = new Date();
    await tenantData.save();

    res.status(200).json({
      success: true,
      message: 'Tenant status updated successfully',
      data: {
        id: tenantData._id,
        is_active: tenantData.status === 'active',
        updated_at: tenantData.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating tenant status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating tenant status: ' + error.message
    });
  }
};

/**
 * Get tenant location data
 * @route GET /api/admin/tenants/:id/location
 * @access Super Admin only
 */
const getLocationData = async (req, res) => {
  try {
    const { tenant } = req.params;

    const tenantData = await Tenant.findById(tenant).lean();

    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: tenantData._id,
        name: tenantData.tenant_name || 'N/A',
        address: {}, // Tenant model doesn't have address field
        location: {
          country: 'N/A',
          state: 'N/A',
          city: 'N/A',
          postal_code: 'N/A'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching tenant location:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant location: ' + error.message
    });
  }
};

/**
 * Get all subscriptions (like Laravel DR)
 * @route GET /api/admin/subscriptions
 * @access Super Admin only
 */
const getSubscriptions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 15;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const planId = req.query.plan_id || '';

    const query = {};
    
    // Add search filter
    if (search) {
      query.$or = [
        { 'tenant_name': { $regex: search, $options: 'i' } },
        { 'phone': { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter
    if (status) {
      query.status = status === 'active' ? 'active' : 'inactive';
    }

    // Add plan filter
    if (planId) {
      query.plan_id = planId;
    }

    const skip = (page - 1) * perPage;
    
    const [tenants, total] = await Promise.all([
      Tenant.find(query)
        .populate('plan_id', 'name plan_tier price time_period')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(perPage),
      Tenant.countDocuments(query)
    ]);

    const subscriptions = tenants.map(tenant => ({
      id: tenant._id,
      tenant_id: tenant._id,
      organisation_name: tenant.tenant_name || 'Unknown',
      email_domain: 'N/A', // Tenant model doesn't have email_domain
      plan_name: tenant.plan_id?.name || 'No Plan',
      plan_tier: tenant.plan_id?.plan_tier || '',
      plan_price: tenant.plan_id?.price || 0,
      plan_period: tenant.plan_id?.time_period || 'monthly',
      is_active: tenant.status === 'active',
      is_trial: tenant.status === 'trial',
      plan_start_date: null, // Tenant model doesn't have these fields
      plan_end_date: null,
      trial_start_date: null,
      trial_end_date: null,
      created_at: tenant.created_at,
      updated_at: tenant.updated_at
    }));

    const lastPage = Math.ceil(total / perPage);

    res.json({
      data: subscriptions,
      current_page: page,
      per_page: perPage,
      total: total,
      last_page: lastPage,
      from: skip + 1,
      to: Math.min(skip + perPage, total)
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subscriptions: ' + error.message
    });
  }
};

/**
 * Subscribe tenant to plan (like Laravel DR)
 * @route POST /api/admin/tenants/:tenant/subscribe
 * @access Super Admin only
 */
const subscribe = async (req, res) => {
  try {
    const { tenant } = req.params;
    const { plan_id, plan_start_date, plan_end_date, is_trial, trial_start_date, trial_end_date } = req.body;

    // Validate required fields
    if (!plan_id) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required',
        errors: {
          plan_id: ['Plan ID is required']
        }
      });
    }

    // Check if tenant exists
    const tenantDoc = await Tenant.findById(tenant);
    if (!tenantDoc) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Check if plan exists
    const plan = await Plan.findById(plan_id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Update tenant with subscription details
    const updateData = {
      plan_id: plan_id
      // Note: Tenant model doesn't have plan_start_date, plan_end_date, is_trial, etc.
      // These fields would need to be added to the Tenant schema if required
    };

    const updatedTenant = await Tenant.findByIdAndUpdate(
      tenant,
      updateData,
      { new: true, runValidators: true }
    ).populate('plan_id');

    // Log the action
    // await AuditLog.create({
    //   user_id: req.superAdmin?.id || 'development-user',
    //   action: 'subscribe_tenant',
    //   resource_type: 'Customer',
    //   resource_id: tenant,
    //   tenant_id: tenant, // Add tenant_id field
    //   details: {
    //     plan_id: plan_id,
    //     plan_name: plan.name,
    //     is_trial: updateData.is_trial
    //   },
    //   ip_address: req.ip,
    //   user_agent: req.get('User-Agent')
    // });

    res.status(201).json({
      success: true,
      message: 'Tenant subscribed successfully',
      data: {
        id: updatedTenant._id,
        tenant_id: updatedTenant._id,
        organisation_name: updatedTenant.tenant_name,
        plan_name: updatedTenant.plan_id?.name,
        plan_tier: updatedTenant.plan_id?.plan_tier,
        is_active: updatedTenant.status === 'active',
        is_trial: updatedTenant.status === 'trial',
        plan_start_date: null, // Tenant model doesn't have these fields
        plan_end_date: null,
        trial_start_date: null,
        trial_end_date: null
      }
    });
  } catch (error) {
    console.error('Error subscribing tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Error subscribing tenant: ' + error.message
    });
  }
};

/**
 * Update subscription status (like Laravel DR)
 * @route PATCH /api/admin/subscription/:id/status
 * @access Super Admin only
 */
const updateSubscriptionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['active', 'inactive', 'suspended', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
        errors: {
          status: ['Status must be one of: ' + validStatuses.join(', ')]
        }
      });
    }

    // Find tenant by subscription ID (in this case, tenant ID)
    const tenant = await Tenant.findById(id).populate('plan_id');
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Update tenant status based on subscription status
    let updateData = {};
    switch (status) {
      case 'active':
        updateData.status = 'active';
        break;
      case 'inactive':
      case 'suspended':
      case 'cancelled':
        updateData.status = 'inactive';
        break;
    }

    const updatedTenant = await Tenant.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('plan_id');

    // Log the action
    // await AuditLog.create({
    //   user_id: req.superAdmin?.id || 'development-user',
    //   action: 'update_subscription_status',
    //   resource_type: 'Customer',
    //   resource_id: id,
    //   tenant_id: id, // Add tenant_id field
    //   details: {
    //     old_status: tenant.status,
    //     new_status: status,
    //     plan_name: tenant.plan_id?.name
    //   },
    //   ip_address: req.ip,
    //   user_agent: req.get('User-Agent')
    // });

    res.json({
      success: true,
      message: 'Subscription status updated successfully',
      data: {
        id: updatedTenant._id,
        tenant_id: updatedTenant._id,
        organisation_name: updatedTenant.tenant_name,
        plan_name: updatedTenant.plan_id?.name,
        status: status,
        is_active: updatedTenant.status === 'active',
        updated_at: updatedTenant.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating subscription status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating subscription status: ' + error.message
    });
  }
};

/**
 * Get all users for a specific tenant
 * @route GET /api/admin/tenants/:tenant/users
 * @access Super Admin only
 */
const getTenantUsers = async (req, res) => {
  try {
    const { tenant } = req.params;
    const {
      page = 1,
      limit = 15,
      search,
      is_active,
      role_id
    } = req.query;

    // Validate tenant ID
    if (!tenant.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant ID format'
      });
    }

    // Check if tenant exists
    const tenantExists = await Tenant.findById(tenant);
    if (!tenantExists) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Build filter query for users
    let filterQuery = { tenant_id: tenant };

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    if (role_id) {
      filterQuery.role_ids = role_id;
    }

    // Search by name or email
    if (search) {
      filterQuery.$or = [
        { full_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Fetch users with roles populated
    const [users, totalUsers] = await Promise.all([
      User.find(filterQuery)
        .populate('role_ids', 'name description permissions')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filterQuery)
    ]);

    // Format users for response
    const formattedUsers = users.map(user => ({
      id: user._id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      is_active: user.is_active,
      roles: user.role_ids || [],
      created_at: user.created_at,
      updated_at: user.updated_at,
      auth0_id: user.auth0_id
    }));

    res.status(200).json({
      success: true,
      count: formattedUsers.length,
      total: totalUsers,
      page: pageNum,
      pages: Math.ceil(totalUsers / limitNum),
      data: formattedUsers
    });

  } catch (error) {
    console.error('Error fetching tenant users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant users',
      error: error.message
    });
  }
};

/**
 * Create a new user for a specific tenant
 * @route POST /api/admin/tenants/:tenant/users
 * @access Super Admin only
 */
const createTenantUser = async (req, res) => {
  try {
    const { tenant } = req.params;
    const { name, email, phone, roleIds, password, is_active, send_invite_email } = req.body;

    // Validate tenant ID
    if (!tenant.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant ID format'
      });
    }

    // Check if tenant exists
    const tenantExists = await Tenant.findById(tenant);
    if (!tenantExists) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Validate required fields
    const validationErrors = {};
    if (!name || !name.trim()) {
      validationErrors.name = ['Name is required'];
    }
    if (!email || !email.trim()) {
      validationErrors.email = ['Email is required'];
    }
    if (!password || password.length < 6) {
      validationErrors.password = ['Password must be at least 6 characters'];
    }
    if (!roleIds || roleIds.length === 0) {
      validationErrors.roleIds = ['At least one role is required'];
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists',
        errors: {
          email: ['A user with this email already exists']
        }
      });
    }

    // Create user in MongoDB first
    let newUser;

    try {
      newUser = new User({
        full_name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || '',
        tenant_id: tenant,
        role_ids: roleIds,
        is_active: is_active !== undefined ? is_active : true
      });

      await newUser.save();

      // Populate roles for response
      await newUser.populate('role_ids', 'name description permissions');

      // Create user in Auth0 - REQUIRED for success
      console.log(`🔐 Creating Auth0 user for: ${email.trim()}`);
      const auth0Service = require('../services/auth0Service');

      const auth0User = await auth0Service.ensureAuth0User({
        _id: newUser._id,
        email: email.trim(),
        full_name: name.trim(),
        phone: phone?.trim() || '',
        password: password, // Use the password from admin form
        is_active: is_active !== undefined ? is_active : true,
        role_ids: roleIds
      });

      // Verify Auth0 user was created
      if (!auth0User || !auth0User.user_id) {
        throw new Error('Failed to create user in Auth0 - no user ID returned');
      }

      // Store Auth0 user ID in MongoDB
      newUser.auth0_id = auth0User.user_id;
      await newUser.save();

      console.log(`✅ Auth0 user created successfully: ${auth0User.user_id}`);

      // Send welcome email if requested
      let inviteSent = false;
      let inviteError = null;

      if (send_invite_email) {
        try {
          console.log(`📧 Sending welcome email to ${email.trim()}...`);
          const emailService = require('../utils/emailService');

          await emailService.sendUserInvite({
            to: email.trim(),
            userName: name.trim(),
            userEmail: email.trim(),
            password: password
          });

          inviteSent = true;
          console.log(`✅ Welcome email sent successfully to ${email.trim()}`);
        } catch (emailError) {
          console.error('⚠️  Failed to send welcome email:', emailError);
          inviteError = emailError.message;
          // Don't fail the user creation if email fails
        }
      }

      // Log audit
      // await AuditLog.create({
      //   action: 'create',
      //   resource_type: 'user',
      //   resource_id: newUser._id,
      //   tenant_id: tenant,
      //   user_id: req.superAdmin?.id,
      //   user_email: req.superAdmin?.email,
      //   details: {
      //     user_email: email.trim(),
      //     user_name: name.trim(),
      //     roles: roleIds,
      //     auth0_created: true,
      //     auth0_id: auth0User.user_id,
      //     invite_sent: inviteSent
      //   }
      // });

      res.status(201).json({
        success: true,
        message: 'User created successfully with Auth0',
        data: {
          id: newUser._id,
          full_name: newUser.full_name,
          email: newUser.email,
          phone: newUser.phone,
          is_active: newUser.is_active,
          roles: newUser.role_ids || [],
          created_at: newUser.created_at,
          updated_at: newUser.updated_at,
          auth0_id: newUser.auth0_id
        },
        invite_sent: inviteSent,
        invite_error: inviteError
      });

    } catch (error) {
      console.error('❌ Error creating tenant user:', error);

      // If user was created in MongoDB but Auth0 failed, delete the MongoDB user
      if (newUser && newUser._id) {
        try {
          await User.findByIdAndDelete(newUser._id);
          console.log('⚠️  Rolled back MongoDB user creation after error');
        } catch (deleteError) {
          console.error('Failed to rollback user creation:', deleteError);
        }
      }

      res.status(500).json({
        success: false,
        message: 'Error creating user',
        error: error.message
      });
    }
  } catch (error) {
    console.error('❌ Outer error creating tenant user:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
};

/**
 * Update a user for a specific tenant
 * @route PUT /api/admin/tenants/:tenant/users/:userId
 * @access Super Admin only
 */
const updateTenantUser = async (req, res) => {
  try {
    const { tenant, userId } = req.params;
    const { name, phone, roleIds, password, is_active } = req.body;
    
    // Debug: Log incoming request data
    console.log('[Tenant User Update] Request body:', {
      name,
      phone,
      roleIds,
      password: password ? '***' : 'NOT PROVIDED',
      is_active,
      passwordLength: password ? password.length : 0
    });

    // Validate tenant ID
    if (!tenant.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant ID format'
      });
    }

    // Check if tenant exists
    const tenantExists = await Tenant.findById(tenant);
    if (!tenantExists) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Find user
    const user = await User.findOne({ _id: userId, tenant_id: tenant });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found in this tenant'
      });
    }

    // Validate required fields
    const validationErrors = {};
    if (name !== undefined && (!name || !name.trim())) {
      validationErrors.name = ['Name is required'];
    }
    if (password !== undefined && password && password.length < 8) {
      validationErrors.password = ['Password must be at least 8 characters'];
    }
    if (roleIds !== undefined && (!roleIds || roleIds.length === 0)) {
      validationErrors.roleIds = ['At least one role is required'];
    }

    if (Object.keys(validationErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Update fields (password only stored in Auth0, not MongoDB)
    if (name) user.full_name = name.trim();
    if (phone !== undefined) user.phone = phone?.trim() || '';
    if (roleIds) user.role_ids = roleIds;
    if (is_active !== undefined) user.is_active = is_active;

    user.updated_at = new Date();
    await user.save();

    // Populate roles for response
    await user.populate('role_ids', 'name description permissions');

    // Update password in Auth0 if provided (use dedicated function)
    let passwordUpdated = false;
    if (password !== undefined && password && password.trim().length > 0) {
      console.log(`[Tenant User Update] Password update requested for user: ${user.email}, auth0_id: ${user.auth0_id || 'N/A'}`);
      
      // Validate password length
      if (password.length < 8) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: {
            password: ['Password must be at least 8 characters']
          }
        });
      }
      
      if (!user.auth0_id) {
        console.warn(`[Tenant User Update] User ${user.email} does not have auth0_id. Creating Auth0 user first.`);
        try {
          const auth0Service = require('../services/auth0Service');
          const auth0User = await auth0Service.ensureAuth0User({
            _id: user._id,
            email: user.email,
            full_name: user.full_name,
            phone: user.phone,
            password: password,
            is_active: user.is_active,
            role_ids: user.role_ids || []
          });
          
          if (auth0User) {
            user.auth0_id = auth0User.user_id;
            await user.save();
            passwordUpdated = true;
            console.log(`[Tenant User Update] Auth0 user created with password: ${auth0User.user_id}`);
          }
        } catch (auth0Error) {
          console.error('[Tenant User Update] Failed to create Auth0 user:', auth0Error.message);
          console.error('[Tenant User Update] Full error:', auth0Error);
          // Don't return error - allow other updates to succeed
          // Just log the error and continue
        }
      } else {
        try {
          console.log(`[Tenant User Update] Updating password for auth0_id: ${user.auth0_id}`);
          const auth0Service = require('../services/auth0Service');
          await auth0Service.setAuth0Password(user.auth0_id, password);
          passwordUpdated = true;
          console.log(`[Tenant User Update] Password updated successfully for: ${user.email}`);
        } catch (passwordError) {
          console.error('[Tenant User Update] Failed to update password:', passwordError.message);
          console.error('[Tenant User Update] Full error:', passwordError);
          // Don't return error - allow other updates to succeed
          // Just log the error and continue
        }
      }
    }

    // Update user in Auth0 (if auth0_id exists)
    // Note: password is handled separately above using setAuth0Password
    if (user.auth0_id) {
      try {
        const auth0Service = require('../services/auth0Service');

        const auth0UpdateData = {};
        if (name) auth0UpdateData.full_name = name.trim();
        if (phone !== undefined) auth0UpdateData.phone = phone?.trim() || '';
        if (is_active !== undefined) auth0UpdateData.is_active = is_active;

        await auth0Service.updateAuth0User(user.auth0_id, auth0UpdateData);

        // Sync roles if changed
        if (roleIds) {
          await auth0Service.syncUserRoles(user.auth0_id, roleIds);
        }
      } catch (auth0Error) {
        console.error('[Tenant User Update] Failed to update Auth0 user:', auth0Error.message);
        // Don't fail the entire operation if Auth0 fails
      }
    }

    // Log audit
    // await AuditLog.create({
    //   action: 'update',
    //   resource_type: 'user',
    //   resource_id: userId,
    //   tenant_id: tenant,
    //   user_id: req.superAdmin?.id,
    //   user_email: req.superAdmin?.email,
    //   details: {
    //     user_email: user.email,
    //     user_name: user.full_name,
    //     updated_fields: Object.keys(req.body),
    //     auth0_synced: !!user.auth0_id
    //   }
    // });

    // Build response message
    let message = 'User updated successfully';
    if (password !== undefined && password && !passwordUpdated) {
      message = 'User updated successfully, but password update failed';
    } else if (password !== undefined && password && passwordUpdated) {
      message = 'User updated successfully, password updated in Auth0';
    }
    
    console.log(`[Tenant User Update] Final status - passwordProvided: ${password !== undefined && password}, passwordUpdated: ${passwordUpdated}`);

    res.status(200).json({
      success: true,
      message: message,
      data: {
        id: user._id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        is_active: user.is_active,
        roles: user.role_ids || [],
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      password_updated: passwordUpdated
    });
  } catch (error) {
    console.error('Error updating tenant user:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
};

/**
 * Delete a user from a specific tenant
 * @route DELETE /api/admin/tenants/:tenant/users/:userId
 * @access Super Admin only
 */
const deleteTenantUser = async (req, res) => {
  try {
    const { tenant, userId } = req.params;

    // Validate tenant ID
    if (!tenant.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant ID format'
      });
    }

    // Check if tenant exists
    const tenantExists = await Tenant.findById(tenant);
    if (!tenantExists) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Find user
    const user = await User.findOne({ _id: userId, tenant_id: tenant });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found in this tenant'
      });
    }

    // Delete user from Auth0 first
    if (user.auth0_id) {
      try {
        console.log(`🔐 Deleting Auth0 user: ${user.auth0_id}`);
        const auth0Service = require('../services/auth0Service');
        await auth0Service.deleteAuth0User(user.auth0_id);
        console.log(`✅ Auth0 user deleted successfully`);
      } catch (auth0Error) {
        console.error('❌ Failed to delete Auth0 user:', auth0Error.message);
        // Continue with MongoDB deletion even if Auth0 fails
      }
    } else {
      console.log('⚠️ User does not have auth0_id, skipping Auth0 deletion');
    }

    // Log audit before deletion
    // await AuditLog.create({
    //   action: 'delete',
    //   resource_type: 'user',
    //   resource_id: userId,
    //   tenant_id: tenant,
    //   user_id: req.superAdmin?.id,
    //   user_email: req.superAdmin?.email,
    //   details: {
    //     user_email: user.email,
    //     user_name: user.full_name,
    //     auth0_deleted: !!user.auth0_id,
    //     auth0_id: user.auth0_id || null
    //   }
    // });

    // Delete user from MongoDB
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting tenant user:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};

/**
 * Sync tenant users to Auth0
 * @route POST /api/admin/tenants/:tenant/users/sync-auth0
 * @access Super Admin only
 */
const syncUsersToAuth0 = async (req, res) => {
  try {
    const { tenant } = req.params;
    const { limit, skipExisting = 'true' } = req.query;

    // Validate tenant ID
    if (!tenant.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant ID format'
      });
    }

    // Check if tenant exists
    const tenantExists = await Tenant.findById(tenant);
    if (!tenantExists) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    console.log(`🔄 Starting Auth0 sync for tenant: ${tenant}`);

    // Use the sync script
    const syncUsersScript = require('../scripts/syncUsersToAuth0');
    const result = await syncUsersScript({
      tenantId: tenant,
      dryRun: false,
      skipExisting: skipExisting === 'true',
      limit: limit ? parseInt(limit) : null
    });

    // Log audit
    // await AuditLog.create({
    //   action: 'update',
    //   resource_type: 'tenant',
    //   resource_id: tenant,
    //   tenant_id: tenant,
    //   user_id: req.superAdmin?.id,
    //   user_email: req.superAdmin?.email,
    //   details: {
    //     action: 'sync_users_to_auth0',
    //     synced: result.synced,
    //     skipped: result.skipped,
    //     failed: result.failed
    //   }
    // });

    res.status(200).json({
      success: true,
      message: `Auth0 sync completed: ${result.synced} synced, ${result.skipped} skipped, ${result.failed} failed`,
      data: result
    });

  } catch (error) {
    console.error('Error syncing users to Auth0:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing users to Auth0',
      error: error.message
    });
  }
};

/**
 * Get audit logs for a specific tenant
 * @route GET /api/admin/tenants/:tenant/audit-logs
 * @access Super Admin only
 */
const getTenantAuditLogs = async (req, res) => {
  try {
    const { tenant } = req.params;
    const { limit = 10, page = 1 } = req.query;

    // Validate tenant ID
    if (!tenant.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant ID format'
      });
    }

    // Check if tenant exists
    const tenantExists = await Tenant.findById(tenant);
    if (!tenantExists) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Fetch audit logs for this tenant
    const limitNum = parseInt(limit);
    const pageNum = parseInt(page);
    const skip = (pageNum - 1) * limitNum;

    // Convert tenant ID to ObjectId to ensure proper matching
    const mongoose = require('mongoose');
    const tenantObjectId = mongoose.Types.ObjectId.isValid(tenant)
      ? new mongoose.Types.ObjectId(tenant)
      : null;

    console.log(`🔍 Fetching audit logs for tenant: ${tenant}`);
    console.log(`   Tenant ObjectId: ${tenantObjectId}`);

    // Query filter that matches both String and ObjectId types
    const queryFilter = {
      $or: [
        { tenant_id: tenant },           // String match
        ...(tenantObjectId ? [{ tenant_id: tenantObjectId }] : [])  // ObjectId match (if valid)
      ]
    };

    console.log(`   Query filter:`, JSON.stringify(queryFilter, null, 2));

    const [auditLogs, totalLogs] = await Promise.all([
      AuditLog.find(queryFilter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(queryFilter)
    ]);

    console.log(`✅ Found ${auditLogs.length} audit logs for tenant ${tenant} (total: ${totalLogs})`);

    // Log sample of tenant_ids for debugging
    if (auditLogs.length > 0) {
      console.log('   Sample audit logs:');
      auditLogs.slice(0, Math.min(5, auditLogs.length)).forEach((log, idx) => {
        console.log(`     [${idx + 1}] action: ${log.action}, user: ${log.user_email || log.user_name}, tenant_id: ${log.tenant_id} (type: ${typeof log.tenant_id}), resource: ${log.resource_type}${log.resource_name ? ' - ' + log.resource_name : ''}`);
      });
    } else {
      console.log('   ⚠️  No audit logs found for this tenant');

      // Debug: Check if there are ANY audit logs in the collection
      const totalAllLogs = await AuditLog.countDocuments({});
      console.log(`   📊 Total audit logs in collection: ${totalAllLogs}`);

      if (totalAllLogs > 0) {
        // Sample a few audit logs to see what tenant_ids exist
        const sampleLogs = await AuditLog.find({}).limit(5).lean();
        console.log('   Sample of ALL audit logs in collection:');
        sampleLogs.forEach((log, idx) => {
          console.log(`     [${idx + 1}] tenant_id: ${log.tenant_id} (type: ${typeof log.tenant_id}), action: ${log.action}, user: ${log.user_email}`);
        });
      }
    }

    res.status(200).json({
      success: true,
      count: auditLogs.length,
      total: totalLogs,
      page: pageNum,
      pages: Math.ceil(totalLogs / limitNum),
      data: auditLogs
    });

  } catch (error) {
    console.error('Error fetching tenant audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant audit logs',
      error: error.message
    });
  }
};

module.exports = {
  getAllTenants,
  getTenantById,
  createTenant,
  provisionTenant,
  updateTenant,
  deleteTenant,
  getTenantStats,
  updateTenantRestrictions,
  updateStatus,
  getLocationData,
  getTenantUsers,
  createTenantUser,
  updateTenantUser,
  deleteTenantUser,
  syncUsersToAuth0,
  getTenantAuditLogs,
  getSubscriptions,
  subscribe,
  updateSubscriptionStatus
};