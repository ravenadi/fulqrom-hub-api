/**
 * Generate Dummy Data Script
 *
 * Creates sample data for a tenant for testing/demo purposes
 *
 * Usage:
 *   node scripts/generateDummyData.js <tenant_id> [count]
 *
 * Example:
 *   node scripts/generateDummyData.js 507f1f77bcf86cd799439011
 *   node scripts/generateDummyData.js 507f1f77bcf86cd799439011 5
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Vendor = require('../models/Vendor');
const BuildingTenant = require('../models/BuildingTenant');
const Document = require('../models/Document');

// Storage for created IDs
const createdIds = {
  customers: [],
  sites: [],
  buildings: [],
  floors: [],
  assets: [],
  vendors: [],
  buildingTenants: []
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Generate random Australian business name
 */
function generateBusinessName() {
  const types = ['Properties', 'Real Estate', 'Developments', 'Holdings', 'Group', 'Investments'];
  const names = ['Summit', 'Harbour', 'Pacific', 'Southern', 'Metro', 'Urban', 'Crown', 'Gateway', 'Premier', 'Elite'];
  return `${names[Math.floor(Math.random() * names.length)]} ${types[Math.floor(Math.random() * types.length)]}`;
}

/**
 * Generate random Australian ABN
 */
function generateABN() {
  return Math.floor(10000000000 + Math.random() * 90000000000).toString();
}

/**
 * Generate random Australian address
 */
function generateAddress() {
  const streets = ['George', 'Elizabeth', 'King', 'Queen', 'York', 'Pitt', 'Collins', 'Bourke', 'Flinders'];
  const suburbs = ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Parramatta', 'Chatswood'];
  const states = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'ACT'];
  const streetNumber = Math.floor(1 + Math.random() * 999);
  const street = streets[Math.floor(Math.random() * streets.length)];
  const suburb = suburbs[Math.floor(Math.random() * suburbs.length)];
  const state = states[Math.floor(Math.random() * states.length)];
  const postcode = (2000 + Math.floor(Math.random() * 7000)).toString();

  return {
    street: `${streetNumber} ${street} Street`,
    suburb,
    state,
    postcode
  };
}

/**
 * Generate dummy customers
 */
async function generateCustomers(tenantId, count = 3) {
  console.log(`\n📋 Generating ${count} Customers...`);

  for (let i = 0; i < count; i++) {
    const orgName = generateBusinessName();
    const businessAddress = generateAddress();

    const customer = await Customer.create({
      tenant_id: tenantId,
      organisation: {
        organisation_name: orgName,
        email_domain: orgName.toLowerCase().replace(/\s+/g, '') + '.com.au',
        notes: 'Sample customer for testing'
      },
      company_profile: {
        business_number: generateABN(),
        trading_name: orgName,
        industry_type: 'Commercial Real Estate',
        organisation_size: 'Medium (50-250 employees)'
      },
      business_address: businessAddress,
      postal_address: businessAddress,
      contact_methods: [
        {
          full_name: 'John Smith',
          job_title: 'Property Manager',
          department: 'Operations',
          role_type: 'Primary',
          contact_type: 'Business',
          platform_access: 'Full',
          contact_methods: [
            {
              method_type: 'email',
              method_value: 'john.smith@' + orgName.toLowerCase().replace(/\s+/g, '') + '.com.au',
              label: 'Work',
              is_primary: true
            },
            {
              method_type: 'phone',
              method_value: '02 ' + Math.floor(8000 + Math.random() * 1999) + ' ' + Math.floor(1000 + Math.random() * 8999),
              label: 'Mobile',
              is_primary: false
            }
          ],
          is_primary: true
        }
      ],
      is_active: true,
      is_delete: false
    });

    createdIds.customers.push(customer._id);
    console.log(`  ✓ Created: ${orgName}`);
  }

  console.log(`✅ Generated ${count} customers`);
}

/**
 * Generate dummy sites
 */
