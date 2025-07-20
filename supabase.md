Working with Supabase service guidelines: 

## 🏗️ **Service Architecture Patterns**

### 1. **Mixed Language Approach** ⚡
- **TypeScript**: Use for complex services with multiple entities and relationships (like `financialService.ts`)
- **JavaScript**: Use for simple CRUD operations (like `vehicleService.js`, `technicianService.js`)

```typescript
// TypeScript Pattern - Complex Services
export interface DailyReport {
  id: string;
  vehicle_id: string;
  // ... complete type definitions
}

// AVoid circular reference in the RLS policies

export const financialService = {
  async getDailyReports(): Promise<DailyReport[]> {
    // implementation
  }
}
```

```javascript
// JavaScript Pattern - Simple Services  
export const vehicleService = {
  getVehicles: async () => {
    try {
      const { data, error } = await supabaseClient
        .from('vehicles')
        .select('*');
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      throw error;
    }
  }
}
```

## 📦 **Client Initialization Patterns**

### ✅ **Best Practice - Consistent Naming**
```javascript
// Good: Use consistent naming across services
import { createClient } from '@/lib/supabase/client';
const supabase = createClient(); // financialService.ts pattern
// OR
const supabaseClient = createClient(); // other services pattern
```

### ❌ **Avoid: Mixed naming conventions**
Don't use different client variable names (`supabase`, `supabaseClient`, `client`) in the same codebase.

## 🔄 **CRUD Operation Patterns**

### 1. **READ Operations**

#### **Simple Select with Error Handling**
```javascript
async getAll() {
  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
  return data || [];
}
```

#### **Complex Joins (Critical Pattern)**
```javascript
// ✅ CORRECT: Proper join syntax
async getDailyReports() {
  const { data, error } = await supabase
    .from('daily_reports')
    .select(`
      *,
      vehicles (plate),                    // Join syntax
      daily_expenses (id, amount),         // One-to-many
      deposit_reports (deposit_id)         // Junction table
    `)
    .order('report_date', { ascending: false });
}

// ✅ Advanced joins with aliases
async getMaintenanceRecords() {
  const { data, error } = await supabase
    .from('maintenance_records')
    .select(`
      *,
      vehicles:vehicle_id(plate, model),      // Alias syntax
      technicians:technician_id(name)         // Foreign key reference
    `);
}
```

#### **Left Joins for Optional Relations**
```javascript
// Find undeposited reports using left join
async getUndepositedReports() {
  const { data, error } = await supabase
    .from('daily_reports')
    .select(`
      *,
      vehicles (plate),
      deposit_reports!left(deposit_id)      // Left join syntax
    `)
    .eq('status', 'Operational')
    .is('deposit_reports.deposit_id', null); // Filter for null joins
}
```

### 2. **CREATE Operations**

#### **Single Insert with Return**
```javascript
// ✅ Always use .select() after insert to get the created record
async createRecord(data) {
  const { data: result, error } = await supabase
    .from('table_name')
    .insert([data])          // Always wrap in array
    .select('*')             // Get the created record back
    .single();               // Return single object, not array
    
  if (error) throw error;
  return result;
}
```

#### **Complex Insert with Relationships**
```javascript
// Pattern for creating with file upload
async createBankDepositWithFile(depositData, reportIds, bankSlipFile) {
  let bankSlipUrl = null;
  
  // 1. Upload file first (if provided)
  if (bankSlipFile) {
    bankSlipUrl = await this.uploadBankSlip(bankSlipFile, 'temp-id');
  }
  
  // 2. Create main record
  const { data: deposit, error: depositError } = await supabase
    .from('bank_deposits')
    .insert([{ ...depositData, deposit_slip_url: bankSlipUrl }])
    .select('*')
    .single();
    
  if (depositError) throw depositError;
  
  // 3. Create junction table records
  if (reportIds.length > 0) {
    const junctionRecords = reportIds.map(reportId => ({
      deposit_id: deposit.id,
      report_id: reportId
    }));
    
    const { error: junctionError } = await supabase
      .from('deposit_reports')
      .insert(junctionRecords);
      
    if (junctionError) throw junctionError;
  }
  
  return deposit;
}
```

### 3. **UPDATE Operations**

