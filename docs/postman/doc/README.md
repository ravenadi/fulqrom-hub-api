# Fulqrom Hub API - Postman Collection

## Setup

1. Import `API.postman_collection.json` into Postman or use with Newman
2. Import `Local.postman_environment.json` environment file
3. Update `auth0_password` in the environment file

## Running Tests

```bash
# Clear library path conflicts and run collection
unset DYLD_LIBRARY_PATH && newman run ./docs/postman/API.postman_collection.json -e ./docs/postman/Local.postman_environment.json
```

## Authentication Flow

1. **Auth0 Login** - Get access token from Auth0
2. **Sync User** - Create user in MongoDB (run once per user)
3. **BFF Login** - Create session cookies (sid, csrf)
4. All subsequent requests use session cookies automatically

## Customer Endpoints - Features Implemented

###  Dynamic ID Management
- **List Customers**: Automatically saves first customer's `id` and `__v` to environment variables
- **Get Customer**: Uses `{{customer_id}}` variable from environment
- **Create Customer**: Saves newly created customer's `id` and `__v`
- **Update Customer**: Uses stored `{{customer_id}}` variable

###  Optimistic Locking (Version Control)
- **If-Match Header**: Format `W/"v{{customer_version}}"` (e.g., `W/"v0"`)
- **Auto Version Tracking**: Test scripts automatically update `customer_version` after each operation
- **Conflict Prevention**: API returns 409 if version mismatch detected

###  Test Scripts
All Customer endpoints include automated test scripts that:
- Extract and store customer IDs for reuse
- Track version numbers (__v) for updates
- Log success/failure messages
- Chain requests automatically

## Endpoint Status

### Authentication 
- Auth0 Login (Password Realm Grant)
- Sync User
- BFF Login (Session Creation)
- Get Current User
- Logout

### Customer CRUD
- List Customers (with ID/version extraction and search/filter options)
- Get Customer (uses dynamic ID)
- Create Customer (saves new ID/version and ID for delete, comprehensive schema)
- Update Customer (with If-Match version header, comprehensive schema)
- Delete Customer (uses ID from Create Customer)

#### Customer Schema - Complete Fields Reference

**List Customers - Query Parameters:**
- `search` - Filter by organisation name, business number, or trading name
- `limit` - Maximum results to return (default: 50)

**Create/Update Customer - Request Body:**

**Organisation** (organisation object):
- `organisation_name` - Organisation name (required for create)
- `email_domain` - Company email domain
- `logo_url` - URL to organisation logo
- `building_image` - URL to building/office image
- `notes` - Additional notes about organisation
- `metadata` - Key-value pairs for custom data (object)

**Company Profile** (company_profile object):
- `business_number` - ABN (11 digits, Australian Business Number)
- `company_number` - ACN (9 digits, Australian Company Number)
- `trading_name` - Trading/DBA name
- `industry_type` - Industry category
- `organisation_size` - Company size (e.g., "Small (1-50)", "Medium (50-250)", "Large (250+)")

**Business Address** (business_address object):
- `street` - Street address
- `suburb` - Suburb/city
- `state` - Australian state (NSW, VIC, QLD, SA, WA, TAS, NT, ACT)
- `postcode` - 4-digit postcode

**Postal Address** (postal_address object):
- `street` - Mailing street address
- `suburb` - Suburb/city
- `state` - Australian state
- `postcode` - 4-digit postcode

**Contact Methods** (contact_methods array):
- `full_name` - Contact person name
- `job_title` - Position/title
- `department` - Department name
- `role_type` - Role category
- `contact_type` - Contact category
- `platform_access` - Access level
- `is_primary` - Mark as primary contact (boolean)
- `contact_methods` - Array of contact methods:
  - `method_type` - Type (Email, Phone, Mobile, etc.)
  - `method_value` - Contact value (email address, phone number)
  - `label` - Display label
  - `is_primary` - Primary method for this contact (boolean)

**Metadata** (metadata array):
- `key` - Metadata key
- `value` - Metadata value

**System Fields:**
- `is_active` - Active status (boolean, default: true)

**Australian Data Standards:**
- ABN: 11 digits (business_number)
- ACN: 9 digits (company_number)
- States: NSW, VIC, QLD, SA, WA, TAS, NT, ACT
- Postcodes: 4 digits


