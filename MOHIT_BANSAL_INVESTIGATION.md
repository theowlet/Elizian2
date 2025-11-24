# Mohit Bansal - 0 EZT Balance Investigation

**Date**: 2025-11-24  
**Issue**: User "Mohit Bansal" shows 0 EZT balance despite no purchases  
**Expected**: Should have 100 EZT signup bonus

---

## 🔍 **Investigation Results**

### **Finding #1: User EXISTS in LOCAL Database**

**Database**: PostgreSQL localhost:5432/elizian

```sql
SELECT * FROM users WHERE first_name = 'Mohit' AND last_name = 'Bansal';

Result:
├─ id: 814b57ad-9952-4591-8a93-2d94bbe31f21
├─ email: mohit.bansal@elizian.xyz
├─ phone_number: 1234567890
├─ available_tokens: 93.75000 EZT ✅
├─ total_tokens_earned: 100.00000 EZT ✅
├─ total_tokens_spent: 6.25000 EZT ✅
├─ signup_bonus_credited: true ✅
└─ created_at: 2025-11-12 08:33:17
```

**Status**: ✅ **Mohit DID receive signup bonus!**

---

### **Finding #2: User MISSING in NEON Cloud Database**

**Database**: Neon.tech (cloud)

```sql
SELECT * FROM users WHERE first_name = 'Mohit';

Result: 0 rows ❌
```

**Status**: ❌ **Mohit doesn't exist in cloud database!**

---

### **Finding #3: Missing Token Ledger Entries**

**Query**: 
```sql
SELECT * FROM token_ledger WHERE user_id = '814b57ad-9952-4591-8a93-2d94bbe31f21';

Result: 0 rows ❌
```

**Issue**: Despite having tokens, there are NO ledger entries showing:
- ❌ No signup bonus record
- ❌ No spending records (but he spent 6.25 EZT!)
- ❌ No earning records

**Possible Causes**:
1. Account created before token_ledger was implemented
2. Ledger writes failing silently
3. Manual database updates bypassed ledger

---

## 🏗️ **System Architecture Issue**

### **TWO SEPARATE DATABASES**

```
Your Application Has:

├─ LOCAL PostgreSQL (Development)
│  ├─ Host: localhost:5432
│  ├─ Database: elizian
│  ├─ Status: Server connects here ✅
│  └─ Data: Mohit Bansal with 93.75 EZT ✅
│
└─ NEON Cloud (Production?)
   ├─ Host: Neon.tech remote
   ├─ Database: neondb
   ├─ Status: Some endpoints might use this
   └─ Data: Mohit Bansal NOT FOUND ❌
```

### **Current Server Configuration**

```javascript
// From server logs:
{
  DB_HOST: 'localhost',
  DB_NAME: 'elizian',
  DB_PORT: 5432,
  DB_USER: 'postgres'
}
```

**Server is using LOCAL database** ✅

---

## 🤔 **Why User Sees 0 EZT Balance?**

### **Possible Scenarios:**

#### **Scenario A: Frontend Connected to Different Database**
```
User checks balance on:
├─ Admin panel?
├─ User profile page?
├─ Mobile app?
└─ → Could be hitting Neon API, not localhost
```

#### **Scenario B: Different Environment**
```
Development: localhost (has Mohit with 93.75 EZT)
Staging: Neon (Mohit doesn't exist)
Production: ??? 
```

#### **Scenario C: Cached/Stale Data**
```
Frontend showing cached data
OR old API response
OR different user with same name
```

#### **Scenario D: API Endpoint Issue**
```
GET /api/v1/user/{id} → 404 (endpoint doesn't exist!)
Frontend might be falling back to 0 as default
```

---

## 🎯 **What Actually Happened to Mohit**

### **Timeline:**

```
2025-11-12 08:33:17 - Account Created
├─ Signup bonus: 100 EZT credited ✅
├─ total_tokens_earned: 100 EZT
├─ available_tokens: 100 EZT
└─ signup_bonus_credited: true

[Some time later] - First Purchase
├─ Redeemed: 6.25 EZT (₹625)
├─ total_tokens_spent: 6.25 EZT
└─ available_tokens: 93.75 EZT

Current Status:
└─ Has 93.75 EZT available (₹9,375 value) ✅
```

**Conclusion**: Mohit HAS tokens, but you're looking at the wrong database!

---

## 🔧 **How to Verify Which Database You're Using**

