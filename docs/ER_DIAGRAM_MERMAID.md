# ER Diagram - Mermaid Format

This file contains the ER diagram in Mermaid syntax for visual rendering in Markdown viewers that support Mermaid.

## Complete Entity Relationship Diagram

```mermaid
erDiagram
    %% Core SaaS Entities
    Tenant ||--|| Organization : "has"
    Tenant ||--o| TenantOrg : "has"
    Plan ||--o{ Tenant : "subscribes"
    Plan ||--o{ Organization : "subscribes"
    Plan ||--o{ Customer : "subscribes"
    
    %% User & Access Control
    User ||--o{ UserSession : "has"
    User }o--o{ Role : "assigned"
    User ||--o{ AuditLog : "creates"
    Organization ||--o| User : "owned_by"
    
    %% Property Hierarchy
    Customer ||--o{ Site : "owns"
    Site ||--o{ Building : "contains"
    Building ||--o{ Floor : "contains"
    Floor }o--o{ Building : "in"
    Site }o--o{ Floor : "contains"
    
    %% Building Tenants
    Organization ||--o{ BuildingTenant : "leases"
    Site ||--o{ BuildingTenant : "located_at"
    Building ||--o{ BuildingTenant : "occupies"
    Floor ||--o{ BuildingTenant : "occupies"
    Customer ||--o{ BuildingTenant : "manages"
    
    %% Assets
    Customer ||--o{ Asset : "owns"
    Site ||--o{ Asset : "located_at"
    Building ||--o{ Asset : "installed_in"
    Floor ||--o{ Asset : "installed_on"
    
    %% Vendors
    Vendor ||--o| Vendor : "self"
    
    %% Documents
    Document ||--o{ DocumentComment : "has"
    Document }o--o| Site : "relates_to"
    Document }o--o| Building : "relates_to"
    Document }o--o| Floor : "relates_to"
    Document }o--o| Asset : "relates_to"
    Document }o--o| BuildingTenant : "relates_to"
    Document }o--o| Vendor : "relates_to"
    Document }o--o| Customer : "relates_to"
    
    %% Notifications
    User ||--o{ Notification : "receives"
    Document ||--o{ Notification : "triggers"
    DocumentComment ||--o{ Notification : "triggers"
    
    %% Entity Definitions
    Tenant {
        ObjectId _id PK
        string tenant_name
        string phone
        string status
        ObjectId plan_id FK
        object plan_status
        string s3_bucket_name
        date created_at
        date updated_at
    }
    
    Organization {
        ObjectId _id PK
        ObjectId tenant_id FK "unique"
        string name
        string slug "unique"
        string email
        string phone
        string abn
        string acn
        object address
        ObjectId plan_id FK
        string status
        ObjectId owner_id FK
        object limits
        object current_usage
        date created_at
    }
    
    Plan {
        ObjectId _id PK
        string name
        string plan_tier
        string slug "unique"
        number price
        string time_period
        number max_users
        number max_documents
        number max_storage_gb
        boolean is_active
        boolean is_default
    }
    
    User {
        ObjectId _id PK
        string email "unique"
        string full_name
        string phone
        string auth0_id
        array role_ids FK
        array resource_access
        boolean is_active
        date created_at
    }
    
    Role {
        ObjectId _id PK
        string name "unique"
        string description
        array permissions
        boolean is_active
    }
    
    UserSession {
        ObjectId _id PK
        string session_id "unique"
        ObjectId user_id FK
        string auth0_id
        ObjectId tenant_id FK
        string csrf_token
        boolean is_active
        date expires_at
    }
    
    Site {
        ObjectId _id PK
        ObjectId tenant_id FK
        string site_name
        string site_code
        string type
        object address
        ObjectId customer_id FK
        string status
        boolean is_active
        date created_date
    }
    
    Building {
        ObjectId _id PK
        ObjectId tenant_id FK
        ObjectId site_id FK
        string building_name
        string building_code
        string building_type
        string primary_use
        ObjectId customer_id FK
        object address
        number number_of_floors
        number nabers_rating
        string status
        boolean is_active
    }
    
    Floor {
        ObjectId _id PK
        ObjectId tenant_id FK
        ObjectId site_id FK
        ObjectId building_id FK
        string floor_name
        number floor_number
        string floor_type
        number maximum_occupancy
        ObjectId customer_id FK
        string status
    }
    
    BuildingTenant {
        ObjectId _id PK
        ObjectId tenant_id FK
        ObjectId site_id FK
        ObjectId building_id FK
        ObjectId floor_id FK
        string tenant_name
        string tenant_legal_name
        string abn
        string lease_type
        date lease_start_date
        date lease_end_date
        number occupied_area
        string tenant_status
        ObjectId customer_id FK
        boolean is_active
    }
    
    Asset {
        ObjectId _id PK
        ObjectId tenant_id FK
        ObjectId customer_id FK
        ObjectId site_id FK
        ObjectId building_id FK
        ObjectId floor_id FK
        string asset_id
        string asset_no
        string status
        string category
        string type
        string make
        string model
        string serial
        date date_of_installation
        boolean is_active
    }
    
    Vendor {
        ObjectId _id PK
        ObjectId tenant_id FK
        string contractor_name
        string trading_name
        string abn
        string email
        string phone
        object address
        string contractor_type
        array licenses
        array insurances
        array certifications
        array contacts
        string status
        boolean is_active
    }
    
    Customer {
        ObjectId _id PK
        ObjectId tenant_id FK
        object organisation
        object company_profile
        object business_address
        object postal_address
        array contact_methods
        ObjectId plan_id FK
        boolean is_active
    }
    
    Document {
        ObjectId _id PK
        ObjectId tenant_id FK
        string name
        string description
        string version
        string category
        string type
        string status
        object file
        object location
        object customer
        object drawing_info
        object access_control
        object approval_config
        string document_group_id
        string version_number
        boolean is_current_version
        array version_history
        date created_at
    }
    
    DocumentComment {
        ObjectId _id PK
        ObjectId tenant_id FK
        ObjectId document_id FK
        string user_id
        string user_name
        string user_email
        string comment
        string status
        boolean is_active
        date created_at
    }
    
    Notification {
        ObjectId _id PK
        ObjectId tenant_id FK
        string user_id
        string user_email
        string title
        string message
        string type
        string priority
        ObjectId document_id FK
        ObjectId comment_id FK
        boolean is_read
        date created_at
    }
    
    AuditLog {
        ObjectId _id PK
        ObjectId tenant_id FK
        string action
        string description
        string module
        ObjectId module_id
        object user
        string ip
        string agent
        date created_at
    }
```

## Relationship Types

### One-to-One (||--||)
- Tenant ↔ Organization
- Tenant ↔ TenantOrg

### One-to-Many (||--o{)
- Plan → Tenant, Organization, Customer
- User → UserSession, AuditLog
- Site → Building, Floor
- Building → Floor, BuildingTenant, Asset
- Floor → BuildingTenant, Asset
- Organization → BuildingTenant
- Customer → Site, Building, Floor, Asset, BuildingTenant
- Document → DocumentComment
- User → Notification
- Document → Notification

### Many-to-Many (}o--o{)
- User ↔ Role
- Document ↔ Site, Building, Floor, Asset, BuildingTenant, Vendor (via location object)

### Optional Relationships (||--o|)
- Organization → User (owner)
- BuildingTenant → Floor (optional)

## Key Features

1. **Multi-Tenancy**: Most entities include `tenant_id` for isolation
2. **Soft Deletes**: `is_active` flags on most entities
3. **Audit Trail**: All operations logged to AuditLog
4. **Version Control**: Documents support versioning with `document_group_id`
5. **Flexible Associations**: Documents use embedded location objects for polymorphic relationships
6. **Fine-grained Permissions**: Users have `resource_access` array for granular control

