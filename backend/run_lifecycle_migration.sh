#!/bin/bash

# ============================================
# LIFECYCLE MANAGEMENT SYSTEM - MIGRATION SCRIPT
# ============================================

echo "🚀 Running Lifecycle Management System Migration..."
echo ""

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
else
  echo "❌ .env file not found!"
  exit 1
fi

# Run the migration
psql -U $DB_USER -d $DB_NAME -h $DB_HOST -p $DB_PORT -f migrations/add_lifecycle_fields.sql

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migration completed successfully!"
  echo ""
  echo "📋 Summary:"
  echo "   • Added lifecycle fields to menu_items table"
  echo "   • Created indexes for performance"
  echo "   • Added trigger for automatic status updates"
  echo "   • Migrated existing events to use lifecycle fields"
  echo ""
  echo "🔧 Next Steps:"
  echo "   1. Restart backend server: node server.js"
  echo "   2. Test with: curl http://localhost:5001/api/v1/partners/{ID}/menu?include_lifecycle=true"
  echo "   3. Create a test service with end_time in past to verify expiry"
  echo ""
else
  echo ""
  echo "❌ Migration failed! Check error messages above."
  exit 1
fi
