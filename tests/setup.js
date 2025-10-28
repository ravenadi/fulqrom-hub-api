// Test setup file
// Runs before all tests

const mongoose = require('mongoose');
require('dotenv').config();

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for all tests
jest.setTimeout(30000);

// Connect to test database before all tests
beforeAll(async () => {
  const testDbUri = process.env.MONGODB_TEST_URI || process.env.MONGODB_CONNECTION;

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(testDbUri);
  console.log('✅ Connected to test database');
});

// Clean up after all tests
afterAll(async () => {
  await mongoose.disconnect();
  console.log('✅ Disconnected from test database');
});

// Global test utilities
global.testUtils = {
  createTestUser: async (overrides = {}) => {
    const User = require('../models/User');
    const defaultUser = {
      email: `test-${Date.now()}@example.com`,
      full_name: 'Test User',
      role_ids: [],
      is_active: true,
      ...overrides
    };
    return await User.create(defaultUser);
  },

  cleanupTestUsers: async () => {
    const User = require('../models/User');
    await User.deleteMany({ email: /^test-.*@example\.com$/ });
  },
};
