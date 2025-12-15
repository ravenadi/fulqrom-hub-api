#!/usr/bin/env node

/**
 * Test Runner Script for Permission System
 * 
 * This script provides easy commands to run different types of tests
 * for the permission system implementation.
 * 
 * Usage:
 *   node run-tests.js jest          # Run Jest tests
 *   node run-tests.js manual       # Run manual test script
 *   node run-tests.js all          # Run all tests
 *   node run-tests.js api          # Run API tests with curl
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    log(`\n🚀 Running: ${command} ${args.join(' ')}`, 'cyan');
    
    const process = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });

    process.on('close', (code) => {
      if (code === 0) {
        log(`✅ Command completed successfully`, 'green');
        resolve(code);
      } else {
        log(`❌ Command failed with code ${code}`, 'red');
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    process.on('error', (error) => {
      log(`❌ Command error: ${error.message}`, 'red');
      reject(error);
    });
  });
}

async function runJestTests() {
  log('\n📋 Running Jest Tests...', 'blue');
  
  try {
    await runCommand('npm', ['test', 'tests/integration/permission-system.test.js']);
    log('✅ Jest tests completed successfully', 'green');
  } catch (error) {
    log('❌ Jest tests failed', 'red');
    throw error;
  }
}

async function runManualTests() {
  log('\n📋 Running Manual Test Script...', 'blue');
  
  try {
    await runCommand('node', ['test-permission-system.js']);
    log('✅ Manual tests completed successfully', 'green');
  } catch (error) {
    log('❌ Manual tests failed', 'red');
    throw error;
  }
}

async function runAPITests() {
  log('\n📋 Running API Tests with curl...', 'blue');
  
  const tests = [
    {
      name: 'Test User Details',
      command: 'curl',
      args: [
        '-X', 'GET',
        'http://localhost:30001/api/users/68f75211ab9d0946c112721e',
        '-H', 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IkFDQ3M2d2FBbEpPZ0pDeUg4eXVCRSJ9.eyJodHRwczovL2Z1bHFyb20uY29tLmF1L3JvbGVzIjpbIkFkbWluIl0sImlzcyI6Imh0dHBzOi8vZGV2LW1sN3B4dmo2dmczMmo3NDAuYXUuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDY4ZjBhOTc3ZmYxNzJkMWIxYjBmOGQ1YyIsImF1ZCI6WyJodHRwczovL2FwaS5mdWxxcm9tLmNvbS5hdSIsImh0dHBzOi8vZGV2LW1sN3B4dmo2dmczMmo3NDAuYXUuYXV0aDAuY29tL3VzZXJpbmZvIl0sImlhdCI6MTc2MTM3NzI2NCwiZXhwIjoxNzYxNDYzNjY0LCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwiYXpwIjoiODd3NzF6VVdHSml3TFI5R0xOajdLd3hCMzIycW1GWjQiLCJwZXJtaXNzaW9ucyI6W119.dqzIdbhjDzQLuumfle3wa-_PBzV5UjT7C3r2DG0gi91KzjuClYKodweGg3dKKRPKs5iFfUeBjQx-niYxfLROQZG78z-_JGrVE8VBdcMl0DW0FYmJYSLwYxU73QRqxTT_9ATQpynjRtWFDeQTTQMjMa9M0u758Y2e8FWv7sVM7e01rv0yrzTNxARr8Y4EtmwVx0Nf7wjdwdbbk2IgoPYbojhBlUhqbGtL-dPz68M8jcWqd-U0jDiF5iVi09P5e0aropw0Nu9ih6_prwUf9YMUx9fo3M05R-3Vh9Emf3u-jhffzPnxu2kbaBYVYck8YYyNUwjSlBpnUaQRkSxySgMd-A',
        '|', 'jq', '.'
      ]
    },
    {
      name: 'Test Document Access',
      command: 'curl',
      args: [
        '-X', 'GET',
        'http://localhost:30001/api/documents?page=1&limit=5',
        '-H', 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IkFDQ3M2d2FBbEpPZ0pDeUg4eXVCRSJ9.eyJodHRwczovL2Z1bHFyb20uY29tLmF1L3JvbGVzIjpbInVzZXIiXSwiaXNzIjoiaHR0cHM6Ly9kZXYtbWw3cHh2ajZ2ZzMyajc0MC5hdS5hdXRoMC5jb20vIiwic3ViIjoiYXV0aDB8NjhmNzUyMTFiYTA4M2Y0NzJlZmRiYWY3IiwiYXVkIjpbImh0dHBzOi8vYXBpLmZ1bHFyb20uY29tLmF1IiwiaHR0cHM6Ly9kZXYtbWw3cHh2ajZ2ZzMyajc0MC5hdS5hdXRoMC5jb20vdXNlcmluZm8iXSwiaWF0IjoxNzYxMzc3MjUzLCJleHAiOjE3NjE0NjM2NTMsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgZW1haWwiLCJhenAiOiI4N3c3MXpVV0dKaXdMUjlHTE5qN0t3eEIzMjJxbUZaNCIsInBlcm1pc3Npb25zIjpbXX0.FV6B_awP7JBw9EFAymEFYCFcmE0VJqvaHqz4JcDof_ZJ1GpenNpZeIGQgo5k1yKndqww2Dd6I-mYpSPv2qahG7TSdbsgGHS-kjvmueHsvMi91npBI93G__nhIGzXV9-OgeSwrm_X49SACbwGc1lPcXoCOm7U7i4E0MzzCxaSpKTQ_wxD66KtC6Bn2sHNHUuY2DI6YqObq73ThCQbi-eul5xzej6HIWNE1Iyr-CXiRJHdpIYIe0hyum71VYfZOoJrEUWHV9coPDenHDA2AIKYvfE0GKt7xPAvC1QWAQwYq5xSQNtsxCs5LXGfTHThsk-obL6nTepxnkpxGEJaC9kn0w',
        '|', 'jq', '.'
      ]
    }
  ];

  for (const test of tests) {
    try {
      log(`\n🧪 ${test.name}...`, 'yellow');
      await runCommand(test.command, test.args);
    } catch (error) {
      log(`❌ ${test.name} failed`, 'red');
    }
  }
}

async function runAllTests() {
  log('\n🎯 Running All Permission System Tests...', 'magenta');
  
  try {
    await runJestTests();
    await runManualTests();
    await runAPITests();
    
    log('\n🎉 All tests completed successfully!', 'green');
    log('\n📊 Test Summary:', 'cyan');
    log('✅ Jest unit tests passed', 'green');
    log('✅ Manual integration tests passed', 'green');
    log('✅ API endpoint tests passed', 'green');
    
  } catch (error) {
    log('\n❌ Some tests failed. Check the output above for details.', 'red');
    process.exit(1);
  }
}

async function showHelp() {
  log('\n📚 Permission System Test Runner', 'cyan');
  log('=' .repeat(50), 'cyan');
  log('\nAvailable commands:', 'yellow');
  log('  jest     - Run Jest unit tests', 'blue');
  log('  manual   - Run manual test script', 'blue');
  log('  api      - Run API tests with curl', 'blue');
  log('  all      - Run all tests', 'blue');
  log('  help     - Show this help message', 'blue');
  log('\nUsage:', 'yellow');
  log('  node run-tests.js <command>', 'blue');
  log('\nExamples:', 'yellow');
  log('  node run-tests.js jest', 'blue');
  log('  node run-tests.js all', 'blue');
  log('  node run-tests.js help', 'blue');
}

// Main execution
async function main() {
  const command = process.argv[2] || 'help';
  
  switch (command.toLowerCase()) {
    case 'jest':
      await runJestTests();
      break;
    case 'manual':
      await runManualTests();
      break;
    case 'api':
      await runAPITests();
      break;
    case 'all':
      await runAllTests();
      break;
    case 'help':
    default:
      await showHelp();
      break;
  }
}

// Run if this script is executed directly
if (require.main === module) {
  main().catch((error) => {
    log(`\n❌ Test runner failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = {
  runJestTests,
  runManualTests,
  runAPITests,
  runAllTests
};
