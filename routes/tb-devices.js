const express = require('express');
const mongoose = require('mongoose');
const TbDevice = require('../models/TbDevice');
const TbTelemetry = require('../models/TbTelemetry');
const { checkModulePermission } = require('../middleware/checkPermission');
const { logCreate, logUpdate, logDelete } = require('../utils/auditLogger');

const router = express.Router();

// GET /api/tb-devices - List all IoT devices
router.get('/', checkModulePermission('assets', 'view'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const {
      type,
      device_profile_name,
      is_active,
      search,
      page = 1,
      limit = 50,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    let filterQuery = {
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    };

    if (type) filterQuery.type = type;
    if (device_profile_name) filterQuery.device_profile_name = device_profile_name;
    if (is_active !== undefined) filterQuery.is_active = is_active === 'true';

    if (search) {
      filterQuery.$or = [
        { name: new RegExp(search, 'i') },
        { label: new RegExp(search, 'i') },
        { type: new RegExp(search, 'i') },
        { tb_device_id: new RegExp(search, 'i') }
      ];
    }

    const pageNumber = Math.max(1, parseInt(page));
    const limitNumber = Math.min(Math.max(1, parseInt(limit)), 200);
    const skip = (pageNumber - 1) * limitNumber;

    const validSortFields = ['created_at', 'updated_at', 'name', 'type', 'device_profile_name', 'is_active'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order === 'asc' ? 1 : -1;

    const totalDevices = await TbDevice.countDocuments(filterQuery);

    const devices = await TbDevice.find(filterQuery)
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    const totalPages = Math.ceil(totalDevices / limitNumber);

    res.status(200).json({
      success: true,
      data: devices,
      pagination: {
        current_page: pageNumber,
        per_page: limitNumber,
        total_items: totalDevices,
        total_pages: totalPages,
        has_next_page: pageNumber < totalPages,
        has_prev_page: pageNumber > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching IoT devices',
      error: error.message
    });
  }
});

// GET /api/tb-devices/stats - Get device type statistics
router.get('/stats', checkModulePermission('assets', 'view'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const stats = await TbDevice.aggregate([
      {
        $match: {
          tenant_id: new mongoose.Types.ObjectId(req.tenant.tenantId),
          is_delete: { $ne: true }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const deviceStats = {};
    stats.forEach(stat => {
      deviceStats[stat._id || 'Unknown'] = stat.count;
    });

    res.status(200).json({
      success: true,
      data: deviceStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching device statistics',
      error: error.message
    });
  }
});

// GET /api/tb-devices/:id - Get single device
router.get('/:id', checkModulePermission('assets', 'view'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const device = await TbDevice.findOne({
      _id: req.params.id,
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'IoT device not found'
      });
    }

    res.status(200).json({
      success: true,
      data: device
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching device',
      error: error.message
    });
  }
});

// GET /api/tb-devices/by-tb-id/:tbDeviceId - Get device by IoT platform ID
router.get('/by-tb-id/:tbDeviceId', checkModulePermission('assets', 'view'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const device = await TbDevice.findOne({
      tb_device_id: req.params.tbDeviceId,
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'IoT device not found'
      });
    }

    res.status(200).json({
      success: true,
      data: device
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching device',
      error: error.message
    });
  }
});

// POST /api/tb-devices - Create or update device (upsert)
router.post('/', checkModulePermission('assets', 'create'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const { tb_device_id, ...deviceData } = req.body;

    if (!tb_device_id) {
      return res.status(400).json({
        success: false,
        message: 'tb_device_id is required'
      });
    }

    // Check if device exists
    const existingDevice = await TbDevice.findOne({
      tb_device_id,
      tenant_id: req.tenant.tenantId
    });

    let device;
    let action;

    if (existingDevice) {
      // Update existing device
      device = await TbDevice.findOneAndUpdate(
        { tb_device_id, tenant_id: req.tenant.tenantId },
        {
          ...deviceData,
          'import_metadata.last_sync': new Date()
        },
        { new: true, runValidators: true }
      );
      action = 'updated';

      logUpdate({
        module: 'tb_device',
        resourceName: device.name,
        req,
        moduleId: device._id,
        resource: device.toObject()
      });
    } else {
      // Create new device
      device = new TbDevice({
        tb_device_id,
        tenant_id: req.tenant.tenantId,
        ...deviceData
      });
      await device.save();
      action = 'created';

      logCreate({
        module: 'tb_device',
        resourceName: device.name,
        req,
        moduleId: device._id,
        resource: device.toObject()
      });
    }

    res.status(action === 'created' ? 201 : 200).json({
      success: true,
      message: `IoT device ${action} successfully`,
      action,
      data: device
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Device with this IoT platform ID already exists',
        error: 'Duplicate tb_device_id'
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error creating/updating device',
      error: error.message
    });
  }
});