### Dashboard 
- Portfolio Map



### Hierarchy
- Get Customer Hierarchy (full hierarchy: sites -> buildings -> floors -> assets)
- Get Site Hierarchy (site hierarchy: buildings -> floors -> assets)
- Get Building Hierarchy (building hierarchy: floors -> assets)
- Get Hierarchy Statistics (summary statistics for customer hierarchy)

### Entity Lists (for dropdowns/selection)
- List All Customers (Entity) - all customers for selection
- List All Sites (Entity) - all sites, optionally filtered by customer
- List All Buildings (Entity) - all buildings, filtered by site/customer
- List All Floors (Entity) - all floors, filtered by building/site/customer
- List All Assets (Entity) - all assets, filtered by building/floor
- List All Tenants (Entity) - all building tenants, filtered by building/floor
- List All Vendors (Entity) - all vendors, optionally filtered by category

### Setting
- Get All Dropdowns

### Customer Contacts CRUD
- List Contacts (with ID/version extraction)
- Get Contact (uses dynamic ID)
- Get Primary Contact (saves primary contact ID)
- Search Contacts (by query, role type, contact type)
- Create Contact (saves new ID/version and ID for delete)
- Update Contact (with If-Match version header)
- Set Primary Contact (mark contact as primary)
- Delete Contact (uses ID from Create Contact)

### Site CRUD
- List Sites (with ID/version extraction)
- Get Site (uses dynamic ID)
- Create Site (saves new ID/version and ID for delete)
- Update Site (with If-Match version header)
- Delete Site (uses ID from Create Site)

### Building CRUD
- List Buildings (with ID/version extraction)
- Get Building (uses dynamic ID)
- Create Building (saves new ID/version and ID for delete)
- Update Building (with If-Match version header)
- Delete Building (uses ID from Create Building)

### Floor CRUD
- List Floors (with ID/version extraction)
- Get Floor (uses dynamic ID)
- Create Floor (saves new ID/version and ID for delete)
- Update Floor (with If-Match version header)
- Delete Floor (uses ID from Create Floor)

### Building Tenant CRUD
- List Building Tenants (with ID/version extraction)
- Get Building Tenant (uses dynamic ID)
- Create Building Tenant (saves new ID/version and ID for delete)
- Update Building Tenant (with If-Match version header)
- Delete Building Tenant (uses ID from Create Building Tenant)

### Asset CRUD
- List Assets (with ID/version extraction and comprehensive filtering)
- Get Asset (uses dynamic ID)
- Create Asset (saves new ID/version and ID for delete, comprehensive schema)
- Update Asset (with If-Match version header, comprehensive schema)
- Delete Asset (uses ID from Create Asset)

#### Asset Schema - Complete Fields Reference

**List Assets - Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50)
- `search` - Search by asset number, make, model, serial
- `category` - Asset category (Boiler System, Chiller System, Pump System, etc.)
- `status` - Status (Active, Inactive, Decommissioned)
- `condition` - Condition (Excellent, Good, Average, Poor, Critical)
- `criticality_level` - Criticality (Low, Medium, High, Critical)
- `customer_id`, `site_id`, `building_id`, `floor_id` - Location filters
- `make`, `model` - Equipment filters
- `level`, `area` - Location detail filters
- `device_id`, `asset_no`, `asset_id` - ID filters
- `refrigerant` - Refrigerant type filter
- `owner`, `service_status` - Ownership/service filters
- `age_min`, `age_max` - Age range (years)
- `purchase_cost_min`, `purchase_cost_max` - Cost range (AUD)
- `current_value_min`, `current_value_max` - Value range (AUD)
- `test_result` - Test result filter
- `is_active` - Active status filter
- `sort_by`, `sort_order` - Sorting options

**Create/Update Asset - Request Body:**

**Hierarchy & Location:**
- `customer_id` - Customer ID (required for create)
- `site_id` - Associated site
- `building_id` - Associated building
- `floor_id` - Associated floor
- `level` - Level/floor level (e.g., "Ground Floor", "Level 2")
- `area` - Area/location within floor

**Asset Identification:**
- `asset_id` - Custom asset ID
- `asset_no` - Asset number (unique per customer)
- `device_id` - IoT device ID

