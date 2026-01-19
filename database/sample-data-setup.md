# Rwanda Water Resources Board - Comprehensive Sample Data Setup

## Overview ✨

I've created comprehensive sample data that demonstrates all the UX branching paths and includes all the new fields from the schema update. This data shows how the application form works with different:

- **Account Types**: Individual, Company, Cooperative, Organization, Institution
- **Application Types**: Domestic, Industrial, Agricultural, Commercial, Municipal
- **Water Sources**: Borehole, Surface Water, River, Spring, Dam
- **Water Purposes**: Domestic, Industrial, Irrigation, Commercial, Municipal Supply

## Sample Data Created 📊

### 1. Enhanced Users (5 Different Account Types)

| Account Type | User | Email | Organization | Location |
|-------------|------|-------|-------------|----------|
| Individual | Jean Baptiste Mukamana | jean.baptiste@sample.com | - | Kigali, Gasabo |
| Company | AgroTech Industries | contact@agrotech.rw | AgroTech Industries Ltd | Kigali, Gasabo |
| Cooperative | Ubwoba Farmers | info@farmerscoop.rw | Ubwoba Farmers Cooperative | Southern, Huye |
| Organization | Gorilla View Hotel | manager@hospitality.rw | Gorilla View Hotel & Resort | Northern, Musanze |
| Institution | District Admin | admin@kayonza.gov.rw | Kayonza District Administration | Eastern, Kayonza |

### 2. Comprehensive Applications (5 Different Scenarios)

#### Application 1: RWB-2025-000001 - Individual Domestic Borehole
- **Applicant**: Jean Baptiste Mukamana (Individual)
- **Type**: Domestic water supply
- **Source**: Borehole (Nyabugogo Aquifer)
- **Volume**: 25.5 m³/day
- **Status**: Submitted
- **Highlights**: 
  - Family of 8 members
  - Complete land ownership
  - Gravity-fed system with overhead tank
  - Environmental impact minimal

#### Application 2: RWB-2025-000002 - Company Industrial Surface Water
- **Applicant**: AgroTech Industries (Company)
- **Type**: Industrial food processing
- **Source**: Surface water (Nyabugogo River)
- **Volume**: 1,200 m³/day
- **Status**: Submitted
- **Highlights**:
  - Large-scale food processing plant
  - River intake with treatment plant
  - Multiple affected landowners
  - Comprehensive EIA completed

#### Application 3: RWB-2025-000003 - Cooperative Agricultural Irrigation
- **Applicant**: Ubwoba Farmers Cooperative (Cooperative)
- **Type**: Agricultural irrigation
- **Source**: River (Akanyaru River)
- **Volume**: 2,500 m³/day
- **Status**: Submitted
- **Highlights**:
  - 150-hectare rice cultivation
  - Serves 120 farmer families
  - Seasonal water availability
  - Lease agreements with local administration

#### Application 4: RWB-2025-000004 - Organization Commercial Spring
- **Applicant**: Gorilla View Hotel & Resort (Organization)
- **Type**: Commercial hospitality
- **Source**: Spring (Kinigi Natural Spring)
- **Volume**: 180 m³/day
- **Status**: Submitted
- **Highlights**:
  - 120-bed eco-tourism hotel
  - Gravity-fed spring capture
  - Volcanoes National Park buffer zone
  - Recorded easement with RDB

#### Application 5: RWB-2025-000005 - Institution Municipal Dam
- **Applicant**: Kayonza District Administration (Institution)
- **Type**: Municipal water supply
- **Source**: Dam (Kayonza Dam)
- **Volume**: 5,000 m³/day
- **Status**: Submitted
- **Highlights**:
  - Serves 15,000 residents
  - Upgrade existing infrastructure
  - Public land ownership
  - Automated control systems

## New Fields Demonstrated 🆕

### Enhanced Contact Information
- P.O. Box numbers
- Mobile and landline phones
- Business/incorporation certificate numbers
- Alternative contact person details (JSONB)

### Water Source Details
- Water body names and tributaries
- Catchment names (Level 1 & 2)
- Water reliability assessments
- Natural discharge volumes

### Water Usage Breakdown
- Daily/monthly/yearly volume maximums
- Flow rates in m³/second
- Abstraction facilities descriptions
- Return flow locations and volumes
- Duration specifications
- Pumping hours per day

### Project Details
- Proposed facilities descriptions
- Construction types
- Concession areas in hectares
- Operational overviews

### Land Ownership Information
- Land ownership status
- Affected landowners (JSONB arrays)
- Easement/consent/lease details
- Land access steps

## How to Use This Data 🚀

### Option 1: Direct SQL Execution (Recommended)
```sql
-- Connect to your Supabase database and run:
-- database/comprehensive-sample-data.sql
```

### Option 2: Through Application Interface
1. Navigate to the application form
2. Create new applications using the sample data as reference
3. Test different branching paths based on selections

### Option 3: API Integration
Use the sample data structure for testing API endpoints and form validations.

## Testing Scenarios 🧪

### UX Branching Paths to Test:

1. **Account Type Selection**:
   - Individual → Shows personal info fields
   - Company → Shows company info fields
   - Cooperative → Shows cooperative-specific fields
   - Organization → Shows organization details
   - Institution → Shows institutional information

2. **Application Type Selection**:
   - Domestic → Basic water usage fields
   - Industrial → Industrial-specific fields
   - Agricultural → Irrigation-specific fields
   - Commercial → Commercial usage fields
   - Municipal → Municipal supply fields

3. **Water Source Selection**:
   - Borehole → Drilling and pump details
   - Surface Water → Intake and treatment
   - River → Flow and environmental impact
   - Spring → Capture and protection
   - Dam → Reservoir and management

4. **Land Ownership Scenarios**:
   - Own all land → Simple approval
   - Recorded easement → Legal documentation
   - Written consent → Landowner agreements
   - Lease agreement → Rental arrangements
   - Access pending → Resolution process

## Data Validation ✅

All sample data includes:
- ✅ Required field validation
- ✅ Proper data types and formats
- ✅ Realistic values and calculations
- ✅ Proper relationships between entities
- ✅ Geographic coordinates (GPS)
- ✅ Comprehensive contact information
- ✅ Environmental assessments
- ✅ Technical specifications
- ✅ Legal documentation references

## Next Steps 🎯

1. **Execute the SQL script** to populate your database
2. **Test the application form** with different user types
3. **Verify branching logic** works correctly
4. **Test inspection workflows** with the submitted applications
5. **Validate review processes** with the sample data

## Database Schema Compatibility 🔗

This sample data is compatible with:
- ✅ Current base schema (`database/schema.sql`)
- ✅ Schema updates (`database/schema_update_comprehensive.sql`)
- ✅ Enhanced type definitions
- ✅ New field validations
- ✅ Updated enums and constraints

## Support 💬

All sample applications have **"submitted"** status and include:
- Complete applicant information
- Detailed project descriptions
- Environmental assessments
- Technical specifications
- Land ownership documentation
- Contact information
- GPS coordinates
- Financial estimates

Perfect for testing the complete application lifecycle! 