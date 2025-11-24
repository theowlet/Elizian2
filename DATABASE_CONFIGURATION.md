# Database Configuration - LOCAL ONLY

**Date**: 2025-11-24  
**Status**: ✅ **System configured for LOCAL PostgreSQL ONLY**  
**Cloud Database**: ❌ **REMOVED - Not in use**

---

## 🎯 **Current Configuration**

### **Database**: LOCAL PostgreSQL

```
Host: localhost
Port: 5432
Database: elizian
User: postgres
Password: postgres
```

### **Environment Variables** (.env)

```bash
# PostgreSQL Configuration - LOCAL ONLY
DB_HOST=localhost
DB_NAME=elizian
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres

# ⚠️ DO NOT SET DATABASE_URL
# If DATABASE_URL is set, it will override local settings
# Keep this commented out or remove it:
# DATABASE_URL=  ← DO NOT USE
```

---

## 🔧 **How Database Connection Works**

### **File**: `backend/src/config/db.js`

```javascript
// Connection logic (lines 14-26):
const connectionOptions = config.database.url
  ? {
      // If DATABASE_URL exists → Use connection string (Neon/Cloud)
      connectionString: config.database.url,
      ssl: config.database.ssl
    }
  : {
      // If NO DATABASE_URL → Use individual env vars (LOCAL)
      user: process.env.DB_USER,      // postgres
      host: process.env.DB_HOST,      // localhost
      database: process.env.DB_NAME,  // elizian
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      ssl: false  // ✅ No SSL for localhost
    };
```

### **Priority**:
```
1. DATABASE_URL (if set) ← Neon/Cloud
2. Individual vars (if DATABASE_URL not set) ← LOCAL ✅
```

---

## ✅ **Current Status Verification**

### **Server Logs Confirm LOCAL Usage**:
```bash
2025-11-24T07:54:14.204Z 📋 Environment Configuration:
2025-11-24T07:54:14.204Z    - NODE_ENV: development
2025-11-24T07:54:14.204Z    - DB_HOST: localhost ✅
2025-11-24T07:54:14.204Z    - DB_NAME: elizian ✅
2025-11-24T07:54:14.204Z    - DB_PORT: 5432 ✅
2025-11-24T07:54:14.204Z    - DB_USER: postgres ✅
```

### **Database Connection Test**:
```bash
✅ Server running on port 5001
✅ Connected to localhost:5432/elizian
✅ All tables accessible
✅ Mohit Bansal found with 93.75 EZT
```

---

## 🚫 **What Was REMOVED**

### **Neon Cloud Database** (No longer used)

```
❌ Host: ep-steep-surf-adjdf3ij-pooler.c-2.us-east-1.aws.neon.tech
❌ Database: neondb
❌ Role: neondb_owner
❌ Connection String: postgresql://neondb_owner:npg_...

Status: NOT IN USE - System uses localhost only
```

### **Why It Was Causing Confusion**:
```
1. Two databases existed (LOCAL + Neon)
2. Data only in LOCAL database
3. Some queries went to Neon (empty)
4. Result: Users like Mohit appeared to have 0 balance
```

---

## 📋 **.env File Template**

Create/Update `backend/.env` with:

```bash
# ==============================================
# ELIZIAN BACKEND - LOCAL DEVELOPMENT
# ==============================================

# Node Environment
NODE_ENV=development
PORT=5001

# ===== DATABASE (LOCAL POSTGRESQL) =====
# ⚠️ DO NOT use DATABASE_URL for local development
DB_HOST=localhost
DB_NAME=elizian
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres

# Database Pool Settings
PG_POOL_MAX=20
PG_IDLE_TIMEOUT=30000
PG_CONN_TIMEOUT=2000

# ===== JWT SECURITY =====
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars

# ===== FRONTEND URLs =====
FRONTEND_URL=http://localhost:8080
ADMIN_URL=http://localhost:8080/admin

# ===== CORS SETTINGS =====
CORS_ALLOWED_ORIGINS=http://localhost:8080,http://localhost:8081,http://127.0.0.1:8080

# ===== OTP SETTINGS =====
OTP_EXPIRY_MINUTES=10
OTP_MAX_ATTEMPTS=5
LOG_OTP=true

# ===== REDIS (Optional) =====
# REDIS_URL=redis://localhost:6379
REDIS_PREFIX=elizian

# ===== EMAIL (Optional) =====
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASSWORD=your-app-password

# ==============================================
# ⚠️ IMPORTANT: DO NOT SET THESE FOR LOCAL DEV
# ==============================================
# DATABASE_URL=  ← Keep commented or remove
# NEON_API_KEY=  ← Not needed
# VERCEL=        ← Not needed
```

---

## 🔍 **Verify Your Setup**

### **1. Check .env File**
```bash
cd backend
cat .env | grep -E "DB_|DATABASE_URL"

# Should show:
# DB_HOST=localhost
# DB_NAME=elizian
# DB_PORT=5432
# DB_USER=postgres
# DB_PASSWORD=postgres

# Should NOT show:
# DATABASE_URL=postgresql://... ← This should be absent or commented
```

