const mongoose = require('mongoose');

/**
 * Address model
 * Stores address information that can be referenced by other models
 */
const AddressSchema = new mongoose.Schema({
  street: {
    type: String,
    required: true,
    trim: true
  },
  suburb: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  postcode: {
    type: String,
    required: true,
    trim: true
  },
  country: {
    type: String,
    default: 'Australia',
    trim: true
  },
  // Audit fields
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Pre-save middleware to update updated_at
AddressSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Indexes
AddressSchema.index({ state: 1, postcode: 1 });
AddressSchema.index({ suburb: 1, state: 1 });

// Virtual for full address
AddressSchema.virtual('full_address').get(function() {
  return `${this.street}, ${this.suburb}, ${this.state} ${this.postcode}`;
});

// Ensure virtual fields are serialized
AddressSchema.set('toJSON', { virtuals: true });
AddressSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Address', AddressSchema);
