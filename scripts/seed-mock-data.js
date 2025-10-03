const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Customer = require('../models/Customer');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Asset = require('../models/Asset');
const Tenant = require('../models/Tenant');
const Document = require('../models/Document');

// Australian cities and addresses for realistic data
const australianCities = [
  { city: 'Sydney', state: 'NSW', suburbs: ['Parramatta', 'North Sydney', 'Chatswood', 'Pyrmont', 'Barangaroo'] },
  { city: 'Melbourne', state: 'VIC', suburbs: ['Docklands', 'Southbank', 'Carlton', 'Richmond', 'St Kilda'] },
  { city: 'Brisbane', state: 'QLD', suburbs: ['Fortitude Valley', 'South Bank', 'Newstead', 'Milton', 'Bowen Hills'] },
  { city: 'Perth', state: 'WA', suburbs: ['Northbridge', 'Subiaco', 'West Perth', 'East Perth', 'Victoria Park'] }
];

// Australian street names
const streetNames = ['Collins', 'George', 'Pitt', 'King', 'Elizabeth', 'Bourke', 'Lonsdale', 'William', 'Queen', 'Eagle'];
const streetTypes = ['Street', 'Avenue', 'Road', 'Boulevard', 'Drive'];

// Helper functions
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateAustralianAddress() {
  const cityData = randomElement(australianCities);
  const streetNumber = randomInt(1, 999);
  const streetName = randomElement(streetNames);
  const streetType = randomElement(streetTypes);
  const suburb = randomElement(cityData.suburbs);
  const postcode = randomInt(1000, 9999).toString();

  const fullAddress = `${streetNumber} ${streetName} ${streetType}, ${suburb}, ${cityData.state} ${postcode}`;

  return {
    street: `${streetNumber} ${streetName} ${streetType}`,
    suburb: suburb,
    city: cityData.city,
    state: cityData.state,
    postcode: postcode,
    country: 'Australia',
    full_address: fullAddress
  };
}

function generateABN() {
  return Array.from({ length: 11 }, () => randomInt(0, 9)).join('');
}

// Seed data generation functions
async function seedSites(customerIds) {
  console.log('\n=== Seeding Sites ===');
  const currentSitesCount = await Site.countDocuments();
  console.log(`Current sites count: ${currentSitesCount}`);

  if (currentSitesCount >= 8) {
    console.log('Sufficient sites already exist. Skipping...');
    return await Site.find().lean();
  }

  const siteTypes = ['commercial', 'mixed-use', 'industrial', 'Corporate Office', 'Shopping Centre'];
  const statuses = ['active', 'development', 'maintenance'];

  const sites = [];
  const sitesToCreate = Math.max(0, 10 - currentSitesCount);

  for (let i = 0; i < sitesToCreate; i++) {
    const customerId = randomElement(customerIds);
    const address = generateAustralianAddress();

    const site = {
      customer_id: customerId,
      site_name: `${address.suburb} ${randomElement(siteTypes)} Centre`,
      type: randomElement(siteTypes),
      status: randomElement(statuses),
      address: address,
      total_floor_area: randomInt(5000, 50000),
      site_code: `SITE-${1000 + currentSitesCount + i}`,
      manager: {
        name: `${randomElement(['John', 'Sarah', 'Michael', 'Emma'])} ${randomElement(['Smith', 'Johnson', 'Williams', 'Brown'])}`,
        email: `manager${i}@example.com.au`,
        phone: `+61 ${randomInt(2, 9)} ${randomInt(1000, 9999)} ${randomInt(1000, 9999)}`
      },
      is_active: true
    };

    sites.push(site);
  }

  if (sites.length > 0) {
    const created = await Site.insertMany(sites);
    console.log(`Created ${created.length} new sites`);
  }

  return await Site.find().lean();
}

