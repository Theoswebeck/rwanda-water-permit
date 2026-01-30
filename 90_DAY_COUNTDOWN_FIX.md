# 90-Day Countdown Fix - Implementation Summary

## Problem Statement
The 90-day processing deadline countdown was starting from when the application was **submitted**. However, the correct behavior is:
- The countdown should start from when the **assessor clicks "Confirm Completeness and Lock"**
- Before this action, the countdown should show **"Not Started"**

## Solution Implemented

### 1. Database Changes (`90_DAY_COUNTDOWN_MIGRATION.sql`)
Added a new column to the `applications` table:
```sql
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS completeness_confirmed_at TIMESTAMPTZ DEFAULT NULL;
```

This column stores the timestamp when the assessor confirms document completeness, which triggers the 90-day countdown.

### 2. Type Definition (`types/database.ts`)
Added the new field to the `Application` interface:
```typescript
// 90-day deadline countdown trigger
completeness_confirmed_at?: string
```

### 3. Core Utility Function (`lib/utils.ts`)
Updated `calculateDaysRemainingTo90DayDeadline()` to use `completenessConfirmedAt` instead of `submittedAt`:
- Returns `null` when completeness hasn't been confirmed (countdown not started)
- Calculates days remaining from `completeness_confirmed_at` when it's set

### 4. Assessment Page (`app/assessment/application/[id]/page.tsx`)
Updated `handleConfirmCompletenessAndLock()` to:
- Save `completeness_confirmed_at` to the `applications` table
- Show a message confirming the 90-day deadline has started
- Update local state with the new timestamp

### 5. UI Badge Updates
Updated the `get90DayBadge()` function in all dashboard pages to show:
- **"Not Started"** (gray badge) - when `completeness_confirmed_at` is null
- **"Overdue"** (red badge) - when deadline has passed
- **"Xd"** (amber badge) - when ≤7 days remaining
- **"Xd"** (green badge) - when >7 days remaining

Files updated:
- `app/assessment/page.tsx`
- `app/review/page.tsx`
- `app/verification/page.tsx`
- `components/approver/all-applications-list.tsx`
- `components/approver/final-decisions.tsx`

## How to Apply

### Step 1: Run the Database Migration
Execute the SQL migration in your Supabase SQL Editor:
```bash
# Copy and paste the contents of 90_DAY_COUNTDOWN_MIGRATION.sql
# into the Supabase SQL Editor and run it
```

### Step 2: (Optional) Backfill Existing Applications
If you have existing applications where completeness was already confirmed, uncomment and run the backfill query in the migration file. This will populate `completeness_confirmed_at` from the existing `docReviewMeta` stored in assessments.

### Step 3: Restart the Application
```bash
# Stop any running dev server and restart
npm run dev
```

## Verification

1. **New Applications**: When an assessor clicks "Confirm Completeness and Lock":
   - The 90-day countdown should start showing days remaining
   - Before this button is clicked, the badge shows "Not Started"

2. **Dashboard Lists**: All application lists now show:
   - "Not Started" for applications without confirmed completeness
   - Days remaining for applications with confirmed completeness

## Technical Notes

- The countdown is based on `completeness_confirmed_at` + 90 days
- All existing deadline sorting logic continues to work (null values are sorted last)
- The `docReviewMeta.completenessConfirmedAt` is still stored in assessments for backwards compatibility
- The `applications.completeness_confirmed_at` is the source of truth for UI display

## Rollback

If you need to rollback:
1. Remove the `completeness_confirmed_at` column from applications table
2. Revert the code changes using git
3. The system will fall back to showing "Not Started" for all applications (since the column won't exist)
