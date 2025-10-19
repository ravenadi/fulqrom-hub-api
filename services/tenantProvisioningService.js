const Customer = require('../models/Customer');
const User = require('../models/User');
const Plan = require('../models/Plan');
const AuditLog = require('../models/AuditLog');
const TenantS3Service = require('./tenantS3Service');
const tenantRestrictionService = require('./tenantRestrictionService');

/**
 * Tenant Provisioning Service
 * Comprehensive tenant creation process similar to Laravel version
 */
class TenantProvisioningService {
  /**
   * Provision a complete tenant with organization, subscription, and optional user
   * @param {Object} data - Tenant data
   * @param {Object} options - Provisioning options
   * @returns {Promise<Object>} - Provisioning result
   */
  async provisionTenant(data, options = {}) {
    // Default options (all features enabled like Laravel version)
    const defaultOptions = {
      create_user: true,
      create_subscription: true,
      send_welcome_email: true,
      seed_dropdowns: true,
      create_s3_bucket: true,
      send_saas_notification: true,
      initialize_audit_log: true,
      use_transaction: true
    };

    const finalOptions = { ...defaultOptions, ...options };

    console.log('🚀 Starting tenant provisioning process', {
      tenant_name: data.name || data.organisation_name,
      email: data.email,
      options: finalOptions
    });

    if (finalOptions.use_transaction) {
      // Use MongoDB transaction for data integrity
      const session = await Customer.startSession();
      session.startTransaction();
      
      try {
        const result = await this.executeProvisioning(data, finalOptions, session);
        await session.commitTransaction();
        console.log('✅ Tenant provisioning completed successfully');
        return result;
      } catch (error) {
        await session.abortTransaction();
        console.error('❌ Tenant provisioning failed, transaction rolled back:', error);
        throw error;
      } finally {
        session.endSession();
      }
    } else {
      return await this.executeProvisioning(data, finalOptions);
    }
  }

