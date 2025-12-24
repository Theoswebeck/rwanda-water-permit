# Rwanda Water Resources Board Water Permit System Database Schema

## Overview

This comprehensive PostgreSQL schema is designed for the Rwanda Water Resources Board (RWB) water permit management system. It supports the complete workflow from application submission through review, inspection, and final approval, with robust data tracking and audit capabilities.

## Schema Features

### 🔐 **Security & Compliance**
- Row-Level Security (RLS) policies for Supabase
- Comprehensive audit logging
- Role-based access control
- Data encryption support

### 📊 **Data Structures**
- **13 Core Tables** with comprehensive relationships
- **Spatial data support** with PostGIS for GPS coordinates
- **JSONB fields** for flexible data storage
- **Enum types** for data consistency

### 🔄 **Automation**
- Auto-generated application and permit numbers
- Automatic timestamp updates
- Activity count tracking
- SLA status monitoring

### 🏛️ **Rwanda-Specific Features**
- Administrative divisions (Province, District, Sector, Cell)
- Kinyarwanda language support
- Local timezone handling (Africa/Kigali)
- Ministry compliance requirements

## Core Tables

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `users` | User management | Role-based, Individual/Company profiles |
| `applications` | Permit applications | Comprehensive form data, Workflow tracking |
| `permits` | Issued permits | Conditions, Expiry tracking, Renewal history |
| `documents` | File management | Verification status, Type classification |
| `inspections` | Site inspections | Detailed checklists, Evidence collection |
| `reviews` | Application reviews | Multi-stage workflow, Risk assessment |
| `approvals` | Final decisions | Approval conditions, Delegation tracking |
| `workflow_history` | Audit trail | Complete state change history |
| `communications` | Internal messaging | Comments, Notifications, Requests |
| `notifications` | User notifications | Email/SMS delivery tracking |
| `system_settings` | Configuration | Workflow parameters, System limits |
| `user_preferences` | User settings | UI preferences, Notification settings |
| `audit_logs` | Security audit | All system actions, IP tracking |

## Installation & Setup

### Prerequisites
- PostgreSQL 13+ with PostGIS extension
- Supabase project (recommended) or standalone PostgreSQL
- Database admin privileges

### Option 1: Supabase Setup (Recommended)

1. **Create new Supabase project**
   ```bash
   npx supabase init
   npx supabase start
   ```

2. **Apply the schema**
   ```bash
   # Copy schema.sql to Supabase migrations
   cp database/schema.sql supabase/migrations/20240101000000_initial_schema.sql
   
   # Apply migration
   npx supabase db push
   ```

3. **Enable required extensions in Supabase dashboard**
   - Go to Database → Extensions
   - Enable `uuid-ossp` and `postgis`

### Option 2: Standalone PostgreSQL

1. **Create database**
   ```sql
   CREATE DATABASE rwb_water_permits;
   \c rwb_water_permits;
   ```

2. **Apply schema**
   ```bash
   psql -d rwb_water_permits -f database/schema.sql
   ```

## Data Model Overview

### User Workflow
```
Applicant → Application → Review → Inspection → Approval → Permit
     ↓           ↓          ↓          ↓          ↓        ↓
 Documents → Workflow → Comments → Evidence → Decision → Audit
```

### Role-Based Access
- **Applicant**: Submit applications, upload documents, track status
- **Reviewer**: Review applications, request revisions, assign risk levels
- **Inspector**: Conduct site inspections, verify compliance, collect evidence
- **Approver**: Make final decisions, set permit conditions
- **Admin**: System oversight, user management, configuration

### Application States
```
draft → submitted → under_review → pending_inspection → approved/rejected
                                                     ↘
                                                   revision_required
```

## Key Features Explained

### 1. **Comprehensive Application Data**
The `applications` table captures all form data identified from your UI components:
- Personal/company information
- Project details with GPS coordinates
- Technical specifications
- Environmental assessments
- Infrastructure details
- Industry-specific fields

### 2. **Spatial Data Support**
```sql
-- GPS coordinates stored as PostGIS geometry
coordinates GEOMETRY(POINT, 4326)

-- Query applications within radius
SELECT * FROM applications 
WHERE ST_DWithin(coordinates, ST_MakePoint(lng, lat)::geography, 1000);
```

### 3. **Document Management**
- Type classification with verification status
- File metadata and size tracking
- Required vs optional document flags
- Upload audit trail

### 4. **Detailed Inspections**
Structured verification sections:
- **Location verification**: GPS, site plan compliance
- **Technical verification**: Infrastructure, water source
- **Environmental compliance**: Impact assessments
- **Regulatory compliance**: Permit conditions, reporting