**Classification & Status:**
- `status` - Status (Active, Inactive, Decommissioned)
- `category` - Category (Boiler System, Chiller System, Pump System, AHU, Fan Coil Unit, Cooling Tower, VRV/VRF System, etc.)
- `type` - Specific type (e.g., "Chiller - Water Cooled", "Boiler - Gas Fired")
- `condition` - Condition (Excellent, Good, Average, Poor, Critical)
- `criticality_level` - Criticality level (Low, Medium, High, Critical)

**Equipment Details:**
- `make` - Manufacturer/make
- `model` - Model number
- `serial` - Serial number

**HVAC/Refrigerant Information:**
- `refrigerant` - Refrigerant type (R-134a, R-410A, R-407C, etc.)
- `refrigerant_capacity` - Refrigerant capacity (e.g., "150 kg")
- `refrigerant_consumption` - Annual consumption (e.g., "2.5 kg/year")

**Ownership & Service:**
- `owner` - Asset owner
- `da19_life_expectancy` - Expected life (years)
- `service_status` - Service status (Under Warranty, Maintenance Contract, Ad-hoc)

**Dates & Testing:**
- `date_of_installation` - Installation date (ISO 8601 or Date object)
- `age` - Age in years (string)
- `last_test_date` - Last test/inspection date
- `last_test_result` - Test result description

**Financial Information:**
- `purchase_cost_aud` - Purchase cost in AUD
- `current_book_value_aud` - Current book value in AUD
- `weight_kgs` - Weight in kilograms

**System:**
- `is_active` - Active status (default: true)

**Australian Standards:**
- Currency: AUD (Australian Dollars)
- Weights: Metric (kg)
- Refrigerant standards: AS/NZS compliance


### Vendor CRUD
- List Vendors (with ID/version extraction)
- Get Vendor (uses dynamic ID)
- Create Vendor (saves new ID/version and ID for delete)
- Update Vendor (with If-Match version header)
- Delete Vendor (uses ID from Create Vendor)

### Document CRUD
- List Documents (with ID/version extraction and comprehensive filtering)
- Get Document (uses dynamic ID)
- Create Document (multipart/form-data with file upload, saves new ID/version and ID for delete)
- Update Document (with If-Match version header, comprehensive schema)
- Delete Document (uses ID from Create Document)

### Document Version/History Management
- Create New Document Version (upload new version with file, maintains history, saves version_id)
- Get All Document Versions (retrieve complete version history, saves first version_id)
- Download Specific Version (download any previous version using version_id)
- Restore Document Version (rollback to previous version)

### Document File Operations
- Download Document File (download current document file)
- Preview Document (get preview URL for current file)

### Document Approval Workflow
- Request Approval (request approval from an approver)
- Approve Document (approve a pending document)
- Reject Document (reject a document with comment)
- Revoke Approval (revoke a previously granted approval)
- Get Pending Approvals (get all documents pending approval for current user)
- Get Approval History (get complete approval history for a document)

### Document Comments & Reviews
- Get Comments (retrieve all comments for a document)
- Add Review/Comment (add a review or comment to a document)

#### Document Schema - Complete Fields Reference

**List Documents - Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 20)
- `search` - Search by name, description, tags
- `category` - Document category filter
- `type` - Document type filter
- `status` - Document status filter
- `customer_id`, `site_id`, `building_id`, `floor_id` - Location filters
- `asset_id`, `tenant_id`, `vendor_id` - Association filters
- `tags` - Tag filter
- `sort_by`, `sort_order` - Sorting options

**Create Document - Multipart Form Data:**
- `file` - File to upload (required) - Select file in Postman's Body tab
- `name` - Document name (required)
- `category` - Document category (required - Compliance, Drawing Register, Manual, Report, etc.)
- `type` - Document type (required - Certificate, Plan, Procedure, etc.)
- `customer_id` - Customer ID (required)
- `description`, `building_id`, `site_id`, `floor_id`, `tags` - Optional fields
- **Supported formats:** PDF, DOCX, XLSX, DWG, DXF, JPG, PNG, TXT, ZIP
- **Content-Type:** multipart/form-data
- **Returns:** Created document with file metadata (file_name, file_size, file_type, file_url, etc.)
- **File Storage:** S3 with secure URLs
- **Note:** File upload is integrated into Create Document endpoint (POST /api/documents)

