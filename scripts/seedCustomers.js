const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

const MONGODB_URI = process.env.MONGODB_CONNECTION;

const sampleCustomers = [
  {
    organisation: {
      organisation_name: 'Sydney Commercial Properties',
      email_domain: 'sydneycommercial.com.au',
      logo_url: 'https://via.placeholder.com/100x100/4F46E5/FFFFFF?text=SCP',
      building_image: 'https://via.placeholder.com/400x200/4F46E5/FFFFFF?text=Sydney+Commercial+Properties',
      notes: 'Leading commercial property management company in Sydney',
      metadata: {}
    },
    company_profile: {
      business_number: '12345678901',
      company_number: '987654321',
      trading_name: 'Sydney Commercial Properties Pty Ltd',
      industry_type: 'Commercial Real Estate',
      organisation_size: 'Large'
    },
    business_address: {
      street: '123 George Street',
      suburb: 'Sydney',
      state: 'NSW',
      postcode: '2000',
      country: 'Australia'
    },
    contact_methods: [
      {
        full_name: 'John Smith',
        method_type: 'Email',
        method_value: 'john.smith@sydneycommercial.com.au',
        label: 'Work',
        is_primary: true,
        job_title: 'Property Manager',
        department: 'Property Management',
        role_type: null,
        contact_type: null,
        platform_access: null
      },
      {
        full_name: 'John Smith',
        method_type: 'Phone',
        method_value: '+61 2 9876 5432',
        label: 'Work',
        is_primary: false,
        job_title: 'Property Manager',
        department: 'Property Management',
        role_type: null,
        contact_type: null,
        platform_access: null
      }
    ],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    organisation: {
      organisation_name: 'Melbourne Office Towers',
      email_domain: 'melbournetowers.com.au',
      logo_url: 'https://via.placeholder.com/100x100/059669/FFFFFF?text=MOT',
      building_image: 'https://via.placeholder.com/400x200/059669/FFFFFF?text=Melbourne+Office+Towers',
      notes: 'Premium office space management in Melbourne CBD',
      metadata: {}
    },
    company_profile: {
      business_number: '23456789012',
      company_number: '876543210',
      trading_name: 'Melbourne Office Towers Pty Ltd',
      industry_type: 'Office Management',
      organisation_size: 'Medium'
    },
    business_address: {
      street: '456 Collins Street',
      suburb: 'Melbourne',
      state: 'VIC',
      postcode: '3000',
      country: 'Australia'
    },
    contact_methods: [
      {
        full_name: 'Sarah Johnson',
        method_type: 'Email',
        method_value: 'sarah.johnson@melbournetowers.com.au',
        label: 'Work',
        is_primary: true,
        job_title: 'Facilities Manager',
        department: 'Facilities',
        role_type: null,
        contact_type: null,
        platform_access: null
      },
      {
        full_name: 'Sarah Johnson',
        method_type: 'Phone',
        method_value: '+61 3 8765 4321',
        label: 'Work',
        is_primary: false,
        job_title: 'Facilities Manager',
        department: 'Facilities',
        role_type: null,
        contact_type: null,
        platform_access: null
      }
    ],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    organisation: {
      organisation_name: 'Brisbane Industrial Hub',
      email_domain: 'brisbaneindustrial.com.au',
      logo_url: 'https://via.placeholder.com/100x100/DC2626/FFFFFF?text=BIH',
      building_image: 'https://via.placeholder.com/400x200/DC2626/FFFFFF?text=Brisbane+Industrial+Hub',
      notes: 'Industrial property management and logistics solutions',
      metadata: {}
    },
    company_profile: {
      business_number: '34567890123',
      company_number: '765432109',
      trading_name: 'Brisbane Industrial Hub Pty Ltd',
      industry_type: 'Industrial',
      organisation_size: 'Large'
    },
    business_address: {
      street: '789 Eagle Street',
      suburb: 'Brisbane',
      state: 'QLD',
      postcode: '4000',
      country: 'Australia'
    },
    contact_methods: [
      {
        full_name: 'Michael Brown',
        method_type: 'Email',
        method_value: 'michael.brown@brisbaneindustrial.com.au',
        label: 'Work',
        is_primary: true,
        job_title: 'Operations Manager',
        department: 'Operations',
        role_type: null,
        contact_type: null,
        platform_access: null
      },
      {
        full_name: 'Michael Brown',
        method_type: 'Phone',
        method_value: '+61 7 7654 3210',
        label: 'Work',
        is_primary: false,
        job_title: 'Operations Manager',
        department: 'Operations',
        role_type: null,
        contact_type: null,
        platform_access: null
      }
    ],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  }
];

async function seedCustomers() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected for customer seeding.');

    // Clear existing customers (optional - remove this if you want to keep existing data)
    await Customer.deleteMany({});
    console.log('Cleared existing customers.');

    // Insert sample customers
    const insertedCustomers = await Customer.insertMany(sampleCustomers);
    console.log(`Successfully seeded ${insertedCustomers.length} customers:`);
    
    insertedCustomers.forEach(customer => {
      console.log(`- ${customer.organisation.organisation_name} (${customer.company_profile.trading_name})`);
    });

    console.log('Customer seeding completed successfully.');
  } catch (error) {
    console.error('Error seeding customers:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

seedCustomers();
