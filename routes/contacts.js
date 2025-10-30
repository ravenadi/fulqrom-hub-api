const express = require('express');
const Customer = require('../models/Customer');
const { logCreate, logUpdate, logDelete } = require('../utils/auditLogger');
const { requireIfMatch, sendVersionConflict } = require('../middleware/etagVersion');

const router = express.Router({ mergeParams: true });

// GET /api/customers/:customerId/contacts/primary - Get primary contact for customer
router.get('/primary', async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const primaryContact = customer.contact_methods?.find(contact => contact.is_primary);

    if (!primaryContact) {
      return res.status(404).json({
        success: false,
        message: 'No primary contact found for this customer'
      });
    }

    res.status(200).json({
      success: true,
      data: primaryContact,
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching primary contact',
      error: error.message
    });
  }
});

// GET /api/customers/:customerId/contacts/search - Search contacts by name, email, or role
router.get('/search', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { q, role_type, contact_type } = req.query;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    let contacts = customer.contact_methods || [];

    // Apply search filters
    if (q) {
      const searchTerm = q.toLowerCase();
      contacts = contacts.filter(contact =>
        (contact.full_name && contact.full_name.toLowerCase().includes(searchTerm)) ||
        (contact.method_value && contact.method_value.toLowerCase().includes(searchTerm)) ||
        (contact.job_title && contact.job_title.toLowerCase().includes(searchTerm)) ||
        (contact.department && contact.department.toLowerCase().includes(searchTerm))
      );
    }

    if (role_type) {
      contacts = contacts.filter(contact => contact.role_type === role_type);
    }

    if (contact_type) {
      contacts = contacts.filter(contact => contact.contact_type === contact_type);
    }

    // Sort by primary first, then by name
    contacts.sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });

    res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts,
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error searching contacts',
      error: error.message
    });
  }
});

// GET /api/customers/:customerId/contacts - List all contacts for a customer
router.get('/', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { search } = req.query;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    let contacts = customer.contact_methods || [];

    // Simple search across key fields
    if (search) {
      const searchTerm = search.toLowerCase();
      contacts = contacts.filter(contact =>
        (contact.full_name && contact.full_name.toLowerCase().includes(searchTerm)) ||
        (contact.method_value && contact.method_value.toLowerCase().includes(searchTerm)) ||
        (contact.job_title && contact.job_title.toLowerCase().includes(searchTerm)) ||
        (contact.department && contact.department.toLowerCase().includes(searchTerm)) ||
        (contact.role_type && contact.role_type.toLowerCase().includes(searchTerm))
      );
    }

    res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts,
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts',
      error: error.message
    });
  }
});