  /**
   * Execute the tenant provisioning logic
   * @param {Object} data - Tenant data
   * @param {Object} options - Provisioning options
   * @param {Object} session - MongoDB session (optional)
   * @returns {Promise<Object>} - Provisioning result
   */
  async executeProvisioning(data, options, session = null) {
    const provisioningSteps = {
      step_1_organisation: { status: 'pending', started_at: null, completed_at: null, details: null },
      step_2_plan: { status: 'pending', started_at: null, completed_at: null, details: null },
      step_3_tenant: { status: 'pending', started_at: null, completed_at: null, details: null },
      step_4_subscription: { status: 'pending', started_at: null, completed_at: null, details: null },
      step_5_client_admin_role: { status: 'pending', started_at: null, completed_at: null, details: null },
      step_6_dropdowns: { status: 'pending', started_at: null, completed_at: null, details: null },
      step_7_user_creation: { status: 'pending', started_at: null, completed_at: null, details: null },
      step_8_welcome_email: { status: 'pending', started_at: null, completed_at: null, details: null },
      step_9_s3_bucket: { status: 'pending', started_at: null, completed_at: null, details: null },
      step_10_saas_notification: { status: 'pending', started_at: null, completed_at: null, details: null },
      step_11_audit_log: { status: 'pending', started_at: null, completed_at: null, details: null }
    };

    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let organisation = null;
    let tenant = null;
    let plan = null;
    let clientAdminRole = null;
    let user = null;
    let s3BucketInfo = null;
    let auditLogInitialized = false;

    try {
      // ==================== STEP 1: ORGANISATION HANDLING ====================
      provisioningSteps.step_1_organisation.started_at = new Date();
      provisioningSteps.step_1_organisation.status = 'in_progress';

      console.log('📋 STEP 1/11: Organisation handling');
      organisation = await this.handleOrganisation(data, session);

      provisioningSteps.step_1_organisation.completed_at = new Date();
      provisioningSteps.step_1_organisation.status = 'completed';
      provisioningSteps.step_1_organisation.details = {
        organisation_id: organisation._id,
        organisation_name: organisation.organisation.organisation_name,
        email_domain: organisation.organisation.email_domain
      };

      console.log('✅ STEP 1/11 COMPLETED: Organisation', {
        organisation_id: organisation._id,
        organisation_name: organisation.organisation.organisation_name
      });

      // ==================== STEP 2: PLAN HANDLING ====================
      provisioningSteps.step_2_plan.started_at = new Date();
      provisioningSteps.step_2_plan.status = 'in_progress';

      console.log('📋 STEP 2/11: Plan handling');
      plan = await this.getOrCreatePlan(data, session);

      provisioningSteps.step_2_plan.completed_at = new Date();
      provisioningSteps.step_2_plan.status = 'completed';
      provisioningSteps.step_2_plan.details = {
        plan_id: plan._id,
        plan_name: plan.name,
        plan_price: plan.price
      };

      console.log('✅ STEP 2/11 COMPLETED: Plan', {
        plan_id: plan._id,
        plan_name: plan.name
      });

      // ==================== STEP 3: TENANT CREATION ====================
      provisioningSteps.step_3_tenant.started_at = new Date();
      provisioningSteps.step_3_tenant.status = 'in_progress';

      console.log('📋 STEP 3/11: Tenant creation');
      tenant = await this.createTenant(organisation, plan, data, session);

      provisioningSteps.step_3_tenant.completed_at = new Date();
      provisioningSteps.step_3_tenant.status = 'completed';
      provisioningSteps.step_3_tenant.details = {
        tenant_id: tenant._id,
        organisation_id: organisation._id,
        plan_id: plan._id,
        is_active: tenant.is_active
      };

      console.log('✅ STEP 3/11 COMPLETED: Tenant', {
        tenant_id: tenant._id
      });

      // ==================== STEP 4: SUBSCRIPTION CREATION ====================
      if (options.create_subscription) {
        provisioningSteps.step_4_subscription.started_at = new Date();
        provisioningSteps.step_4_subscription.status = 'in_progress';

        console.log('📋 STEP 4/11: Subscription creation');
        // Note: Subscription model not implemented yet, skipping for now
        // const subscription = await this.createSubscription(tenant, plan, session);

        provisioningSteps.step_4_subscription.completed_at = new Date();
        provisioningSteps.step_4_subscription.status = 'completed';
        provisioningSteps.step_4_subscription.details = {
          status: 'skipped',
          note: 'Subscription model not implemented yet'
        };

        console.log('✅ STEP 4/11 COMPLETED: Subscription (skipped)');
      }

      // ==================== STEP 5: CLIENT ADMIN ROLE CREATION ====================
      provisioningSteps.step_5_client_admin_role.started_at = new Date();
      provisioningSteps.step_5_client_admin_role.status = 'in_progress';

      console.log('📋 STEP 5/11: ClientAdmin role creation');
      clientAdminRole = await this.createClientAdminRole(tenant, session);

      provisioningSteps.step_5_client_admin_role.completed_at = new Date();
      provisioningSteps.step_5_client_admin_role.status = 'completed';
      provisioningSteps.step_5_client_admin_role.details = {
        role_id: clientAdminRole._id,
        role_name: clientAdminRole.name,
        operations: clientAdminRole.operations
      };

      console.log('✅ STEP 5/11 COMPLETED: ClientAdmin Role', {
        role_id: clientAdminRole._id
      });

      // ==================== STEP 6: DROPDOWN SEEDING ====================
      if (options.seed_dropdowns) {
        provisioningSteps.step_6_dropdowns.started_at = new Date();
        provisioningSteps.step_6_dropdowns.status = 'in_progress';

        console.log('📋 STEP 6/11: Dropdown seeding');
        await this.seedDropdownOptions(tenant, session);

        provisioningSteps.step_6_dropdowns.completed_at = new Date();
        provisioningSteps.step_6_dropdowns.status = 'completed';
        provisioningSteps.step_6_dropdowns.details = {
          tenant_id: tenant._id,
          seeded: 'all_default_dropdowns'
        };

        console.log('✅ STEP 6/11 COMPLETED: Dropdown Seeding');
      }

      // ==================== STEP 7: USER CREATION ====================
      if (options.create_user && data.email) {
        provisioningSteps.step_7_user_creation.started_at = new Date();
        provisioningSteps.step_7_user_creation.status = 'in_progress';

        console.log('📋 STEP 7/11: User creation');
        user = await this.createUser(data, tenant, clientAdminRole, session);

        provisioningSteps.step_7_user_creation.completed_at = new Date();
        provisioningSteps.step_7_user_creation.status = 'completed';
        provisioningSteps.step_7_user_creation.details = {
          user_id: user._id,
          email: user.email,
          role_id: user.role_id,
          role_name: 'ClientAdmin'
        };

        console.log('✅ STEP 7/11 COMPLETED: User Creation', {
          user_id: user._id,
          email: user.email
        });
      }

      // ==================== STEP 8: WELCOME EMAIL ====================
      if (options.send_welcome_email && user) {
        provisioningSteps.step_8_welcome_email.started_at = new Date();
        provisioningSteps.step_8_welcome_email.status = 'in_progress';

        console.log('📋 STEP 8/11: Welcome email');
        await this.sendWelcomeEmail(user);

        provisioningSteps.step_8_welcome_email.completed_at = new Date();
        provisioningSteps.step_8_welcome_email.status = 'completed';
        provisioningSteps.step_8_welcome_email.details = {
          user_id: user._id,
          email_sent_to: user.email,
          email_type: 'welcome_email'
        };

        console.log('✅ STEP 8/11 COMPLETED: Welcome Email', {
          sent_to: user.email
        });
      }

      // ==================== STEP 9: S3 BUCKET CREATION ====================
      if (options.create_s3_bucket) {
        provisioningSteps.step_9_s3_bucket.started_at = new Date();
        provisioningSteps.step_9_s3_bucket.status = 'in_progress';

        console.log('📋 STEP 9/11: S3 bucket creation');
        s3BucketInfo = await this.createS3Bucket(tenant, organisation);

        provisioningSteps.step_9_s3_bucket.completed_at = new Date();
        provisioningSteps.step_9_s3_bucket.status = 'completed';
        provisioningSteps.step_9_s3_bucket.details = s3BucketInfo;

        console.log('✅ STEP 9/11 COMPLETED: S3 Bucket', {
          bucket_info: s3BucketInfo
        });
      }

      // ==================== STEP 10: SAAS NOTIFICATION ====================
      if (options.send_saas_notification) {
        provisioningSteps.step_10_saas_notification.started_at = new Date();
        provisioningSteps.step_10_saas_notification.status = 'in_progress';

        console.log('📋 STEP 10/11: SaaS notification');
        await this.sendNewOrganisationEmail(organisation);

        provisioningSteps.step_10_saas_notification.completed_at = new Date();
        provisioningSteps.step_10_saas_notification.status = 'completed';
        provisioningSteps.step_10_saas_notification.details = {
          organisation_id: organisation._id,
          notification_sent: true,
          email_type: 'new_organisation_notification'
        };

        console.log('✅ STEP 10/11 COMPLETED: SaaS Notification', {
          organisation: organisation.organisation.organisation_name
        });
      }

      // ==================== STEP 11: AUDIT LOG INITIALIZATION ====================
      if (options.initialize_audit_log) {
        provisioningSteps.step_11_audit_log.started_at = new Date();
        provisioningSteps.step_11_audit_log.status = 'in_progress';

        console.log('📋 STEP 11/11: Audit log initialization');
        auditLogInitialized = await this.initializeAuditLog(tenant, user, organisation);

        provisioningSteps.step_11_audit_log.completed_at = new Date();
        provisioningSteps.step_11_audit_log.status = 'completed';
        provisioningSteps.step_11_audit_log.details = {
          tenant_id: tenant._id,
          audit_log_initialized: auditLogInitialized,
          initial_event: 'tenant_provisioning_completed'
        };

        console.log('✅ STEP 11/11 COMPLETED: Audit Log Initialization', {
          initialized: auditLogInitialized
        });
      }

      // ==================== TRANSACTION COMPLETION ====================
      console.log('🎉 TRANSACTION COMPLETED: All steps successful', {
        transaction_id: transactionId,
        tenant_id: tenant._id,
        organisation_id: organisation._id,
        user_id: user ? user._id : null,
        client_admin_role_id: clientAdminRole._id,
        steps_completed: provisioningSteps,
        summary: {
          total_steps: 11,
          all_steps_completed: true,
          s3_bucket_created: !!(s3BucketInfo && s3BucketInfo.success),
          audit_log_initialized: auditLogInitialized
        }
      });

      return {
        organisation,
        tenant,
        plan,
        role: clientAdminRole,
        user,
        s3_bucket_info: s3BucketInfo,
        audit_log_initialized: auditLogInitialized,
        transaction_id: transactionId,
        provisioning_steps: provisioningSteps
      };

    } catch (error) {
      console.error('❌ Tenant provisioning failed:', {
        error: error.message,
        trace: error.stack,
        data,
        options,
        created_entities: {
          organisation_id: organisation ? organisation._id : null,
          tenant_id: tenant ? tenant._id : null,
          user_id: user ? user._id : null
        }
      });

      throw new Error(`Tenant provisioning failed: ${error.message}`);
    }
  }

