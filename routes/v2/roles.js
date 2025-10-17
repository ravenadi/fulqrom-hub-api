const express = require('express');
const {
  getAllRoles,
  getRoleById,
  getRoleByName,
  initializePredefinedRoles,
  getPermissionsMatrix
} = require('../../controllers/v2/rolesController');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     RoleV2:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         _id:
 *           type: string
 *           description: The auto-generated id of the role
 *         name:
 *           type: string
 *           enum: [Admin, Property Manager, Building Manager, Contractor, Tenants]
 *           description: The name of the role
 *         description:
 *           type: string
 *           description: Description of the role
 *         is_active:
 *           type: boolean
 *           description: Whether the role is active
 *         permissions:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               entity:
 *                 type: string
 *                 enum: [org, sites, buildings, floors, tenants, documents, assets, vendors, customers, users, analytics]
 *               view:
 *                 type: boolean
 *               create:
 *                 type: boolean
 *               edit:
 *                 type: boolean
 *               delete:
 *                 type: boolean
 *         user_count:
 *           type: number
 *           description: Number of users assigned to this role
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/v2/roles:
 *   get:
 *     summary: Get all predefined roles
 *     tags: [Roles V2]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of roles per page
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Roles fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 count:
 *                   type: number
 *                 total:
 *                   type: number
 *                 page:
 *                   type: number
 *                 pages:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RoleV2'
 *       500:
 *         description: Server error
 */
router.get('/', getAllRoles);

/**
 * @swagger
 * /api/v2/roles/{id}:
 *   get:
 *     summary: Get role by ID
 *     tags: [Roles V2]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *     responses:
 *       200:
 *         description: Role fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/RoleV2'
 *       400:
 *         description: Invalid role ID format
 *       404:
 *         description: Role not found
 *       500:
 *         description: Server error
 */
router.get('/:id', getRoleById);

/**
 * @swagger
 * /api/v2/roles/name/{name}:
 *   get:
 *     summary: Get role by name
 *     tags: [Roles V2]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Admin, Property Manager, Building Manager, Contractor, Tenants]
 *         description: Role name
 *     responses:
 *       200:
 *         description: Role fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/RoleV2'
 *       404:
 *         description: Role not found
 *       500:
 *         description: Server error
 */
router.get('/name/:name', getRoleByName);

/**
 * @swagger
 * /api/v2/roles/initialize:
 *   post:
 *     summary: Initialize predefined roles (Admin only)
 *     tags: [Roles V2]
 *     responses:
 *       200:
 *         description: Predefined roles initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.post('/initialize', initializePredefinedRoles);

/**
 * @swagger
 * /api/v2/roles/permissions/matrix:
 *   get:
 *     summary: Get permissions matrix for all roles
 *     tags: [Roles V2]
 *     responses:
 *       200:
 *         description: Permissions matrix fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     entities:
 *                       type: array
 *                       items:
 *                         type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     matrix:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           role_name:
 *                             type: string
 *                           role_description:
 *                             type: string
 *                           permissions:
 *                             type: object
 *       500:
 *         description: Server error
 */
router.get('/permissions/matrix', getPermissionsMatrix);

module.exports = router;