#### **Partial Updates with Type Safety**
```typescript
// ✅ TypeScript pattern with Partial<> and Omit<>
async updateDailyReport(
  reportId: string, 
  reportData: Partial<Omit<DailyReport, 'id' | 'created_at' | 'updated_at'>>
): Promise<DailyReport> {
  const { data, error } = await supabase
    .from('daily_reports')
    .update(reportData)
    .eq('id', reportId)
    .select('*')
    .single();
    
  if (error) throw error;
  return data;
}
```

#### **Array/JSON Field Updates**
```javascript
// Handling JSON/Array fields (like parts array)
async updateMaintenanceRecord(id, record, parts) {
  const normalizedParts = Array.isArray(parts) ? parts : [];
  
  const recordToUpdate = {
    ...record,
    parts: normalizedParts  // Direct array assignment for JSONB columns
  };
  
  const { data, error } = await supabase
    .from('maintenance_records')
    .update(recordToUpdate)
    .eq('id', id)
    .select();
}
```

### 4. **DELETE Operations**

#### **Simple Delete**
```javascript
async deleteRecord(id) {
  const { error } = await supabase
    .from('table_name')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
  return true;  // Indicate success
}
```

#### **Cascade Delete Pattern**
```javascript
// Manual cascade for complex relationships
async deleteDailyReport(reportId) {
  // 1. Delete related expenses first
  const { error: expenseError } = await supabase
    .from('daily_expenses')
    .delete()
    .eq('report_id', reportId);
    
  if (expenseError) throw expenseError;
  
  // 2. Delete junction table records
  const { error: junctionError } = await supabase
    .from('deposit_reports')
    .delete()
    .eq('report_id', reportId);
    
  if (junctionError) throw junctionError;
  
  // 3. Delete main record
  const { error } = await supabase
    .from('daily_reports')
    .delete()
    .eq('id', reportId);
    
  if (error) throw error;
}
```

## 📊 **Advanced Query Patterns**

### 1. **Analytics and Aggregations**
```javascript
// Using Supabase functions for complex analytics
async getFinancialSummary(startDate, endDate) {
  const { data, error } = await supabase
    .rpc('get_financial_summary', {  // Custom database function
      start_date: startDate,
      end_date: endDate
    });
    
  if (error) throw error;
  return data;
}

// Manual aggregation when functions aren't available
async getRevenueTrend(startDate, endDate) {
  const { data, error } = await supabase
    .from('daily_reports')
    .select(`
      report_date,
      ticket_revenue,
      baggage_revenue,
      cargo_revenue,
      daily_expenses(amount)
    `)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .eq('status', 'Operational')
    .order('report_date');
    
  // Process aggregations in JavaScript
  return data?.map(report => ({
    date: report.report_date,
    revenue: report.ticket_revenue + report.baggage_revenue + report.cargo_revenue,
    expenses: report.daily_expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0
  })) || [];
}
```

### 2. **File Upload Integration**
```javascript
// Pattern for handling file uploads with Supabase Storage
async uploadBankSlip(file, depositId) {
  const fileExt = file.name.split('.').pop();
  const fileName = `bank-slip-${depositId}-${Date.now()}.${fileExt}`;
  const filePath = `bank-slips/${fileName}`;
  
  const { data, error } = await supabase.storage
    .from('bank_deposits')  // Storage bucket name
    .upload(filePath, file);
    
  if (error) throw error;
  
  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('bank_deposits')
    .getPublicUrl(filePath);
    
  return publicUrl;
}
```

## ⚠️ **Critical Error Handling Patterns**

### 1. **Consistent Error Handling**
```javascript
// ✅ ALWAYS do this pattern
try {
  const { data, error } = await supabase.from('table').select();
  if (error) {
    console.error('Descriptive error message:', error);
    throw error;  // Re-throw for caller to handle
  }
  return data || [];  // Handle null data
} catch (error) {
  console.error('Service method error:', error);
  throw error;  // Let UI handle the error
}
```

### 2. **RLS Policy Debugging**
```javascript
// When getting unexplained empty results, log for RLS issues
async getData() {
  const { data, error } = await supabase.from('table').select();
  
  if (error) {
    console.error('Query error (check RLS policies):', error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    console.warn('No data returned - check RLS policies and user permissions');
  }
  
  return data || [];
}
```

## 🔐 **Authentication Integration**