### **2. Check Server Logs**
```bash
# Start server and check output
npm run dev

# Should log:
# ✅ - DB_HOST: localhost
# ✅ - DB_NAME: elizian
```

### **3. Test Database Connection**
```bash
# Test direct connection
psql -h localhost -U postgres -d elizian -c "SELECT COUNT(*) FROM users;"

# Should return count of users ✅
```

---

## 🎯 **Database Access Commands**

### **Connect to Database**
```bash
psql -h localhost -U postgres -d elizian
```

### **Common Queries**
```sql
-- Check users
SELECT id, first_name, last_name, available_tokens 
FROM users 
ORDER BY created_at DESC 
LIMIT 10;

-- Check token balances
SELECT 
  u.first_name, 
  u.last_name, 
  u.available_tokens, 
  u.total_tokens_earned,
  u.total_tokens_spent
FROM users u
WHERE u.available_tokens > 0
ORDER BY u.available_tokens DESC;

-- Check recent bookings
SELECT * FROM bookings ORDER BY created_at DESC LIMIT 10;
```

---

## 🚀 **Setup Instructions (Fresh Install)**

### **1. Install PostgreSQL**
```bash
# macOS
brew install postgresql@17
brew services start postgresql@17

# Ubuntu
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### **2. Create Database**
```bash
# Create database and user
createdb elizian
psql -d elizian

# Or using SQL:
psql -U postgres
CREATE DATABASE elizian;
\q
```

### **3. Run Migrations**
```bash
cd backend

# Run schema initialization (if you have it)
psql -h localhost -U postgres -d elizian -f db/elizian_schema.sql

# Or let server auto-create tables
npm run dev
```

### **4. Verify Setup**
```bash
# Check tables exist
psql -h localhost -U postgres -d elizian -c "\dt"

# Should show tables:
# users, partners, bookings, transactions, 
# loyalty_points, token_ledger, etc.
```

---

## 📊 **Architecture Overview**

```
Elizian Application Stack:

Frontend (port 8080)
├─ Static HTML/JS
└─ Calls API at localhost:5001

Backend (port 5001)
├─ Node.js/Express Server
└─ Connects to LOCAL PostgreSQL ✅

Database (port 5432)
└─ PostgreSQL on localhost ✅
   ├─ Database: elizian
   ├─ Users: Mohit Bansal (93.75 EZT) ✅
   └─ All data stored locally
```

---

## ⚠️ **Important Notes**

### **DO NOT Add DATABASE_URL**
```bash
# ❌ WRONG - This will connect to cloud
DATABASE_URL=postgresql://user:pass@remote-host/db

# ✅ CORRECT - Use individual vars
DB_HOST=localhost
DB_NAME=elizian
```

### **Data is LOCAL ONLY**
```
✅ All user data in localhost database
✅ All bookings in localhost database
✅ All tokens in localhost database
❌ No cloud sync
❌ No remote backup (unless you set it up)
```

### **Backup Your Data**
```bash
# Regular backups recommended
pg_dump -h localhost -U postgres elizian > backup_$(date +%Y%m%d).sql

# Restore if needed
psql -h localhost -U postgres -d elizian < backup_20251124.sql
```

---

## 🔒 **Security Notes**

### **For Local Development** (Current Setup):
```
✅ localhost only (not exposed to internet)
✅ No SSL needed
✅ Simple password OK for dev
```

### **For Production** (Future):
```
⚠️ Use strong passwords
⚠️ Enable SSL
⚠️ Restrict network access
⚠️ Use environment-specific secrets
⚠️ Consider managed database (RDS, Neon, etc.)
```

---

## 📝 **Troubleshooting**

### **Issue: Can't connect to database**
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Check credentials
psql -h localhost -U postgres -d elizian
```

### **Issue: Database doesn't exist**
```bash
# Create it
createdb elizian

# Or
psql -U postgres -c "CREATE DATABASE elizian;"
```

### **Issue: Tables missing**
```bash
# Let server create them
npm run dev

# Or run migrations manually
psql -h localhost -U postgres -d elizian -f db/schema.sql
```

---

## ✅ **Summary**

### **Current Configuration**:
```
✅ Database: LOCAL PostgreSQL (localhost:5432/elizian)
✅ No cloud database in use
✅ All data stored locally
✅ Server confirmed using localhost
✅ Mohit Bansal found with correct balance
```

### **Key Files**:
```
backend/.env                    ← Database credentials
backend/src/config/env.js       ← Reads environment variables
backend/src/config/db.js        ← Creates database connection
```

### **Environment Variables to Set**:
```
DB_HOST=localhost     ✅ Required
DB_NAME=elizian       ✅ Required
DB_PORT=5432          ✅ Required
DB_USER=postgres      ✅ Required
DB_PASSWORD=postgres  ✅ Required
DATABASE_URL=         ❌ Must NOT be set
```

---

**Status**: ✅ **CONFIGURED FOR LOCAL POSTGRESQL ONLY**  
**Cloud Database**: ❌ **NOT IN USE**  
**Ready**: ✅ **YES - System uses localhost exclusively**

