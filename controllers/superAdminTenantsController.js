const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Document = require('../models/Document');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
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
    
    const [tenants, total] = await Promise.all([
      Tenant.find(filter)
        .populate('plan_id', 'name plan_tier price time_period')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(per_page))
        .lean(),
      Tenant.countDocuments(filter)
    ]);

    // Format tenants with additional data
    const formattedTenants = await Promise.all(tenants.map(async (tenant) => {
      const usersCount = await User.countDocuments({ tenant_id: tenant._id });
      // Use withTenant for proper tenant context or withoutTenantFilter for super admin
      const customersCount = await Customer.withTenant(tenant._id).countDocuments({});
      const sitesCount = await Site.countDocuments({ tenant_id: tenant._id });
      const buildingsCount = await Building.countDocuments({ tenant_id: tenant._id });
      const documentsCount = await Document.countDocuments({ tenant_id: tenant._id });

      // Get users list with basic info
      const users = await User.find({ tenant_id: tenant._id })
        .select('full_name email phone is_active created_at')
        .limit(10)
        .lean();

      // Get last activity from AuditLog
      const lastActivity = await AuditLog.findOne({ 
        resource_type: 'tenant',
        resource_id: tenant._id 
      })
        .sort({ created_at: -1 })
        .select('action created_at user_email')
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
        plan_status: {
          is_active: tenant.status === 'active',
          is_trial: tenant.status === 'trial',
          plan_start_date: null, // Tenant model doesn't have these fields
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

    // Get additional statistics
    const [usersCount, customersCount, sitesCount, buildingsCount, documentsCount, subscription] = await Promise.all([
      User.countDocuments({ customer_id: tenant }),
      Customer.withTenant(tenant).countDocuments({}),
      Site.countDocuments({ customer_id: tenant }),
      Building.countDocuments({ customer_id: tenant }),
      Document.countDocuments({ customer_id: tenant }),
      Subscription.findOne({ tenant_id: tenant }).populate('plan')
    ]);

    const formattedTenant = {
      id: tenantData._id,
      name: tenantData.organisation?.organisation_name || 'N/A',
      email_domain: tenantData.organisation?.email_domain || 'N/A',
      organisation_id: tenantData._id,
      is_active: tenantData.is_active,
      is_active_label: tenantData.is_active ? 'Active' : 'Inactive',
      status: tenantData.is_active ? 'active' : 'inactive',
      plan: subscription?.plan ? {
        id: subscription.plan._id,
        name: subscription.plan.name,
        price: subscription.plan.price,
        time_period: subscription.plan.billing_cycle
      } : null,
      plan_status: {
        is_active: subscription?.status === 'active',
        is_trial: subscription?.is_trial,
        plan_start_date: subscription?.start_date,
        plan_end_date: subscription?.end_date,
        trial_start_date: subscription?.trial_start_date,
        trial_end_date: subscription?.trial_end_date,
      },
      users_count: usersCount,
      customers_count: customersCount,
      sites_count: sitesCount,
      buildings_count: buildingsCount,
      documents_count: documentsCount,
      created_at: tenantData.created_at,
      updated_at: tenantData.updated_at,
      users: tenantData.users.map(user => ({
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
        
        // Store S3 bucket info in tenant metadata (if Tenant model supports metadata)
        // Note: Tenant model is simplified and may not have metadata field
        // This would need to be added to the Tenant schema if required
      } else {
        console.error(`❌ Failed to create S3 bucket: ${s3BucketInfo.error}`);
      }
    } catch (s3Error) {
      console.error('S3 bucket creation failed:', s3Error);
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

    // Log audit
    await AuditLog.create({
      action: 'create',
      resource_type: 'tenant',
      resource_id: tenant._id,
      tenant_id: tenant._id, // Add tenant_id field
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        tenant_name: tenantName,
        phone: phone
      }
    });

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
    await AuditLog.create({
      action: 'provision_tenant',
      resource_type: 'tenant',
      resource_id: provisioningResult.tenant._id,
      tenant_id: provisioningResult.tenant._id, // Add tenant_id field
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        tenant_name: provisioningData.name,
        email_domain: email_domain,
        provisioning_steps_completed: Object.keys(provisioningResult.provisioning_steps).length,
        s3_bucket_created: !!(provisioningResult.s3_bucket_info && provisioningResult.s3_bucket_info.success),
        user_created: !!provisioningResult.user
      }
    });

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

    const updatedTenant = await Tenant.findByIdAndUpdate(
      tenant,
      updateData,
      { new: true, runValidators: true }
    ).populate('plan_id', 'name price time_period');

    // Log audit
    await AuditLog.create({
      action: 'update',
      resource_type: 'tenant',
      resource_id: tenant,
      tenant_id: tenant, // Add tenant_id field
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: updateData
    });

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
        plan_status: {
          is_active: updatedTenant.status === 'active',
          is_trial: updatedTenant.status === 'trial',
          plan_start_date: null, // Tenant model doesn't have these fields
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
      Customer.withTenant(tenant).countDocuments({}),
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
    await AuditLog.create({
      action: 'update_restrictions',
      resource_type: 'tenant',
      resource_id: tenant,
      tenant_id: tenant, // Add tenant_id field
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        max_users: max_users,
        max_documents: max_documents,
        max_storage_gb: max_storage_gb
      }
    });

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
    await AuditLog.create({
      user_id: req.superAdmin?.id || 'development-user',
      action: 'subscribe_tenant',
      resource_type: 'Customer',
      resource_id: tenant,
      tenant_id: tenant, // Add tenant_id field
      details: {
        plan_id: plan_id,
        plan_name: plan.name,
        is_trial: updateData.is_trial
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

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
    await AuditLog.create({
      user_id: req.superAdmin?.id || 'development-user',
      action: 'update_subscription_status',
      resource_type: 'Customer',
      resource_id: id,
      tenant_id: id, // Add tenant_id field
      details: {
        old_status: tenant.status,
        new_status: status,
        plan_name: tenant.plan_id?.name
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

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
  getSubscriptions,
  subscribe,
  updateSubscriptionStatus
};