const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Role = require('../../models/Role');
const Document = require('../../models/Document');

// Mock auth middleware for testing
jest.mock('../../middleware/authMiddleware', () => {
  return (req, res, next) => {
    req.user = {
      sub: 'auth0|68f75211ba083f472efdbaf7',
      id: '68f75211ab9d0946c112721e',
      _id: '68f75211ab9d0946c112721e',
      email: 'test@example.com',
      full_name: 'Test User',
      role_ids: [],
      resource_access: [],
      document_categories: [],
      engineering_disciplines: [],
      is_active: true,
      tenant_id: '68f7d0db3c5ae331c086199c'
    };
    req.tenant = { tenantId: '68f7d0db3c5ae331c086199c', bypassTenant: false };
    next();
  };
});

// Mock authorization middleware
jest.mock('../../middleware/authorizationRules', () => ({
  validateUserCreation: (req, res, next) => next(),
  validateUserElevation: (req, res, next) => next(),
  getAccessibleResources: jest.fn(),
  applyScopeFiltering: (scope) => (req, res, next) => {
    // Mock document filtering based on user permissions
    if (scope === 'document') {
      req.documentFilters = {
        hasFullAccess: false,
        allowedCategories: req.user.document_categories || [],
        allowedDisciplines: req.user.engineering_disciplines || [],
        categoryPermissions: [],
        disciplinePermissions: [],
        userDocumentCategories: req.user.document_categories || [],
        userEngineeringDisciplines: req.user.engineering_disciplines || []
      };
    }
    next();
  }
}));

// Mock tenant context middleware
jest.mock('../../middleware/tenantContext', () => ({
  tenantContext: (req, res, next) => {
    req.tenant = req.tenant || { tenantId: '68f7d0db3c5ae331c086199c', bypassTenant: false };
    next();
  }
}));

