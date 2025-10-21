/**
 * Seed All Modules - Create comprehensive test data
 * This script creates sample data for ALL modules in the Fulqrom Hub system
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import all models
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const BuildingTenant = require('../models/BuildingTenant');
const Document = require('../models/Document');
const User = require('../models/User');
const LegacyRole = require('../models/Role'); // Model is named LegacyRole, creates 'legacyroles' collection

async function seedAllModules() {
  try {
    console.log('🌱 Starting comprehensive data seeding...\n');

    // Get Admin role for demo user
    const adminRole = await LegacyRole.findOne({ name: 'Admin' });
    if (!adminRole) {
      console.error('❌ Admin role not found. Run initializeDefaultRoles.js first.');
      process.exit(1);
    }

    // Get demo user
    let demoUser = await User.findOne({ email: 'demo@fulqrom.com.au' });
    if (!demoUser) {
      console.log('Creating demo user...');
      demoUser = await User.create({
        email: 'demo@fulqrom.com.au',
        full_name: 'Demo User',
        phone: '+61 2 9000 0000',
        is_active: true,
        role_ids: [adminRole._id]
      });
    }
    console.log(`✓ Demo User: ${demoUser.email}`);

    // 1. Create Customers
    console.log('\n📋 Creating Customers...');
    const customers = await Customer.insertMany([
      {
        organisation: {
          organisation_name: 'Westfield Corporation',
          notes: 'Major retail property owner',
          metadata: {}
        },
        company_profile: {
          business_number: '12345678901',
          industry_type: 'Retail'
        },
        business_address: {
          street: '100 Market Street',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000'
        },
        contact_methods: [{
          full_name: 'Sarah Johnson',
          method_type: 'Email',
          method_value: 'sarah.johnson@westfield.com',
          label: 'Work',
          is_primary: true,
          job_title: 'Property Manager',
          department: 'Property Management'
        }, {
          full_name: 'Sarah Johnson',
          method_type: 'Phone',
          method_value: '+61 2 9000 1111',
          label: 'Work',
          is_primary: false,
          job_title: 'Property Manager',
          department: 'Property Management'
        }],
        is_active: true
      },
      {
        organisation: {
          organisation_name: 'Mirvac Group',
          notes: 'Integrated property group',
          metadata: {}
        },
        company_profile: {
          business_number: '98765432109',
          industry_type: 'Commercial'
        },
        business_address: {
          street: '200 George Street',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000'
        },
        contact_methods: [{
          full_name: 'Michael Chen',
          method_type: 'Email',
          method_value: 'michael.chen@mirvac.com',
          label: 'Work',
          is_primary: true,
          job_title: 'Facilities Manager',
          department: 'Facilities'
        }],
        is_active: true
      },
      {
        organisation: {
          organisation_name: 'GPT Group',
          notes: 'Diversified property portfolio',
          metadata: {}
        },
        company_profile: {
          business_number: '55544433322',
          industry_type: 'Office'
        },
        business_address: {
          street: '1 Bligh Street',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000'
        },
        contact_methods: [{
          full_name: 'Emma Wilson',
          method_type: 'Email',
          method_value: 'emma.wilson@gpt.com.au',
          label: 'Work',
          is_primary: true,
          job_title: 'Building Manager',
          department: 'Operations'
        }],
        is_active: true
      }
    ]);
    console.log(`✓ Created ${customers.length} customers`);
    customers.forEach(c => console.log(`  - ${c.organisation.organisation_name}`));

    // 2. Create Vendors
    console.log('\n🏢 Creating Vendors...');
    const vendors = await Vendor.insertMany([
      {
        name: 'Daikin Australia',
        email: 'service@daikin.com.au',
        phone: '+61 2 9000 2222',
        service_type: 'HVAC',
        address: {
          street: '15 Pacific Highway',
          suburb: 'St Leonards',
          state: 'NSW',
          postcode: '2065',
          country: 'Australia'
        },
        abn: '11223344556',
        is_active: true
      },
      {
        name: 'Carrier Climate Control',
        email: 'info@carrier.com.au',
        phone: '+61 2 9000 3333',
        service_type: 'HVAC',
        address: {
          street: '45 Lexington Drive',
          suburb: 'Norwest',
          state: 'NSW',
          postcode: '2153',
          country: 'Australia'
        },
        abn: '66778899001',
        is_active: true
      },
      {
        name: 'Trane Technologies',
        email: 'contact@trane.com.au',
        phone: '+61 2 9000 4444',
        service_type: 'HVAC',
        address: {
          street: '88 Phillip Street',
          suburb: 'Parramatta',
          state: 'NSW',
          postcode: '2150',
          country: 'Australia'
        },
        abn: '22334455667',
        is_active: true
      }
    ]);
    console.log(`✓ Created ${vendors.length} vendors`);
    vendors.forEach(v => console.log(`  - ${v.name}`));

    // 3. Create Sites
    console.log('\n🏙️  Creating Sites...');
    const sites = await Site.insertMany([
      {
        customer_id: customers[0]._id,
        site_name: 'Westfield Sydney',
        site_code: 'WFS-SYD-001',
        address: {
          street: '188 Pitt Street',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'Australia'
        },
        site_type: 'Shopping Center',
        total_area: 45000,
        site_status: 'Operational',
        is_active: true
      },
      {
        customer_id: customers[0]._id,
        site_name: 'Westfield Bondi Junction',
        site_code: 'WFS-BON-002',
        address: {
          street: '500 Oxford Street',
          suburb: 'Bondi Junction',
          state: 'NSW',
          postcode: '2022',
          country: 'Australia'
        },
        site_type: 'Shopping Center',
        total_area: 55000,
        site_status: 'Operational',
        is_active: true
      },
      {
        customer_id: customers[1]._id,
        site_name: 'Mirvac Office Tower',
        site_code: 'MIR-SYD-001',
        address: {
          street: '200 George Street',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'Australia'
        },
        site_type: 'Office Complex',
        total_area: 35000,
        site_status: 'Operational',
        is_active: true
      },
      {
        customer_id: customers[2]._id,
        site_name: 'GPT Metro Tower',
        site_code: 'GPT-SYD-001',
        address: {
          street: '1 Bligh Street',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'Australia'
        },
        site_type: 'Office Tower',
        total_area: 28000,
        site_status: 'Operational',
        is_active: true
      }
    ]);
    console.log(`✓ Created ${sites.length} sites`);
    sites.forEach(s => console.log(`  - ${s.site_name} (${s.site_code})`));

    // 4. Create Buildings
    console.log('\n🏢 Creating Buildings...');
    const buildings = await Building.insertMany([
      {
        site_id: sites[0]._id,
        building_name: 'Main Tower',
        building_code: 'WFS-SYD-T1',
        address: {
          street: '188 Pitt Street',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'Australia'
        },
        building_type: 'Commercial',
        total_floors: 12,
        total_area: 25000,
        year_built: 2010,
        building_status: 'Operational',
        is_active: true
      },
      {
        site_id: sites[1]._id,
        building_name: 'Retail Centre',
        building_code: 'WFS-BON-R1',
        address: {
          street: '500 Oxford Street',
          suburb: 'Bondi Junction',
          state: 'NSW',
          postcode: '2022',
          country: 'Australia'
        },
        building_type: 'Retail',
        total_floors: 6,
        total_area: 30000,
        year_built: 2015,
        building_status: 'Operational',
        is_active: true
      },
      {
        site_id: sites[2]._id,
        building_name: 'Office Building A',
        building_code: 'MIR-SYD-A1',
        address: {
          street: '200 George Street',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'Australia'
        },
        building_type: 'Office',
        total_floors: 18,
        total_area: 20000,
        year_built: 2018,
        building_status: 'Operational',
        is_active: true
      },
      {
        site_id: sites[3]._id,
        building_name: 'GPT Tower',
        building_code: 'GPT-SYD-T1',
        address: {
          street: '1 Bligh Street',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          country: 'Australia'
        },
        building_type: 'Office',
        total_floors: 25,
        total_area: 28000,
        year_built: 2020,
        building_status: 'Operational',
        is_active: true
      }
    ]);
    console.log(`✓ Created ${buildings.length} buildings`);
    buildings.forEach(b => console.log(`  - ${b.building_name} (${b.building_code})`));

    // 5. Create Floors
    console.log('\n🏗️  Creating Floors...');
    const floors = [];
    for (const building of buildings.slice(0, 2)) { // Create floors for first 2 buildings
      for (let i = 0; i < 5; i++) {
        floors.push({
          building_id: building._id,
          floor_level: i,
          floor_name: i === 0 ? 'Ground Floor' : `Level ${i}`,
          floor_code: `${building.building_code}-L${i}`,
          floor_area: building.total_area / building.total_floors,
          floor_type: i === 0 ? 'Retail' : 'Office',
          ceiling_height: 3.5,
          floor_status: 'Operational',
          is_active: true
        });
      }
    }
    const createdFloors = await Floor.insertMany(floors);
    console.log(`✓ Created ${createdFloors.length} floors across 2 buildings`);

    // 6. Create Assets (HVAC Equipment)
    console.log('\n❄️  Creating HVAC Assets...');
    const assets = await Asset.insertMany([
      {
        building_id: buildings[0]._id,
        floor_id: createdFloors[0]._id,
        asset_no: 'HVAC-001',
        asset_name: 'Main Chiller Unit 1',
        asset_type: 'Chiller',
        brand: 'Daikin',
        model: 'EWAQ-DZ',
        serial_number: 'DK-CH-2023-001',
        installation_date: new Date('2023-01-15'),
        warranty_expiry: new Date('2026-01-15'),
        location_description: 'Basement - Mechanical Room A',
        asset_status: 'Operational',
        vendor_id: vendors[0]._id,
        is_active: true
      },
      {
        building_id: buildings[0]._id,
        floor_id: createdFloors[1]._id,
        asset_no: 'HVAC-002',
        asset_name: 'Air Handling Unit - Level 1',
        asset_type: 'AHU',
        brand: 'Carrier',
        model: 'AHU-500',
        serial_number: 'CR-AHU-2023-002',
        installation_date: new Date('2023-02-10'),
        warranty_expiry: new Date('2026-02-10'),
        location_description: 'Level 1 - Plant Room',
        asset_status: 'Operational',
        vendor_id: vendors[1]._id,
        is_active: true
      },
      {
        building_id: buildings[1]._id,
        floor_id: createdFloors[5]._id,
        asset_no: 'HVAC-003',
        asset_name: 'VRV System - Retail Centre',
        asset_type: 'VRV',
        brand: 'Daikin',
        model: 'VRV-Q',
        serial_number: 'DK-VRV-2023-003',
        installation_date: new Date('2023-03-20'),
        warranty_expiry: new Date('2028-03-20'),
        location_description: 'Ground Floor - Retail Area',
        asset_status: 'Operational',
        vendor_id: vendors[0]._id,
        is_active: true
      },
      {
        building_id: buildings[2]._id,
        asset_no: 'HVAC-004',
        asset_name: 'Cooling Tower',
        asset_type: 'Cooling Tower',
        brand: 'Trane',
        model: 'CT-2000',
        serial_number: 'TR-CT-2023-004',
        installation_date: new Date('2023-04-05'),
        warranty_expiry: new Date('2026-04-05'),
        location_description: 'Roof - North Side',
        asset_status: 'Operational',
        vendor_id: vendors[2]._id,
        is_active: true
      }
    ]);
    console.log(`✓ Created ${assets.length} HVAC assets`);
    assets.forEach(a => console.log(`  - ${a.asset_no}: ${a.asset_name} (${a.asset_type})`));

    // 7. Create Building Tenants
    console.log('\n👥 Creating Building Tenants...');
    const tenants = await BuildingTenant.insertMany([
      {
        building_id: buildings[0]._id,
        floor_id: createdFloors[1]._id,
        tenant_name: 'Tech Innovations Pty Ltd',
        tenant_code: 'TEN-001',
        company_abn: '11122233344',
        contact_person: 'John Smith',
        contact_email: 'john.smith@techinnovations.com',
        contact_phone: '+61 2 9000 5555',
        lease_start_date: new Date('2023-01-01'),
        lease_end_date: new Date('2026-12-31'),
        lease_status: 'Active',
        occupied_area: 500,
        monthly_rent: 15000,
        is_active: true
      },
      {
        building_id: buildings[1]._id,
        floor_id: createdFloors[6]._id,
        tenant_name: 'Global Finance Group',
        tenant_code: 'TEN-002',
        company_abn: '55566677788',
        contact_person: 'Lisa Chen',
        contact_email: 'lisa.chen@globalfinance.com',
        contact_phone: '+61 2 9000 6666',
        lease_start_date: new Date('2023-06-01'),
        lease_end_date: new Date('2028-05-31'),
        lease_status: 'Active',
        occupied_area: 800,
        monthly_rent: 25000,
        is_active: true
      },
      {
        building_id: buildings[2]._id,
        tenant_name: 'Creative Design Studio',
        tenant_code: 'TEN-003',
        company_abn: '99988877766',
        contact_person: 'Mark Wilson',
        contact_email: 'mark.wilson@creativedesign.com',
        contact_phone: '+61 2 9000 7777',
        lease_start_date: new Date('2024-01-01'),
        lease_end_date: new Date('2027-12-31'),
        lease_status: 'Active',
        occupied_area: 600,
        monthly_rent: 18000,
        is_active: true
      }
    ]);
    console.log(`✓ Created ${tenants.length} building tenants`);
    tenants.forEach(t => console.log(`  - ${t.tenant_name} (${t.tenant_code})`));

    // 8. Create Documents
    console.log('\n📄 Creating Documents...');
    const documents = await Document.insertMany([
      {
        name: 'HVAC Maintenance Manual',
        category: 'Manual',
        type: 'O&M Manual',
        description: 'Operation and Maintenance manual for Daikin Chiller',
        version: '1.0',
        engineering_discipline: 'Mechanical',
        tags: ['HVAC', 'Maintenance', 'Manual'],
        customer_id: customers[0]._id,
        customer_name: customers[0].organisation.organisation_name,
        site_id: sites[0]._id,
        building_id: buildings[0]._id,
        assets: [{
          asset_id: assets[0]._id,
          asset_name: assets[0].asset_name,
          asset_type: assets[0].asset_type
        }],
        vendor_id: vendors[0]._id,
        vendor_name: vendors[0].name,
        file_url: 'https://example.com/docs/hvac-manual-001.pdf',
        file_type: 'application/pdf',
        file_size: 2500000,
        approval_status: 'Approved',
        uploaded_by: demoUser._id,
        user_name: demoUser.full_name,
        is_active: true
      },
      {
        name: 'Building Safety Certificate',
        category: 'Compliance',
        type: 'Certificate',
        description: 'Annual building safety compliance certificate',
        version: '2024',
        engineering_discipline: 'General',
        tags: ['Safety', 'Compliance', 'Certificate'],
        customer_id: customers[0]._id,
        customer_name: customers[0].organisation.organisation_name,
        site_id: sites[0]._id,
        building_id: buildings[0]._id,
        file_url: 'https://example.com/docs/safety-cert-2024.pdf',
        file_type: 'application/pdf',
        file_size: 500000,
        approval_status: 'Approved',
        uploaded_by: demoUser._id,
        user_name: demoUser.full_name,
        is_active: true
      },
      {
        name: 'Chiller Installation Report',
        category: 'Report',
        type: 'Installation',
        description: 'Installation and commissioning report for main chiller unit',
        version: '1.0',
        engineering_discipline: 'Mechanical',
        tags: ['Installation', 'Chiller', 'Commissioning'],
        customer_id: customers[1]._id,
        customer_name: customers[1].organisation.organisation_name,
        site_id: sites[2]._id,
        building_id: buildings[2]._id,
        vendor_id: vendors[2]._id,
        vendor_name: vendors[2].name,
        file_url: 'https://example.com/docs/chiller-install-2023.pdf',
        file_type: 'application/pdf',
        file_size: 3500000,
        approval_status: 'Approved',
        uploaded_by: demoUser._id,
        user_name: demoUser.full_name,
        is_active: true
      }
    ]);
    console.log(`✓ Created ${documents.length} documents`);
    documents.forEach(d => console.log(`  - ${d.name} (${d.type})`));

    console.log('\n✅ All modules seeded successfully!\n');
    console.log('Summary:');
    console.log(`  - ${customers.length} Customers`);
    console.log(`  - ${vendors.length} Vendors`);
    console.log(`  - ${sites.length} Sites`);
    console.log(`  - ${buildings.length} Buildings`);
    console.log(`  - ${createdFloors.length} Floors`);
    console.log(`  - ${assets.length} Assets`);
    console.log(`  - ${tenants.length} Tenants`);
    console.log(`  - ${documents.length} Documents`);
    console.log(`\n🎉 Demo user (demo@fulqrom.com.au) can now login and see all data!\n`);

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const MONGODB_URI = process.env.MONGODB_CONNECTION || process.env.MONGODB_URI || 'mongodb://localhost:27017/fulqrom_hub';

  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✓ Connected to MongoDB\n');
      return seedAllModules();
    })
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedAllModules };
