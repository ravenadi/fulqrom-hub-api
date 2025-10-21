const express = require('express');
const SuperAdminAnalyticsController = require('../controllers/superAdminAnalyticsController');
const SuperAdminTenantsController = require('../controllers/superAdminTenantsController');
const SuperAdminUsersController = require('../controllers/superAdminUsersController');
const SuperAdminRolesController = require('../controllers/superAdminRolesController');
const SuperAdminPlansController = require('../controllers/superAdminPlansController');
const authenticate = require('../middleware/authMiddleware');
const { checkSuperAdmin } = require('../middleware/superAdmin');

const router = express.Router();

// Apply authentication and super admin middleware to all admin routes
router.use(authenticate);
router.use(checkSuperAdmin);

/**
 * @swagger
 * components:
 *   schemas:
 *     SuperAdminStats:
 *       type: object
 *       properties:
 *         total_sites:
 *           type: number
 *         total_buildings:
 *           type: number
 *         total_floors:
 *           type: number
 *         total_building_tenants:
 *           type: number
 *         total_documents:
 *           type: number
 *         total_users:
 *           type: number
 *         total_tenants:
 *           type: number
 *         active_tenants:
 *           type: number
 *         total_assets:
 *           type: number
 *         total_contacts:
 *           type: number
 *         total_vendors:
 *           type: number
 *         total_notes:
 *           type: number
 *         storage:
 *           type: object
 *           properties:
 *             totalSizeBytes:
 *               type: number
 *               description: Total storage size in bytes
 *             totalSizeMB:
 *               type: number
 *               description: Total storage size in MB
 *             totalSizeGB:
 *               type: number
 *               description: Total storage size in GB
 *             displaySize:
 *               type: string
 *               description: Human-readable storage size
 *             totalRecords:
 *               type: number
 *               description: Total document records
 *             documentsWithFiles:
 *               type: number
 *               description: Documents that have files attached
 *             documentsWithoutFiles:
 *               type: number
 *               description: Documents without files
 *         total_space_used:
 *           type: number
 *           description: Legacy field for backward compatibility (bytes)
 *         system_health:
 *           type: string
 */