### 1. **Getting Current User Context**
```javascript
// Pattern for user-aware operations
async createRecord(recordData) {
  // Get current user for created_by field
  const { data: { user } } = await supabase.auth.getUser();
  
  const dataWithUser = {
    ...recordData,
    created_by: user?.email || null
  };
  
  const { data, error } = await supabase
    .from('table')
    .insert([dataWithUser])
    .select()
    .single();
}
```

## 🎯 **Type Safety Best Practices**

### 1. **TypeScript Interface Definitions**
```typescript
// ✅ Define complete interfaces matching your database schema
export interface DailyReport {
  id: string;                    // UUID primary key
  vehicle_id: string;           // Foreign key
  report_date: string;          // Date as string (YYYY-MM-DD)
  status: 'Operational' | 'Non-Operational';  // Enum types
  ticket_revenue: number;       // Numeric fields
  created_at: string;           // Timestamp fields
  updated_at: string;
  
  // Optional joined fields (not in DB table)
  vehicles?: {
    plate: string;
  };
  daily_expenses?: DailyExpense[];
  total_revenue?: number;       // Computed fields
}

// ✅ Use Omit<> for create/update operations
type CreateDailyReport = Omit<DailyReport, 'id' | 'created_at' | 'updated_at'>;
type UpdateDailyReport = Partial<Omit<DailyReport, 'id' | 'created_at' | 'updated_at'>>;
```

## 🗄️ **Local Storage Integration**

### 1. **Hybrid Storage Pattern**
```javascript
// Pattern for combining Supabase with localStorage (seen in partService)
const initializeLocalStorage = () => {
  if (typeof window !== 'undefined') {
    if (!localStorage.getItem('custom_parts')) {
      localStorage.setItem('custom_parts', JSON.stringify([]));
    }
  }
};

const loadCustomParts = () => {
  if (typeof window !== 'undefined') {
    try {
      return JSON.parse(localStorage.getItem('custom_parts') || '[]');
    } catch (error) {
      console.error('Error loading custom parts:', error);
      return [];
    }
  }
  return [];
};

// Combine database and local data
async getPartsByCategory() {
  const customParts = loadCustomParts();
  const dbParts = await this.getDbParts();
  
  // Merge and format data
  return this.combineData(dbParts, customParts);
}
```

## 🚨 **Common Pitfalls to Avoid**

### 1. **Query Construction Mistakes**
```javascript
// ❌ DON'T: Forget parentheses in joins
.select('*, vehicles plate')  // Wrong!

// ✅ DO: Proper join syntax
.select('*, vehicles(plate)')

// ❌ DON'T: Forget to handle null data
return data;  // Could be null!

// ✅ DO: Always provide fallback
return data || [];
```

### 2. **RLS Policy Issues**
```javascript
// ❌ Common issue: Forgetting user context for RLS
const { data } = await supabase.from('user_reports').select();
// Returns empty if RLS expects user_id

// ✅ Check your RLS policies match your query patterns
```

### 3. **Date Handling Problems**
```javascript
// ❌ DON'T: Inconsistent date formats
date: new Date().toISOString()  // Includes time

// ✅ DO: Consistent date format for date-only fields
date: new Date().toISOString().split('T')[0]  // YYYY-MM-DD only
```

### 4. **Array/JSON Field Issues**
```javascript
// ❌ DON'T: Assume data structure
parts: parts  // Could be undefined or wrong type

// ✅ DO: Normalize data
parts: Array.isArray(parts) ? parts : []
```

## 📁 **Service Organization Best Practices**

### 1. **File Structure**
```
services/
├── financialService.ts     # Complex domain service (TypeScript)
├── vehicleService.js       # Simple CRUD service (JavaScript)  
├── maintenanceService.js   # Business logic service
├── supabaseService.js      # Generic utilities (avoid this pattern)
└── authService.js          # Authentication helpers
```

### 2. **Service Naming Conventions**
- Use `Service` suffix: `vehicleService`, `financialService`
- Export as named exports: `export const vehicleService = {}`
- Group related operations in single service
- Avoid generic `supabaseService` - be domain-specific

### 3. **Method Naming Patterns**
```javascript
// ✅ Consistent CRUD naming
getItems()          // Read all
getItemById(id)     // Read one
createItem(data)    // Create
updateItem(id, data) // Update  
deleteItem(id)      // Delete

// ✅ Business logic naming
getUndepositedReports()
calculateRevenueTrend()
generateFinancialSummary()
```

