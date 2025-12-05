# Elizian Production Database Package

## 📦 Package Contents

This package contains all database files required for Elizian production deployment.

### Structure:
```
production-db-package/
├── db/                    # Core database files
├── db/migrations/         # Migration files
├── docs/                  # Documentation
├── PRODUCTION_MIGRATION_SCRIPT.sh  # Automated deployment script
└── README.md              # This file
```

## 🚀 Quick Start

### Option 1: Automated Deployment (Recommended)

1. **Extract the package:**
   ```bash
   unzip elizian-production-db-*.zip
   cd production-db-package
   ```

2. **Set database credentials:**
   ```bash
   export DB_NAME=elizian
   export DB_USER=postgres
   export DB_HOST=localhost
   export DB_PORT=5432
   ```

3. **Run the automated script:**
   ```bash
   cd db
   chmod +x ../PRODUCTION_MIGRATION_SCRIPT.sh
   ../PRODUCTION_MIGRATION_SCRIPT.sh
   ```

### Option 2: Manual Deployment

1. **Create database:**
   ```bash
   psql -U postgres -c "CREATE DATABASE elizian;"
   ```

2. **Run files in order (see PRODUCTION_DB_DEPLOYMENT.md):**
   ```bash
   psql -U postgres -d elizian -f db/elizian_schema.sql
   psql -U postgres -d elizian -f db/add_role_id_column.sql
   # ... (continue with all files)
   ```

## 📋 Files Included

### Critical Files (10 files - Required)
- Core schema and role system
- Bank offers & reservations
- Loyalty tier system
- Booking system fixes

### Feature Files (22 files - Optional)
- Partner features
- Admin console features
- Data structure enhancements

See `docs/PRODUCTION_FILES_CHECKLIST.md` for complete list.

## ✅ Verification

After deployment, verify:

```sql
-- Check critical tables exist
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN (
  'bookings', 
  'restaurant_availability', 
  'loyalty_tiers', 
  'users',
  'partners'
);
-- Should return: 5
```

## 📚 Documentation

- `docs/PRODUCTION_DB_DEPLOYMENT.md` - Complete deployment guide
- `docs/PRODUCTION_FILES_CHECKLIST.md` - File checklist

## ⚠️ Important Notes

1. **Backup First**: Always backup production database before running migrations
2. **Test First**: Run migrations on staging/test database first
3. **Order Matters**: Critical files must run in the specified order
4. **Transaction Safety**: Each file should be run in its own transaction

## 📧 Support

If you encounter issues:
1. Check `docs/PRODUCTION_DB_DEPLOYMENT.md` for detailed instructions
2. Verify all files were run in the correct order
3. Check PostgreSQL logs for errors

---
**Package Created:** $(date)
**Version:** Production Release