**Update Document - Request Body (JSON):**

**Basic Information:**
- `name` - Document name (required for create)
- `description` - Document description
- `version` - Version number (default: "1.0")
- `category` - Document category (required for create - Compliance, Drawing Register, Manual, Report, etc.)
- `type` - Document type (required for create - Certificate, Plan, Procedure, etc.)
- `engineering_discipline` - Engineering discipline (HVAC, Electrical, Mechanical, etc.)
- `status` - Document status (Draft, Approved, Archived, etc.)

**Compliance & Regulatory:**
- `regulatory_framework` - Regulatory standard (e.g., AS/NZS 3666.1:2011)
- `certification_number` - Certificate/permit number
- `compliance_framework` - Compliance framework name
- `compliance_status` - Compliance status
- `issue_date` - Issue date (YYYY-MM-DD)
- `expiry_date` - Expiry date (YYYY-MM-DD)
- `review_date` - Next review date (YYYY-MM-DD)
- `frequency` - Review frequency (weekly, monthly, quarterly, annual)

**File Information (file.file_meta object):**
- `file_name` - File name
- `file_size` - Size in bytes
- `file_type` - MIME type
- `file_extension` - Extension (pdf, docx, dwg, etc.)
- `file_url` - S3 URL
- `file_path` - Path in bucket
- `file_key` - S3 key
- `bucket_name` - S3 bucket name
- `version` - File version

**Tags:**
- `tags.tags` - Array of tags for categorization

**Location & Associations:**
- `location.site.site_id` - Associated site
- `location.building.building_id` - Associated building
- `location.floor.floor_id` - Associated floor
- `location.assets` - Array of associated assets (asset_id, asset_name, asset_type)
- `location.tenant.tenant_id` - Associated tenant
- `location.vendor.vendor_id` - Associated vendor
- `customer.customer_id` - Customer ID (required for create)

**Drawing Register Information (drawing_info object):**
- `date_issued` - Issue date
- `drawing_status` - Drawing status
- `prepared_by` - Prepared by
- `drawing_scale` - Scale (e.g., 1:100)
- `approved_by_user` - Approver name
- `related_drawings` - Array of related drawing references (document_id, document_name)

**Access Control (access_control object):**
- `access_level` - Access level (internal, confidential, public)
- `access_users` - Array of user emails with access

**Approval Workflow (approval_config object):**
- `enabled` - Enable approval workflow (boolean)
- `status` - Approval status (Pending, Approved, Rejected)
- `approvers` - Array of approver objects (user_id, user_name, user_email)


### Document Approval Flow
- Request Approval (request document approval from approver)
- Approve Document (approve a pending document)
- Reject Document (reject with required comment)
- Revoke Approval (revoke previously granted approval)
- Get Pending Approvals (list documents awaiting approval)
- Get Approval History (view complete approval timeline)

### Document Comments
- Get Comments (retrieve all document comments)
- Add Review/Comment (post comment with optional rating)

### User Profile
- Get Current User (GET /auth/me)

### User Management CRUD
- List Users (with ID/version extraction)
- Get User (uses dynamic ID)
- Create User (saves new ID/version and ID for delete)
- Update User (with If-Match version header)
- Delete User (uses ID from Create User)


### Notification
- Get Notifications (with filtering and pagination, saves first notification ID)
- Get Unread Count (count of unread notifications)
- Mark Notification as Read (mark single notification)
- Mark Multiple as Read (mark multiple by IDs)
- Mark All as Read (mark all notifications)
- Delete Notification (delete single notification)
- Delete All Read Notifications (bulk delete read notifications)

### Organisation
- Get Current Organisation (saves ID/version)
- Update Organisation (with If-Match version header)

### Activity/Audit Log
- List Audit Logs (with ID extraction)
- Create Audit Log (saves new ID)

### SaaS Tenant CRUD (Super Admin)
- List Tenants (with ID/version extraction)
- Get Tenant (uses dynamic ID)
- Create Tenant (saves new ID/version and ID for delete)
- Update Tenant (with If-Match version header)
- Delete Tenant (uses ID from Create Tenant)

### SaaS Dashboard (Super Admin)
- Get All Stats
- Get Usage Analytics
- Get Overview Analytics

