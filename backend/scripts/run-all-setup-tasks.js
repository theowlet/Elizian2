/**
 * Run All Setup Tasks (1-3)
 * 1. Verify AWS S3 Configuration
 * 2. Run Database Migration
 * 3. Test Booking Creation
 */

const { execSync } = require('child_process');
const path = require('path');
const { log, logError } = require('../utils/logger');

async function runTask(taskName, scriptPath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 Task: ${taskName}`);
  console.log(`${'='.repeat(60)}\n`);
  
  try {
    execSync(`node ${scriptPath}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log(`\n✅ ${taskName} completed successfully!\n`);
    return true;
  } catch (error) {
    console.log(`\n❌ ${taskName} failed!\n`);
    return false;
  }
}

async function runAllTasks() {
  console.log('🚀 Starting Voucher Redemption System Setup...\n');
  console.log('This will run the following tasks:');
  console.log('  1. Verify AWS S3 Configuration');
  console.log('  2. Run Database Migration');
  console.log('  3. Test Booking Creation\n');

  const tasks = [
    {
      name: 'Task 1: Verify AWS S3 Configuration',
      script: 'scripts/verify-s3-config.js'
    },
    {
      name: 'Task 2: Run Database Migration',
      script: 'run-voucher-redemption-migration.js'
    },
    {
      name: 'Task 3: Test Booking Creation',
      script: 'scripts/test-booking-creation.js'
    }
  ];

  const results = [];

  for (const task of tasks) {
    const success = await runTask(task.name, task.script);
    results.push({ name: task.name, success });
    
    if (!success) {
      console.log(`\n⚠️  ${task.name} failed. Please fix the issue and try again.`);
      console.log('   You can run tasks individually:');
      console.log(`   node ${task.script}\n`);
      break;
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Setup Summary');
  console.log(`${'='.repeat(60)}\n`);

  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} Task ${index + 1}: ${result.name}`);
  });

  const allPassed = results.every(r => r.success);
  
  if (allPassed) {
    console.log('\n🎉 All setup tasks completed successfully!');
    console.log('\n✨ Voucher Redemption System is ready to use!');
    console.log('\n📝 Next Steps:');
    console.log('   - Create bookings via API or frontend');
    console.log('   - QR codes will be auto-generated');
    console.log('   - Test redemption flow via partner console');
  } else {
    console.log('\n⚠️  Some tasks failed. Please review the errors above.');
    console.log('   Fix the issues and re-run the failed tasks.');
  }

  process.exit(allPassed ? 0 : 1);
}

runAllTasks();

