module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'routes/**/*.js',
    'models/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**',
  ],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/tenant-deletion.test.js', // Ignore until dependencies are fixed
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  verbose: true,
  testTimeout: 30000, // 30 seconds for DB operations
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Mock uuid module to avoid ES module issues
  moduleNameMapper: {
    '^uuid$': '<rootDir>/tests/mocks/uuid.js',
  },
};