describe('Permission System Integration Tests', () => {
  let app;
  let testUser;
  let testRole;
  let testTenantId;
  let testDocuments = [];

  beforeAll(() => {
    app = require('../../server');
    testTenantId = new mongoose.Types.ObjectId('68f7d0db3c5ae331c086199c');
  });

  beforeEach(async () => {
    // Create test role with documents permission
    testRole = await Role.create({
      name: 'Building Manager',
      description: 'Building Manager role for testing',
      permissions: [
        { entity: 'documents', view: true, create: true, edit: true, delete: true },
        { entity: 'sites', view: true, create: true, edit: true, delete: false },
        { entity: 'buildings', view: true, create: true, edit: true, delete: false }
      ],
      is_active: true,
      tenant_id: testTenantId
    });

    // Create test user
    testUser = await User.create({
      email: `test-${Date.now()}@example.com`,
      full_name: 'Test User',
      role_ids: [testRole._id],
      resource_access: [],
      document_categories: ['Asset Registers', 'Compliance Documents', 'Building Management & Control Diagrams'],
      engineering_disciplines: ['Civil', 'Electrical'],
      is_active: true,
      tenant_id: testTenantId,
      auth0_id: 'auth0|68f75211ba083f472efdbaf7'
    });

    // Create test documents
    testDocuments = await Document.create([
      {
        name: 'Test Asset Register',
        category: 'Asset Registers',
        engineering_discipline: 'Civil',
        type: 'PDF',
        status: 'Draft',
        tenant_id: testTenantId,
        customer: { customer_id: '68d3929ae4c5d9b3e920a9df', customer_name: 'Test Customer' }
      },
      {
        name: 'Test Compliance Doc',
        category: 'Compliance Documents',
        engineering_discipline: 'Electrical',
        type: 'PDF',
        status: 'Draft',
        tenant_id: testTenantId,
        customer: { customer_id: '68d3929ae4c5d9b3e920a9df', customer_name: 'Test Customer' }
      },
      {
        name: 'Test Building Management',
        category: 'Building Management & Control Diagrams',
        engineering_discipline: 'Civil',
        type: 'PDF',
        status: 'Draft',
        tenant_id: testTenantId,
        customer: { customer_id: '68d3929ae4c5d9b3e920a9df', customer_name: 'Test Customer' }
      },
      {
        name: 'Test Restricted Doc',
        category: 'Restricted Category',
        engineering_discipline: 'Mechanical',
        type: 'PDF',
        status: 'Draft',
        tenant_id: testTenantId,
        customer: { customer_id: '68d3929ae4c5d9b3e920a9df', customer_name: 'Test Customer' }
      }
    ]);
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({ email: /^test-.*@example\.com$/ });
    await Role.deleteMany({ name: 'Building Manager' });
    await Document.deleteMany({ name: /^Test / });
  });

  describe('POST /api/users - User Creation with Permissions', () => {
    it('should create user with resource_access', async () => {
      const userData = {
        email: 'newuser@example.com',
        full_name: 'New User',
        role_ids: [testRole._id.toString()],
        resource_access: [{
          resource_type: 'customer',
          resource_id: '68d3929ae4c5d9b3e920a9df',
          permissions: {
            can_view: true,
            can_create: false,
            can_edit: false,
            can_delete: false
          },
          granted_by: 'admin'
        }],
        document_categories: ['Asset Registers', 'Compliance Documents'],
        engineering_disciplines: ['Civil', 'Electrical']
      };

      const response = await request(app)
        .post('/api/users')
        .send(userData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.resource_access).toHaveLength(1);
      expect(response.body.data.resource_access[0].resource_type).toBe('customer');
      expect(response.body.data.document_categories).toEqual(['Asset Registers', 'Compliance Documents']);
      expect(response.body.data.engineering_disciplines).toEqual(['Civil', 'Electrical']);

      // Verify in database
      const createdUser = await User.findOne({ email: 'newuser@example.com' });
      expect(createdUser.resource_access).toHaveLength(1);
      expect(createdUser.document_categories).toEqual(['Asset Registers', 'Compliance Documents']);
      expect(createdUser.engineering_disciplines).toEqual(['Civil', 'Electrical']);
    });

    it('should validate resource_access structure', async () => {
      const userData = {
        email: 'invalid@example.com',
        full_name: 'Invalid User',
        role_ids: [testRole._id.toString()],
        resource_access: [{
          resource_type: 'customer',
          // Missing resource_id and permissions
          granted_by: 'admin'
        }]
      };

      const response = await request(app)
        .post('/api/users')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('resource_id');
    });

    it('should validate document_categories as array', async () => {
      const userData = {
        email: 'invalid-categories@example.com',
        full_name: 'Invalid Categories User',
        role_ids: [testRole._id.toString()],
        document_categories: 'not-an-array' // Should be array
      };

      const response = await request(app)
        .post('/api/users')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('array');
    });
  });

  describe('PUT /api/users/:id - User Updates with Permissions', () => {
    it('should update resource_access with replace flag', async () => {
      const updateData = {
        resource_access: [{
          resource_type: 'site',
          resource_id: '68fc5e629b51eb0f7ed7f7a4',
          permissions: {
            can_view: true,
            can_create: false,
            can_edit: true,
            can_delete: false
          },
          granted_by: 'admin'
        }],
        replace_resource_access: true
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.resource_access).toHaveLength(1);
      expect(response.body.data.resource_access[0].resource_type).toBe('site');

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.resource_access).toHaveLength(1);
      expect(updatedUser.resource_access[0].resource_type).toBe('site');
    });

    it('should append resource_access without replace flag', async () => {
      // First add some initial resource access
      testUser.resource_access = [{
        resource_type: 'customer',
        resource_id: '68d3929ae4c5d9b3e920a9df',
        permissions: { can_view: true, can_create: false, can_edit: false, can_delete: false },
        granted_at: new Date(),
        granted_by: 'admin'
      }];
      await testUser.save();

      const updateData = {
        resource_access: [{
          resource_type: 'building',
          resource_id: '68fc5f459b51eb0f7ed7f89f',
          permissions: {
            can_view: true,
            can_create: false,
            can_edit: false,
            can_delete: false
          },
          granted_by: 'admin'
        }],
        replace_resource_access: false
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.resource_access).toHaveLength(2);

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.resource_access).toHaveLength(2);
    });

    it('should update document_categories', async () => {
      const updateData = {
        document_categories: ['Updated Category 1', 'Updated Category 2', 'New Category']
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.document_categories).toEqual(['Updated Category 1', 'Updated Category 2', 'New Category']);

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.document_categories).toEqual(['Updated Category 1', 'Updated Category 2', 'New Category']);
    });

    it('should update engineering_disciplines', async () => {
      const updateData = {
        engineering_disciplines: ['Updated Civil', 'New Mechanical', 'Environmental']
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.engineering_disciplines).toEqual(['Updated Civil', 'New Mechanical', 'Environmental']);

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.engineering_disciplines).toEqual(['Updated Civil', 'New Mechanical', 'Environmental']);
    });

    it('should trim and filter empty document categories', async () => {
      const updateData = {
        document_categories: ['  Valid Category  ', '', '   ', 'Another Valid Category']
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.document_categories).toEqual(['Valid Category', 'Another Valid Category']);

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.document_categories).toEqual(['Valid Category', 'Another Valid Category']);
    });
  });

  describe('POST /api/users/resource-access - Resource Access Management', () => {
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
        },
        granted_by: 'admin'
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

    it('should reject duplicate resource access', async () => {
      // Add initial access
      await request(app)
        .post('/api/users/resource-access')
        .send({
          user_id: testUser._id.toString(),
          resource_type: 'building',
          resource_id: 'building-123',
          permissions: { can_view: true },
          granted_by: 'admin'
        });

      // Try to add duplicate
      const response = await request(app)
        .post('/api/users/resource-access')
        .send({
          user_id: testUser._id.toString(),
          resource_type: 'building',
          resource_id: 'building-123',
          permissions: { can_view: true },
          granted_by: 'admin'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already granted');
    });
  });

  describe('GET /api/documents - Document Access Control', () => {
    beforeEach(() => {
      // Update mock user with test user data
      const authMiddleware = require('../../middleware/authMiddleware');
      jest.doMock('../../middleware/authMiddleware', () => {
        return (req, res, next) => {
          req.user = {
            sub: 'auth0|68f75211ba083f472efdbaf7',
            id: testUser._id.toString(),
            _id: testUser._id,
            email: testUser.email,
            full_name: testUser.full_name,
            role_ids: testUser.role_ids,
            resource_access: testUser.resource_access,
            document_categories: testUser.document_categories,
            engineering_disciplines: testUser.engineering_disciplines,
            is_active: testUser.is_active,
            tenant_id: testUser.tenant_id
          };
          req.tenant = { tenantId: testUser.tenant_id, bypassTenant: false };
          next();
        };
      });
    });

    it('should return documents filtered by user document_categories', async () => {
      const response = await request(app)
        .get('/api/documents?page=1&limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      
      // Should only return documents with categories the user has access to
      const returnedCategories = response.body.data.map(doc => doc.category);
      const allowedCategories = testUser.document_categories;
      
      returnedCategories.forEach(category => {
        expect(allowedCategories).toContain(category);
      });
    });

    it('should not return documents with restricted categories', async () => {
      const response = await request(app)
        .get('/api/documents?page=1&limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Should not return documents with 'Restricted Category'
      const restrictedDocs = response.body.data.filter(doc => 
        doc.category === 'Restricted Category'
      );
      expect(restrictedDocs).toHaveLength(0);
    });

    it('should return documents filtered by engineering disciplines', async () => {
      const response = await request(app)
        .get('/api/documents?page=1&limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Should only return documents with disciplines the user has access to
      const returnedDisciplines = response.body.data.map(doc => doc.engineering_discipline);
      const allowedDisciplines = testUser.engineering_disciplines;
      
      returnedDisciplines.forEach(discipline => {
        if (discipline) { // Some docs might not have discipline
          expect(allowedDisciplines).toContain(discipline);
        }
      });
    });
  });

  describe('Authorization Field Name Consistency', () => {
    it('should use correct field names in role permissions', async () => {
      const role = await Role.findById(testRole._id);
      
      // Verify role uses 'entity' field (not 'module_name')
      expect(role.permissions[0]).toHaveProperty('entity');
      expect(role.permissions[0]).not.toHaveProperty('module_name');
      
      // Verify role uses 'view' field (not 'can_view')
      expect(role.permissions[0]).toHaveProperty('view');
      expect(role.permissions[0]).not.toHaveProperty('can_view');
    });

    it('should use correct field names in resource access', async () => {
      // Add resource access
      testUser.resource_access = [{
        resource_type: 'customer',
        resource_id: '68d3929ae4c5d9b3e920a9df',
        permissions: {
          can_view: true,
          can_create: false,
          can_edit: false,
          can_delete: false
        },
        granted_at: new Date(),
        granted_by: 'admin'
      }];
      await testUser.save();

      const user = await User.findById(testUser._id);
      
      // Verify resource access uses 'can_view' field (not 'view')
      expect(user.resource_access[0].permissions).toHaveProperty('can_view');
      expect(user.resource_access[0].permissions).not.toHaveProperty('view');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty document_categories array', async () => {
      const updateData = {
        document_categories: []
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.document_categories).toEqual([]);
    });

    it('should handle null resource_access gracefully', async () => {
      const updateData = {
        resource_access: null
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('array');
    });

    it('should validate resource_type in resource_access', async () => {
      const updateData = {
        resource_access: [{
          resource_type: 'invalid_type',
          resource_id: 'test-123',
          permissions: { can_view: true },
          granted_by: 'admin'
        }]
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('resource_type');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large resource_access arrays efficiently', async () => {
      const largeResourceAccess = Array.from({ length: 100 }, (_, i) => ({
        resource_type: 'building',
        resource_id: `building-${i}`,
        permissions: { can_view: true, can_create: false, can_edit: false, can_delete: false },
        granted_by: 'admin'
      }));

      const updateData = {
        resource_access: largeResourceAccess,
        replace_resource_access: true
      };

      const startTime = Date.now();
      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send(updateData)
        .expect(200);
      const endTime = Date.now();

      expect(response.body.success).toBe(true);
      expect(response.body.data.resource_access).toHaveLength(100);
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
    });

    it('should handle large document_categories arrays', async () => {
      const largeCategories = Array.from({ length: 50 }, (_, i) => `Category ${i}`);

      const updateData = {
        document_categories: largeCategories
      };

      const response = await request(app)
        .put(`/api/users/${testUser._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.document_categories).toHaveLength(50);
    });
  });
});

describe('Permission System Model Tests', () => {
  let testTenantId;

  beforeAll(() => {
    testTenantId = new mongoose.Types.ObjectId('68f7d0db3c5ae331c086199c');
  });

  describe('User Model - New Fields', () => {
    it('should allow adding document_categories field', async () => {
      const user = new User({
        email: 'model-test@example.com',
        full_name: 'Model Test',
        tenant_id: testTenantId,
        document_categories: ['Asset Registers', 'Compliance Documents'],
        engineering_disciplines: ['Civil', 'Electrical']
      });

      await user.save();

      const savedUser = await User.findById(user._id);
      expect(savedUser.document_categories).toEqual(['Asset Registers', 'Compliance Documents']);
      expect(savedUser.engineering_disciplines).toEqual(['Civil', 'Electrical']);

      await User.deleteOne({ _id: user._id });
    });

    it('should trim document_categories strings', async () => {
      const user = new User({
        email: 'trim-test@example.com',
        full_name: 'Trim Test',
        tenant_id: testTenantId,
        document_categories: ['  Asset Registers  ', '  Compliance Documents  '],
        engineering_disciplines: ['  Civil  ', '  Electrical  ']
      });

      await user.save();

      const savedUser = await User.findById(user._id);
      expect(savedUser.document_categories).toEqual(['Asset Registers', 'Compliance Documents']);
      expect(savedUser.engineering_disciplines).toEqual(['Civil', 'Electrical']);

      await User.deleteOne({ _id: user._id });
    });

    it('should handle empty arrays for new fields', async () => {
      const user = new User({
        email: 'empty-test@example.com',
        full_name: 'Empty Test',
        tenant_id: testTenantId,
        document_categories: [],
        engineering_disciplines: []
      });

      await user.save();

      const savedUser = await User.findById(user._id);
      expect(savedUser.document_categories).toEqual([]);
      expect(savedUser.engineering_disciplines).toEqual([]);

      await User.deleteOne({ _id: user._id });
    });
  });

  describe('Role Model - Permission Structure', () => {
    it('should use correct permission field names', async () => {
      const role = new Role({
        name: 'Test Role',
        description: 'Test role for field validation',
        permissions: [
          { entity: 'documents', view: true, create: true, edit: true, delete: false },
          { entity: 'sites', view: true, create: false, edit: false, delete: false }
        ],
        is_active: true,
        tenant_id: testTenantId
      });

      await role.save();

      const savedRole = await Role.findById(role._id);
      expect(savedRole.permissions[0]).toHaveProperty('entity');
      expect(savedRole.permissions[0]).toHaveProperty('view');
      expect(savedRole.permissions[0]).not.toHaveProperty('module_name');
      expect(savedRole.permissions[0]).not.toHaveProperty('can_view');

      await Role.deleteOne({ _id: role._id });
    });
  });
});
