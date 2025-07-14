# Sample User Data for Application Form Testing

## Individual User (Current Implementation)
```javascript
const userData = {
  email: "jane.doe@example.com",
  name: "Jane Doe",
  phone: "+250 789 123 456",
  address: "KN 5 Ave, Kigali, Rwanda",
  idNumber: "1 1980 8 0123456 7 89",
  account_type: 'individual',
  id_number: "1 1980 8 0123456 7 89",
  company_tin: undefined,
};
```
**Result**: Shows "National ID Number" field with value "1 1980 8 0123456 7 89" (read-only, verified)

## Company User (Sample)
```javascript
const userData = {
  email: "info@agrotech.rw",
  name: "AgroTech Industries Ltd",
  phone: "+250 788 555 002",
  address: "KG 9 Ave, Industrial Zone, Kigali",
  idNumber: undefined,
  account_type: 'company',
  id_number: undefined,
  company_tin: "123456789",
};
```
**Result**: Shows "TIN (Tax Identification Number)" field with value "123456789" (read-only, verified)

## Cooperative User (Sample)
```javascript
const userData = {
  email: "contact@ubwoba.coop",
  name: "Ubwoba Farmers Cooperative",
  phone: "+250 788 555 003",
  address: "Musanze District, Northern Province",
  idNumber: undefined,
  account_type: 'cooperative',
  id_number: undefined,
  company_tin: "987654321",
};
```
**Result**: Shows "TIN (Tax Identification Number)" field with value "987654321" (read-only, verified)

## Features Implemented

### ✅ Dynamic Field Labels
- Individual accounts: "National ID Number"
- Company/Cooperative/Organization/Institution accounts: "TIN (Tax Identification Number)"

### ✅ Read-only Verified Data
- Input field is disabled (cannot be edited)
- Shows "Verified" badge
- Explanation text: "This information was verified during account registration and cannot be changed here."

### ✅ Account Type Support
- Handles all account types: individual, company, cooperative, organization, institution
- Displays appropriate identification based on account type
- Falls back to "Not provided" if data is missing

### ✅ User Experience
- Clear indication that this is verified account data
- No confusion about why the field can't be edited
- Professional appearance with proper styling

## Implementation Benefits

1. **Security**: Prevents tampering with verified identification data
2. **Data Integrity**: Ensures applications use verified account information
3. **User Experience**: Clear indication of verified vs. editable data
4. **Compliance**: Meets Rwanda regulatory requirements for identification
5. **Scalability**: Works for all account types in the system 