const express = require('express');
const { validateUserCreation, validateUserElevation } = require('../middleware/authorizationRules');

// Import controller for refactored endpoints
const userController = require('../controllers/userController');

const router = express.Router();

// GET /api/users/:id/accessible-resources - Get resources accessible to user for assignment (Rule 1)
// Refactored to use userController (Phase 2 - Clean Architecture)
router.get('/:id/accessible-resources', userController.getAccessibleResources);

// GET /api/users - Get all users with roles
// Refactored to use userController (Phase 2 - Clean Architecture)
router.get('/', userController.list);


// GET /api/users/:id - Get user by ID
// Refactored to use userController (Phase 2 - Clean Architecture)
router.get('/:id', userController.getById);

// POST /api/users - Create user
// Refactored to use userController (Phase 2 - Clean Architecture)
router.post('/', validateUserCreation, userController.create);

// PUT /api/users/:id - Update user
// Refactored to use userController (Phase 2 - Clean Architecture)
router.put('/:id', validateUserElevation, userController.update);

// DELETE /api/users/:id - Delete user
// Refactored to use userController (Phase 2 - Clean Architecture)
router.delete('/:id', userController.remove);

// POST /api/users/:id/resend-invite - Resend invite email to existing user
// Refactored to use userController (Phase 2 - Clean Architecture)
router.post('/:id/resend-invite', userController.resendInvite);

// POST /api/users/:id/deactivate - Deactivate user
// Refactored to use userController (Phase 2 - Clean Architecture)
router.post('/:id/deactivate', userController.deactivate);

// DELETE /api/users/:id/mfa - Reset MFA for a user
// Refactored to use userController (Phase 2 - Clean Architecture)
router.delete('/:id/mfa', userController.resetMfa);

// GET /api/users/:id/resource-access - Get user resource access
// Refactored to use userController (Phase 2 - Clean Architecture)
router.get('/:id/resource-access', userController.getResourceAccess);

// POST /api/users/resource-access - Assign resource access with permissions
// Refactored to use userController (Phase 2 - Clean Architecture)
router.post('/resource-access', userController.assignResourceAccess);

// DELETE /api/users/resource-access/:id - Remove resource access
// Refactored to use userController (Phase 2 - Clean Architecture)
router.delete('/resource-access/:id', userController.removeResourceAccess);



module.exports = router;