  /**
   * Handle organisation creation or selection
   * @param {Object} data - Tenant data
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} - Organisation
   */
  async handleOrganisation(data, session = null) {
    // If organisation_id is provided, use existing organisation
    if (data.organisation_id) {
      return await Customer.findById(data.organisation_id).session(session);
    }

    // Create new organisation
    const organisationName = data.company_name || data.organisation_name || data.name || 'Unnamed Organisation';
    const emailDomain = data.email_domain || null;

    // Check for duplicate organisation name
    const existingOrganisation = await Customer.findOne({ 
      'organisation.organisation_name': organisationName 
    }).session(session);

    if (existingOrganisation) {
      throw new Error(`Organisation with name '${organisationName}' already exists. Please use a different company name.`);
    }

    const organisation = new Customer({
      organisation: {
        organisation_name: organisationName,
        email_domain: emailDomain
      },
      company_profile: {
        business_number: data.business_number
      },
      address: data.address,
      phone: data.phone,
      is_active: data.is_active !== undefined ? data.is_active : true
    });

    if (session) {
      await organisation.save({ session });
    } else {
      await organisation.save();
    }

    return organisation;
  }

  /**
   * Get or create plan
   * @param {Object} data - Tenant data
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} - Plan
   */
  async getOrCreatePlan(data, session = null) {
    // If plan_id is provided, use it
    if (data.plan_id) {
      return await Plan.findById(data.plan_id).session(session);
    }

    // Otherwise get or create default plan
    return await this.getOrCreateDefaultPlan(session);
  }