async function generateSites(tenantId, customersPerSite = 1, sitesPerCustomer = 2) {
  console.log(`\n🏢 Generating Sites...`);

  const siteTypes = ['Office Complex', 'Shopping Centre', 'Industrial Park', 'Mixed Use Development'];
  let totalSites = 0;

  for (const customerId of createdIds.customers) {
    for (let i = 0; i < sitesPerCustomer; i++) {
      const address = generateAddress();
      const siteName = `${address.suburb} ${siteTypes[Math.floor(Math.random() * siteTypes.length)]}`;

      const site = await Site.create({
        tenant_id: tenantId,
        customer_id: customerId,
        site_name: siteName,
        site_code: 'S' + Math.floor(1000 + Math.random() * 8999),
        address: {
          ...address,
          full_address: `${address.street}, ${address.suburb}, ${address.state} ${address.postcode}`,
          latitude: -33.8688 + (Math.random() - 0.5) * 0.5,
          longitude: 151.2093 + (Math.random() - 0.5) * 0.5
        },
        type: 'commercial',
        security_level: 'Controlled',
        land_area: Math.floor(5000 + Math.random() * 45000),
        land_area_unit: 'm²',
        status: 'Active',
        manager: {
          name: 'Sarah Johnson',
          email: 'sarah.j@example.com.au',
          phone: '02 ' + Math.floor(8000 + Math.random() * 1999) + ' ' + Math.floor(1000 + Math.random() * 8999),
          title: 'Site Manager'
        },
        is_active: true,
        is_delete: false
      });

      createdIds.sites.push(site._id);
      totalSites++;
      console.log(`  ✓ Created: ${siteName}`);
    }
  }

  console.log(`✅ Generated ${totalSites} sites`);
}

/**
 * Generate dummy buildings
 */
async function generateBuildings(tenantId, buildingsPerSite = 2) {
  console.log(`\n🏗️  Generating Buildings...`);

  const buildingTypes = ['Office', 'Retail', 'Warehouse', 'Mixed Use'];
  let totalBuildings = 0;

  for (const siteId of createdIds.sites) {
    for (let i = 0; i < buildingsPerSite; i++) {
      const buildingType = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
      const address = generateAddress();

      const building = await Building.create({
        tenant_id: tenantId,
        site_id: siteId,
        building_name: `Building ${String.fromCharCode(65 + i)}`,
        building_code: 'B' + Math.floor(100 + Math.random() * 899),
        address: {
          ...address,
          full_address: `${address.street}, ${address.suburb}, ${address.state} ${address.postcode}`
        },
        building_type: buildingType,
        primary_use: 'Office',
        number_of_floors: Math.floor(3 + Math.random() * 17),
        total_area: Math.floor(2000 + Math.random() * 18000),
        year_built: Math.floor(1990 + Math.random() * 34),
        parking_spaces: Math.floor(50 + Math.random() * 200),
        nabers_rating: Math.floor(Math.random() * 7),
        status: 'Active',
        manager: {
          name: 'Michael Brown',
          email: 'michael.b@example.com.au',
          phone: '02 ' + Math.floor(8000 + Math.random() * 1999) + ' ' + Math.floor(1000 + Math.random() * 8999),
          title: 'Building Manager'
        },
        is_active: true,
        is_delete: false
      });

      createdIds.buildings.push(building._id);
      totalBuildings++;
      console.log(`  ✓ Created: Building ${String.fromCharCode(65 + i)} (${buildingType})`);
    }
  }

  console.log(`✅ Generated ${totalBuildings} buildings`);
}

/**
 * Generate dummy floors
 */
async function generateFloors(tenantId) {
  console.log(`\n🔢 Generating Floors...`);

  const floorTypes = ['Office', 'Retail', 'Car Park', 'Plant Room'];
  let totalFloors = 0;

  for (const buildingId of createdIds.buildings) {
    // Get building to know how many floors
    const building = await Building.findById(buildingId).setOptions({ skipTenantFilter: true });
    const numFloors = building.number_of_floors || 5;

    for (let i = 0; i < numFloors; i++) {
      const floorNumber = i + 1;
      const floorType = i === 0 ? 'Retail' : (i === numFloors - 1 ? 'Plant Room' : 'Office');

      const floor = await Floor.create({
        tenant_id: tenantId,
        site_id: building.site_id,
        building_id: buildingId,
        floor_name: `Level ${floorNumber}`,
        floor_number: floorNumber,
        floor_type: floorType,
        maximum_occupancy: Math.floor(50 + Math.random() * 150),
        occupancy_type: 'Multi-tenant',
        access_control: 'Swipe Card',
        floor_area: Math.floor(500 + Math.random() * 1500),
        floor_area_unit: 'm²',
        ceiling_height: 2.7 + Math.random() * 1.3,
        ceiling_height_unit: 'm',
        hvac_zones: Math.floor(2 + Math.random() * 4),
        status: 'Active',
        is_delete: false
      });

      createdIds.floors.push(floor._id);
      totalFloors++;
    }
  }

  console.log(`✅ Generated ${totalFloors} floors`);
}