// GET /api/customers/:customerId/contacts/:id - Get single contact
router.get('/:id', async (req, res) => {
  try {
    const { customerId, id } = req.params;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const contact = customer.contact_methods?.find(contact => contact._id.toString() === id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    res.status(200).json({
      success: true,
      data: contact,
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching contact',
      error: error.message
    });
  }
});

// POST /api/customers/:customerId/contacts - Create new contact
router.post('/', async (req, res) => {
  try {
    const { customerId } = req.params;

    let customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v ?? customer.__v;
    
    // If this is set as primary, remove primary from existing contacts atomically
    const updateOperation = {};
    if (req.body.is_primary) {
      // Mark all existing contacts as non-primary using $set on array elements
      customer.contact_methods.forEach((contact, index) => {
        if (contact.is_primary) {
          updateOperation[`contact_methods.${index}.is_primary`] = false;
        }
      });
    }

    // Create contact with both new and legacy structure for compatibility
    const newContactData = {
      ...req.body,
      contact_methods: req.body.contact_methods || []  // Initialize empty contact_methods array
    };

    // If legacy method fields are provided, also add them to the new structure
    if (req.body.method_type || req.body.method_value) {
      newContactData.contact_methods = [{
        method_type: req.body.method_type,
        method_value: req.body.method_value,
        label: req.body.label,
        is_primary: req.body.is_primary || true
      }];
    }

    // Use atomic update to add contact and update primary flags
    const result = await Customer.findOneAndUpdate(
      { 
        _id: customerId,
        __v: clientVersion  // Version check for optimistic locking
      },
      {
        $push: { contact_methods: newContactData },
        $set: updateOperation,
        $inc: { __v: 1 }  // Atomic version increment
      },
      { new: true, runValidators: true }
    );

    if (!result) {
      return res.status(409).json({
        success: false,
        message: 'The record was modified by another user. Please refresh and try again',
        code: 'VERSION_CONFLICT'
      });
    }

    customer = result;

    // Get the newly added contact
    const newContact = customer.contact_methods[customer.contact_methods.length - 1];

    // Log audit for contact creation
    const contactName = newContact.full_name || newContact.method_value || 'New Contact';
    const customerName = customer.organisation?.organisation_name || 
                        customer.company_profile?.trading_name || 
                        'Unknown Customer';
    await logCreate({ 
      module: 'contact', 
      resourceName: `${contactName} (${customerName})`, 
      req, 
      moduleId: newContact._id,
      resource: newContact.toObject ? newContact.toObject() : newContact
    });

    res.status(201).json({
      success: true,
      message: 'Contact created successfully',
      data: newContact,
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating contact',
      error: error.message
    });
  }
});

// PUT /api/customers/:customerId/contacts/:id - Update contact
router.put('/:id', requireIfMatch, async (req, res) => {
  try {
    const { customerId, id } = req.params;

    let customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined || customer.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: customerId
      });
    }

    const contactIndex = customer.contact_methods.findIndex(contact => contact._id.toString() === id);
    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Store old contact data for audit
    const oldContact = JSON.parse(JSON.stringify(customer.contact_methods[contactIndex]));

    // Build atomic update operation
    const updateOperation = {};
    
    // Update contact fields atomically
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined && key !== '_id') {
        updateOperation[`contact_methods.${contactIndex}.${key}`] = req.body[key];
      }
    });

    // If this is set as primary, remove primary from other contacts atomically
    if (req.body.is_primary) {
      customer.contact_methods.forEach((contact, index) => {
        if (index !== contactIndex && contact.is_primary) {
          updateOperation[`contact_methods.${index}.is_primary`] = false;
        }
      });
    }

    // Perform atomic update with version check
    const result = await Customer.findOneAndUpdate(
      { 
        _id: customerId,
        __v: clientVersion  // Version check prevents lost updates
      },
      {
        $set: updateOperation,
        $inc: { __v: 1 }  // Atomic version increment
      },
      { new: true, runValidators: true }
    );

    if (!result) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: customerId
      });
    }

    customer = result;

    // Log audit for contact update
    const contactName = customer.contact_methods[contactIndex].full_name || 
                       customer.contact_methods[contactIndex].method_value || 
                       'Contact';
    const customerName = customer.organisation?.organisation_name || 
                        customer.company_profile?.trading_name || 
                        'Unknown Customer';
    await logUpdate({ 
      module: 'contact', 
      resourceName: `${contactName} (${customerName})`, 
      req, 
      moduleId: customer.contact_methods[contactIndex]._id,
      resource: customer.contact_methods[contactIndex].toObject ? 
                customer.contact_methods[contactIndex].toObject() : 
                customer.contact_methods[contactIndex]
    });

    res.status(200).json({
      success: true,
      message: 'Contact updated successfully',
      data: customer.contact_methods[contactIndex],
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating contact',
      error: error.message
    });
  }
});