### 5. **Automated Number Generation**
```sql
-- Applications: RWB-2024-000001
-- Permits: RWBP-2024-000001
```

### 6. **SLA Monitoring**
```sql
-- Automatic SLA status based on due dates
CREATE TYPE sla_status AS ENUM ('on_time', 'due_soon', 'overdue');
```

## Security & Permissions

### Row Level Security (RLS) Policies

The schema includes comprehensive RLS policies for Supabase:

```sql
-- Users can only see their own data
CREATE POLICY "Users can view their own applications"
    ON applications FOR SELECT
    USING (auth.uid() = applicant_id);

-- Role-based access for staff
CREATE POLICY "Reviewers can view assigned applications"
    ON applications FOR SELECT
    USING (auth.uid() = assigned_reviewer_id);
```

### Audit Trail
Every action is logged in `audit_logs` with:
- User ID and timestamp
- Action performed
- Before/after values
- IP address and user agent

## Performance Optimization

### Indexes
Strategic indexes on frequently queried columns:
- User email and roles
- Application status and numbers
- Assignment relationships
- Timestamp fields for reporting

### Query Optimization Tips
```sql
-- Use indexes for filtering
SELECT * FROM applications WHERE status = 'under_review';

-- Spatial queries with PostGIS
SELECT * FROM applications 
WHERE ST_DWithin(coordinates, ST_MakePoint(-1.9441, 30.0619), 50000);

-- Efficient pagination
SELECT * FROM applications 
ORDER BY created_at DESC 
LIMIT 20 OFFSET 0;
```

## Configuration

### System Settings
The `system_settings` table allows runtime configuration:

```sql
-- Example settings
INSERT INTO system_settings (key, value, description) VALUES
('application_timeout_days', '30', 'Days before application times out'),
('permit_renewal_notice_days', '90', 'Notice period for permit renewal'),
('max_file_size_mb', '10', 'Maximum upload file size');
```

### User Preferences
Users can customize their experience:
- Email/SMS notification preferences
- UI theme and language
- Dashboard layout
- Timezone settings

## Data Migration

### From Existing System
If migrating from an existing system:

1. **Map existing data** to new schema structure
2. **Create migration scripts** for each table
3. **Validate data integrity** after migration
4. **Update sequences** for auto-generated numbers

### Example Migration Script
```sql
-- Migrate existing users
INSERT INTO users (email, first_name, last_name, role, account_type)
SELECT email, first_name, last_name, 'applicant', 'individual'
FROM legacy_users;
```

## Monitoring & Maintenance

### Regular Tasks
- **Monitor permit expiries**: Query `permits` with `expiry_date`
- **Clean up old audit logs**: Archive logs older than retention period
- **Update SLA statuses**: Run scheduled job to update overdue applications
- **Backup spatial data**: Ensure PostGIS data is included in backups

### Performance Monitoring
```sql
-- Find slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
WHERE idx_scan = 0;
```

## Troubleshooting

### Common Issues

1. **PostGIS Extension Missing**
   ```sql
   CREATE EXTENSION IF NOT EXISTS "postgis";
   ```

2. **RLS Blocking Queries**
   - Check if user has proper role
   - Verify auth.uid() returns correct value
   - Review policy conditions

3. **Number Generation Conflicts**
   - Check sequence values
   - Ensure triggers are properly installed

4. **Performance Issues**
   - Analyze query plans with `EXPLAIN`
   - Check for missing indexes
   - Consider partitioning for large tables

## API Integration

This schema is designed to work seamlessly with:
- **Supabase Auto-generated APIs**
- **PostgREST**
- **GraphQL with Hasura**
- **Custom REST APIs**

### Example Supabase TypeScript Types
```typescript
export interface Application {
  id: string;
  applicant_id: string;
  application_number?: string;
  status: 'draft' | 'submitted' | 'under_review' | 'pending_inspection' | 'approved' | 'rejected';
  application_type: 'domestic' | 'industrial' | 'agricultural' | 'commercial' | 'municipal';
  // ... other fields
}
```

## Contributing

When modifying the schema:
1. **Test changes** in development environment
2. **Create migrations** for existing deployments
3. **Update documentation**
4. **Consider backwards compatibility**

## Support

For questions or issues:
- Review this documentation
- Check Supabase logs for errors
- Verify RLS policies
- Contact system administrator

---

**Version**: 1.0  
**Last Updated**: 2024  
**Compatible With**: PostgreSQL 13+, Supabase, PostGIS 3.0+ 