/**
 * Generate dummy vendors
 */
async function generateVendors(tenantId, count = 5) {
  console.log(`\n🔧 Generating ${count} Vendors...`);

  const contractorTypes = ['Electrical Contractor', 'HVAC Contractor', 'Plumbing Contractor', 'Building Services Contractor', 'Fire Safety Contractor'];
  const specialisations = ['Air Conditioning', 'Electrical Systems', 'Fire Safety', 'Plumbing', 'Building Automation'];

  for (let i = 0; i < count; i++) {
    const contractorName = generateBusinessName() + ' Services';
    const contractorType = contractorTypes[i % contractorTypes.length];
    const address = generateAddress();

    const vendor = await Vendor.create({
      tenant_id: tenantId,
      contractor_name: contractorName,
      trading_name: contractorName,
      abn: generateABN(),
      gstRegistered: true,
      contractor_type: contractorType,
      consultant_specialisation: specialisations[i % specialisations.length],
      address: address,
      contacts: [
        {
          name: 'David Wilson',
          email: 'david@' + contractorName.toLowerCase().replace(/\s+/g, '') + '.com.au',
          phone: '02 ' + Math.floor(8000 + Math.random() * 1999) + ' ' + Math.floor(1000 + Math.random() * 8999),
          is_primary: true,
          is_emergency: false
        }
      ],
      services_provided: ['Maintenance', 'Repairs', 'Installation'],
      performance_rating: Math.floor(3 + Math.random() * 3),
      preferred_provider: Math.random() > 0.5,
      status: 'active',
      hourlyRate: Math.floor(80 + Math.random() * 120),
      preferredPaymentTerms: '30 days',
      is_active: true,
      is_delete: false
    });

    createdIds.vendors.push(vendor._id);
    console.log(`  ✓ Created: ${contractorName}`);
  }

  console.log(`✅ Generated ${count} vendors`);
}

/**
 * Generate dummy assets
 */
async function generateAssets(tenantId, assetsPerFloor = 3) {
  console.log(`\n⚙️  Generating Assets...`);

  const categories = ['Chiller System', 'Boiler System', 'Air Handling Unit', 'Pump', 'Electrical Panel'];
  const makes = ['Daikin', 'Carrier', 'Trane', 'Mitsubishi', 'LG'];
  const statuses = ['Active', 'Inactive', 'Maintenance'];
  const conditions = ['Excellent', 'Good', 'Average', 'Poor'];
  let totalAssets = 0;

  for (const floorId of createdIds.floors) {
    const floor = await Floor.findById(floorId).setOptions({ skipTenantFilter: true });

    for (let i = 0; i < assetsPerFloor; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const make = makes[Math.floor(Math.random() * makes.length)];

      const asset = await Asset.create({
        tenant_id: tenantId,
        customer_id: floor.customer_id,
        site_id: floor.site_id,
        building_id: floor.building_id,
        floor_id: floorId,
        asset_no: 'A-' + Math.floor(10000 + Math.random() * 89999),
        device_id: 'DEV-' + Math.floor(1000 + Math.random() * 8999),
        status: statuses[Math.floor(Math.random() * statuses.length)],
        category: category,
        type: category,
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        criticality_level: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
        make: make,
        model: 'Model-' + Math.floor(100 + Math.random() * 899),
        serial: 'SN' + Math.floor(100000 + Math.random() * 899999),
        area: `Zone ${Math.floor(1 + Math.random() * 5)}`,
        date_of_installation: new Date(Date.now() - Math.floor(Math.random() * 10 * 365 * 24 * 60 * 60 * 1000)),
        purchase_cost_aud: Math.floor(5000 + Math.random() * 45000),
        is_active: true,
        is_delete: false
      });

      createdIds.assets.push(asset._id);
      totalAssets++;
    }
  }

  console.log(`✅ Generated ${totalAssets} assets`);
}

/**
 * Generate dummy building tenants
 */
