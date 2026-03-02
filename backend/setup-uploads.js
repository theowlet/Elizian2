// setup-uploads.js
// Run this script to create necessary upload directories

const fs = require('fs');
const path = require('path');

const uploadDirs = [
  path.join(__dirname, 'uploads'),
  path.join(__dirname, 'uploads/menu'),
  path.join(__dirname, 'uploads/offers'),
  path.join(__dirname, 'uploads/partners'),
  path.join(__dirname, 'uploads/events'),
  path.join(__dirname, 'uploads/vouchers'),
];

console.log('🚀 Creating upload directories...\n');

uploadDirs.forEach((dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ Created: ${dir}`);
    } else {
      console.log(`✓ Exists: ${dir}`);
    }
  } catch (error) {
    console.error(`❌ Error creating ${dir}:`, error.message);
  }
});

// Create .gitkeep files to preserve empty directories in git
uploadDirs.forEach((dir) => {
  const gitkeepPath = path.join(dir, '.gitkeep');
  if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '');
  }
});

console.log('\n✅ Upload directories setup complete!');
console.log('\n📝 Run with: node setup-uploads.js');