async function seedBuildings(customerIds, sites) {
  console.log('\n=== Seeding Buildings ===');
  const currentBuildingsCount = await Building.countDocuments();
  console.log(`Current buildings count: ${currentBuildingsCount}`);

  if (currentBuildingsCount >= 15) {
    console.log('Sufficient buildings already exist. Skipping...');
    return await Building.find().lean();
  }

  const buildingTypes = ['Office', 'Retail', 'Warehouse', 'Mixed Use', 'Data Centre', 'Industrial'];
  const statuses = ['Active', 'Under Construction', 'Renovation', 'Maintenance'];

  const buildings = [];
  const buildingsToCreate = Math.max(0, 20 - currentBuildingsCount);

  for (let i = 0; i < buildingsToCreate; i++) {
    const site = randomElement(sites);

    const building = {
      customer_id: site.customer_id,
      site_id: site._id,
      building_name: `Building ${String.fromCharCode(65 + (i % 26))}`,
      building_code: `BLD-${1000 + currentBuildingsCount + i}`,
      building_type: randomElement(buildingTypes),
      status: randomElement(statuses),
      number_of_floors: randomInt(3, 20),
      total_area: randomInt(2000, 20000),
      year_built: randomInt(1990, 2024),
      nabers_rating: randomInt(0, 6),
      manager: {
        name: `${randomElement(['Alex', 'Jordan', 'Casey', 'Morgan'])} ${randomElement(['Taylor', 'Anderson', 'Thomas', 'Moore'])}`,
        email: `building${i}@example.com.au`,
        phone: `+61 ${randomInt(2, 9)} ${randomInt(1000, 9999)} ${randomInt(1000, 9999)}`
      },
      is_active: true
    };

    buildings.push(building);
  }

  if (buildings.length > 0) {
    const created = await Building.insertMany(buildings);
    console.log(`Created ${created.length} new buildings`);
  }

  return await Building.find().lean();
}

async function seedFloors(customerIds, sites, buildings) {
  console.log('\n=== Seeding Floors ===');
  const currentFloorsCount = await Floor.countDocuments();
  console.log(`Current floors count: ${currentFloorsCount}`);

  if (currentFloorsCount >= 80) {
    console.log('Sufficient floors already exist. Skipping...');
    return await Floor.find().lean();
  }

  const floorTypes = ['Office', 'Retail', 'Plant Room', 'Lab', 'Common Area', 'Residential'];
  const statuses = ['Active', 'Renovation', 'Maintenance'];

  const floors = [];
  const floorsToCreate = Math.max(0, 100 - currentFloorsCount);

  // Distribute floors across buildings
  const floorsPerBuilding = Math.ceil(floorsToCreate / buildings.length);

  for (const building of buildings) {
    const numFloors = Math.min(building.number_of_floors, floorsPerBuilding);
    const site = sites.find(s => s._id.toString() === building.site_id.toString());

    // Create basement floors
    if (randomInt(0, 1) === 1) {
      for (let b = 1; b <= randomInt(1, 2); b++) {
        floors.push({
          customer_id: building.customer_id,
          site_id: building.site_id,
          building_id: building._id,
          floor_name: `Basement ${b}`,
          floor_number: -b,
          floor_type: randomElement(['Plant Room', 'Common Area']),
          floor_area: randomInt(500, 2000),
          floor_area_unit: 'm²',
          ceiling_height: randomInt(2.5, 3.5),
          ceiling_height_unit: 'm',
          occupancy: randomInt(0, 20),
          status: randomElement(statuses),
          is_active: true
        });
      }
    }

    // Create ground floor
    floors.push({
      customer_id: building.customer_id,
      site_id: building.site_id,
      building_id: building._id,
      floor_name: 'Ground Floor',
      floor_number: 0,
      floor_type: randomElement(['Retail', 'Common Area', 'Office']),
      floor_area: randomInt(800, 3000),
      floor_area_unit: 'm²',
      ceiling_height: randomInt(3, 4.5),
      ceiling_height_unit: 'm',
      occupancy: randomInt(10, 50),
      status: randomElement(statuses),
      is_active: true
    });

    // Create upper floors
    for (let f = 1; f < numFloors; f++) {
      floors.push({
        customer_id: building.customer_id,
        site_id: building.site_id,
        building_id: building._id,
        floor_name: `Level ${f}`,
        floor_number: f,
        floor_type: randomElement(floorTypes),
        floor_area: randomInt(500, 2500),
        floor_area_unit: 'm²',
        ceiling_height: randomInt(2.7, 3.5),
        ceiling_height_unit: 'm',
        occupancy: randomInt(5, 100),
        status: randomElement(statuses),
        is_active: true
      });
    }

    if (floors.length >= floorsToCreate) break;
  }

  if (floors.length > 0) {
    const created = await Floor.insertMany(floors.slice(0, floorsToCreate));
    console.log(`Created ${created.length} new floors`);
  }

  return await Floor.find().lean();
}