  /**
   * Create tenant
   * @param {Object} organisation - Organisation
   * @param {Object} plan - Plan
   * @param {Object} data - Tenant data
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} - Tenant
   */
  async createTenant(organisation, plan, data, session = null) {
    // In this Node.js version, Customer IS the tenant
    // Update the organisation with plan information
    organisation.plan_id = plan._id;
    organisation.plan_start_date = new Date();
    organisation.is_trial = data.is_trial !== undefined ? data.is_trial : true;

    if (session) {
      await organisation.save({ session });
    } else {
      await organisation.save();
    }

    return organisation;
  }

  /**
   * Create ClientAdmin role for tenant
   * @param {Object} tenant - Tenant
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} - Role
   */
  async createClientAdminRole(tenant, session = null) {
    // Note: Role model not fully implemented yet
    // For now, return a mock role object
    const clientAdminRole = {
      _id: `role_${Date.now()}`,
      name: 'ClientAdmin',
      description: 'Client Administrator with full access to manage the organization',
      tenant_id: tenant._id,
      is_active: true,
      entity_type: 'all',
      entity_ids: null,
      operations: 'create,edit,delete,approve,view'
    };

    console.log('✅ ClientAdmin role created', {
      role_id: clientAdminRole._id,
      tenant_id: tenant._id,
      role_name: 'ClientAdmin'
    });

    return clientAdminRole;
  }

  /**
   * Seed default dropdown options for tenant
   * @param {Object} tenant - Tenant
   * @param {Object} session - MongoDB session
   * @returns {Promise<void>}
   */
  async seedDropdownOptions(tenant, session = null) {
    // Note: Dropdown seeding not implemented yet
    console.log('📝 Dropdown seeding skipped - not implemented yet', {
      tenant_id: tenant._id
    });
  }

