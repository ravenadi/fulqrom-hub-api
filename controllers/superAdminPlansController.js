const Plan = require('../models/Plan');
const Customer = require('../models/Customer');
const AuditLog = require('../models/AuditLog');

/**
 * Get all plans
 * @route GET /api/admin/plans
 * @access Super Admin only
 */
const getAllPlans = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 15;
    const search = req.query.search || '';
    const tier = req.query.tier || '';
    const status = req.query.status || '';

    const query = {};
    
    // Add search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { plan_tier: { $regex: search, $options: 'i' } }
      ];
    }

    // Add tier filter
    if (tier) {
      query.plan_tier = tier;
    }

    // Add status filter
    if (status) {
      query.is_active = status === 'active';
    }

    const skip = (page - 1) * perPage;
    
    const [plans, total] = await Promise.all([
      Plan.find(query)
        .sort({ sort_order: 1, name: 1 })
        .skip(skip)
        .limit(perPage),
      Plan.countDocuments(query)
    ]);

    // Get tenant counts for each plan
    const plansWithCounts = await Promise.all(
      plans.map(async (plan) => {
        const tenantsCount = await Customer.countDocuments({ plan_id: plan._id });
        return {
          id: plan._id,
          name: plan.name,
          plan_tier: plan.plan_tier,
          slug: plan.slug,
          description: plan.description,
          price: plan.price,
          price_formatted: plan.price_formatted,
          is_active: plan.is_active,
          is_default: plan.is_default,
          time_period: plan.time_period,
          trial_period_days: plan.trial_period_days,
          trial_period_label: plan.trial_period_label,
          sort_order: plan.sort_order,
          max_users: plan.max_users,
          max_documents: plan.max_documents,
          max_storage_gb: plan.max_storage_gb,
          features: plan.features,
          tenants_count: tenantsCount,
          created_at: plan.created_at,
          updated_at: plan.updated_at
        };
      })
    );

    const lastPage = Math.ceil(total / perPage);

    res.json({
      data: plansWithCounts,
      current_page: page,
      per_page: perPage,
      total: total,
      last_page: lastPage,
      from: skip + 1,
      to: Math.min(skip + perPage, total)
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching plans: ' + error.message
    });
  }
};

/**
 * Get plan by ID
 * @route GET /api/admin/plans/:plan
 * @access Super Admin only
 */
const getPlanById = async (req, res) => {
  try {
    const { plan } = req.params;

    const planDoc = await Plan.findById(plan);
    if (!planDoc) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Get tenant count for this plan
    const tenantsCount = await Customer.countDocuments({ plan_id: planDoc._id });

    res.json({
      success: true,
      data: {
        id: planDoc._id,
        name: planDoc.name,
        plan_tier: planDoc.plan_tier,
        slug: planDoc.slug,
        description: planDoc.description,
        price: planDoc.price,
        price_formatted: planDoc.price_formatted,
        is_active: planDoc.is_active,
        is_default: planDoc.is_default,
        time_period: planDoc.time_period,
        trial_period_days: planDoc.trial_period_days,
        trial_period_label: planDoc.trial_period_label,
        sort_order: planDoc.sort_order,
        max_users: planDoc.max_users,
        max_documents: planDoc.max_documents,
        max_storage_gb: planDoc.max_storage_gb,
        features: planDoc.features,
        tenants_count: tenantsCount,
        created_at: planDoc.created_at,
        updated_at: planDoc.updated_at
      }
    });
  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching plan: ' + error.message
    });
  }
};

/**
 * Create a new plan
 * @route POST /api/admin/plans
 * @access Super Admin only
 */