async function seedAssets(customerIds, sites, buildings, floors) {
  console.log('\n=== Seeding Assets ===');
  const currentAssetsCount = await Asset.countDocuments();
  console.log(`Current assets count: ${currentAssetsCount}`);

  if (currentAssetsCount >= 500) {
    console.log('Sufficient assets already exist. Skipping...');
    return await Asset.find().lean();
  }

  const categories = ['HVAC', 'Electrical', 'Fire Safety', 'Plumbing', 'Security', 'Lift/Elevator'];
  const manufacturers = ['Carrier', 'Daikin', 'Trane', 'Schneider Electric', 'Honeywell', 'Siemens', 'Johnson Controls'];
  const statuses = ['Operational', 'Active', 'Maintenance Required', 'Inactive'];
  const conditions = ['Good', 'Fair', 'Poor'];

  const assets = [];
  const assetsToCreate = Math.max(0, 600 - currentAssetsCount);

  // Distribute assets across floors
  const assetsPerFloor = Math.ceil(assetsToCreate / Math.min(floors.length, 50));

  for (const floor of floors.slice(0, 50)) {
    const building = buildings.find(b => b._id.toString() === floor.building_id.toString());
    const site = sites.find(s => s._id.toString() === floor.site_id.toString());

    const numAssets = randomInt(5, assetsPerFloor);

    for (let a = 0; a < numAssets; a++) {
      const category = randomElement(categories);
      const manufacturer = randomElement(manufacturers);
      const assetNo = `${category.substring(0, 3).toUpperCase()}-${1000 + currentAssetsCount + assets.length}`;

      assets.push({
        customer_id: floor.customer_id,
        site_id: floor.site_id,
        building_id: floor.building_id,
        floor_id: floor._id,
        asset_no: assetNo,
        asset_name: `${category} Unit ${assetNo}`,
        asset_id: assetNo,
        category: category,
        type: category,
        make: manufacturer,
        manufacturer: manufacturer,
        model: `${manufacturer.substring(0, 3).toUpperCase()}-${randomInt(1000, 9999)}`,
        serial: `SN${randomInt(100000, 999999)}`,
        status: randomElement(statuses),
        condition: randomElement(conditions),
        level: floor.floor_name,
        area: floor.floor_name,
        installation_date: new Date(randomInt(2010, 2024), randomInt(0, 11), randomInt(1, 28)),
        age: randomInt(0, 14),
        purchase_cost_aud: randomInt(5000, 100000),
        current_book_value_aud: randomInt(2000, 80000),
        warranty_expiry: new Date(randomInt(2024, 2030), randomInt(0, 11), randomInt(1, 28)),
        last_service_date: new Date(2024, randomInt(0, 8), randomInt(1, 28)),
        next_service_date: new Date(2024, randomInt(9, 11), randomInt(1, 28)),
        service_status: randomElement(['Current', 'Overdue', 'Due Soon']),
        last_test_result: randomElement(['Pass', 'Fail', 'Pending']),
        is_active: true
      });

      if (assets.length >= assetsToCreate) break;
    }

    if (assets.length >= assetsToCreate) break;
  }

  if (assets.length > 0) {
    const created = await Asset.insertMany(assets.slice(0, assetsToCreate));
    console.log(`Created ${created.length} new assets`);
  }

  return await Asset.find().lean();
}

