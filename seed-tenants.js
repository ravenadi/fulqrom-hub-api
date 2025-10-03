const mongoose = require('mongoose');
const Tenant = require('./models/Tenant');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_CONNECTION;

const sampleTenants = [
  {
    customer_id: "68d3ce492549915f92e0a75e",
    tenant_legal_name: "TechCorp Australia Pty Ltd",
    tenant_trading_name: "TechCorp",
    abn: "12345678901",
    acn: "123456789",
    lease_type: "Commercial",
    lease_start_date: new Date('2023-01-01'),
    lease_end_date: new Date('2025-12-31'),
    occupied_area: 850,
    occupied_area_unit: "m²",
    number_of_employees: 45,
    allocated_parking_spaces: 12,
    operating_hours_start: "08:00",
    operating_hours_end: "18:00",
    operating_days: "Monday to Friday",
    primary_contact_name: "Sarah Johnson",
    primary_contact_title: "Operations Manager",
    primary_contact_phone: "02 8765 4321",
    primary_contact_email: "sarah.johnson@techcorp.com.au",
    billing_contact_name: "Michael Chen",
    billing_contact_email: "accounts@techcorp.com.au",
    emergency_contacts: [
      {
        name: "John Smith",
        phone: "0412 345 678",
        relationship: "Facility Manager"
      }
    ],
    industry_type: "Technology",
    business_category: "Software Development",
    occupancy_classification: "Class 5 - Office",
    utilities_included: ["Electricity", "Water", "Internet"],
    services_included: ["Cleaning", "Security", "Reception"],
    rental_rate: 650,
    rental_rate_unit: "per sqm/year",
    bond_amount: 25000,
    outgoings_estimate: 125,
    tenant_status: "Active",
    move_in_date: new Date('2023-01-01'),
    notes: "Premium tenant with excellent payment history",
    is_active: true
  },
  {
    customer_id: "68d3ce492549915f92e0a75e",
    tenant_legal_name: "Green Finance Solutions Pty Ltd",
    tenant_trading_name: "Green Finance",
    abn: "98765432109",
    acn: "987654321",
    lease_type: "Commercial",
    lease_start_date: new Date('2022-07-01'),
    lease_end_date: new Date('2025-06-30'),
    occupied_area: 420,
    occupied_area_unit: "m²",
    number_of_employees: 18,
    allocated_parking_spaces: 6,
    operating_hours_start: "09:00",
    operating_hours_end: "17:30",
    operating_days: "Monday to Friday",
    primary_contact_name: "Amanda Clarke",
    primary_contact_title: "General Manager",
    primary_contact_phone: "02 9876 5432",
    primary_contact_email: "amanda@greenfinance.com.au",
    billing_contact_name: "David Wong",
    billing_contact_email: "billing@greenfinance.com.au",
    emergency_contacts: [
      {
        name: "Lisa Thompson",
        phone: "0423 456 789",
        relationship: "Office Manager"
      }
    ],
    industry_type: "Finance",
    business_category: "Financial Services",
    occupancy_classification: "Class 5 - Office",
    utilities_included: ["Electricity", "Water"],
    services_included: ["Cleaning", "Security"],
    rental_rate: 580,
    rental_rate_unit: "per sqm/year",
    bond_amount: 15000,
    outgoings_estimate: 95,
    tenant_status: "Active",
    move_in_date: new Date('2022-07-01'),
    notes: "Sustainable finance company focused on green investments",
    is_active: true
  },
  {
    customer_id: "68d3ce492549915f92e0a75e",
    tenant_legal_name: "Creative Design Studio Pty Ltd",
    tenant_trading_name: "CDS",
    abn: "11223344556",
    acn: "112233445",
    lease_type: "Commercial",
    lease_start_date: new Date('2024-03-01'),
    lease_end_date: new Date('2026-02-28'),
    occupied_area: 320,
    occupied_area_unit: "m²",
    number_of_employees: 12,
    allocated_parking_spaces: 4,
    operating_hours_start: "10:00",
    operating_hours_end: "19:00",
    operating_days: "Monday to Friday",
    primary_contact_name: "Emma Rodriguez",
    primary_contact_title: "Creative Director",
    primary_contact_phone: "02 5555 1234",
    primary_contact_email: "emma@creativeds.com.au",
    billing_contact_name: "Tom Wilson",
    billing_contact_email: "admin@creativeds.com.au",
    emergency_contacts: [
      {
        name: "Jake Miller",
        phone: "0434 567 890",
        relationship: "Studio Manager"
      }
    ],
    industry_type: "Creative Services",
    business_category: "Design & Marketing",
    occupancy_classification: "Class 5 - Office",
    utilities_included: ["Electricity", "Water", "Internet"],
    services_included: ["Cleaning"],
    rental_rate: 720,
    rental_rate_unit: "per sqm/year",
    bond_amount: 18000,
    outgoings_estimate: 85,
    tenant_status: "Active",
    move_in_date: new Date('2024-03-01'),
    notes: "Creative agency specialising in digital marketing and branding",
    is_active: true
  },
  {
    customer_id: "68d3ce492549915f92e0a75e",
    tenant_legal_name: "Legal Partners Brisbane Pty Ltd",
    tenant_trading_name: "Legal Partners",
    abn: "55667788990",
    acn: "556677889",
    lease_type: "Commercial",
    lease_start_date: new Date('2023-09-01'),
    lease_end_date: new Date('2025-03-31'),
    occupied_area: 680,
    occupied_area_unit: "m²",
    number_of_employees: 32,
    allocated_parking_spaces: 10,
    operating_hours_start: "08:30",
    operating_hours_end: "18:30",
    operating_days: "Monday to Friday",
    primary_contact_name: "Robert Taylor",
    primary_contact_title: "Managing Partner",
    primary_contact_phone: "02 7777 8888",
    primary_contact_email: "robert.taylor@legalpartners.com.au",
    billing_contact_name: "Jennifer Lee",
    billing_contact_email: "accounts@legalpartners.com.au",
    emergency_contacts: [
      {
        name: "Patricia Brown",
        phone: "0445 678 901",
        relationship: "Practice Manager"
      }
    ],
    industry_type: "Legal Services",
    business_category: "Law Firm",
    occupancy_classification: "Class 5 - Office",
    utilities_included: ["Electricity", "Water", "Internet"],
    services_included: ["Cleaning", "Security", "Reception"],
    rental_rate: 695,
    rental_rate_unit: "per sqm/year",
    bond_amount: 35000,
    outgoings_estimate: 145,
    tenant_status: "Active",
    move_in_date: new Date('2023-09-01'),
    notes: "Established law firm with corporate and commercial focus",
    is_active: true
  },
  {
    customer_id: "68d3ce492549915f92e0a75e",
    tenant_legal_name: "Wellness Clinic Australia Pty Ltd",
    tenant_trading_name: "Wellness Clinic",
    abn: "99887766554",
    acn: "998877665",
    lease_type: "Medical",
    lease_start_date: new Date('2024-01-15'),
    lease_end_date: new Date('2025-01-14'),
    occupied_area: 250,
    occupied_area_unit: "m²",
    number_of_employees: 8,
    allocated_parking_spaces: 5,
    operating_hours_start: "08:00",
    operating_hours_end: "17:00",
    operating_days: "Monday to Saturday",
    primary_contact_name: "Dr. Karen White",
    primary_contact_title: "Clinic Director",
    primary_contact_phone: "02 3333 4444",
    primary_contact_email: "dr.white@wellnessclinic.com.au",
    billing_contact_name: "Mark Johnson",
    billing_contact_email: "billing@wellnessclinic.com.au",
    emergency_contacts: [
      {
        name: "Nurse Rebecca Adams",
        phone: "0456 789 012",
        relationship: "Head Nurse"
      }
    ],
    industry_type: "Healthcare",
    business_category: "Medical Practice",
    occupancy_classification: "Class 9a - Healthcare",
    utilities_included: ["Electricity", "Water", "Medical Gases"],
    services_included: ["Cleaning", "Medical Waste Disposal", "Security"],
    rental_rate: 850,
    rental_rate_unit: "per sqm/year",
    bond_amount: 20000,
    outgoings_estimate: 110,
    tenant_status: "Active",
    move_in_date: new Date('2024-01-15'),
    notes: "Lease expires soon - renewal discussions in progress",
    compliance_notes: "Medical facility with special waste disposal requirements",
    is_active: true
  }
];

async function seedTenants() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing tenants for this customer (optional)
    const deleteResult = await Tenant.deleteMany({ customer_id: "68d3ce492549915f92e0a75e" });
    console.log(`🗑️  Removed ${deleteResult.deletedCount} existing tenants for customer`);

    // Insert new tenant data
    const result = await Tenant.insertMany(sampleTenants);
    console.log(`✅ Successfully added ${result.length} tenants`);

    // Display summary
    console.log('\n📊 Tenant Summary:');
    result.forEach((tenant, index) => {
      console.log(`${index + 1}. ${tenant.display_name} - ${tenant.occupied_area} m² - ${tenant.tenant_status}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error seeding tenants:', error);
    process.exit(1);
  }
}

seedTenants();