# Entity Relationship Diagram (ERD)
## Digital Results Management System (DRMS)

### Database Design Overview

**Database Type**: PostgreSQL (Primary) + ClickHouse (Analytics)
**Design Pattern**: Normalized relational design with audit trails
**Scalability**: Designed for multi-tenant architecture with data partitioning

---

## Core Entities

### 1. Organizations & Users

#### `organizations`
```sql
organizations {
  id UUID PRIMARY KEY
  name VARCHAR(255) NOT NULL
  code VARCHAR(50) UNIQUE NOT NULL
  type ENUM('super_aggregator', 'partner', 'foundation') NOT NULL
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active'
  contact_email VARCHAR(255)
  contact_phone VARCHAR(50)
  address TEXT
  website VARCHAR(255)
  integration_config JSONB
  data_sharing_agreement JSONB
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `users`
```sql
users {
  id UUID PRIMARY KEY
  organization_id UUID NOT NULL REFERENCES organizations(id)
  email VARCHAR(255) UNIQUE NOT NULL
  password_hash VARCHAR(255) NOT NULL
  first_name VARCHAR(100) NOT NULL
  last_name VARCHAR(100) NOT NULL
  phone VARCHAR(50)
  role ENUM('super_admin', 'org_admin', 'coordinator', 'me_officer', 'viewer') NOT NULL
  status ENUM('active', 'inactive', 'pending_verification') DEFAULT 'pending_verification'
  last_login_at TIMESTAMP
  email_verified_at TIMESTAMP
  phone_verified_at TIMESTAMP
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `user_sessions`
```sq
user_sessions {
  id UUID PRIMARY KEY
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  token_hash VARCHAR(255) NOT NULL
  expires_at TIMESTAMP NOT NULL
  ip_address INET
  user_agent TEXT
  created_at TIMESTAMP DEFAULT NOW()
}
```

### 2. Results Framework

#### `results_frameworks`
```sql
results_frameworks {
  id UUID PRIMARY KEY
  name VARCHAR(255) NOT NULL
  description TEXT
  version VARCHAR(20) NOT NULL
  status ENUM('draft', 'active', 'archived') DEFAULT 'draft'
  effective_from DATE NOT NULL
  effective_to DATE
  created_by UUID NOT NULL REFERENCES users(id)
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `indicators`
```sql
indicators {
  id UUID PRIMARY KEY
  framework_id UUID NOT NULL REFERENCES results_frameworks(id)
  parent_indicator_id UUID REFERENCES indicators(id)
  code VARCHAR(50) NOT NULL
  name VARCHAR(255) NOT NULL
  description TEXT
  measurement_unit VARCHAR(100)
  data_type ENUM('numeric', 'percentage', 'boolean', 'text', 'date') NOT NULL
  aggregation_type ENUM('sum', 'average', 'count', 'max', 'min', 'custom') NOT NULL
  target_value DECIMAL(15,4)
  baseline_value DECIMAL(15,4)
  frequency ENUM('daily', 'weekly', 'monthly', 'quarterly', 'annually') NOT NULL
  is_cumulative BOOLEAN DEFAULT false
  validation_rules JSONB
  sort_order INTEGER
  status ENUM('active', 'inactive') DEFAULT 'active'
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `indicator_targets`
```sql
indicator_targets {
  id UUID PRIMARY KEY
  indicator_id UUID NOT NULL REFERENCES indicators(id)
  organization_id UUID NOT NULL REFERENCES organizations(id)
  target_value DECIMAL(15,4) NOT NULL
  reporting_period_start DATE NOT NULL
  reporting_period_end DATE NOT NULL
  notes TEXT
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
  
  UNIQUE(indicator_id, organization_id, reporting_period_start)
}
```

### 3. Data Collection & Results

#### `data_submissions`
```sql
data_submissions {
  id UUID PRIMARY KEY
  organization_id UUID NOT NULL REFERENCES organizations(id)
  submitted_by UUID NOT NULL REFERENCES users(id)
  reporting_period_start DATE NOT NULL
  reporting_period_end DATE NOT NULL
  submission_type ENUM('manual', 'api', 'bulk_upload') NOT NULL
  status ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected') DEFAULT 'draft'
  total_indicators INTEGER DEFAULT 0
  completed_indicators INTEGER DEFAULT 0
  data_quality_score DECIMAL(5,2)
  notes TEXT
  submitted_at TIMESTAMP
  reviewed_at TIMESTAMP
  reviewed_by UUID REFERENCES users(id)
  review_notes TEXT
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `indicator_results`
```sql
indicator_results {
  id UUID PRIMARY KEY
  submission_id UUID NOT NULL REFERENCES data_submissions(id) ON DELETE CASCADE
  indicator_id UUID NOT NULL REFERENCES indicators(id)
  organization_id UUID NOT NULL REFERENCES organizations(id)
  reported_value DECIMAL(15,4)
  text_value TEXT
  boolean_value BOOLEAN
  date_value DATE
  geographic_scope VARCHAR(255)
  data_source VARCHAR(255)
  methodology TEXT
  confidence_level ENUM('high', 'medium', 'low')
  is_estimated BOOLEAN DEFAULT false
  supporting_documents JSONB
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
  
  UNIQUE(submission_id, indicator_id)
}
```

### 4. Beneficiary Management

#### `beneficiaries`
```sql
beneficiaries {
  id UUID PRIMARY KEY
  external_id VARCHAR(100)
  organization_id UUID NOT NULL REFERENCES organizations(id)
  first_name VARCHAR(100)
  last_name VARCHAR(100)
  date_of_birth DATE
  gender ENUM('male', 'female', 'other', 'prefer_not_to_say')
  phone VARCHAR(50)
  email VARCHAR(255)
  national_id VARCHAR(50)
  location_country VARCHAR(3) -- ISO country code
  location_region VARCHAR(100)
  location_district VARCHAR(100)
  location_sector VARCHAR(100)
  coordinates POINT
  household_size INTEGER
  education_level VARCHAR(100)
  occupation VARCHAR(100)
  status ENUM('active', 'inactive', 'graduated') DEFAULT 'active'
  duplicate_status ENUM('unique', 'potential_duplicate', 'confirmed_duplicate') DEFAULT 'unique'
  master_beneficiary_id UUID REFERENCES beneficiaries(id)
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `beneficiary_programs`
```sql
beneficiary_programs {
  id UUID PRIMARY KEY
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id)
  organization_id UUID NOT NULL REFERENCES organizations(id)
  program_name VARCHAR(255) NOT NULL
  enrollment_date DATE NOT NULL
  graduation_date DATE
  status ENUM('enrolled', 'active', 'completed', 'dropped_out') DEFAULT 'enrolled'
  intervention_type VARCHAR(100)
  notes TEXT
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `duplicate_detection_results`
```sql
duplicate_detection_results {
  id UUID PRIMARY KEY
  beneficiary_1_id UUID NOT NULL REFERENCES beneficiaries(id)
  beneficiary_2_id UUID NOT NULL REFERENCES beneficiaries(id)
  match_score DECIMAL(5,2) NOT NULL
  match_criteria JSONB
  status ENUM('pending_review', 'confirmed_duplicate', 'not_duplicate') DEFAULT 'pending_review'
  reviewed_by UUID REFERENCES users(id)
  reviewed_at TIMESTAMP
  resolution_action ENUM('merge', 'keep_separate', 'needs_investigation')
  created_at TIMESTAMP DEFAULT NOW()
  
  UNIQUE(beneficiary_1_id, beneficiary_2_id)
}
```

### 5. Reporting & Analytics

#### `reports`
```sql
reports {
  id UUID PRIMARY KEY
  name VARCHAR(255) NOT NULL
  description TEXT
  report_type ENUM('dashboard', 'standard', 'custom', 'scheduled') NOT NULL
  template_config JSONB NOT NULL
  filters JSONB
  created_by UUID NOT NULL REFERENCES users(id)
  organization_id UUID REFERENCES organizations(id)
  is_public BOOLEAN DEFAULT false
  status ENUM('active', 'archived') DEFAULT 'active'
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `report_executions`
```sql
report_executions {
  id UUID PRIMARY KEY
  report_id UUID NOT NULL REFERENCES reports(id)
  executed_by UUID NOT NULL REFERENCES users(id)
  execution_type ENUM('manual', 'scheduled') NOT NULL
  status ENUM('running', 'completed', 'failed') NOT NULL
  parameters JSONB
  output_format ENUM('pdf', 'excel', 'csv', 'json') NOT NULL
  file_path VARCHAR(500)
  execution_time_ms INTEGER
  error_message TEXT
  started_at TIMESTAMP DEFAULT NOW()
  completed_at TIMESTAMP
}
```

### 6. Data Integration

#### `data_sources`
```sql
data_sources {
  id UUID PRIMARY KEY
  organization_id UUID NOT NULL REFERENCES organizations(id)
  name VARCHAR(255) NOT NULL
  source_type ENUM('api', 'database', 'file_upload', 'manual') NOT NULL
  connection_config JSONB
  field_mappings JSONB
  sync_frequency ENUM('real_time', 'hourly', 'daily', 'weekly', 'manual') NOT NULL
  last_sync_at TIMESTAMP
  next_sync_at TIMESTAMP
  status ENUM('active', 'inactive', 'error') DEFAULT 'active'
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `sync_logs`
```sql
sync_logs {
  id UUID PRIMARY KEY
  data_source_id UUID NOT NULL REFERENCES data_sources(id)
  sync_type ENUM('full', 'incremental') NOT NULL
  status ENUM('started', 'completed', 'failed') NOT NULL
  records_processed INTEGER DEFAULT 0
  records_created INTEGER DEFAULT 0
  records_updated INTEGER DEFAULT 0
  records_failed INTEGER DEFAULT 0
  error_details JSONB
  started_at TIMESTAMP DEFAULT NOW()
  completed_at TIMESTAMP
}
```

### 7. Workflow & Approvals

#### `approval_workflows`
```sql
approval_workflows {
  id UUID PRIMARY KEY
  name VARCHAR(255) NOT NULL
  entity_type ENUM('data_submission', 'indicator_result', 'beneficiary') NOT NULL
  organization_id UUID REFERENCES organizations(id)
  steps JSONB NOT NULL -- Array of approval steps
  is_default BOOLEAN DEFAULT false
  status ENUM('active', 'inactive') DEFAULT 'active'
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `approval_requests`
```sql
approval_requests {
  id UUID PRIMARY KEY
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id)
  entity_type VARCHAR(50) NOT NULL
  entity_id UUID NOT NULL
  requested_by UUID NOT NULL REFERENCES users(id)
  current_step INTEGER DEFAULT 1
  status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending'
  notes TEXT
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `approval_actions`
```sql
approval_actions {
  id UUID PRIMARY KEY
  request_id UUID NOT NULL REFERENCES approval_requests(id)
  step_number INTEGER NOT NULL
  approver_id UUID NOT NULL REFERENCES users(id)
  action ENUM('approve', 'reject', 'request_changes') NOT NULL
  comments TEXT
  created_at TIMESTAMP DEFAULT NOW()
}
```

### 8. System Configuration

#### `system_settings`
```sql
system_settings {
  id UUID PRIMARY KEY
  key VARCHAR(100) UNIQUE NOT NULL
  value JSONB NOT NULL
  description TEXT
  category VARCHAR(50)
  is_public BOOLEAN DEFAULT false
  updated_by UUID NOT NULL REFERENCES users(id)
  created_at TIMESTAMP DEFAULT NOW()
  updated_at TIMESTAMP DEFAULT NOW()
}
```

#### `notifications`
```sql
notifications {
  id UUID PRIMARY KEY
  user_id UUID NOT NULL REFERENCES users(id)
  type ENUM('info', 'warning', 'error', 'success') NOT NULL
  title VARCHAR(255) NOT NULL
  message TEXT NOT NULL
  action_url VARCHAR(500)
  is_read BOOLEAN DEFAULT false
  expires_at TIMESTAMP
  created_at TIMESTAMP DEFAULT NOW()
}
```

### 9. Audit & Logging

#### `audit_logs`
```sql
audit_logs {
  id UUID PRIMARY KEY
  user_id UUID REFERENCES users(id)
  organization_id UUID REFERENCES organizations(id)
  entity_type VARCHAR(50) NOT NULL
  entity_id UUID NOT NULL
  action ENUM('create', 'update', 'delete', 'view', 'export') NOT NULL
  old_values JSONB
  new_values JSONB
  ip_address INET
  user_agent TEXT
  created_at TIMESTAMP DEFAULT NOW()
}
```

#### `data_quality_scores`
```sql
data_quality_scores {
  id UUID PRIMARY KEY
  organization_id UUID NOT NULL REFERENCES organizations(id)
  indicator_id UUID REFERENCES indicators(id)
  submission_id UUID REFERENCES data_submissions(id)
  score_type ENUM('completeness', 'accuracy', 'consistency', 'timeliness') NOT NULL
  score DECIMAL(5,2) NOT NULL -- 0-100
  details JSONB
  calculated_at TIMESTAMP DEFAULT NOW()
}
```

---

## Entity Relationships

### Core Relationships

1. **Organizations → Users**: One-to-Many
   - Each organization can have multiple users
   - Each user belongs to one organization

2. **Results Framework → Indicators**: One-to-Many
   - Each framework contains multiple indicators
   - Indicators can have hierarchical relationships (parent-child)

3. **Organizations → Data Submissions**: One-to-Many
   - Each organization submits data independently
   - Submissions contain multiple indicator results

4. **Indicators → Indicator Results**: One-to-Many
   - Each indicator can have multiple results across time periods
   - Results are linked to specific submissions

5. **Organizations → Beneficiaries**: One-to-Many
   - Each organization manages their own beneficiaries
   - Duplicate detection works across organizations

6. **Users → Approval Actions**: One-to-Many
   - Users can approve/reject multiple requests
   - Actions are tracked with timestamps

### Data Flow Relationships

```
Organizations → Data Sources → Sync Logs
     ↓
Data Submissions → Indicator Results
     ↓
Approval Workflows → Approval Requests → Approval Actions
     ↓
Reports → Report Executions
```

---

## Indexing Strategy

### Primary Indexes
```sql
-- Performance indexes
CREATE INDEX idx_users_org_email ON users(organization_id, email);
CREATE INDEX idx_submissions_org_period ON data_submissions(organization_id, reporting_period_start);
CREATE INDEX idx_results_indicator_org ON indicator_results(indicator_id, organization_id);
CREATE INDEX idx_beneficiaries_org_status ON beneficiaries(organization_id, status);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at);

-- Search indexes
CREATE INDEX idx_beneficiaries_search ON beneficiaries USING gin(to_tsvector('english', first_name || ' ' || last_name));
CREATE INDEX idx_indicators_search ON indicators USING gin(to_tsvector('english', name || ' ' || description));

-- Geographic indexes
CREATE INDEX idx_beneficiaries_location ON beneficiaries USING gist(coordinates);
```

### Partitioning Strategy
```sql
-- Partition audit logs by month for performance
CREATE TABLE audit_logs_y2025m01 PARTITION OF audit_logs 
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Partition indicator results by reporting period
CREATE TABLE indicator_results_2025q1 PARTITION OF indicator_results 
FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
```

---

## Data Constraints & Business Rules

### Data Integrity Rules
1. **Temporal Consistency**: `reporting_period_end` must be after `reporting_period_start`
2. **Hierarchical Integrity**: Indicators cannot reference themselves as parent
3. **Organization Isolation**: Users can only access data from their organization (unless super_admin)
4. **Submission Workflow**: Results can only be modified when submission is in 'draft' status
5. **Duplicate Prevention**: Beneficiaries cannot be duplicated within the same organization

### Check Constraints
```sql
ALTER TABLE data_submissions 
ADD CONSTRAINT check_reporting_period 
CHECK (reporting_period_end > reporting_period_start);

ALTER TABLE indicator_targets 
ADD CONSTRAINT check_target_period 
CHECK (reporting_period_end > reporting_period_start);

ALTER TABLE indicators 
ADD CONSTRAINT check_no_self_reference 
CHECK (id != parent_indicator_id);
```

---

## Security Considerations

### Row Level Security (RLS)
```sql
-- Enable RLS on sensitive tables
ALTER TABLE data_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiaries ENABLE ROW LEVEL SECURITY;

-- Organization-based access control
CREATE POLICY org_isolation_policy ON data_submissions
FOR ALL TO authenticated_users
USING (organization_id = current_user_organization());
```

### Data Encryption
- Sensitive PII fields encrypted at application level
- Database connections use TLS 1.3
- Backup encryption using AES-256

### Audit Requirements
- All data modifications logged in `audit_logs`
- User access patterns tracked
- Failed login attempts monitored
- Data export activities logged

---

## Performance Optimization

### Read Replicas
- Analytics queries routed to read replicas
- Dashboard data cached with Redis
- Real-time metrics using materialized views

### Caching Strategy
- User sessions cached for 24 hours
- Report results cached based on data freshness
- Indicator metadata cached until framework changes

### Data Archival
- Historical data older than 7 years archived
- Audit logs retained for 5 years
- Soft deletes used for critical entities

---

**Document Version**: 1.0  
**Created**: September 15, 2025  
**Author**: Senior Database Engineer  
**Review Status**: Ready for Technical Review