## 🛡️ **Security Best Practices**

### 1. **Input Validation**
```javascript
async createRecord(data) {
  // ✅ Validate required fields
  if (!data.vehicle_id) {
    throw new Error('vehicle_id is required');
  }
  
  // ✅ Sanitize user input
  const sanitizedData = {
    ...data,
    amount: parseFloat(data.amount) || 0,
    description: data.description?.trim() || null
  };
}
```

### 2. **User Context Validation**
```javascript
async updateUserRecord(id, data) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  // Include user context in updates for RLS
  const dataWithUser = {
    ...data,
    updated_by: user.email
  };
}
```

This comprehensive guide covers all the patterns, best practices, and critical considerations for building robust Supabase services based on real production code. Follow these patterns to avoid common pitfalls and build maintainable, type-safe services that handle complex business logic effectively.


Working with Supabase + Policies and guidelines

## 🚨 **CRITICAL WARNINGS**

### 1. **Row Level Security (RLS) - THE #1 GOTCHA**
- **ALWAYS enable RLS on all user-facing tables**
- **ALWAYS create complete CRUD policies** (SELECT, INSERT, UPDATE, DELETE)
- **Missing DELETE policies cause runtime errors** - this happened multiple times in this project

```sql
-- ❌ WRONG: Missing DELETE policy causes errors
CREATE POLICY "Allow authenticated users to view records" ON table_name FOR SELECT...

-- ✅ CORRECT: Complete policy set
CREATE POLICY "Allow authenticated users to view records" ON table_name FOR SELECT...
CREATE POLICY "Allow authenticated users to insert records" ON table_name FOR INSERT...  
CREATE POLICY "Allow authenticated users to update records" ON table_name FOR UPDATE...
CREATE POLICY "Allow authenticated users to delete records" ON table_name FOR DELETE...
```

### 2. **Function Parameter Order Disasters**
- **NEVER change function parameter order without dropping the function first**
- **Always DROP existing functions before recreating with different signatures**

```sql
-- ❌ WRONG: Will cause conflicts
CREATE OR REPLACE FUNCTION my_func(param1 TEXT, param2 DATE)...

-- ✅ CORRECT: Drop first, then recreate
DROP FUNCTION IF EXISTS my_func;
DROP FUNCTION IF EXISTS my_func(TEXT, DATE);
DROP FUNCTION IF EXISTS my_func(TEXT, DATE, NUMERIC);
CREATE OR REPLACE FUNCTION my_func(param1 TEXT, param2 DATE)...
```

### 3. **UUID vs Email Identity Crisis**
- **Be consistent with user identification** (UUID vs email)
- **Plan migration paths when changing user ID formats**
- **This project had to migrate from UUIDs to emails** - painful!

## 🏗️ **ARCHITECTURAL PATTERNS**

### 1. **Core Table Structure**
```sql
-- Standard table pattern used throughout this project
CREATE TABLE table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Foreign keys with CASCADE deletes
    parent_id UUID NOT NULL REFERENCES parent_table(id) ON DELETE CASCADE,
    
    -- Timestamps (CRITICAL for audit trails)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT, -- User email/identifier
    
    -- Business logic constraints
    CONSTRAINT meaningful_constraint_name CHECK (status IN ('Valid', 'States')),
    
    -- Unique constraints for business rules
    UNIQUE(parent_id, date_field) -- One record per parent per day
);
```

### 2. **Auto-Update Triggers Pattern**
```sql
-- Essential for tracking changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_table_name_updated_at
BEFORE UPDATE ON table_name
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

### 3. **Junction Table Pattern**
```sql
-- Many-to-many relationships
CREATE TABLE junction_table (
    parent1_id UUID NOT NULL REFERENCES table1(id) ON DELETE CASCADE,
    parent2_id UUID NOT NULL REFERENCES table2(id) ON DELETE CASCADE,
    PRIMARY KEY (parent1_id, parent2_id) -- Composite primary key
);
```

## 📊 **COMPLEX ANALYTICS FUNCTIONS**

### Key Patterns Learned:
1. **Use CTEs extensively** for readable complex queries
2. **Always handle COALESCE for NULL values**
3. **Use generate_series for date ranges**
4. **Return TABLE() for structured results**

```sql
CREATE OR REPLACE FUNCTION get_analytics(start_date DATE, end_date DATE)
RETURNS TABLE (
    date TEXT,
    revenue NUMERIC,
    expenses NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(start_date, end_date, '1 day'::INTERVAL)::DATE AS day
    ),
    revenue_data AS (
        SELECT report_date, SUM(revenue_field) as total_revenue
        FROM main_table 
        WHERE report_date BETWEEN start_date AND end_date
        GROUP BY report_date
    )
    SELECT 
        to_char(ds.day, 'YYYY-MM-DD') AS date,
        COALESCE(rd.total_revenue, 0) AS revenue,
        COALESCE(ed.total_expenses, 0) AS expenses
    FROM date_series ds
    LEFT JOIN revenue_data rd ON ds.day = rd.report_date
    ORDER BY ds.day;
