const express = require('express');
const Site = require('../models/Site');

const router = express.Router();

// GET /api/sites - List all sites
router.get('/', async (req, res) => {
  try {
    const { customer_id, status, manager, address, is_active } = req.query;

    // Build filter query
    let filterQuery = {};

    if (customer_id) {
      filterQuery.customer_id = customer_id;
    }

    if (status) {
      filterQuery.status = status;
    }

    if (manager) {
      filterQuery['manager.name'] = new RegExp(manager, 'i');
    }

    if (address) {
      filterQuery.address = new RegExp(address, 'i');
    }

    if (is_active !== undefined) {
      filterQuery.is_active = is_active === 'true';
    }

    const sites = await Site.find(filterQuery)
      .populate('customer_id', 'organisation.organisation_name')
      .sort({ created_date: -1 });

    res.status(200).json({
      success: true,
      count: sites.length,
      data: sites
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching sites',
      error: error.message
    });
  }
});

// GET /api/sites/:id - Get single site
router.get('/:id', async (req, res) => {
  try {
    const site = await Site.findById(req.params.id)
      .populate('customer_id', 'organisation.organisation_name company_profile.business_number');

    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found'
      });
    }

    res.status(200).json({
      success: true,
      data: site
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching site',
      error: error.message
    });
  }
});

// POST /api/sites - Create new site
router.post('/', async (req, res) => {
  try {
    const site = new Site(req.body);
    await site.save();

    res.status(201).json({
      success: true,
      message: 'Site created successfully',
      data: site
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating site',
      error: error.message
    });
  }
});

module.exports = router;