const createPlan = async (req, res) => {
  try {
    const {
      name,
      plan_tier,
      slug,
      description,
      price,
      is_active = true,
      is_default = false,
      time_period = 'monthly',
      trial_period_days = 0,
      sort_order = 0,
      max_users,
      max_documents,
      max_storage_gb,
      features = {}
    } = req.body;

    // Validate required fields
    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: 'Name and price are required',
        errors: {
          name: name ? [] : ['Name is required'],
          price: price ? [] : ['Price is required']
        }
      });
    }

    // Check if plan with same name already exists
    const existingPlan = await Plan.findOne({ name });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: 'Plan with this name already exists',
        errors: {
          name: ['Plan with this name already exists']
        }
      });
    }

    // Create plan
    const plan = new Plan({
      name,
      plan_tier,
      slug,
      description,
      price,
      is_active,
      is_default,
      time_period,
      trial_period_days,
      sort_order,
      max_users,
      max_documents,
      max_storage_gb,
      features
    });

    await plan.save();

    // Log the action (commented out for now due to enum validation issues)
    // TODO: Fix AuditLog enum values to support plan operations
    /*
    await AuditLog.create({
      user_id: req.superAdmin?.id || 'development-user',
      action: 'create',
      resource_type: 'plan',
      resource_id: plan._id,
      tenant_id: null, // Super admin action, no specific tenant
      details: {
        plan_name: plan.name,
        plan_tier: plan.plan_tier,
        price: plan.price
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });
    */

    res.status(201).json({
      success: true,
      message: 'Plan created successfully',
      data: {
        id: plan._id,
        name: plan.name,
        plan_tier: plan.plan_tier,
        slug: plan.slug,
        description: plan.description,
        price: plan.price,
        price_formatted: plan.price_formatted,
        is_active: plan.is_active,
        is_default: plan.is_default,
        time_period: plan.time_period,
        trial_period_days: plan.trial_period_days,
        trial_period_label: plan.trial_period_label,
        sort_order: plan.sort_order,
        max_users: plan.max_users,
        max_documents: plan.max_documents,
        max_storage_gb: plan.max_storage_gb,
        features: plan.features,
        tenants_count: 0,
        created_at: plan.created_at,
        updated_at: plan.updated_at
      }
    });
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating plan: ' + error.message
    });
  }
};

/**
 * Update plan
 * @route PUT /api/admin/plans/:plan
 * @access Super Admin only
 */
const updatePlan = async (req, res) => {
  try {
    const { plan } = req.params;
    const updateData = req.body;

    // Find plan
    const planDoc = await Plan.findById(plan);
    if (!planDoc) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Check if plan with same name already exists (excluding current plan)
    if (updateData.name && updateData.name !== planDoc.name) {
      const existingPlan = await Plan.findOne({ 
        name: updateData.name, 
        _id: { $ne: plan } 
      });
      if (existingPlan) {
        return res.status(400).json({
          success: false,
          message: 'Plan with this name already exists',
          errors: {
            name: ['Plan with this name already exists']
          }
        });
      }
    }

    // Update plan
    const updatedPlan = await Plan.findByIdAndUpdate(
      plan,
      { ...updateData, updated_at: new Date() },
      { new: true, runValidators: true }
    );

    // Log the action (commented out for now due to enum validation issues)
    // TODO: Fix AuditLog enum values to support plan operations
    /*
    await AuditLog.create({
      user_id: req.superAdmin?.id || 'development-user',
      action: 'update',
      resource_type: 'plan',
      resource_id: plan,
      tenant_id: null, // Super admin action, no specific tenant
      details: {
        plan_name: updatedPlan.name,
        changes: updateData
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });
    */

    res.json({
      success: true,
      message: 'Plan updated successfully',
      data: {
        id: updatedPlan._id,
        name: updatedPlan.name,
        plan_tier: updatedPlan.plan_tier,
        slug: updatedPlan.slug,
        description: updatedPlan.description,
        price: updatedPlan.price,
        price_formatted: updatedPlan.price_formatted,
        is_active: updatedPlan.is_active,
        is_default: updatedPlan.is_default,
        time_period: updatedPlan.time_period,
        trial_period_days: updatedPlan.trial_period_days,
        trial_period_label: updatedPlan.trial_period_label,
        sort_order: updatedPlan.sort_order,
        max_users: updatedPlan.max_users,
        max_documents: updatedPlan.max_documents,
        max_storage_gb: updatedPlan.max_storage_gb,
        features: updatedPlan.features,
        updated_at: updatedPlan.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating plan: ' + error.message
    });
  }
};

/**
 * Delete plan
 * @route DELETE /api/admin/plans/:plan
 * @access Super Admin only
 */
const deletePlan = async (req, res) => {
  try {
    const { plan } = req.params;

    // Find plan
    const planDoc = await Plan.findById(plan);
    if (!planDoc) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Check if plan has active tenants
    const tenantsCount = await Customer.countDocuments({ plan_id: plan });
    if (tenantsCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete plan with active tenants',
        errors: {
          plan: ['Plan has active tenants and cannot be deleted']
        }
      });
    }

    // Delete plan
    await Plan.findByIdAndDelete(plan);

    // Log the action (commented out for now due to enum validation issues)
    // TODO: Fix AuditLog enum values to support plan operations
    /*
    await AuditLog.create({
      user_id: req.superAdmin?.id || 'development-user',
      action: 'delete',
      resource_type: 'plan',
      resource_id: plan,
      tenant_id: null, // Super admin action, no specific tenant
      details: {
        plan_name: planDoc.name,
        plan_tier: planDoc.plan_tier
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });
    */

    res.json({
      success: true,
      message: 'Plan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting plan: ' + error.message
    });
  }
};

module.exports = {
  getAllPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan
};