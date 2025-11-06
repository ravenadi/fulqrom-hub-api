# ER Diagram - DB Diagram Format

This file contains the ER diagram in DB Diagram (dbdiagram.io) syntax for visual rendering.

## Copy the code below and paste it into https://dbdiagram.io/

```
// Core SaaS Entities
Table Tenant {
  _id ObjectId [pk]
  tenant_name string [not null, indexed]
  phone string
  status enum('active', 'inactive', 'suspended', 'trial') [default: 'trial', indexed]
  plan_id ObjectId [ref: > Plan._id, indexed]
  plan_status json
  s3_bucket_name string [indexed]
  s3_bucket_region string [default: 'ap-southeast-2']
  s3_bucket_status enum('created', 'pending', 'failed', 'not_created')
  created_at datetime [default: `now()`, indexed]
  updated_at datetime
}

Table Organization {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, unique, indexed]
  name string [not null, indexed]
  slug string [unique, indexed]
  email string [not null]
  phone string
  abn string [indexed]
  acn string
  address json
  plan_id ObjectId [ref: > Plan._id, indexed]
  status enum('trial', 'active', 'suspended', 'cancelled') [default: 'trial', indexed]
  owner_id ObjectId [ref: > User._id, indexed]
  limits json
  current_usage json
  branding json
  settings json
  billing json
  trial_ends_at datetime [indexed]
  is_active boolean [default: true, indexed]
  created_at datetime [default: `now()`, indexed]
  updated_at datetime
}

Table Plan {
  _id ObjectId [pk]
  name string [not null, indexed]
  plan_tier enum('starter', 'professional', 'enterprise', 'custom')
  slug string [unique, indexed]
  description string
  price number [not null, min: 0]
  time_period enum('monthly', 'quarterly', 'yearly') [default: 'monthly']
  trial_period_days number [default: 0]
  max_users number
  max_documents number
  max_storage_gb number
  features json
  is_active boolean [default: true, indexed]
  is_default boolean [default: false, indexed]
  sort_order number [default: 0]
  created_at datetime [default: `now()`, indexed]
  updated_at datetime
}

Table TenantOrg {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, unique, indexed]
  organisation_name string [not null, indexed]
  trading_name string [indexed]
  email_domain string [indexed]
  organisation_abn string [indexed]
  organisation_acn string [indexed]
  note string
  created_at datetime [default: `now()`]
  updated_at datetime
}

// User & Access Control
Table User {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  email string [unique, not null, indexed]
  full_name string [not null]
  phone string
  auth0_id string [indexed]
  custom_id string
  role_ids ObjectId [ref: > Role._id]
  resource_access json
  document_categories string
  engineering_disciplines string
  mfa_required boolean [default: false, indexed]
  is_active boolean [default: true, indexed]
  created_at datetime [default: `now()`, indexed]
  updated_at datetime
  deactivated_at datetime
  deactivated_by string
}

Table Role {
  _id ObjectId [pk]
  name string [unique, not null, indexed]
  description string
  permissions json
  is_active boolean [default: true, indexed]
  created_at datetime [default: `now()`, indexed]
  updated_at datetime
  created_by string
}

Table UserSession {
  _id ObjectId [pk]
  session_id string [unique, indexed]
  user_id ObjectId [ref: > User._id, indexed]
  auth0_id string [not null, indexed]
  email string [not null]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  csrf_token string [not null]
  user_agent string
  ip_address string
  device_fingerprint string [indexed]
  device_info json
  geolocation json
  session_name string
  created_at datetime [default: `now()`, indexed]
  last_activity datetime [indexed]
  expires_at datetime [not null, indexed]
  is_active boolean [default: true, indexed]
  invalidated_at datetime
  invalidation_reason string
}

Table AuditLog {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  action enum('create', 'read', 'update', 'delete', 'auth') [indexed]
  description string [not null]
  module enum('auth', 'customer', 'site', 'building', 'floor', 'asset', 'tenant', 'building_tenant', 'document', 'user', 'vendor', 'contact') [indexed]
  module_id ObjectId [indexed]
  user json [not null]
  ip string
  agent string
  detail json
  created_at datetime [default: `now()`, indexed]
}

// Property Hierarchy
Table Site {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  site_name string [indexed]
  site_code string
  type string [default: 'commercial']
  security_level string [default: 'Controlled']
  address json
  customer_id ObjectId [ref: > Customer._id, indexed]
  status string [default: 'active', indexed]
  is_active boolean [default: true, indexed]
  created_date datetime [default: `now()`]
}

Table Building {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  site_id ObjectId [ref: > Site._id, not null, indexed]
  building_name string [not null, indexed]
  building_code string [indexed]
  building_type string [not null]
  primary_use string [not null, indexed]
  customer_id ObjectId [ref: > Customer._id, indexed]
  address json
  number_of_floors number [not null, min: 1]
  total_area number
  year_built number
  nabers_rating number [min: 0, max: 6]
  parking_spaces number [default: 0]
  latitude number
  longitude number
  last_inspection_date datetime
  accessibility_features string
  status string [default: 'Active', indexed]
  is_active boolean [default: true, indexed]
}

Table Floor {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  site_id ObjectId [ref: > Site._id, not null]
  building_id ObjectId [ref: > Building._id, not null]
  floor_name string [not null]
  floor_number number
  floor_type string [not null]
  maximum_occupancy number [default: 0]
  occupancy_type string
  access_control string
  fire_compartment string
  hvac_zones number
  special_features string
  area_number number
  area_unit string [default: 'm²']
  floor_area number
  ceiling_height number
  status string [default: 'Active']
  customer_id ObjectId [ref: > Customer._id]
  assets_count number [default: 0]
}

Table BuildingTenant {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Organization._id, not null, indexed]
  site_id ObjectId [ref: > Site._id, indexed]
  building_id ObjectId [ref: > Building._id, indexed]
  floor_id ObjectId [ref: > Floor._id, indexed]
  tenant_name string
  tenant_legal_name string [indexed]
  tenant_trading_name string [indexed]
  abn string [indexed]
  acn string
  lease_type string
  lease_start_date datetime
  lease_end_date datetime [indexed]
  lease_duration_months number
  occupied_area number
  occupied_area_unit string [default: 'm²']
  number_of_employees number
  allocated_parking_spaces number
  location json
  operating_hours_start string
  operating_hours_end string
  operating_days string
  contacts json
  emergency_contacts json
  industry_type string
  industry string
  business_category string
  occupancy_classification string
  utilities_included string
  services_included string
  special_requirements string
  business_hours json
  employee_count number
  parking_allocation number
  rental_rate number
  rental_rate_unit string
  rent_amount number
  rent_frequency string
  bond_amount number
  outgoings_estimate number
  tenant_status string [default: 'Active', indexed]
  move_in_date datetime
  move_out_date datetime
  metadata json
  notes string
  compliance_notes string
  customer_id ObjectId [ref: > Customer._id, indexed]
  is_active boolean [default: true, indexed]
}

// Asset & Vendor Management
Table Asset {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  customer_id ObjectId [ref: > Customer._id, not null, indexed]
  site_id ObjectId [ref: > Site._id, indexed]
  building_id ObjectId [ref: > Building._id, indexed]
  floor_id ObjectId [ref: > Floor._id, indexed]
  asset_id string
  asset_no string [indexed]
  device_id string
  status string [indexed]
  category string [indexed]
  type string
  condition string [indexed]
  criticality_level string [indexed]
  make string [indexed]
  model string
  serial string
  refrigerant string
  refrigerant_capacity string
  refrigerant_consumption string
  level string
  area string
  owner string
  da19_life_expectancy string
  service_status string
  date_of_installation datetime
  age string
  last_test_date datetime
  last_test_result string
  purchase_cost_aud number
  current_book_value_aud number
  weight_kgs string
  is_active boolean [default: true, indexed]
}

Table Vendor {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  contractor_name string [not null, indexed]
  trading_name string [indexed]
  abn string [indexed]
  gstRegistered boolean [default: true]
  email string
  phone string
  website string
  address json
  contractor_type string [not null, indexed]
  consultant_specialisation string [indexed]
  category string
  subcategories string
  contacts json
  professional_registration string
  building_consultant_id string
  building_consultant_registration string
  aibs_membership string
  certification_authority string
  insurance_details string
  insurance_coverage number
  licence_numbers string
  services_provided string
  performance_rating number [min: 1, max: 5]
  preferred_provider boolean [default: false]
  retainer_agreement boolean [default: false]
  response_time_sla string
  annual_review_date datetime [indexed]
  status string [default: 'active', indexed]
  rating number [min: 0, max: 5, default: 0]
  totalJobs number [default: 0]
  completedJobs number [default: 0]
  averageCompletionTime number [default: 0]
  onTimePercentage number [min: 0, max: 100, default: 0]
  licenses json
  insurances json
  certifications json
  businessType string
  yearsInBusiness number [default: 0]
  employeeCount string
  serviceAreas string
  hourlyRate number
  preferredPaymentTerms string [default: '30 days']
  lastJobDate datetime
  notes string
  is_active boolean [default: true, indexed]
}

Table Customer {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  organisation json
  company_profile json
  business_address json
  postal_address json
  contact_methods json
  metadata json
  is_active boolean [default: true, indexed]
  plan_id ObjectId [ref: > Plan._id, indexed]
  plan_start_date datetime [indexed]
  plan_end_date datetime [indexed]
  is_trial boolean [default: true, indexed]
  trial_start_date datetime [indexed]
  trial_end_date datetime [indexed]
}

// Document Management
Table Document {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  name string [not null, indexed]
  description string
  version string [default: '1.0']
  category string [not null, indexed]
  type string [not null, indexed]
  engineering_discipline string
  status string [default: 'Draft', indexed]
  regulatory_framework string [indexed]
  certification_number string
  compliance_framework string
  compliance_status string [indexed]
  issue_date string [indexed]
  expiry_date string [indexed]
  review_date string [indexed]
  frequency enum('weekly', 'monthly', 'quarterly', 'annual')
  file json
  tags json
  location json
  customer json [indexed]
  metadata json
  drawing_info json
  access_control json
  approval_required boolean [default: false]
  approved_by string
  approval_status string [default: 'Pending', indexed]
  approval_config json
  document_group_id string [indexed]
  version_number string [default: '1.0']
  is_current_version boolean [default: true, indexed]
  version_sequence number [default: 1]
  version_metadata json
  version_history json
  created_by json
  created_at string [default: `now()`]
  updated_at string [default: `now()`]
}

Table DocumentComment {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  document_id ObjectId [ref: > Document._id, not null, indexed]
  user_id string [not null, indexed]
  user_name string [not null]
  user_email string [not null]
  comment string [not null, max: 5000]
  status string [not null, indexed]
  mentioned_users json
  attachments json
  is_active boolean [default: true]
  created_at datetime [default: `now()`, indexed]
  updated_at datetime
}

Table Notification {
  _id ObjectId [pk]
  tenant_id ObjectId [ref: > Tenant._id, indexed]
  user_id string [not null, indexed]
  user_email string [not null, indexed]
  title string [not null, max: 200]
  message string [not null, max: 1000]
  type enum('document_approval_status_changed', 'document_status_changed', 'document_comment_added', 'document_approver_assigned', 'document_version_uploaded', 'document_approved', 'document_rejected', 'document_expiry_reminder', 'service_report_reminder') [indexed]
  priority enum('low', 'medium', 'high', 'urgent') [default: 'medium', indexed]
  document_id ObjectId [ref: > Document._id, indexed]
  comment_id ObjectId [ref: > DocumentComment._id]
  actor json
  metadata json
  building string
  customer string
  is_read boolean [default: false, indexed]
  read_at datetime
  action_url string
  email_sent boolean [default: false]
  email_status enum('sent', 'failed', 'pending', 'not_sent') [default: 'not_sent']
  email_provider_id string
  email_error string
  email_sent_at datetime
  created_at datetime [default: `now()`, indexed]
  updated_at datetime
}

// Relationships
Ref: Tenant.plan_id > Plan._id
Ref: Organization.tenant_id > Tenant._id
Ref: Organization.plan_id > Plan._id
Ref: Organization.owner_id > User._id
Ref: TenantOrg.tenant_id > Tenant._id
Ref: User.tenant_id > Tenant._id
Ref: User.role_ids > Role._id [note: 'Many-to-Many']
Ref: UserSession.user_id > User._id
Ref: UserSession.tenant_id > Tenant._id
Ref: AuditLog.tenant_id > Tenant._id
Ref: AuditLog.user.id > User._id
Ref: Site.tenant_id > Tenant._id
Ref: Site.customer_id > Customer._id
Ref: Building.tenant_id > Tenant._id
Ref: Building.site_id > Site._id
Ref: Building.customer_id > Customer._id
Ref: Floor.tenant_id > Tenant._id
Ref: Floor.site_id > Site._id
Ref: Floor.building_id > Building._id
Ref: Floor.customer_id > Customer._id
Ref: BuildingTenant.tenant_id > Organization._id
Ref: BuildingTenant.site_id > Site._id
Ref: BuildingTenant.building_id > Building._id
Ref: BuildingTenant.floor_id > Floor._id
Ref: BuildingTenant.customer_id > Customer._id
Ref: Asset.tenant_id > Tenant._id
Ref: Asset.customer_id > Customer._id
Ref: Asset.site_id > Site._id
Ref: Asset.building_id > Building._id
Ref: Asset.floor_id > Floor._id
Ref: Vendor.tenant_id > Tenant._id
Ref: Customer.tenant_id > Tenant._id
Ref: Customer.plan_id > Plan._id
Ref: Document.tenant_id > Tenant._id
Ref: Document.document_id > Document._id [note: 'Self-reference for versions']
Ref: DocumentComment.tenant_id > Tenant._id
Ref: DocumentComment.document_id > Document._id
Ref: Notification.tenant_id > Tenant._id
Ref: Notification.document_id > Document._id
Ref: Notification.comment_id > DocumentComment._id
```

## Usage Instructions

1. Go to https://dbdiagram.io/
2. Click "New Diagram"
3. Paste the code above into the editor
4. Click "Generate" to render the diagram
5. You can export as PNG, PDF, or SQL

## Notes

- This format uses DB Diagram syntax which supports MongoDB-style ObjectId references
- Some relationships are embedded (JSON) rather than foreign keys
- Document location relationships are embedded objects (polymorphic)
- Many-to-many relationships are shown as arrays in JSON fields
- Virtual relationships (like Document ↔ Site via location object) are indicated with notes