/**
 * @swagger
 * /api/admin/stats/all:
 *   get:
 *     summary: Get comprehensive system statistics
 *     tags: [Super Admin - Analytics]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Filter stats by specific tenant
 *     responses:
 *       200:
 *         description: System statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SuperAdminStats'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/stats/all',
  SuperAdminAnalyticsController.getAllStats
);

/**
 * @swagger
 * /api/admin/analytics/usage:
 *   get:
 *     summary: Get usage analytics
 *     tags: [Super Admin - Analytics]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           default: 30d
 *         description: Analytics period (e.g., 7d, 30d, 90d)
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Filter by specific tenant
 *     responses:
 *       200:
 *         description: Usage analytics retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/analytics/usage',
  SuperAdminAnalyticsController.getUsageTrends
);

/**
 * @swagger
 * /api/admin/analytics/overview:
 *   get:
 *     summary: Get overview analytics
 *     tags: [Super Admin - Analytics]
 *     security:
 *       - SuperAdminAuth: []
 *     responses:
 *       200:
 *         description: Overview analytics retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/analytics/overview',
  
  SuperAdminAnalyticsController.getSystemHealth
);

/**
 * @swagger
 * /api/admin/tenants:
 *   get:
 *     summary: Get all tenants with filtering and pagination
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 15
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by organization name or email domain
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Tenants retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/tenants',
  
  SuperAdminTenantsController.getAllTenants
);

/**
 * @swagger
 * /api/admin/tenants/{tenant}:
 *   get:
 *     summary: Get specific tenant details
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant details retrieved successfully
 *       404:
 *         description: Tenant not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/tenants/:tenant',
  
  SuperAdminTenantsController.getTenantById
);

/**
 * @swagger
 * /api/admin/tenants:
 *   post:
 *     summary: Create new tenant
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - SuperAdminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Organization name
 *               organisation_name:
 *                 type: string
 *                 description: Organisation name (alternative to name)
 *               email_domain:
 *                 type: string
 *                 description: Email domain (optional)
 *               business_number:
 *                 type: string
 *               company_number:
 *                 type: string
 *               trading_name:
 *                 type: string
 *               industry_type:
 *                 type: string
 *               organisation_size:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: Tenant status
 *               is_active:
 *                 type: boolean
 *                 description: Whether tenant is active
 *               plan_id:
 *                 type: string
 *                 description: Plan ID for subscription
 *     responses:
 *       201:
 *         description: Tenant created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.post('/tenants',
  
  SuperAdminTenantsController.createTenant
);

/**
 * @swagger
 * /api/admin/tenants/provision:
 *   post:
 *     summary: Create new tenant with comprehensive provisioning (like Laravel version)
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - SuperAdminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Tenant name
 *               organisation_name:
 *                 type: string
 *                 description: Organisation name
 *               company_name:
 *                 type: string
 *                 description: Company name
 *               email_domain:
 *                 type: string
 *                 description: Email domain
 *               business_number:
 *                 type: string
 *                 description: Business number
 *               address:
 *                 type: object
 *                 description: Address information
 *               phone:
 *                 type: string
 *                 description: Phone number
 *               email:
 *                 type: string
 *                 description: User email (required if create_user=true)
 *               password:
 *                 type: string
 *                 description: User password (required if create_user=true)
 *               is_active:
 *                 type: boolean
 *                 default: true
 *               plan_id:
 *                 type: string
 *                 description: Plan ID
 *               is_trial:
 *                 type: boolean
 *                 default: true
 *               create_user:
 *                 type: boolean
 *                 default: true
 *               create_subscription:
 *                 type: boolean
 *                 default: true
 *               send_welcome_email:
 *                 type: boolean
 *                 default: true
 *               seed_dropdowns:
 *                 type: boolean
 *                 default: true
 *               create_s3_bucket:
 *                 type: boolean
 *                 default: true
 *               send_saas_notification:
 *                 type: boolean
 *                 default: true
 *               initialize_audit_log:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Tenant provisioned successfully with comprehensive setup
 *       422:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.post('/tenants/provision',
  
  SuperAdminTenantsController.provisionTenant
);

/**
 * @swagger
 * /api/admin/tenants/{tenant}:
 *   put:
 *     summary: Update tenant
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Tenant updated successfully
 *       404:
 *         description: Tenant not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.put('/tenants/:tenant',
  
  SuperAdminTenantsController.updateTenant
);

/**
 * @swagger
 * /api/admin/tenants/{tenant}:
 *   delete:
 *     summary: Delete tenant (soft delete)
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant deactivated successfully
 *       404:
 *         description: Tenant not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.delete('/tenants/:tenant',
  
  SuperAdminTenantsController.deleteTenant
);

/**
 * @swagger
 * /api/admin/tenants/{tenant}/status:
 *   patch:
 *     summary: Update tenant status
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Tenant status updated successfully
 *       404:
 *         description: Tenant not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.patch('/tenants/:tenant/status',
  
  SuperAdminTenantsController.updateStatus
);

/**
 * @swagger
 * /api/admin/tenants/{tenant}/stats:
 *   get:
 *     summary: Get tenant statistics
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant statistics retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/tenants/:tenant/stats',
  
  SuperAdminTenantsController.getTenantStats
);

/**
 * @swagger
 * /api/admin/tenants/{tenant}/location-data:
 *   get:
 *     summary: Get tenant location data
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Location data retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/tenants/:tenant/location-data',
  
  SuperAdminTenantsController.getLocationData
);

/**
 * @swagger
 * /api/admin/tenants/{tenant}/users:
 *   get:
 *     summary: Get all users for a specific tenant
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 15
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: role_id
 *         schema:
 *           type: string
 *         description: Filter by role
 *     responses:
 *       200:
 *         description: Tenant users retrieved successfully
 *       404:
 *         description: Tenant not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/tenants/:tenant/users',
  
  SuperAdminTenantsController.getTenantUsers
);

// ===== USER MANAGEMENT ROUTES =====

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users across all tenants
 *     tags: [Super Admin - Users]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 15
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Filter by tenant
 *       - in: query
 *         name: role_id
 *         schema:
 *           type: string
 *         description: Filter by role
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/users',
  
  SuperAdminUsersController.getAllUsers
);

/**
 * @swagger
 * /api/admin/users/{user}:
 *   get:
 *     summary: Get specific user details
 *     tags: [Super Admin - Users]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *       404:
 *         description: User not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/users/:user',
  
  SuperAdminUsersController.getUserById
);

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Create new user
 *     tags: [Super Admin - Users]
 *     security:
 *       - SuperAdminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - full_name
 *               - customer_id
 *             properties:
 *               email:
 *                 type: string
 *               full_name:
 *                 type: string
 *               phone:
 *                 type: string
 *               customer_id:
 *                 type: string
 *               role_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               is_active:
 *                 type: boolean
 *               auth0_id:
 *                 type: string
 *               custom_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.post('/users',
  
  SuperAdminUsersController.createUser
);

/**
 * @swagger
 * /api/admin/users/{user}:
 *   put:
 *     summary: Update user
 *     tags: [Super Admin - Users]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.put('/users/:user',
  
  SuperAdminUsersController.updateUser
);

/**
 * @swagger
 * /api/admin/users/{user}:
 *   delete:
 *     summary: Delete user (soft delete)
 *     tags: [Super Admin - Users]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: user
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deactivated successfully
 *       404:
 *         description: User not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.delete('/users/:user',
  
  SuperAdminUsersController.deleteUser
);

/**
 * @swagger
 * /api/admin/users/tenants:
 *   get:
 *     summary: Get tenants for user creation dropdown
 *     tags: [Super Admin - Users]
 *     security:
 *       - SuperAdminAuth: []
 *     responses:
 *       200:
 *         description: Tenants retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/users/tenants',
  
  SuperAdminUsersController.getTenants
);

/**
 * @swagger
 * /api/admin/users/roles:
 *   get:
 *     summary: Get roles for user creation dropdown
 *     tags: [Super Admin - Users]
 *     security:
 *       - SuperAdminAuth: []
 *     responses:
 *       200:
 *         description: Roles retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/users/roles',
  
  SuperAdminUsersController.getRoles
);

// ===== ROLE MANAGEMENT ROUTES =====

/**
 * @swagger
 * /api/admin/roles:
 *   get:
 *     summary: Get all roles with permissions
 *     tags: [Super Admin - Roles]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or description
 *     responses:
 *       200:
 *         description: Roles retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/roles',
  
  SuperAdminRolesController.getAllRoles
);

/**
 * @swagger
 * /api/admin/roles:
 *   post:
 *     summary: Create new role
 *     tags: [Super Admin - Roles]
 *     security:
 *       - SuperAdminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               document_type:
 *                 type: string
 *               engineering_discipline:
 *                 type: string
 *               permissions:
 *                 type: array
 *     responses:
 *       201:
 *         description: Role created successfully
 *       422:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.post('/roles',
  
  SuperAdminRolesController.createRole
);

/**
 * @swagger
 * /api/admin/roles/{role}:
 *   get:
 *     summary: Get specific role details
 *     tags: [Super Admin - Roles]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *     responses:
 *       200:
 *         description: Role details retrieved successfully
 *       404:
 *         description: Role not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/roles/:role',
  
  SuperAdminRolesController.getRoleById
);

/**
 * @swagger
 * /api/admin/roles/{role}:
 *   put:
 *     summary: Update role
 *     tags: [Super Admin - Roles]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               document_type:
 *                 type: string
 *               engineering_discipline:
 *                 type: string
 *               permissions:
 *                 type: array
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       404:
 *         description: Role not found
 *       422:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.put('/roles/:role',
  
  SuperAdminRolesController.updateRole
);

/**
 * @swagger
 * /api/admin/roles/{role}:
 *   delete:
 *     summary: Delete role (soft delete)
 *     tags: [Super Admin - Roles]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *     responses:
 *       200:
 *         description: Role deactivated successfully
 *       400:
 *         description: Role has users assigned
 *       404:
 *         description: Role not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.delete('/roles/:role',
  
  SuperAdminRolesController.deleteRole
);

/**
 * @swagger
 * /api/admin/roles/permissions/available:
 *   get:
 *     summary: Get available permissions
 *     tags: [Super Admin - Roles]
 *     security:
 *       - SuperAdminAuth: []
 *     responses:
 *       200:
 *         description: Available permissions retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/roles/permissions/available',
  
  SuperAdminRolesController.getAvailablePermissions
);

/**
 * @swagger
 * /api/admin/roles/assign:
 *   post:
 *     summary: Assign role to user
 *     tags: [Super Admin - Roles]
 *     security:
 *       - SuperAdminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - role_id
 *             properties:
 *               user_id:
 *                 type: string
 *               role_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Role assigned successfully
 *       400:
 *         description: User already has this role
 *       404:
 *         description: User or role not found
 *       422:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.post('/roles/assign',
  
  SuperAdminRolesController.assignRole
);

/**
 * @swagger
 * /api/admin/roles/remove:
 *   delete:
 *     summary: Remove role from user
 *     tags: [Super Admin - Roles]
 *     security:
 *       - SuperAdminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - role_id
 *             properties:
 *               user_id:
 *                 type: string
 *               role_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Role removed successfully
 *       400:
 *         description: User does not have this role
 *       404:
 *         description: User or role not found
 *       422:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.delete('/roles/remove',
  
  SuperAdminRolesController.removeRole
);

// ===== PLANS MANAGEMENT ROUTES =====

/**
 * @swagger
 * /api/admin/plans:
 *   get:
 *     summary: Get all plans
 *     tags: [Super Admin - Plans]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 15
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or description
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Plans retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/plans',
  
  SuperAdminPlansController.getAllPlans
);

/**
 * @swagger
 * /api/admin/plans/{plan}:
 *   get:
 *     summary: Get specific plan details
 *     tags: [Super Admin - Plans]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: plan
 *         required: true
 *         schema:
 *           type: string
 *         description: Plan ID
 *     responses:
 *       200:
 *         description: Plan details retrieved successfully
 *       404:
 *         description: Plan not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/plans/:plan',
  
  SuperAdminPlansController.getPlanById
);

/**
 * @swagger
 * /api/admin/plans:
 *   post:
 *     summary: Create new plan
 *     tags: [Super Admin - Plans]
 *     security:
 *       - SuperAdminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - billing_cycle
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               billing_cycle:
 *                 type: string
 *                 enum: [monthly, quarterly, yearly]
 *               currency:
 *                 type: string
 *                 default: AUD
 *               features:
 *                 type: object
 *               is_active:
 *                 type: boolean
 *               is_popular:
 *                 type: boolean
 *               sort_order:
 *                 type: number
 *     responses:
 *       201:
 *         description: Plan created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.post('/plans',
  
  SuperAdminPlansController.createPlan
);

/**
 * @swagger
 * /api/admin/plans/{plan}:
 *   put:
 *     summary: Update plan
 *     tags: [Super Admin - Plans]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: plan
 *         required: true
 *         schema:
 *           type: string
 *         description: Plan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Plan updated successfully
 *       404:
 *         description: Plan not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.put('/plans/:plan',
  
  SuperAdminPlansController.updatePlan
);

/**
 * @swagger
 * /api/admin/plans/{plan}:
 *   delete:
 *     summary: Delete plan (soft delete)
 *     tags: [Super Admin - Plans]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: plan
 *         required: true
 *         schema:
 *           type: string
 *         description: Plan ID
 *     responses:
 *       200:
 *         description: Plan deactivated successfully
 *       400:
 *         description: Plan has active subscriptions
 *       404:
 *         description: Plan not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.delete('/plans/:plan',
  
  SuperAdminPlansController.deletePlan
);

// ===== SUBSCRIPTIONS MANAGEMENT ROUTES =====

/**
 * @swagger
 * /api/admin/subscriptions:
 *   get:
 *     summary: Get all subscriptions
 *     tags: [Super Admin - Subscriptions]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 15
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, suspended, cancelled, trial]
 *         description: Filter by status
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Filter by tenant
 *       - in: query
 *         name: plan_id
 *         schema:
 *           type: string
 *         description: Filter by plan
 *     responses:
 *       200:
 *         description: Subscriptions retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.get('/subscriptions',
  
  SuperAdminTenantsController.getSubscriptions
);

/**
 * @swagger
 * /api/admin/tenants/{tenant}/subscribe:
 *   post:
 *     summary: Subscribe tenant to plan
 *     tags: [Super Admin - Subscriptions]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: tenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan_id
 *             properties:
 *               plan_id:
 *                 type: string
 *               start_date:
 *                 type: string
 *                 format: date
 *               end_date:
 *                 type: string
 *                 format: date
 *               is_trial:
 *                 type: boolean
 *               trial_days:
 *                 type: number
 *               auto_renew:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Subscription created successfully
 *       400:
 *         description: Invalid input data or tenant already subscribed
 *       404:
 *         description: Tenant or plan not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.post('/tenants/:tenant/subscribe',
  
  SuperAdminTenantsController.subscribe
);

/**
 * @swagger
 * /api/admin/subscription/{subscription}/status:
 *   patch:
 *     summary: Update subscription status
 *     tags: [Super Admin - Subscriptions]
 *     security:
 *       - SuperAdminAuth: []
 *     parameters:
 *       - in: path
 *         name: subscription
 *         required: true
 *         schema:
 *           type: string
 *         description: Subscription ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended, cancelled, trial]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscription status updated successfully
 *       404:
 *         description: Subscription not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin privileges required
 *       500:
 *         description: Server error
 */
router.patch('/subscription/:id/status',
  
  SuperAdminTenantsController.updateSubscriptionStatus
);

module.exports = router;
