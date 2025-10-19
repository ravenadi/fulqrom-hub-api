const Customer = require('../models/Customer');
const User = require('../models/User');
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
        { 'organisation.organisation_name': { $regex: search, $options: 'i' } },
        { 'organisation.email_domain': { $regex: search, $options: 'i' } },
        { 'company_profile.business_number': { $regex: search, $options: 'i' } }
      ];
    }

    if (active !== undefined) {
      filter.is_active = active === 'true';
    }

    // For plan_id, we can query the Customer model directly
    if (plan_id) {
      filter.plan_id = plan_id;
    }

    // Build sort object
    const sort = {};
    sort[sort_by] = sort_order === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(per_page);
    
    const [tenants, total] = await Promise.all([
      Customer.find(filter)
        .populate('organisation', 'organisation_name email_domain')
        .populate('plan_id', 'name plan_tier price time_period')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(per_page))
        .lean(),
      Customer.countDocuments(filter)
    ]);

    // Format tenants with additional data
    const formattedTenants = await Promise.all(tenants.map(async (customer) => {
      const usersCount = await User.countDocuments({ customer_id: customer._id });
      const sitesCount = await Site.countDocuments({ customer_id: customer._id });
      const buildingsCount = await Building.countDocuments({ customer_id: customer._id });
      const documentsCount = await Document.countDocuments({ customer_id: customer._id });

      // Get users list with basic info
      const users = await User.find({ customer_id: customer._id })
        .select('full_name email phone is_active created_at')
        .limit(10)
        .lean();

      // Get last activity from AuditLog
      const lastActivity = await AuditLog.findOne({ 
        resource_type: 'tenant',
        resource_id: customer._id 
      })
        .sort({ created_at: -1 })
        .select('action created_at user_email')
        .lean();

      return {
        id: customer._id,
        name: customer.organisation?.organisation_name || 'N/A',
        email_domain: customer.organisation?.email_domain || 'N/A',
        organisation_id: customer._id, // In Node.js, Customer is the top-level tenant
        is_active: customer.is_active,
        is_active_label: customer.is_active ? 'Active' : 'Inactive',
        status: customer.is_active ? 'active' : 'inactive',
        plan: customer.plan_id ? {
          id: customer.plan_id._id,
          name: customer.plan_id.name,
          price: customer.plan_id.price,
          time_period: customer.plan_id.time_period
        } : null,
        plan_status: {
          is_active: customer.is_active,
          is_trial: customer.is_trial,
          plan_start_date: customer.plan_start_date,
          plan_end_date: customer.plan_end_date,
          trial_start_date: customer.trial_start_date,
          trial_end_date: customer.trial_end_date,
        },
        users_count: usersCount,
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
        created_at: customer.created_at,
        updated_at: customer.updated_at
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

    const tenantData = await Customer.findById(tenant)
      .populate('organisation')
      .populate('plan_id', 'name plan_tier price time_period')
      .lean();

    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Get additional statistics
    const [usersCount, sitesCount, buildingsCount, documentsCount, subscription] = await Promise.all([
      User.countDocuments({ customer_id: tenant }),
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

    // Check if tenant with same email domain exists (only if email_domain is provided)
    if (email_domain) {
      const existingTenant = await Customer.findOne({ 'organisation.email_domain': email_domain });
      if (existingTenant) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: {
            email_domain: ['The email domain has already been taken.']
          }
        });
      }
    }

    // Create tenant
    const tenant = new Customer({
      organisation: {
        organisation_name: tenantName,
        email_domain: email_domain || null // Allow null like Laravel version
      },
      company_profile: {
        business_number: business_number
      },
      address: address,
      phone: phone,
      is_active: tenantStatus
    });

    await tenant.save();

    // Create S3 bucket for tenant (like Laravel version)
    let s3BucketInfo = null;
    try {
      console.log(`🚀 Creating S3 bucket for tenant: ${tenant._id}`);
      const tenantS3Service = new TenantS3Service();
      s3BucketInfo = await tenantS3Service.createTenantBucketIfNotExists(
        tenant.organisation.organisation_name,
        tenant._id.toString()
      );

      if (s3BucketInfo.success) {
        console.log(`✅ S3 bucket created successfully: ${s3BucketInfo.bucket_name}`);
        
        // Store S3 bucket info in tenant metadata
        const metadata = tenant.metadata || {};
        metadata.s3_bucket = {
          bucket_name: s3BucketInfo.bucket_name,
          org_slug: s3BucketInfo.org_slug,
          region: s3BucketInfo.region,
          status: s3BucketInfo.status,
          created_at: new Date().toISOString()
        };
        
        tenant.metadata = metadata;
        await tenant.save();
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
      tenant.plan_start_date = new Date();
      tenant.is_trial = false;
      await tenant.save();
    }

    // Log audit
    await AuditLog.create({
      action: 'create',
      resource_type: 'tenant',
      resource_id: tenant._id,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        tenant_name: tenantName,
        email_domain: email_domain
      }
    });

    res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: {
        id: tenant._id,
        name: tenant.organisation.organisation_name,
        email_domain: tenant.organisation.email_domain,
        organisation_id: tenant._id,
        is_active: tenant.is_active,
        is_active_label: tenant.is_active ? 'Active' : 'Inactive',
        status: tenant.is_active ? 'active' : 'inactive',
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

    // Check if tenant with same email domain exists
    const existingTenant = await Customer.findOne({ 'organisation.email_domain': email_domain });
    if (existingTenant) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: {
          email_domain: ['The email domain has already been taken.']
        }
      });
    }

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

    const tenantData = await Customer.findById(tenant);
    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Check if email domain is being changed and if it conflicts
    if (email_domain && email_domain !== tenantData.organisation?.email_domain) {
      const existingTenant = await Customer.findOne({ 
        'organisation.email_domain': email_domain,
        _id: { $ne: tenant } 
      });
      if (existingTenant) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors: {
            email_domain: ['The email domain has already been taken.']
          }
        });
      }
    }

    // Update tenant data
    const updateData = {};
    if (name !== undefined) updateData['organisation.organisation_name'] = name;
    if (email_domain !== undefined) updateData['organisation.email_domain'] = email_domain;
    if (business_number !== undefined) updateData['company_profile.business_number'] = business_number;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    
    // Handle status - use status if provided, otherwise use is_active
    if (status !== undefined) {
      updateData.is_active = status === 'active';
    } else if (is_active !== undefined) {
      updateData.is_active = is_active;
    }
    
    // Handle plan_id
    if (plan_id !== undefined) {
      if (plan_id === '' || plan_id === null) {
        // Remove plan assignment
        updateData.plan_id = null;
        updateData.plan_start_date = null;
        updateData.plan_end_date = null;
        updateData.is_trial = true;
      } else {
        // Assign new plan
        updateData.plan_id = plan_id;
        updateData.plan_start_date = new Date();
        updateData.is_trial = false;
      }
    }

    const updatedTenant = await Customer.findByIdAndUpdate(
      tenant,
      updateData,
      { new: true, runValidators: true }
    ).populate('plan_id', 'name price time_period');

    // Log audit
    await AuditLog.create({
      action: 'update',
      resource_type: 'tenant',
      resource_id: tenant,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: updateData
    });

    res.status(200).json({
      success: true,
      message: 'Tenant updated successfully',
      data: {
        id: updatedTenant._id,
        name: updatedTenant.organisation.organisation_name,
        email_domain: updatedTenant.organisation.email_domain,
        organisation_id: updatedTenant._id,
        is_active: updatedTenant.is_active,
        is_active_label: updatedTenant.is_active ? 'Active' : 'Inactive',
        status: updatedTenant.is_active ? 'active' : 'inactive',
        plan: updatedTenant.plan_id ? {
          id: updatedTenant.plan_id._id,
          name: updatedTenant.plan_id.name,
          price: updatedTenant.plan_id.price,
          time_period: updatedTenant.plan_id.time_period
        } : null,
        plan_status: {
          is_active: updatedTenant.is_active,
          is_trial: updatedTenant.is_trial,
          plan_start_date: updatedTenant.plan_start_date,
          plan_end_date: updatedTenant.plan_end_date,
          trial_start_date: updatedTenant.trial_start_date,
          trial_end_date: updatedTenant.trial_end_date,
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
 * Delete tenant (soft delete)
 * @route DELETE /api/admin/tenants/:id
 * @access Super Admin only
 */
const deleteTenant = async (req, res) => {
  try {
    const { tenant } = req.params;

    const tenantData = await Customer.findById(tenant);
    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Check if tenant has users
    const usersCount = await User.countDocuments({ customer_id: tenant });
    if (usersCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete tenant. ${usersCount} user(s) are associated with this tenant.`
      });
    }

    // Soft delete - set is_active to false
    tenantData.is_active = false;
    await tenantData.save();

    // Log audit
    await AuditLog.create({
      action: 'delete',
      resource_type: 'tenant',
      resource_id: tenant,
      user_id: req.superAdmin?.id,
      user_email: req.superAdmin?.email,
      details: {
        tenant_name: tenantData.organisation?.organisation_name
      }
    });

    res.status(200).json({
      success: true,
      message: 'Tenant deactivated successfully'
    });
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

    const tenantData = await Customer.findById(tenant);
    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const [
      totalUsers, totalDocuments, totalSites, totalBuildings, totalFloors,
      totalAssets, totalVendors, subscription
    ] = await Promise.all([
      User.countDocuments({ customer_id: tenant }),
      Document.countDocuments({ customer_id: tenant }),
      Site.countDocuments({ customer_id: tenant }),
      Building.countDocuments({ customer_id: tenant }),
      Floor.countDocuments({ customer_id: tenant }),
      Asset.countDocuments({ customer_id: tenant }),
      Vendor.countDocuments({ customer_id: tenant }),
      Subscription.findOne({ tenant_id: tenant }).populate('plan')
    ]);

    res.status(200).json({
      success: true,
      data: {
        tenant_id: tenant,
        tenant_name: tenantData.organisation?.organisation_name,
        total_users: totalUsers,
        total_documents: totalDocuments,
        total_sites: totalSites,
        total_buildings: totalBuildings,
        total_floors: totalFloors,
        total_assets: totalAssets,
        total_vendors: totalVendors,
        subscription: subscription ? {
          plan_name: subscription.plan?.name,
          status: subscription.status,
          is_trial: subscription.is_trial,
          start_date: subscription.start_date,
          end_date: subscription.end_date
        } : null,
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

    const tenantData = await Customer.findById(tenant);
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

    const tenantData = await Customer.findById(tenant);
    if (!tenantData) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    tenantData.is_active = is_active;
    tenantData.updated_at = new Date();
    await tenantData.save();

    res.status(200).json({
      success: true,
      message: 'Tenant status updated successfully',
      data: {
        id: tenantData._id,
        is_active: tenantData.is_active,
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

    const tenantData = await Customer.findById(tenant)
      .populate('organisation')
      .lean();

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
        name: tenantData.organisation?.organisation_name || 'N/A',
        address: tenantData.organisation?.address || {},
        location: {
          country: tenantData.organisation?.address?.country || 'N/A',
          state: tenantData.organisation?.address?.state || 'N/A',
          city: tenantData.organisation?.address?.city || 'N/A',
          postal_code: tenantData.organisation?.address?.postal_code || 'N/A'
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
        { 'organisation.organisation_name': { $regex: search, $options: 'i' } },
        { 'organisation.email_domain': { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter
    if (status) {
      query.is_active = status === 'active';
    }

    // Add plan filter
    if (planId) {
      query.plan_id = planId;
    }

    const skip = (page - 1) * perPage;
    
    const [tenants, total] = await Promise.all([
      Customer.find(query)
        .populate('plan_id', 'name plan_tier price time_period')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(perPage),
      Customer.countDocuments(query)
    ]);

    const subscriptions = tenants.map(tenant => ({
      id: tenant._id,
      tenant_id: tenant._id,
      organisation_name: tenant.organisation?.organisation_name || 'Unknown',
      email_domain: tenant.organisation?.email_domain || '',
      plan_name: tenant.plan_id?.name || 'No Plan',
      plan_tier: tenant.plan_id?.plan_tier || '',
      plan_price: tenant.plan_id?.price || 0,
      plan_period: tenant.plan_id?.time_period || 'monthly',
      is_active: tenant.is_active,
      is_trial: tenant.is_trial,
      plan_start_date: tenant.plan_start_date,
      plan_end_date: tenant.plan_end_date,
      trial_start_date: tenant.trial_start_date,
      trial_end_date: tenant.trial_end_date,
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
    const tenantDoc = await Customer.findById(tenant);
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
      plan_id: plan_id,
      plan_start_date: plan_start_date ? new Date(plan_start_date) : new Date(),
      plan_end_date: plan_end_date ? new Date(plan_end_date) : null,
      is_trial: is_trial || false,
      trial_start_date: trial_start_date ? new Date(trial_start_date) : null,
      trial_end_date: trial_end_date ? new Date(trial_end_date) : null
    };

    const updatedTenant = await Customer.findByIdAndUpdate(
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
        organisation_name: updatedTenant.organisation?.organisation_name,
        plan_name: updatedTenant.plan_id?.name,
        plan_tier: updatedTenant.plan_id?.plan_tier,
        is_active: updatedTenant.is_active,
        is_trial: updatedTenant.is_trial,
        plan_start_date: updatedTenant.plan_start_date,
        plan_end_date: updatedTenant.plan_end_date,
        trial_start_date: updatedTenant.trial_start_date,
        trial_end_date: updatedTenant.trial_end_date
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
    const tenant = await Customer.findById(id).populate('plan_id');
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
        updateData.is_active = true;
        break;
      case 'inactive':
      case 'suspended':
      case 'cancelled':
        updateData.is_active = false;
        break;
    }

    const updatedTenant = await Customer.findByIdAndUpdate(
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
      details: {
        old_status: tenant.is_active ? 'active' : 'inactive',
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
        organisation_name: updatedTenant.organisation?.organisation_name,
        plan_name: updatedTenant.plan_id?.name,
        status: status,
        is_active: updatedTenant.is_active,
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
  getSubscriptions,
  subscribe,
  updateSubscriptionStatus
};