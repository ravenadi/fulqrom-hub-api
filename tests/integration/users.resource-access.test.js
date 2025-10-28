const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Role = require('../../models/Role');

// Mock auth middleware for testing - export as default function
jest.mock('../../middleware/authMiddleware', () => {
  return (req, res, next) => {
    req.user = {
      sub: 'test-user-id',
      id: 'test-user-id',
      _id: 'test-user-id'
    };
    req.tenant = { tenantId: 'test-tenant-id', bypassTenant: false };
    next();
  };
});

// Mock authorization middleware
jest.mock('../../middleware/authorizationMiddleware', () => {
  return (req, res, next) => {
    next();
  };
});

// Mock tenant context middleware
jest.mock('../../middleware/tenantContext', () => ({
  tenantContext: (req, res, next) => {
    req.tenant = req.tenant || { tenantId: 'test-tenant-id', bypassTenant: false };
    next();
  }
}));

// Mock authorization rules middleware
jest.mock('../../middleware/authorizationRules', () => ({
  validateUserCreation: (req, res, next) => next(),
  validateUserElevation: (req, res, next) => next(),
  getAccessibleResources: jest.fn(),
  applyScopeFiltering: (scope) => (req, res, next) => next()
}));

describe('User Resource Access API', () => {
  let app;
  let testUser;
  let testTenantId;

  beforeAll(() => {
    // Import app after mocks are set up
    app = require('../../server');
    // Create a valid ObjectId for tenant
    testTenantId = new mongoose.Types.ObjectId();
  });

  beforeEach(async () => {
    // Create a test user
    testUser = await User.create({
      email: `test-${Date.now()}@example.com`,
      full_name: 'Test User',
      role_ids: [],
      resource_access: [],
      is_active: true,
      tenant_id: testTenantId
    });
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({ email: /^test-.*@example\.com$/ });
  });

  describe('POST /api/users/resource-access', () => {
    it('should add resource access to user', async () => {
      const resourceAccessData = {
        user_id: testUser._id.toString(),
        resource_type: 'building',
        resource_id: 'building-123',
        resource_name: 'Test Building',
        permissions: {
          can_view: true,
          can_create: false,
          can_edit: true,
          can_delete: false
        },
        granted_by: 'admin'
      };

      const response = await request(app)
        .post('/api/users/resource-access')
        .send(resourceAccessData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('granted successfully');
      expect(response.body.data).toMatchObject({
        resource_type: 'building',
        resource_id: 'building-123',
        permissions: {
          can_view: true,
          can_edit: true
        }
      });

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.resource_access).toHaveLength(1);
      expect(updatedUser.resource_access[0].resource_type).toBe('building');
    });

    it('should add document category access', async () => {
      const documentAccessData = {
        user_id: testUser._id.toString(),
        resource_type: 'document_category',
        resource_id: 'Technical',
        resource_name: 'Technical Documents',
        permissions: {
          can_view: true,
          can_create: false,
          can_edit: false,
          can_delete: false
        }
      };

      const response = await request(app)
        .post('/api/users/resource-access')
        .send(documentAccessData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.resource_access).toHaveLength(1);
      expect(updatedUser.resource_access[0].resource_type).toBe('document_category');
      expect(updatedUser.resource_access[0].resource_id).toBe('Technical');
    });

    it('should add document discipline access', async () => {
      const disciplineAccessData = {
        user_id: testUser._id.toString(),
        resource_type: 'document_discipline',
        resource_id: 'HVAC',
        resource_name: 'HVAC Documents',
        permissions: {
          can_view: true,
          can_edit: true,
          can_create: false,
          can_delete: false
        }
      };

      const response = await request(app)
        .post('/api/users/resource-access')
        .send(disciplineAccessData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.resource_access).toHaveLength(1);
      expect(updatedUser.resource_access[0].resource_type).toBe('document_discipline');
      expect(updatedUser.resource_access[0].resource_id).toBe('HVAC');
    });

    it('should reject duplicate resource access', async () => {
      // Add initial access
      await request(app)
        .post('/api/users/resource-access')
        .send({
          user_id: testUser._id.toString(),
          resource_type: 'building',
          resource_id: 'building-123',
          permissions: { can_view: true }
        });

      // Try to add duplicate
      const response = await request(app)
        .post('/api/users/resource-access')
        .send({
          user_id: testUser._id.toString(),
          resource_type: 'building',
          resource_id: 'building-123',
          permissions: { can_view: true }
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already granted');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/users/resource-access')
        .send({
          resource_type: 'building',
          // Missing user_id and resource_id
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });

    it('should validate resource_type', async () => {
      const response = await request(app)
        .post('/api/users/resource-access')
        .send({
          user_id: testUser._id.toString(),
          resource_type: 'invalid_type',
          resource_id: 'test-123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid resource_type');
    });
  });

  describe('GET /api/users/:id/resource-access', () => {
    beforeEach(async () => {
      // Add some resource access entries
      testUser.resource_access = [
        {
          resource_type: 'building',
          resource_id: 'building-1',
          resource_name: 'Building One',
          permissions: { can_view: true, can_edit: false, can_create: false, can_delete: false }
        },
        {
          resource_type: 'document_category',
          resource_id: 'Technical',
          resource_name: 'Technical Docs',
          permissions: { can_view: true, can_edit: false, can_create: false, can_delete: false }
        }
      ];
      await testUser.save();
    });

    it('should get all resource access for user', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser._id}/resource-access`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('resource_type');
      expect(response.body.data[0]).toHaveProperty('permissions');
    });
  });

  describe('DELETE /api/users/resource-access/:id', () => {
    let accessId;

    beforeEach(async () => {
      // Add resource access
      testUser.resource_access = [{
        resource_type: 'building',
        resource_id: 'building-1',
        permissions: { can_view: true, can_edit: false, can_create: false, can_delete: false }
      }];
      await testUser.save();

      const user = await User.findById(testUser._id);
      accessId = user.resource_access[0]._id.toString();
    });

    it('should remove resource access', async () => {
      const response = await request(app)
        .delete(`/api/users/resource-access/${accessId}`)
        .query({ user_id: testUser._id.toString() })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('removed successfully');

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.resource_access).toHaveLength(0);
    });

    it('should require user_id query parameter', async () => {
      const response = await request(app)
        .delete(`/api/users/resource-access/${accessId}`)
        // Missing user_id query param
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('user_id query parameter is required');
    });
  });

  describe('PUT /api/users/:id - Role Assignment', () => {
    let testRole;

    beforeEach(async () => {
      // Use existing role or create one
      testRole = await Role.findOne({ name: 'Contractor' });

      if (!testRole) {
        testRole = await Role.create({
          name: 'Contractor',
          description: 'Contractor role for testing',
          permissions: [
            { entity: 'buildings', view: true, create: false, edit: false, delete: false }
          ],
          is_active: true
        });
      }
    });

    it('should update user role_ids', async () => {
      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send({
          role_ids: [testRole._id.toString()]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.role_ids).toHaveLength(1);

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.role_ids).toHaveLength(1);
      expect(updatedUser.role_ids[0].toString()).toBe(testRole._id.toString());
    });

    it('should support multiple roles', async () => {
      let testRole2 = await Role.findOne({ name: 'Building Manager' });

      if (!testRole2) {
        testRole2 = await Role.create({
          name: 'Building Manager',
          description: 'Building Manager for testing',
          permissions: [],
          is_active: true
        });
      }

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send({
          role_ids: [testRole._id.toString(), testRole2._id.toString()]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.role_ids).toHaveLength(2);
    });
  });
});

describe('User Model - resource_access field', () => {
  it('should allow adding resource_access entries', async () => {
    const testTenantId = new mongoose.Types.ObjectId();
    const user = new User({
      email: 'model-test@example.com',
      full_name: 'Model Test',
      tenant_id: testTenantId,
      resource_access: [
        {
          resource_type: 'building',
          resource_id: 'b-1',
          permissions: { can_view: true, can_edit: false, can_create: false, can_delete: false }
        }
      ]
    });

    await user.save();

    const savedUser = await User.findById(user._id);
    expect(savedUser.resource_access).toHaveLength(1);
    expect(savedUser.resource_access[0].resource_type).toBe('building');
    expect(savedUser.resource_access[0].permissions.can_view).toBe(true);

    await User.deleteOne({ _id: user._id });
  });

  it('should generate _id for each resource_access entry', async () => {
    const testTenantId = new mongoose.Types.ObjectId();
    const user = new User({
      email: 'id-test@example.com',
      full_name: 'ID Test',
      tenant_id: testTenantId,
      resource_access: [
        { resource_type: 'building', resource_id: 'b-1', permissions: { can_view: true } }
      ]
    });

    await user.save();

    const savedUser = await User.findById(user._id);
    expect(savedUser.resource_access[0]._id).toBeDefined();
    expect(mongoose.Types.ObjectId.isValid(savedUser.resource_access[0]._id)).toBe(true);

    await User.deleteOne({ _id: user._id });
  });
});