async function generateBuildingTenants(tenantId, tenantsPerBuilding = 2) {
  console.log(`\n🏘️  Generating Building Tenants...`);

  const industries = ['Accounting', 'Legal Services', 'Technology', 'Consulting', 'Finance'];
  let totalTenants = 0;

  for (const buildingId of createdIds.buildings) {
    const building = await Building.findById(buildingId).setOptions({ skipTenantFilter: true });

    for (let i = 0; i < tenantsPerBuilding; i++) {
      const tenantName = generateBusinessName();
      const industry = industries[Math.floor(Math.random() * industries.length)];

      const buildingTenant = await BuildingTenant.create({
        tenant_id: tenantId,
        site_id: building.site_id,
        building_id: buildingId,
        customer_id: building.customer_id,
        tenant_name: tenantName,
        tenant_legal_name: tenantName + ' Pty Ltd',
        tenant_trading_name: tenantName,
        abn: generateABN(),
        lease_type: 'Commercial',
        lease_start_date: new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)),
        lease_end_date: new Date(Date.now() + Math.floor((365 + Math.random() * 1095) * 24 * 60 * 60 * 1000)),
        occupied_area: Math.floor(100 + Math.random() * 400),
        occupied_area_unit: 'm²',
        number_of_employees: Math.floor(5 + Math.random() * 45),
        allocated_parking_spaces: Math.floor(2 + Math.random() * 10),
        industry_type: industry,
        tenant_status: 'Active',
        contacts: [
          {
            name: 'Emma Davis',
            email: 'emma@' + tenantName.toLowerCase().replace(/\s+/g, '') + '.com.au',
            phone: '02 ' + Math.floor(8000 + Math.random() * 1999) + ' ' + Math.floor(1000 + Math.random() * 8999),
            is_primary: true
          }
        ],
        is_active: true,
        is_delete: false
      });

      totalTenants++;
      console.log(`  ✓ Created: ${tenantName}`);
    }
  }

  console.log(`✅ Generated ${totalTenants} building tenants`);
}

/**
 * Generate dummy documents with proper location and asset associations
 */
