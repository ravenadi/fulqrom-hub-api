const mongoose = require('mongoose');
require('dotenv').config();
const Vendor = require('../models/Vendor');

// Mock vendors data based on /src/data/vendors.ts
const mockVendors = [
  {
    name: 'Fire Safety Solutions Australia',
    abn: '12345678901',
    gstRegistered: true,
    email: 'contact@firesafetyaus.com.au',
    phone: '+61 2 9555 0123',
    website: 'https://firesafetyaus.com.au',
    address: {
      street: '123 Safety Street',
      suburb: 'Pyrmont',
      state: 'NSW',
      postcode: '2009',
      country: 'Australia'
    },
    category: 'fire-safety',
    subcategories: ['fire-extinguisher-servicing', 'emergency-lighting', 'fire-alarm-testing'],
    status: 'active',
    rating: 4.8,
    totalJobs: 156,
    completedJobs: 152,
    averageCompletionTime: 24,
    onTimePercentage: 97.4,
    licenses: [
      {
        type: 'fire-safety',
        number: 'FS-2023-001234',
        issuingBody: 'Fire and Rescue NSW',
        issueDate: new Date('2023-01-15'),
        expiryDate: new Date('2025-01-15'),
        status: 'current'
      }
    ],
    insurances: [
      {
        type: 'public-liability',
        provider: 'CGU Insurance',
        policyNumber: 'PL-789456123',
        coverageAmount: 20000000,
        expiryDate: new Date('2024-12-31'),
        status: 'current'
      },
      {
        type: 'professional-indemnity',
        provider: 'CGU Insurance',
        policyNumber: 'PI-789456124',
        coverageAmount: 5000000,
        expiryDate: new Date('2024-12-31'),
        status: 'current'
      }
    ],
    certifications: [
      {
        name: 'Fire Protection Association Australia Certification',
        issuingBody: 'Fire Protection Association Australia',
        certificationNumber: 'FPAA-2023-567',
        issueDate: new Date('2023-03-01'),
        expiryDate: new Date('2026-03-01'),
        status: 'current'
      }
    ],
    businessType: 'company',
    yearsInBusiness: 12,
    employeeCount: '10-20',
    serviceAreas: ['Sydney', 'Newcastle', 'Wollongong'],
    hourlyRate: 150,
    preferredPaymentTerms: '30 days',
    lastJobDate: new Date('2024-01-12'),
    notes: 'Excellent fire safety provider with strong track record.'
  },
  {
    name: 'Elite HVAC Services',
    abn: '23456789012',
    gstRegistered: true,
    email: 'info@elitehvac.com.au',
    phone: '+61 3 8555 0234',
    website: 'https://elitehvac.com.au',
    address: {
      street: '456 Climate Avenue',
      suburb: 'South Melbourne',
      state: 'VIC',
      postcode: '3205',
      country: 'Australia'
    },
    category: 'hvac',
    subcategories: ['air-conditioning', 'heating', 'ventilation', 'refrigeration'],
    status: 'active',
    rating: 4.6,
    totalJobs: 203,
    completedJobs: 198,
    averageCompletionTime: 36,
    onTimePercentage: 94.1,
    licenses: [
      {
        type: 'refrigeration',
        number: 'REF-VIC-2023-5678',
        issuingBody: 'Victorian Building Authority',
        issueDate: new Date('2023-02-01'),
        expiryDate: new Date('2025-02-01'),
        status: 'current'
      },
      {
        type: 'electrical',
        number: 'EL-VIC-2023-9012',
        issuingBody: 'Energy Safe Victoria',
        issueDate: new Date('2023-01-10'),
        expiryDate: new Date('2025-01-10'),
        status: 'current'
      }
    ],
    insurances: [
      {
        type: 'public-liability',
        provider: 'Allianz Australia',
        policyNumber: 'AL-PL-456789',
        coverageAmount: 10000000,
        expiryDate: new Date('2024-11-30'),
        status: 'current'
      }
    ],
    certifications: [
      {
        name: 'Australian Refrigeration Council Certificate',
        issuingBody: 'Australian Refrigeration Council',
        certificationNumber: 'ARC-2023-890',
        issueDate: new Date('2023-01-20'),
        expiryDate: new Date('2025-01-20'),
        status: 'current'
      }
    ],
    businessType: 'company',
    yearsInBusiness: 8,
    employeeCount: '21-50',
    serviceAreas: ['Melbourne', 'Geelong', 'Ballarat'],
    hourlyRate: 120,
    preferredPaymentTerms: '14 days',
    lastJobDate: new Date('2024-01-10')
  },
  {
    name: 'Premier Electrical Services',
    abn: '34567890123',
    gstRegistered: true,
    email: 'admin@premierelectric.com.au',
    phone: '+61 7 3555 0345',
    website: 'https://premierelectric.com.au',
    address: {
      street: '789 Power Road',
      suburb: 'Fortitude Valley',
      state: 'QLD',
      postcode: '4006',
      country: 'Australia'
    },
    category: 'electrical',
    subcategories: ['commercial-electrical', 'emergency-lighting', 'power-systems'],
    status: 'active',
    rating: 4.9,
    totalJobs: 89,
    completedJobs: 87,
    averageCompletionTime: 18,
    onTimePercentage: 98.9,
    licenses: [
      {
        type: 'electrical',
        number: 'EL-QLD-2023-3456',
        issuingBody: 'Electrical Safety Office Queensland',
        issueDate: new Date('2023-03-15'),
        expiryDate: new Date('2025-03-15'),
        status: 'current'
      }
    ],
    insurances: [
      {
        type: 'public-liability',
        provider: 'QBE Insurance',
        policyNumber: 'QBE-PL-789123',
        coverageAmount: 15000000,
        expiryDate: new Date('2024-10-15'),
        status: 'current'
      }
    ],
    certifications: [],
    businessType: 'company',
    yearsInBusiness: 15,
    employeeCount: '5-10',
    serviceAreas: ['Brisbane', 'Gold Coast', 'Sunshine Coast'],
    hourlyRate: 140,
    preferredPaymentTerms: '30 days',
    lastJobDate: new Date('2024-01-08')
  },
  {
    name: 'Crystal Clear Cleaning Co.',
    abn: '45678901234',
    gstRegistered: true,
    email: 'bookings@crystalclear.com.au',
    phone: '+61 8 6555 0456',
    address: {
      street: '321 Clean Street',
      suburb: 'West Perth',
      state: 'WA',
      postcode: '6005',
      country: 'Australia'
    },
    category: 'cleaning',
    subcategories: ['office-cleaning', 'window-cleaning', 'carpet-cleaning'],
    status: 'active',
    rating: 4.3,
    totalJobs: 312,
    completedJobs: 305,
    averageCompletionTime: 8,
    onTimePercentage: 96.8,
    licenses: [],
    insurances: [
      {
        type: 'public-liability',
        provider: 'IAG Insurance',
        policyNumber: 'IAG-PL-234567',
        coverageAmount: 5000000,
        expiryDate: new Date('2024-09-30'),
        status: 'current'
      }
    ],
    certifications: [
      {
        name: 'Green Cleaning Certification',
        issuingBody: 'Green Building Council of Australia',
        certificationNumber: 'GBCA-GC-2023-123',
        issueDate: new Date('2023-04-01'),
        expiryDate: new Date('2025-04-01'),
        status: 'current'
      }
    ],
    businessType: 'company',
    yearsInBusiness: 6,
    employeeCount: '51-100',
    serviceAreas: ['Perth', 'Fremantle', 'Joondalup'],
    hourlyRate: 65,
    preferredPaymentTerms: '7 days',
    lastJobDate: new Date('2024-01-09')
  },
  {
    name: 'Secure Guard Solutions',
    abn: '56789012345',
    gstRegistered: true,
    email: 'operations@secureguard.com.au',
    phone: '+61 2 8555 0567',
    website: 'https://secureguard.com.au',
    address: {
      street: '654 Security Boulevard',
      suburb: 'Parramatta',
      state: 'NSW',
      postcode: '2150',
      country: 'Australia'
    },
    category: 'security',
    subcategories: ['access-control', 'cctv', 'alarm-systems', 'security-patrols'],
    status: 'active',
    rating: 4.7,
    totalJobs: 78,
    completedJobs: 76,
    averageCompletionTime: 48,
    onTimePercentage: 97.4,
    licenses: [
      {
        type: 'other',
        number: 'SEC-NSW-2023-7890',
        issuingBody: 'NSW Police Force',
        issueDate: new Date('2023-05-01'),
        expiryDate: new Date('2025-05-01'),
        status: 'current'
      }
    ],
    insurances: [
      {
        type: 'public-liability',
        provider: 'Zurich Insurance',
        policyNumber: 'ZUR-PL-345678',
        coverageAmount: 25000000,
        expiryDate: new Date('2024-08-31'),
        status: 'current'
      }
    ],
    certifications: [
      {
        name: 'Security Industry Certification',
        issuingBody: 'Security Industry Association',
        certificationNumber: 'SIA-2023-456',
        issueDate: new Date('2023-05-15'),
        expiryDate: new Date('2025-05-15'),
        status: 'current'
      }
    ],
    businessType: 'company',
    yearsInBusiness: 10,
    employeeCount: '11-20',
    serviceAreas: ['Sydney', 'Central Coast', 'Hunter Valley'],
    hourlyRate: 95,
    preferredPaymentTerms: '21 days',
    lastJobDate: new Date('2024-01-05')
  }
];

async function seedVendors() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_CONNECTION;
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing vendors (optional - comment out if you want to keep existing data)
    const deleteResult = await Vendor.deleteMany({});
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing vendors`);

    // Insert mock vendors
    const result = await Vendor.insertMany(mockVendors);
    console.log(`✅ Successfully seeded ${result.length} vendors`);

    // Display summary
    console.log('\n📊 Seeded Vendors Summary:');
    result.forEach((vendor, index) => {
      console.log(`${index + 1}. ${vendor.name} (${vendor.category}) - ${vendor.address.state}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding vendors:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the seed function
seedVendors();