### **Method 1: Check API Response**
```bash
# Make authenticated API call to get user profile
curl -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/v1/auth/profile

# Check available_tokens in response
```

### **Method 2: Check Frontend Network Tab**
```javascript
// In browser DevTools → Network
// Find the API call that fetches user balance
// Check:
// - Request URL (localhost:5001 vs Neon endpoint)
// - Response body (available_tokens field)
```

### **Method 3: Server Logs**
```bash
# Check which database server is querying
tail -f backend/logs/app.log

# Or add temporary logging
console.log('DB Config:', process.env.DB_HOST, process.env.DB_NAME);
```

---

## 📊 **Comparison Table**

| Attribute | LOCAL DB | NEON DB | Expected |
|-----------|----------|---------|----------|
| User Exists | ✅ YES | ❌ NO | ✅ YES |
| available_tokens | 93.75 EZT | N/A | 100 EZT |
| total_tokens_earned | 100 EZT | N/A | 100 EZT |
| total_tokens_spent | 6.25 EZT | N/A | 0 EZT |
| signup_bonus_credited | ✅ true | N/A | ✅ true |
| Token Ledger Entries | ❌ 0 rows | N/A | Should have records |

---

## 🚨 **Critical Issues Found**

### **Issue #1: Database Sync**
```
LOCAL and NEON databases are completely out of sync
Users in LOCAL don't exist in NEON
```

### **Issue #2: Missing Ledger Entries**
```
Mohit has tokens but no audit trail
Can't track where 6.25 EZT was spent
Can't verify signup bonus was properly credited
```

### **Issue #3: Unknown Frontend Connection**
```
Not clear which database frontend is using
User seeing 0 EZT suggests frontend → NEON
But server logs show backend → LOCAL
```

---

## 💡 **Recommended Actions**

### **Immediate: Determine Source of "0 EZT" Report**

**Ask user:**
1. Where are you seeing 0 EZT balance?
   - [ ] Admin panel
   - [ ] User profile page  
   - [ ] Mobile app
   - [ ] Direct database query
   - [ ] API response

2. What URL/endpoint are you accessing?
   - [ ] http://localhost:8080
   - [ ] https://production-domain.com
   - [ ] Mobile app

3. Can you check browser Network tab?
   - [ ] What API endpoint is called?
   - [ ] What does the response show?

### **Short Term: Fix Database Sync**

**Option A: Use LOCAL as primary**
```sql
-- Stop using NEON
-- All environments point to localhost
-- OR sync NEON with LOCAL data
```

**Option B: Use NEON as primary**
```sql
-- Migrate all LOCAL data to NEON
-- Update server config to use NEON
-- Export users from LOCAL → Import to NEON
```

**Option C: Separate Development/Production**
```
Development: localhost (keep as is)
Production: NEON (create Mohit there)
```

### **Long Term: Fix Audit Trail**

```sql
-- Backfill token_ledger for existing users
INSERT INTO token_ledger (user_id, amount, ledger_type, ...)
SELECT 
  id as user_id,
  total_tokens_earned as amount,
  'airdrop' as ledger_type,
  ...
FROM users
WHERE signup_bonus_credited = true
  AND NOT EXISTS (
    SELECT 1 FROM token_ledger 
    WHERE token_ledger.user_id = users.id
  );
```

---

## 🎯 **Summary**

### **Question**: 
"Why does Mohit Bansal have 0 EZT when he made no purchases?"

### **Answer**: 
**Mohit actually HAS 93.75 EZT!** (and already spent ₹625)

**The confusion comes from:**
1. ✅ LOCAL database: Mohit has 93.75 EZT
2. ❌ NEON database: Mohit doesn't exist
3. ❓ Unknown: Which database are you checking?

### **Next Step**:
**Tell us WHERE you're seeing 0 EZT** so we can identify which database the frontend is using and fix the sync issue.

---

## 📞 **Questions for You**

1. **Where are you seeing the 0 EZT balance?**
2. **Should we be using LOCAL or NEON as the primary database?**
3. **Is this a development or production environment?**
4. **Can you share a screenshot of where you see 0 EZT?**

---

**Status**: ⏸️ **WAITING FOR CLARIFICATION**  
**User Data**: ✅ **EXISTS IN LOCAL DB WITH 93.75 EZT**  
**Issue**: 🔍 **NEED TO IDENTIFY WHICH DATABASE FRONTEND IS USING**