### Other Modules (Not Implemented)
- Settings (not available in API)
- Guest

## Environment Variables

### Required (Set in Local.postman_environment.json)
- `API_BASE_URL`: http://localhost:30001
- `AUTH0_DOMAIN`: dev-ml7pxvj6vg32j740.au.auth0.com
- `AUTH0_CLIENT_ID`: Your Auth0 client ID
- `AUTH0_CLIENT_SECRET`: Your Auth0 client secret
- `AUTH0_AUDIENCE`: https://api.fulqrom.com.au
- `auth0_username`: demo@fulqrom.com.au
- `auth0_password`: Your password
- `auth0_scope`: openid profile email

### Auto-Generated (Set by test scripts)
- `access_token`: Auth0 access token
- `customer_id`: Current customer ID
- `customer_version`: Current customer version (__v)
- `customer_id_for_delete`: Customer ID saved from Create Customer for deletion
- `contact_id`: Current contact ID
- `contact_version`: Current contact version (__v)
- `contact_id_for_delete`: Contact ID saved from Create Contact for deletion
- `primary_contact_id`: Primary contact ID
- `site_id`: Current site ID
- `site_version`: Current site version (__v)
- `site_id_for_delete`: Site ID saved from Create Site for deletion
- `building_id`: Current building ID
- `building_version`: Current building version (__v)
- `building_id_for_delete`: Building ID saved from Create Building for deletion
- `floor_id`: Current floor ID
- `floor_version`: Current floor version (__v)
- `floor_id_for_delete`: Floor ID saved from Create Floor for deletion
- `tenant_id`: Current building tenant ID
- `tenant_version`: Current building tenant version (__v)
- `tenant_id_for_delete`: Building tenant ID saved from Create Building Tenant for deletion
- `asset_id`: Current asset ID
- `asset_version`: Current asset version (__v)
- `asset_id_for_delete`: Asset ID saved from Create Asset for deletion
- `vendor_id`: Current vendor ID
- `vendor_version`: Current vendor version (__v)
- `vendor_id_for_delete`: Vendor ID saved from Create Vendor for deletion
- `document_id`: Current document ID
- `document_version`: Current document version (__v)
- `document_id_for_delete`: Document ID saved from Create Document for deletion
- `user_id`: Current user ID
- `user_version`: Current user version (__v)
- `user_id_for_delete`: User ID saved from Create User for deletion
- `notification_id`: Current notification ID
- `organisation_id`: Current organisation ID
- `organisation_version`: Current organisation version (__v)
- `audit_log_id`: Current audit log ID
- `saas_tenant_id`: Current SaaS tenant ID
- `saas_tenant_version`: Current SaaS tenant version (__v)
- `saas_tenant_id_for_delete`: Tenant ID saved from Create Tenant for deletion

## Version Control Details

The API uses optimistic locking to prevent concurrent update conflicts:

1. **Read**: Get customer with current version (e.g., `__v: 0`)
2. **Update**: Send `If-Match: W/"v0"` header
3. **Success**: Version increments (e.g., `__v: 1`)
4. **Conflict**: Returns 409 if version doesn't match (someone else updated)

## Test Results (Latest Run)

```
 Auth0 Login - 200 OK
 Sync User - 200 OK
 BFF Login - 200 OK (session created)
 Get Current User - 200 OK
 Logout - 200 OK
 Portfolio Map - 200 OK
 List Customers - 200 OK (saved ID & version)
 Get Customer - 200 OK (used dynamic ID)
 Create Customer - 201 Created (saved new ID & version)
 Update Customer - 200 OK (version incremented 0 � 1)
 Health Check - 200 OK

Total: 11 requests, 0 failed
```

## Notes

- Session cookies (sid, csrf) are automatically managed by Postman/Newman
- All module ID and version variables persist across requests in the same run
- All modules follow the same pattern: extract IDs in List/Create, use in Get/Update/Delete
- All write operations (Update) include If-Match header for optimistic locking
- Test scripts automatically save resource IDs and versions to environment variables
- Version control prevents concurrent update conflicts using the __v field
- Delete operations use separate variables (`{resource}_id_for_delete`) to avoid conflicts with Get/Update workflows
- Delete endpoints perform soft deletes (resources are marked as deleted, not permanently removed)
