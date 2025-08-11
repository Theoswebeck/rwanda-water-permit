# 🔒 Policy Update Instructions - Edit Protection

## 📋 **Overview**
This document provides instructions for updating the Row Level Security (RLS) policies to prevent editing of approved or rejected applications.

## ⚠️ **Issue**
When trying to create new policies, you may encounter:
```
ERROR: 42710: policy "Users can update their own draft applications" for table "applications" already exists
```

## ✅ **Solution**
Run the migration script to update existing policies:

### **Option 1: Run Migration Script**
```sql
-- Run this in your Supabase SQL editor or psql
\i database/update-edit-protection-policies.sql
```

### **Option 2: Manual Commands**
If you prefer to run commands manually:

```sql
-- 1. Drop existing user policy
DROP POLICY IF EXISTS "Users can update their own draft applications" ON applications;

-- 2. Create updated user policy
CREATE POLICY "Users can update their own draft applications"
    ON applications FOR UPDATE
    USING (
        auth.uid() = applicant_id 
        AND status IN ('draft', 'revision_required') 
        AND status NOT IN ('approved', 'rejected')
    );

-- 3. Drop existing staff policy  
DROP POLICY IF EXISTS "Staff can update applications in their workflow" ON applications;

-- 4. Create updated staff policy
CREATE POLICY "Staff can update applications in their workflow"
    ON applications FOR UPDATE
    USING (
        (auth.uid() = assigned_reviewer_id OR
         auth.uid() = assigned_inspector_id OR
         auth.uid() = assigned_approver_id OR
         EXISTS (
             SELECT 1 FROM users 
             WHERE id = auth.uid() AND role = 'admin'
         )) AND
        status NOT IN ('approved', 'rejected')
    );
```

## 🔍 **Verification**
After running the migration, verify the policies:

```sql
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'applications' 
AND policyname IN (
    'Users can update their own draft applications',
    'Staff can update applications in their workflow'
);
```

## 🎯 **What These Policies Do**

### **User Policy**
- ✅ Users can edit their own applications
- ✅ Only if status is `draft` or `revision_required`
- ❌ Cannot edit if status is `approved` or `rejected`

### **Staff Policy**  
- ✅ Staff can edit applications assigned to them
- ✅ Only if status is NOT `approved` or `rejected`
- ❌ Even staff cannot edit finalized applications

## 🚀 **Next Steps**
1. Run the migration script
2. Test the edit protection in your application
3. Verify that approved/rejected applications cannot be edited

## 📝 **Notes**
- These policies work at the database level
- They complement the frontend validation
- Provides multi-layer security for data integrity 