# Fulqrom Hub REST API

## Project Overview
REST API for the Fulqrom Hub - Australian Commercial Real Estate & HVAC Building Management System.

## Technology Stack
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (Mongoose ODM)
- **Environment:** Node.js 18+

## Database Connection
```
MONGODB_CONNECTION=mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/fulqrom-hub
```

## Development Commands
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## API Endpoints

### Customers Module
- `GET /api/customers` - List all customers
- `GET /api/customers/:id` - Get single customer by ID
- `GET /api/customers/debug/collections` - Debug: List database collections

### Health Check
- `GET /health` - API health status
- `GET /` - API information

## Customer Schema Fields
Based on the UI form, the Customer model includes:

### Organisation Information
- `organisationName` (required)
- `logoUrl`

### Company Profile
- `abn` (required, unique, 11 digits)
- `acn` (9 digits)
- `tradingName`
- `industryType`
- `organisationSize`

### Addresses
- `businessAddress` (street, suburb, state, postcode)
- `postalAddress` (street, suburb, state, postcode)

### Role & Responsibilities
- `role.title`
- `role.department`
- `role.roleType` (Primary, Secondary, Other)
- `role.contactType` (Internal, External, Other)
- `role.platformAccess` (Operational, View Only, Admin, None)

### Contacts
Array of contacts with:
- `fullName`
- `type` (Email, Phone, Other)
- `emailAddress`
- `label`
- `isPrimary`

### Additional
- `organisationNotes`
- `additionalInfo` (key-value pairs)
- `status` (active, inactive, pending)

## Australian Context
- **States:** NSW, VIC, QLD, WA, SA, TAS, ACT, NT
- **Postcodes:** 4-digit format
- **ABN:** 11-digit Australian Business Number
- **ACN:** 9-digit Australian Company Number

## Current Status
- ✅ Basic Express server setup
- ✅ MongoDB connection configured
- ✅ Customer model with comprehensive schema
- ✅ GET endpoints for customers
- ✅ Error handling middleware
- ✅ Health check endpoints

## Testing
```bash
# Health check
curl -X GET http://localhost:3000/health

# Get all customers
curl -X GET http://localhost:3000/api/customers

# Debug collections
curl -X GET http://localhost:3000/api/customers/debug/collections
```

## Next Steps
1. Add POST/PUT/DELETE operations for customers
2. Add validation middleware
3. Add authentication
4. Add other modules (sites, buildings, assets)
5. Add proper error responses
6. Add API documentation