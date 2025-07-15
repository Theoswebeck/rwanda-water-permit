# 🔧 Application Number Duplicate Bug Fix

## 🚨 **Issue Identified**
Users are getting **"duplicate key value violates unique constraint"** errors when creating new applications because the application number generation function has a substring extraction bug.

## 🔍 **Root Cause Analysis**

### **The Problem**
In the database function `generate_application_number()`, the code was:
```sql
SUBSTRING(application_number FROM 9)
```

For application number `"RWB-2025-000001"`:
- Position 9 starts at the **hyphen** (`-000001`)
- Casting `"-000001"` to INTEGER causes issues
- This leads to incorrect counter calculations and duplicate numbers

### **The Fix**
Changed to:
```sql
SUBSTRING(application_number FROM 10)  
```

Now it correctly extracts just `"000001"` (the numeric part).

## ✅ **How to Apply the Fix**

### **Step 1: Run the SQL Fix**
Execute the SQL script in your Supabase database:

```sql
-- Copy and paste the contents of: database/fix-application-number-generation.sql
```

### **Step 2: Verify the Fix**
1. **Check for duplicates** (the script will show you):
   ```sql
   SELECT application_number, COUNT(*) 
   FROM applications 
   WHERE application_number IS NOT NULL
   GROUP BY application_number 
   HAVING COUNT(*) > 1;
   ```

2. **Test new application creation** - try creating a new application

### **Step 3: Clean Up Existing Duplicates (if any)**
If you have existing duplicate numbers, manually assign unique numbers:

```sql
-- Example: Update duplicate application numbers
UPDATE applications 
SET application_number = 'RWB-2025-000002' 
WHERE id = 'your-duplicate-app-id-here';
```

## 🧪 **Testing the Fix**

After applying the SQL fix:

1. **✅ Try creating a new application** at: `http://localhost:3000/dashboard/new-application`
2. **✅ Verify unique numbers** are generated properly 
3. **✅ Check the console** for debug messages showing the generated numbers

## 📋 **Application Number Format**

The format is: `RWB-YYYY-NNNNNN`
- **RWB**: Rwanda Water Board prefix
- **YYYY**: Current year (e.g., 2025)
- **NNNNNN**: 6-digit sequential counter (000001, 000002, etc.)

Examples:
- `RWB-2025-000001`
- `RWB-2025-000002`
- `RWB-2025-000003`

## 🔄 **What the Fix Does**

1. **✅ Fixes substring extraction** to get correct numeric part
2. **✅ Ensures unique sequential numbering** for each year
3. **✅ Adds debug logging** to help monitor number generation
4. **✅ Checks for existing duplicates** before applying

## 🚀 **Quick Steps**

1. **Open Supabase Dashboard** → SQL Editor
2. **Copy & paste** the contents of `database/fix-application-number-generation.sql`
3. **Run the script**
4. **Test** by creating a new application
5. **Verify** no more duplicate number errors

## 📞 **If You Still Have Issues**

If the error persists:
1. Check the console for the debug messages
2. Verify the SQL script ran successfully  
3. Look for any remaining duplicate application numbers in your database
4. Make sure you're running the latest version of the fix

---

**Status**: ✅ **READY TO DEPLOY**  
**Impact**: 🔴 **HIGH** - Fixes critical application creation bug  
**Effort**: 🟢 **LOW** - Simple SQL script execution 