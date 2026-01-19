# 🚨 QUICK FIX: Phone Verification Setup

## Issue
The phone verification is failing because the database schema hasn't been applied yet.

## ✅ IMMEDIATE SOLUTION

### Step 1: Apply Database Schema
**Go to your Supabase Dashboard and run this SQL:**

```sql
-- Quick fix for phone verification columns
DO $$ 
BEGIN
    -- Add phone_verified column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'phone_verified') THEN
        ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added phone_verified column';
    END IF;
    
    -- Add phone_verification_code column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'phone_verification_code') THEN
        ALTER TABLE users ADD COLUMN phone_verification_code VARCHAR(10);
        RAISE NOTICE 'Added phone_verification_code column';
    END IF;
    
    -- Add phone_verification_expires_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'phone_verification_expires_at') THEN
        ALTER TABLE users ADD COLUMN phone_verification_expires_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added phone_verification_expires_at column';
    END IF;
    
    -- Add phone_verification_attempts column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'phone_verification_attempts') THEN
        ALTER TABLE users ADD COLUMN phone_verification_attempts INTEGER DEFAULT 0;
        RAISE NOTICE 'Added phone_verification_attempts column';
    END IF;
    
    -- Add phone_verification_last_sent column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'phone_verification_last_sent') THEN
        ALTER TABLE users ADD COLUMN phone_verification_last_sent TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added phone_verification_last_sent column';
    END IF;
    
    RAISE NOTICE '✅ Phone verification schema applied successfully!';
END $$;
```

### Step 2: Restart Development Server
After applying the schema:
```bash
# Stop your dev server (Ctrl+C)
# Then restart:
npm run dev
```

### Step 3: Test Phone Verification
1. Go to registration page
2. Enter a valid Rwandan phone number (e.g., `+250786072744`)
3. Click "Verify" button
4. You should see the verification dialog
5. Check your phone for SMS code

## 🔧 What I Fixed

1. **Created Server-Side Service** - Separated client and server-side verification services
2. **Updated API Routes** - Now use proper server-side Supabase client
3. **Better Error Handling** - More specific error messages for debugging
4. **Schema Detection** - Will tell you if schema needs to be applied

## 🚀 After the Fix

- ✅ No more API 400 errors
- ✅ Proper SMS sending via Pindo.io
- ✅ Beautiful verification dialog
- ✅ Complete phone verification workflow

**Run the SQL above in Supabase, then restart your server!** 

The error should be resolved and phone verification will work perfectly.