async function seedTenants(customerIds, sites, buildings, floors) {
  console.log('\n=== Seeding Tenants ===');
  const currentTenantsCount = await Tenant.countDocuments();
  console.log(`Current tenants count: ${currentTenantsCount}`);

  if (currentTenantsCount >= 20) {
    console.log('Sufficient tenants already exist. Skipping...');
    return await Tenant.find().lean();
  }

  const industries = ['Technology', 'Finance', 'Healthcare', 'Legal', 'Consulting', 'Retail', 'Education', 'Manufacturing'];
  const leaseStatuses = ['Active', 'Expiring Soon', 'Expired', 'Pending Renewal'];
  const companyNames = ['Tech Solutions', 'Financial Services', 'Medical Centre', 'Law Firm', 'Consulting Group', 'Retail Store', 'Training Academy', 'Manufacturing Co'];

  const tenants = [];
  const tenantsToCreate = Math.max(0, 30 - currentTenantsCount);

  // Distribute tenants across buildings
  const tenantsPerBuilding = Math.ceil(tenantsToCreate / Math.min(buildings.length, 15));

  for (const building of buildings.slice(0, 15)) {
    const buildingFloors = floors.filter(f => f.building_id.toString() === building._id.toString());
    const site = sites.find(s => s._id.toString() === building.site_id.toString());

    const numTenants = randomInt(1, tenantsPerBuilding);

    for (let t = 0; t < numTenants; t++) {
      const floor = randomElement(buildingFloors);
      const industry = randomElement(industries);
      const companyType = randomElement(companyNames);
      const tenantName = `${site.address.suburb} ${companyType}`;

      const leaseStart = new Date(randomInt(2020, 2023), randomInt(0, 11), 1);
      const leaseYears = randomInt(3, 7);
      const leaseEnd = new Date(leaseStart);
      leaseEnd.setFullYear(leaseEnd.getFullYear() + leaseYears);

      tenants.push({
        customer_id: building.customer_id,
        site_id: building.site_id,
        building_id: building._id,
        floor_id: floor ? floor._id : null,
        tenant_legal_name: `${tenantName} Pty Ltd`,
        tenant_trading_name: tenantName,
        tenant_name: tenantName,
        abn: generateABN(),
        industry_type: industry,
        industry: industry,
        lease_type: randomElement(['Commercial', 'Retail', 'Office']),
        lease_start_date: leaseStart,
        lease_end_date: leaseEnd,
        lease_status: leaseEnd < new Date() ? 'Expired' : (leaseEnd < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) ? 'Expiring Soon' : 'Active'),
        tenant_status: 'Active',
        area_sqm: randomInt(50, 500),
        monthly_rent_aud: randomInt(2000, 20000),
        primary_contact_name: `${randomElement(['James', 'Lisa', 'David', 'Sophie'])} ${randomElement(['Wilson', 'Martin', 'Lee', 'Clark'])}`,
        primary_contact_email: `contact@${tenantName.toLowerCase().replace(/\s/g, '')}.com.au`,
        primary_contact_phone: `+61 ${randomInt(2, 9)} ${randomInt(1000, 9999)} ${randomInt(1000, 9999)}`,
        is_active: true
      });

      if (tenants.length >= tenantsToCreate) break;
    }

    if (tenants.length >= tenantsToCreate) break;
  }

  if (tenants.length > 0) {
    const created = await Tenant.insertMany(tenants.slice(0, tenantsToCreate));
    console.log(`Created ${created.length} new tenants`);
  }

  return await Tenant.find().lean();
}

