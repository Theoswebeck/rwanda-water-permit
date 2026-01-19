# Quick Installation Guide

## 🚀 Get Started in 5 Minutes

### Option 1: Automated Setup (Recommended)

```bash
# Make the setup script executable
chmod +x database/setup-scripts/setup-supabase.sh

# Run the automated setup
./database/setup-scripts/setup-supabase.sh
```

This script will:
- ✅ Check prerequisites
- ✅ Initialize Supabase project
- ✅ Apply database schema
- ✅ Generate TypeScript types
- ✅ Verify installation
- ✅ Display connection details

### Option 2: Manual Setup

#### 1. Install Supabase CLI
```bash
npm install -g supabase
```

#### 2. Initialize Project
```bash
supabase init
supabase start
```

#### 3. Apply Schema
```bash
# Copy schema to migrations
cp database/schema.sql supabase/migrations/$(date +%Y%m%d%H%M%S)_initial_schema.sql

# Apply migration
supabase db push
```

#### 4. Generate Types
```bash
supabase gen types typescript --local > types/supabase.ts
```

## 🎯 Next Steps

### 1. Environment Variables
Update your `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 2. Update Supabase Client
```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

### 3. Test Sample Data (Optional)
```bash
# Insert sample data for testing
supabase db connect --local -f database/sample-data.sql
```

## 🔍 Verification

### Check Tables
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

### Verify Data
```sql
-- Check sample users
SELECT email, role, account_type FROM users LIMIT 5;

-- Check sample applications
SELECT application_number, status, application_type FROM applications LIMIT 5;
```

## 🛠️ Troubleshooting

### Common Issues

**PostGIS Extension Missing**
```sql
CREATE EXTENSION IF NOT EXISTS "postgis";
```

**RLS Policies Blocking Access**
- Check if user has proper role
- Verify `auth.uid()` returns correct value

**Migration Conflicts**
```bash
# Reset database if needed
supabase db reset
```

## 📚 Documentation

- **Schema Reference**: See [database/README.md](./README.md)
- **API Types**: Use types from [types/database.ts](../types/database.ts)
- **Sample Data**: Review [database/sample-data.sql](./sample-data.sql)

## 🆘 Need Help?

1. Check the [troubleshooting section](./README.md#troubleshooting) in README.md
2. Verify Supabase logs: `supabase logs`
3. Test connection: `supabase db connect --local`

---

**Ready to build!** 