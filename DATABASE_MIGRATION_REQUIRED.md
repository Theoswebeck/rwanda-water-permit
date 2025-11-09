# 🔴 DATABASE MIGRATION REQUIRED

## ⚠️ Action Needed: Run SQL Migration for Permit Inspection Checklist

A comprehensive permit inspection checklist system has been implemented. Before it can be used, you **MUST** run the database migration to add the required fields to the `inspections` table.

## 📋 Instructions

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase project: https://supabase.com/dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Run the Migration

Copy and paste the **ENTIRE** contents of this file into the SQL Editor:

```
/database/add-inspection-checklist-fields.sql
```

Then click **Run** or press `Ctrl + Enter` (Windows/Linux) or `Cmd + Enter` (Mac)

### Step 3: Verify Success

You should see a success message indicating:
- ✅ Columns added to inspections table
- ✅ Comments added
- ✅ Indexes created

### Step 4: Test the System

1. Navigate to the Inspector Dashboard
2. Go to "Post-Permit Inspections"
3. Click "Conduct Inspection" on any approved permit
4. Verify all sections load correctly with pre-populated data

## 🔍 What This Migration Does

Adds **25 new fields** to the `inspections` table to support:

- ✅ Section 2: Activity details
- ✅ Section 5: Allowed water abstraction
- ✅ Section 6: Actual water abstraction & measurement devices
- ✅ Section 7: Wastewater management system
- ✅ Section 8: Fees payment verification
- ✅ Section 9: Reports submission
- ✅ Section 10: Water use conflicts
- ✅ Section 11: Catchment protection initiatives
- ✅ Section 12: Overall assessment & compliance status

## ❓ Need Help?

If you encounter any issues:
1. Check that you have admin/owner access to the database
2. Ensure you're running the migration in the correct Supabase project
3. Verify no syntax errors in the SQL (shouldn't be any)
4. Check the Supabase logs for error details

## 📚 More Information

See `/PERMIT_INSPECTION_CHECKLIST_IMPLEMENTATION.md` for complete documentation.

---

**Status:** 🔴 MIGRATION PENDING - Run this before using the new inspection system!