async function seedDocuments(customerIds, sites, buildings, assets) {
  console.log('\n=== Seeding Documents ===');
  const currentDocumentsCount = await Document.countDocuments();
  console.log(`Current documents count: ${currentDocumentsCount}`);

  if (currentDocumentsCount >= 50) {
    console.log('Sufficient documents already exist. Skipping...');
    return await Document.find().lean();
  }

  const categories = ['Architectural', 'Engineering', 'Safety', 'Compliance', 'Legal', 'Financial', 'Operational'];
  const documentTypes = ['PDF', 'DOCX', 'DWG', 'XLSX', 'PNG', 'JPG'];
  const statuses = ['Active', 'Draft', 'Archived', 'Under Review'];

  const documents = [];
  const documentsToCreate = Math.max(0, 80 - currentDocumentsCount);

  for (let i = 0; i < documentsToCreate; i++) {
    const customer = await Customer.findById(randomElement(customerIds)).lean();
    const site = randomElement(sites);
    const siteBuildings = buildings.filter(b => b.site_id.toString() === site._id.toString());
    const building = siteBuildings.length > 0 ? randomElement(siteBuildings) : null;
    const asset = (building && assets.length > 0) ? (randomElement(assets.filter(a => a.building_id && a.building_id.toString() === building._id.toString())) || null) : null;

    const category = randomElement(categories);
    const docType = randomElement(documentTypes);
    const buildingName = building ? building.building_name : 'General';
    const docName = `${category}-${buildingName}-${Date.now() + i}`;

    documents.push({
      customer: {
        customer_id: customer._id.toString(),
        customer_name: customer.organisation?.organisation_name || 'Unknown'
      },
      location: {
        site: site ? {
          site_id: site._id.toString(),
          site_name: site.site_name
        } : undefined,
        building: building ? {
          building_id: building._id.toString(),
          building_name: building.building_name
        } : undefined,
        asset: asset ? {
          asset_id: asset._id.toString(),
          asset_name: asset.asset_name
        } : undefined
      },
      document_name: docName,
      document_title: `${category} Document - ${buildingName}`,
      document_description: `${category} documentation for ${buildingName}`,
      category: category,
      type: docType,
      status: randomElement(statuses),
      version: `${randomInt(1, 5)}.${randomInt(0, 9)}`,
      file_size: `${randomInt(100, 9999)} KB`,
      file_size_bytes: randomInt(100000, 9999000),
      document_url: `https://storage.example.com/docs/${docName}.${docType.toLowerCase()}`,
      uploaded_date: new Date(randomInt(2022, 2024), randomInt(0, 11), randomInt(1, 28)),
      uploaded_by: `${randomElement(['Admin', 'Manager', 'Engineer'])} User`,
      tags: {
        tags: [category, building ? building.building_type : 'General', randomElement(['Important', 'Standard', 'Reference'])]
      },
      metadata: {
        compliance_status: randomElement(['Compliant', 'Non-Compliant', 'Under Review']),
        regulatory_framework: randomElement(['NCC', 'AS/NZS', 'ISO', 'Local Council'])
      },
      is_active: true
    });
  }

  if (documents.length > 0) {
    const created = await Document.insertMany(documents);
    console.log(`Created ${created.length} new documents`);
  }

  return await Document.find().lean();
}

// Main seeding function
async function seedDatabase() {
  try {
    console.log('=================================');
    console.log('FULQROM HUB - MOCK DATA SEEDING');
    console.log('=================================');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    console.log('\n✅ Connected to MongoDB');
    console.log(`📍 Database: ${process.env.MONGODB_CONNECTION.split('@')[1]}\n`);

    // Get existing customer IDs
    const customers = await Customer.find().lean();
    if (customers.length === 0) {
      console.error('❌ No customers found in database. Please create customers first.');
      process.exit(1);
    }

    const customerIds = customers.map(c => c._id);
    console.log(`Found ${customers.length} existing customers`);

    // Seed data in order (respecting foreign key relationships)
    const sites = await seedSites(customerIds);
    const buildings = await seedBuildings(customerIds, sites);
    const floors = await seedFloors(customerIds, sites, buildings);
    const assets = await seedAssets(customerIds, sites, buildings, floors);
    const tenants = await seedTenants(customerIds, sites, buildings, floors);
    const documents = await seedDocuments(customerIds, sites, buildings, assets);

    // Final count summary
    console.log('\n=================================');
    console.log('FINAL DATABASE SUMMARY');
    console.log('=================================\n');

    const finalCounts = {
      customers: await Customer.countDocuments(),
      sites: await Site.countDocuments(),
      buildings: await Building.countDocuments(),
      floors: await Floor.countDocuments(),
      assets: await Asset.countDocuments(),
      tenants: await Tenant.countDocuments(),
      documents: await Document.countDocuments()
    };

    for (const [collection, count] of Object.entries(finalCounts)) {
      console.log(`${collection.padEnd(15)}: ${count} records`);
    }

    console.log('\n✅ Mock data seeding completed successfully!\n');

    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the seeding
seedDatabase();