// PATCH /api/customers/:customerId/contacts/:id/primary - Set contact as primary
router.patch('/:id/primary', requireIfMatch, async (req, res) => {
  try {
    const { customerId, id } = req.params;

    let customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined || customer.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: customerId
      });
    }

    const contactIndex = customer.contact_methods.findIndex(contact => contact._id.toString() === id);
    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Build atomic update: remove primary from all, set primary for target contact
    const updateOperation = {};
    customer.contact_methods.forEach((contact, index) => {
      if (index === contactIndex) {
        updateOperation[`contact_methods.${index}.is_primary`] = true;
      } else if (contact.is_primary) {
        updateOperation[`contact_methods.${index}.is_primary`] = false;
      }
    });

    // Perform atomic update with version check
    const result = await Customer.findOneAndUpdate(
      { 
        _id: customerId,
        __v: clientVersion
      },
      {
        $set: updateOperation,
        $inc: { __v: 1 }
      },
      { new: true, runValidators: true }
    );

    if (!result) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: customerId
      });
    }

    customer = result;

    res.status(200).json({
      success: true,
      message: 'Contact set as primary successfully',
      data: customer.contact_methods[contactIndex],
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error setting primary contact',
      error: error.message
    });
  }
});

// DELETE /api/customers/:customerId/contacts/:id - Delete contact
router.delete('/:id', requireIfMatch, async (req, res) => {
  try {
    const { customerId, id } = req.params;

    let customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined || customer.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: customerId
      });
    }

    const contactIndex = customer.contact_methods.findIndex(contact => contact._id.toString() === id);
    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Store contact data for audit before deletion
    const deletedContact = customer.contact_methods[contactIndex];

    // Remove the contact atomically using $pull
    const result = await Customer.findOneAndUpdate(
      { 
        _id: customerId,
        __v: clientVersion
      },
      {
        $pull: { contact_methods: { _id: id } },
        $inc: { __v: 1 }
      },
      { new: true }
    );

    if (!result) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: customerId
      });
    }

    customer = result;

    // Log audit for contact deletion
    const contactName = deletedContact.full_name || deletedContact.method_value || 'Contact';
    const customerName = customer.organisation?.organisation_name || 
                        customer.company_profile?.trading_name || 
                        'Unknown Customer';
    await logDelete({ 
      module: 'contact', 
      resourceName: `${contactName} (${customerName})`, 
      req, 
      moduleId: deletedContact._id,
      resource: deletedContact.toObject ? deletedContact.toObject() : deletedContact
    });

    res.status(200).json({
      success: true,
      message: 'Contact deleted successfully',
      data: deletedContact,
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting contact',
      error: error.message
    });
  }
});