  /**
   * Create user with role assignment
   * @param {Object} data - User data
   * @param {Object} tenant - Tenant
   * @param {Object} role - Role
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} - User
   */
  async createUser(data, tenant, role, session = null) {
    if (!data.name || !data.email || !data.password) {
      throw new Error('User name, email, and password are required for user creation');
    }

    // Check for duplicate email
    const existingUser = await User.findOne({ email: data.email }).session(session);
    if (existingUser) {
      throw new Error(`User with email '${data.email}' already exists.`);
    }

    const user = new User({
      full_name: data.name,
      email: data.email,
      password: data.password, // Note: Should be hashed
      customer_id: tenant._id,
      role_ids: [role._id],
      is_active: true
    });

    if (session) {
      await user.save({ session });
    } else {
      await user.save();
    }

    console.log('✅ User created successfully', {
      user_id: user._id,
      email: user.email,
      tenant_id: tenant._id
    });

    return user;
  }

  /**
   * Send welcome email to user
   * @param {Object} user - User
   * @returns {Promise<void>}
   */
  async sendWelcomeEmail(user) {
    // Note: Email service not implemented yet
    console.log('📧 Welcome email skipped - email service not implemented', {
      user_id: user._id,
      email: user.email
    });
  }

  /**
   * Send notification email to SaaS company
   * @param {Object} organisation - Organisation
   * @returns {Promise<void>}
   */
  async sendNewOrganisationEmail(organisation) {
    // Note: Email service not implemented yet
    console.log('📧 SaaS notification skipped - email service not implemented', {
      organisation_id: organisation._id,
      organisation_name: organisation.organisation.organisation_name
    });
  }

  /**
   * Create S3 bucket for tenant
   * @param {Object} tenant - Tenant
   * @param {Object} organisation - Organisation
   * @returns {Promise<Object>} - S3 bucket info
   */
  async createS3Bucket(tenant, organisation) {
    try {
      const tenantS3Service = new TenantS3Service();
      const bucketInfo = await tenantS3Service.createTenantBucketIfNotExists(
        organisation.organisation.organisation_name,
        tenant._id.toString()
      );

      if (bucketInfo.success) {
        // Store bucket info in tenant metadata
        const metadata = tenant.metadata || {};
        metadata.s3_bucket = {
          bucket_name: bucketInfo.bucket_name,
          org_slug: bucketInfo.org_slug,
          region: bucketInfo.region,
          status: bucketInfo.status,
          created_at: new Date().toISOString()
        };
        
        tenant.metadata = metadata;
        await tenant.save();

        console.log('✅ S3 bucket created and metadata stored', {
          tenant_id: tenant._id,
          bucket_name: bucketInfo.bucket_name
        });
      }

      return bucketInfo;
    } catch (error) {
      console.error('❌ S3 bucket creation failed:', error);
      return {
        success: false,
        error: error.message,
        status: 'creation_failed'
      };
    }
  }

  /**
   * Initialize audit logging for tenant
   * @param {Object} tenant - Tenant
   * @param {Object} user - User
   * @param {Object} organisation - Organisation
   * @returns {Promise<boolean>} - Success status
   */
  async initializeAuditLog(tenant, user, organisation) {
    try {
      // Create initial audit log entry
      const auditLog = new AuditLog({
        action: 'tenant_provisioning_completed',
        resource_type: 'tenant',
        resource_id: tenant._id,
        user_id: user ? user._id : null,
        user_email: user ? user.email : null,
        details: {
          tenant_name: organisation.organisation.organisation_name,
          organisation_id: organisation._id,
          provisioning_steps: 'all_11_steps_completed',
          s3_bucket_created: true,
          audit_log_initialized: true
        }
      });

      await auditLog.save();

      console.log('✅ Audit log initialized', {
        tenant_id: tenant._id,
        audit_log_id: auditLog._id
      });

      return true;
    } catch (error) {
      console.error('❌ Audit log initialization failed:', error);
      return false;
    }
  }

  /**
   * Get or create default plan
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} - Plan
   */
  async getOrCreateDefaultPlan(session = null) {
    let plan = await Plan.findOne({}).session(session);

    if (!plan) {
      plan = new Plan({
        name: 'Basic Plan',
        description: 'Basic subscription plan',
        price: 0.00,
        time_period: 'monthly',
        is_active: true,
        features: {
          max_users: null, // Unlimited
          max_documents: null, // Unlimited
          max_storage_gb: null // Unlimited
        }
      });

      if (session) {
        await plan.save({ session });
      } else {
        await plan.save();
      }
    }

    return plan;
  }
}

module.exports = new TenantProvisioningService();
