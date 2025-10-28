// Mock UUID module for Jest testing
// Avoids ES module import issues

let counter = 0;

module.exports = {
  v4: () => {
    counter++;
    return `test-uuid-${counter}-${Date.now()}`;
  },
  v1: () => {
    counter++;
    return `test-uuid-v1-${counter}-${Date.now()}`;
  },
  validate: (uuid) => {
    return typeof uuid === 'string' && uuid.length > 0;
  },
  version: (uuid) => {
    return 4;
  }
};