async function generateDocuments(tenantId) {
  console.log(`\n📄 Generating Documents (metadata only)...`);

  let totalDocuments = 0;

  // 1. Generate Building Compliance Documents
  console.log('  Creating building compliance documents...');
  for (const buildingId of createdIds.buildings) {
    const building = await Building.findById(buildingId).setOptions({ skipTenantFilter: true });

    // Fire Safety Certificate
    await Document.create({
      tenant_id: tenantId,
      name: `Fire Safety Certificate - ${building.building_name}`,
      description: 'Annual fire safety compliance certificate as per Australian Standards',
      category: 'Compliance',
      type: 'Certificate',
      status: 'Approved',
      version: '1.0',
      customer: {
        customer_id: building.customer_id ? building.customer_id.toString() : createdIds.customers[0].toString()
      },
      location: {
        site: building.site_id ? { site_id: building.site_id.toString() } : undefined,
        building: { building_id: buildingId.toString() }
      },
      regulatory_framework: 'Building Code of Australia',
      compliance_status: 'Compliant',
      issue_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      expiry_date: new Date(Date.now() + 305 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      review_date: new Date(Date.now() + 275 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      tags: { tags: ['compliance', 'fire-safety', 'building', 'certificate'] },
      is_delete: false
    });
    totalDocuments++;

    // Electrical Safety Certificate
    await Document.create({
      tenant_id: tenantId,
      name: `Electrical Safety Certificate - ${building.building_name}`,
      description: 'Electrical installation and testing certificate',
      category: 'Compliance',
      type: 'Certificate',
      status: 'Approved',
      version: '1.0',
      customer: {
        customer_id: building.customer_id ? building.customer_id.toString() : createdIds.customers[0].toString()
      },
      location: {
        site: building.site_id ? { site_id: building.site_id.toString() } : undefined,
        building: { building_id: buildingId.toString() }
      },
      regulatory_framework: 'AS/NZS 3000:2018',
      compliance_status: 'Compliant',
      issue_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      expiry_date: new Date(Date.now() + 275 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      tags: { tags: ['compliance', 'electrical', 'safety', 'certificate'] },
      is_delete: false
    });
    totalDocuments++;

    // Building Plan
    await Document.create({
      tenant_id: tenantId,
      name: `As-Built Plans - ${building.building_name}`,
      description: 'Complete as-built architectural and engineering drawings',
      category: 'Drawing Register',
      type: 'Plan',
      status: 'Approved',
      version: '2.1',
      customer: {
        customer_id: building.customer_id ? building.customer_id.toString() : createdIds.customers[0].toString()
      },
      location: {
        site: building.site_id ? { site_id: building.site_id.toString() } : undefined,
        building: { building_id: buildingId.toString() }
      },
      drawing_info: {
        date_issued: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        drawing_status: 'approved',
        prepared_by: 'ABC Architecture Pty Ltd',
        drawing_scale: '1:100',
        approved_by_user: 'Senior Architect'
      },
      tags: { tags: ['drawing', 'as-built', 'architectural', 'engineering'] },
      is_delete: false
    });
    totalDocuments++;
  }

  // 2. Generate Asset Documentation
  console.log('  Creating asset documentation...');
  // Sample some assets (not all, to keep it reasonable)
  const sampleAssets = createdIds.assets.slice(0, Math.min(20, createdIds.assets.length));

  for (const assetId of sampleAssets) {
    const asset = await Asset.findById(assetId).setOptions({ skipTenantFilter: true });

    // Asset Manual
    await Document.create({
      tenant_id: tenantId,
      name: `${asset.category} Manual - ${asset.asset_no}`,
      description: `Operation and maintenance manual for ${asset.make} ${asset.model}`,
      category: 'Technical',
      type: 'Manual',
      status: 'Approved',
      version: '1.0',
      customer: {
        customer_id: asset.customer_id.toString()
      },
      location: {
        site: asset.site_id ? { site_id: asset.site_id.toString() } : undefined,
        building: asset.building_id ? { building_id: asset.building_id.toString() } : undefined,
        floor: asset.floor_id ? { floor_id: asset.floor_id.toString() } : undefined,
        assets: [{
          asset_id: assetId.toString(),
          asset_name: asset.asset_no,
          asset_type: asset.category
        }]
      },
      tags: { tags: ['manual', 'asset', asset.category.toLowerCase().replace(/\s+/g, '-')] },
      is_delete: false
    });
    totalDocuments++;

    // Warranty Certificate (for newer assets)
    if (asset.date_of_installation && (Date.now() - new Date(asset.date_of_installation).getTime()) < 5 * 365 * 24 * 60 * 60 * 1000) {
      await Document.create({
        tenant_id: tenantId,
        name: `Warranty Certificate - ${asset.asset_no}`,
        description: `Manufacturer warranty certificate for ${asset.make} ${asset.model}`,
        category: 'Legal',
        type: 'Certificate',
        status: 'Approved',
        version: '1.0',
        customer: {
          customer_id: asset.customer_id.toString()
        },
        location: {
          site: asset.site_id ? { site_id: asset.site_id.toString() } : undefined,
          building: asset.building_id ? { building_id: asset.building_id.toString() } : undefined,
          assets: [{
            asset_id: assetId.toString(),
            asset_name: asset.asset_no,
            asset_type: asset.category
          }]
        },
        issue_date: asset.date_of_installation ? new Date(asset.date_of_installation).toISOString().split('T')[0] : undefined,
        expiry_date: asset.date_of_installation ? new Date(new Date(asset.date_of_installation).getTime() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : undefined,
        tags: { tags: ['warranty', 'certificate', 'asset'] },
        is_delete: false
      });
      totalDocuments++;
    }
  }

  // 3. Generate Vendor Contracts
  console.log('  Creating vendor contracts...');
  for (const vendorId of createdIds.vendors) {
    const vendor = await Vendor.findById(vendorId).setOptions({ skipTenantFilter: true });
    const randomCustomerId = createdIds.customers[Math.floor(Math.random() * createdIds.customers.length)];

    await Document.create({
      tenant_id: tenantId,
      name: `Service Agreement - ${vendor.contractor_name}`,
      description: `Master service agreement for ${vendor.contractor_type.toLowerCase()} services`,
      category: 'Legal',
      type: 'Contract',
      status: 'Approved',
      version: '1.0',
      customer: {
        customer_id: randomCustomerId.toString()
      },
      location: {
        vendor: { vendor_id: vendorId.toString() }
      },
      issue_date: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      expiry_date: new Date(Date.now() + 545 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      review_date: new Date(Date.now() + 455 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      tags: { tags: ['contract', 'vendor', 'legal', 'service-agreement'] },
      is_delete: false
    });
    totalDocuments++;
  }

  // 4. Generate Site-level Documents
  console.log('  Creating site-level documents...');
  for (const siteId of createdIds.sites) {
    const site = await Site.findById(siteId).setOptions({ skipTenantFilter: true });

    // Site Safety Plan
    await Document.create({
      tenant_id: tenantId,
      name: `Site Safety Management Plan - ${site.site_name}`,
      description: 'Comprehensive safety management plan and emergency procedures',
      category: 'Operations',
      type: 'Plan',
      status: 'Approved',
      version: '2.0',
      customer: {
        customer_id: site.customer_id ? site.customer_id.toString() : createdIds.customers[0].toString()
      },
      location: {
        site: { site_id: siteId.toString() }
      },
      issue_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      review_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      frequency: 'annual',
      tags: { tags: ['safety', 'operations', 'site', 'emergency'] },
      is_delete: false
    });
    totalDocuments++;

    // Environmental Management Plan
    await Document.create({
      tenant_id: tenantId,
      name: `Environmental Management Plan - ${site.site_name}`,
      description: 'Environmental compliance and sustainability management plan',
      category: 'Compliance',
      type: 'Plan',
      status: 'Approved',
      version: '1.0',
      customer: {
        customer_id: site.customer_id ? site.customer_id.toString() : createdIds.customers[0].toString()
      },
      location: {
        site: { site_id: siteId.toString() }
      },
      regulatory_framework: 'EPA Guidelines',
      compliance_status: 'Compliant',
      tags: { tags: ['environment', 'compliance', 'sustainability', 'site'] },
      is_delete: false
    });
    totalDocuments++;
  }

  // 5. Generate HVAC System Reports
  console.log('  Creating HVAC system reports...');
  const hvacAssets = createdIds.assets.slice(0, Math.min(10, createdIds.assets.length));

  for (const assetId of hvacAssets) {
    const asset = await Asset.findById(assetId).setOptions({ skipTenantFilter: true });

    await Document.create({
      tenant_id: tenantId,
      name: `Maintenance Report - ${asset.asset_no} - ${new Date().toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}`,
      description: `Routine maintenance inspection and service report`,
      category: 'Technical',
      type: 'Report',
      status: 'Approved',
      version: '1.0',
      customer: {
        customer_id: asset.customer_id.toString()
      },
      location: {
        site: asset.site_id ? { site_id: asset.site_id.toString() } : undefined,
        building: asset.building_id ? { building_id: asset.building_id.toString() } : undefined,
        floor: asset.floor_id ? { floor_id: asset.floor_id.toString() } : undefined,
        assets: [{
          asset_id: assetId.toString(),
          asset_name: asset.asset_no,
          asset_type: asset.category
        }]
      },
      issue_date: new Date().toISOString().split('T')[0],
      tags: { tags: ['maintenance', 'report', 'hvac', 'inspection'] },
      is_delete: false
    });
    totalDocuments++;
  }

  console.log(`✅ Generated ${totalDocuments} documents`);
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('❌ Usage: node generateDummyData.js <tenant_id> [customer_count]');
    console.error('   Example: node generateDummyData.js 507f1f77bcf86cd799439011 3');
    process.exit(1);
  }

  const tenantId = args[0];
  const customerCount = args[1] ? parseInt(args[1]) : 3;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(tenantId)) {
    console.error('❌ Invalid tenant ID');
    process.exit(1);
  }

  console.log('🚀 Starting dummy data generation...');
  console.log(`   Tenant ID: ${tenantId}`);
  console.log(`   Customers: ${customerCount}\n`);

  await connectDB();

  try {
    // Generate data in order to maintain referential integrity
    await generateCustomers(tenantId, customerCount);
    await generateSites(tenantId, 1, 2);           // 2 sites per customer
    await generateBuildings(tenantId, 2);          // 2 buildings per site
    await generateFloors(tenantId);                // Based on building floors
    await generateVendors(tenantId, 5);            // 5 vendors
    await generateAssets(tenantId, 3);             // 3 assets per floor
    await generateBuildingTenants(tenantId, 2);    // 2 tenants per building
    await generateDocuments(tenantId);             // Various documents linked to entities

    console.log('\n✅ All dummy data generated successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Customers:        ${createdIds.customers.length}`);
    console.log(`   Sites:            ${createdIds.sites.length}`);
    console.log(`   Buildings:        ${createdIds.buildings.length}`);
    console.log(`   Floors:           ${createdIds.floors.length}`);
    console.log(`   Vendors:          ${createdIds.vendors.length}`);
    console.log(`   Assets:           ${createdIds.assets.length}`);
    console.log(`   Building Tenants: ${createdIds.buildingTenants.length}`);
    console.log(`   Documents:        (multiple types - see output above)`);

  } catch (error) {
    console.error('\n❌ Error during generation:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the script
main();