END;
$$;
```

## 💾 **STORAGE POLICIES**

### File Upload Pattern:
```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('bucket-name', 'bucket-name', true)
ON CONFLICT (id) DO NOTHING;

-- Folder-based user isolation
CREATE POLICY "Users can upload to own folder" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'bucket-name' 
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
```

## 🔧 **DATA TYPE BEST PRACTICES**

### Learned from this project:
```sql
-- ✅ CORRECT: Precise decimal handling
amount NUMERIC(10, 2) -- For currency
large_amount NUMERIC(12, 2) -- For deposits

-- ✅ CORRECT: Proper constraints  
status TEXT NOT NULL CHECK (status IN ('Operational', 'Non-Operational'))

-- ✅ CORRECT: Conditional constraints
CONSTRAINT check_non_operational_reason CHECK (
    (status = 'Non-Operational' AND reason IS NOT NULL) OR
    (status = 'Operational')
)

-- ✅ CORRECT: Timestamps with timezone
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

## 🔍 **INDEXING STRATEGY**

```sql
-- Performance-critical indexes used in this project
CREATE INDEX idx_table_date ON table_name(date_field);
CREATE INDEX idx_table_foreign_key ON table_name(foreign_key_id);
CREATE INDEX idx_table_status ON table_name(status) WHERE status = 'Active';
```

## ⚠️ **COMMON PITFALLS TO AVOID**

### 1. **Missing CASCADE Deletes**
```sql
-- ❌ WRONG: Orphaned records
parent_id UUID REFERENCES parent_table(id)

-- ✅ CORRECT: Clean deletion
parent_id UUID REFERENCES parent_table(id) ON DELETE CASCADE
```

### 2. **Incomplete RLS Coverage**
- **Every table needs complete CRUD policies**
- **Junction tables often forgotten** (deposit_reports was missed initially)
- **Storage buckets need separate policies**

### 3. **Function Security**
```sql
-- ✅ ALWAYS use SECURITY DEFINER for functions that need elevated permissions
CREATE OR REPLACE FUNCTION sensitive_function()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER  -- This is critical!
AS $$
```

## 📝 **MIGRATION NAMING CONVENTION**

```
YYYYMMDD_HHMMSS_descriptive_action.sql
20241215_120000_add_daily_reports_delete_policy.sql
```

## 🛡️ **SECURITY CHECKLIST**

Before any migration:
- [ ] All tables have RLS enabled
- [ ] Complete CRUD policies exist
- [ ] Storage policies are restrictive
- [ ] Functions use appropriate security settings
- [ ] Foreign keys have proper CASCADE rules
- [ ] User identification is consistent
- [ ] Constraints prevent invalid data states

## 🔄 **ROLLBACK STRATEGIES**

Always plan rollbacks:
```sql
-- Document what this migration does
-- ROLLBACK: To undo this migration, run:
-- DROP POLICY "policy_name" ON table_name;
-- ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
```

## 💡 **DEBUGGING TIPS**

1. **Use `\dt` and `\dp` in psql** to check tables and permissions
2. **Check RLS policies with**: `SELECT * FROM pg_policies WHERE tablename = 'your_table';`
3. **Test policies with different user roles**
4. **Use RAISE NOTICE in functions** for debugging
5. **Check function signatures**: `\df function_name`

This project required **15 migrations** to get everything right. The main issues were always **missing RLS policies** and **function parameter conflicts**. Follow these patterns religiously and you'll avoid 90% of the pain! 🎯