// POST /api/customers/:customerId/contacts/:id/methods - Add contact method to existing contact
router.post('/:id/methods', async (req, res) => {
  try {
    const { customerId, id } = req.params;

    let customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const contactIndex = customer.contact_methods.findIndex(contact => contact._id.toString() === id);
    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Ensure contact_methods array exists
    if (!customer.contact_methods[contactIndex].contact_methods) {
      customer.contact_methods[contactIndex].contact_methods = [];
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v ?? customer.__v;

    // Build update operation for atomic add
    const updateOperation = {};
    if (req.body.is_primary) {
      // Remove primary from other methods in this contact
      const contact = customer.contact_methods[contactIndex];
      if (contact.contact_methods) {
        contact.contact_methods.forEach((method, methodIndex) => {
          if (method.is_primary) {
            updateOperation[`contact_methods.${contactIndex}.contact_methods.${methodIndex}.is_primary`] = false;
          }
        });
      }
    }

    // Add new method atomically
    const result = await Customer.findOneAndUpdate(
      { 
        _id: customerId,
        __v: clientVersion
      },
      {
        $push: { [`contact_methods.${contactIndex}.contact_methods`]: req.body },
        $set: updateOperation,
        $inc: { __v: 1 }
      },
      { new: true, runValidators: true }
    );

    if (!result) {
      return res.status(409).json({
        success: false,
        message: 'The record was modified by another user. Please refresh and try again.',
        code: 'VERSION_CONFLICT'
      });
    }

    customer = result;

    // Get the newly added method
    const methodsArray = customer.contact_methods[contactIndex].contact_methods;
    const newMethod = methodsArray[methodsArray.length - 1];

    res.status(201).json({
      success: true,
      message: 'Contact method added successfully',
      data: newMethod,
      contact: customer.contact_methods[contactIndex],
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error adding contact method',
      error: error.message
    });
  }
});

// PUT /api/customers/:customerId/contacts/:id/methods/:methodId - Update specific contact method
router.put('/:id/methods/:methodId', requireIfMatch, async (req, res) => {
  try {
    const { customerId, id, methodId } = req.params;

    let customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined || customer.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: customerId
      });
    }

    const contactIndex = customer.contact_methods.findIndex(contact => contact._id.toString() === id);
    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    let contact = customer.contact_methods[contactIndex];
    if (!contact.contact_methods) {
      return res.status(404).json({
        success: false,
        message: 'No contact methods found'
      });
    }

    const methodIndex = contact.contact_methods.findIndex(method => method._id.toString() === methodId);
    if (methodIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact method not found'
      });
    }

    // Build atomic update operation
    const updateOperation = {};
    
    // Update method fields atomically
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined && key !== '_id') {
        updateOperation[`contact_methods.${contactIndex}.contact_methods.${methodIndex}.${key}`] = req.body[key];
      }
    });

    // If this method is set as primary, remove primary from other methods atomically
    if (req.body.is_primary) {
      contact.contact_methods.forEach((method, index) => {
        if (index !== methodIndex && method.is_primary) {
          updateOperation[`contact_methods.${contactIndex}.contact_methods.${index}.is_primary`] = false;
        }
      });
    }

    // Perform atomic update with version check
    const result = await Customer.findOneAndUpdate(
      { 
        _id: customerId,
        __v: clientVersion
      },
      {
        $set: updateOperation,
        $inc: { __v: 1 }
      },
      { new: true, runValidators: true }
    );

    if (!result) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: customerId
      });
    }

    customer = result;
    contact = customer.contact_methods[contactIndex];

    res.status(200).json({
      success: true,
      message: 'Contact method updated successfully',
      data: contact.contact_methods[methodIndex],
      contact: contact,
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating contact method',
      error: error.message
    });
  }
});

// DELETE /api/customers/:customerId/contacts/:id/methods/:methodId - Delete specific contact method
router.delete('/:id/methods/:methodId', requireIfMatch, async (req, res) => {
  try {
    const { customerId, id, methodId } = req.params;

    let customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const contactIndex = customer.contact_methods.findIndex(contact => contact._id.toString() === id);
    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    let contact = customer.contact_methods[contactIndex];
    if (!contact.contact_methods) {
      return res.status(404).json({
        success: false,
        message: 'No contact methods found'
      });
    }

    const methodIndex = contact.contact_methods.findIndex(method => method._id.toString() === methodId);
    if (methodIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact method not found'
      });
    }

    // Get version for optimistic locking
    const clientVersion = req.clientVersion ?? req.body.__v;
    if (clientVersion === undefined || customer.__v !== clientVersion) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: customerId
      });
    }

    const deletedMethod = contact.contact_methods[methodIndex];
    
    // Remove method atomically using $pull
    const result = await Customer.findOneAndUpdate(
      { 
        _id: customerId,
        __v: clientVersion
      },
      {
        $pull: { [`contact_methods.${contactIndex}.contact_methods`]: { _id: methodId } },
        $inc: { __v: 1 }
      },
      { new: true }
    );

    if (!result) {
      return sendVersionConflict(res, {
        clientVersion,
        currentVersion: customer.__v,
        resource: 'Customer',
        id: customerId
      });
    }

    customer = result;
    contact = customer.contact_methods[contactIndex];

    res.status(200).json({
      success: true,
      message: 'Contact method deleted successfully',
      data: deletedMethod,
      contact: contact,
      customer: {
        id: customer._id,
        name: customer.display_name
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting contact method',
      error: error.message
    });
  }
});

module.exports = router;