// POST /api/tb-devices/bulk - Bulk import devices
router.post('/bulk', checkModulePermission('assets', 'create'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const { devices } = req.body;

    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'devices array is required and must not be empty'
      });
    }

    const results = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    for (const deviceData of devices) {
      try {
        const { tb_device_id, ...rest } = deviceData;

        if (!tb_device_id) {
          results.failed++;
          results.errors.push({
            deviceName: rest.name || 'Unknown',
            error: 'tb_device_id is required'
          });
          continue;
        }

        const existingDevice = await TbDevice.findOne({
          tb_device_id,
          tenant_id: req.tenant.tenantId
        });

        if (existingDevice) {
          await TbDevice.findOneAndUpdate(
            { tb_device_id, tenant_id: req.tenant.tenantId },
            {
              ...rest,
              'import_metadata.last_sync': new Date()
            },
            { runValidators: true }
          );
          results.updated++;
        } else {
          const device = new TbDevice({
            tb_device_id,
            tenant_id: req.tenant.tenantId,
            ...rest
          });
          await device.save();
          results.created++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          deviceName: deviceData.name || 'Unknown',
          tb_device_id: deviceData.tb_device_id,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk import completed: ${results.created} created, ${results.updated} updated, ${results.failed} failed`,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error during bulk import',
      error: error.message
    });
  }
});

// PUT /api/tb-devices/:id - Update device
router.put('/:id', checkModulePermission('assets', 'edit'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const device = await TbDevice.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant_id: req.tenant.tenantId,
        is_delete: { $ne: true }
      },
      req.body,
      { new: true, runValidators: true }
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'IoT device not found'
      });
    }

    logUpdate({
      module: 'tb_device',
      resourceName: device.name,
      req,
      moduleId: device._id,
      resource: device.toObject()
    });

    res.status(200).json({
      success: true,
      message: 'IoT device updated successfully',
      data: device
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating device',
      error: error.message
    });
  }
});

// DELETE /api/tb-devices/bulk - Bulk soft delete devices
router.delete('/bulk', checkModulePermission('assets', 'delete'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'ids array is required and must not be empty'
      });
    }

    const result = await TbDevice.updateMany(
      {
        _id: { $in: ids },
        tenant_id: req.tenant.tenantId,
        is_delete: { $ne: true }
      },
      { is_delete: true }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} devices deleted successfully`,
      data: { deleted_count: result.modifiedCount }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting devices',
      error: error.message
    });
  }
});

// DELETE /api/tb-devices/:id - Soft delete device
router.delete('/:id', checkModulePermission('assets', 'delete'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const device = await TbDevice.findOne({
      _id: req.params.id,
      tenant_id: req.tenant.tenantId
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'IoT device not found'
      });
    }

    if (device.is_delete) {
      return res.status(400).json({
        success: false,
        message: 'Device already deleted'
      });
    }

    await TbDevice.findByIdAndUpdate(req.params.id, { is_delete: true });

    logDelete({
      module: 'tb_device',
      resourceName: device.name,
      req,
      moduleId: device._id,
      resource: device.toObject()
    });

    res.status(200).json({
      success: true,
      message: 'IoT device deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting device',
      error: error.message
    });
  }
});

// POST /api/tb-devices/:id/telemetry - Store telemetry data
router.post('/:id/telemetry', checkModulePermission('assets', 'create'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const device = await TbDevice.findOne({
      _id: req.params.id,
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'IoT device not found'
      });
    }

    const { telemetry } = req.body;

    if (!telemetry || !Array.isArray(telemetry)) {
      return res.status(400).json({
        success: false,
        message: 'telemetry array is required'
      });
    }

    const telemetryDocs = telemetry.map(item => ({
      tenant_id: req.tenant.tenantId,
      tb_device_id: device.tb_device_id,
      key: item.key,
      value: item.value,
      ts: new Date(item.ts || Date.now()),
      data_type: typeof item.value === 'number' ? 'number' :
                typeof item.value === 'boolean' ? 'boolean' :
                typeof item.value === 'object' ? 'json' : 'string'
    }));

    await TbTelemetry.insertMany(telemetryDocs);

    // Update device's latest_telemetry snapshot
    const latestTelemetry = {};
    telemetry.forEach(item => {
      latestTelemetry[item.key] = {
        value: item.value,
        ts: item.ts || Date.now()
      };
    });

    await TbDevice.findByIdAndUpdate(device._id, {
      latest_telemetry: { ...device.latest_telemetry, ...latestTelemetry },
      telemetry_updated_at: new Date()
    });

    res.status(201).json({
      success: true,
      message: `Stored ${telemetryDocs.length} telemetry records`,
      data: { count: telemetryDocs.length }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error storing telemetry',
      error: error.message
    });
  }
});

// GET /api/tb-devices/:id/telemetry - Get telemetry data
router.get('/:id/telemetry', checkModulePermission('assets', 'view'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const device = await TbDevice.findOne({
      _id: req.params.id,
      tenant_id: req.tenant.tenantId,
      is_delete: { $ne: true }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'IoT device not found'
      });
    }

    const {
      keys,
      start_ts,
      end_ts,
      limit = 100
    } = req.query;

    let query = {
      tenant_id: req.tenant.tenantId,
      tb_device_id: device.tb_device_id
    };

    if (keys) {
      const keyList = keys.split(',').map(k => k.trim());
      query.key = { $in: keyList };
    }

    if (start_ts || end_ts) {
      query.ts = {};
      if (start_ts) query.ts.$gte = new Date(parseInt(start_ts));
      if (end_ts) query.ts.$lte = new Date(parseInt(end_ts));
    }

    const telemetry = await TbTelemetry.find(query)
      .sort({ ts: -1 })
      .limit(Math.min(parseInt(limit), 1000))
      .lean();

    res.status(200).json({
      success: true,
      data: telemetry,
      count: telemetry.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching telemetry',
      error: error.message
    });
  }
});

// POST /api/tb-devices/:id/link-asset - Link to Fulqrom asset
router.post('/:id/link-asset', checkModulePermission('assets', 'edit'), async (req, res) => {
  try {
    if (!req.tenant || !req.tenant.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'No tenant context found.'
      });
    }

    const { asset_id } = req.body;

    if (!asset_id) {
      return res.status(400).json({
        success: false,
        message: 'asset_id is required'
      });
    }

    const device = await TbDevice.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant_id: req.tenant.tenantId,
        is_delete: { $ne: true }
      },
      { linked_asset_id: asset_id },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'IoT device not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Device linked to asset successfully',
      data: device
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error linking device to asset',
      error: error.message
    });
  }
});

module.exports = router;
