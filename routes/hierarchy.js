const express = require('express');
const mongoose = require('mongoose');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Asset = require('../models/Asset');

const router = express.Router();


// Function to generate floor levels based on actual asset levels
function generateFloors(building, assets) {
  // Group assets by their actual level values
  const assetsByLevel = {};
  assets.forEach(asset => {
    const level = asset.level || 'Unassigned';
    if (!assetsByLevel[level]) {
      assetsByLevel[level] = [];
    }
    assetsByLevel[level].push(asset);
  });

  // Create floors based on actual asset levels found
  const floors = Object.keys(assetsByLevel).map((level, index) => {
    const floorAssets = assetsByLevel[level];

    // Transform assets to hierarchy nodes (no sensors - end nodes)
    const assetNodes = floorAssets.map(asset => ({
      id: asset._id.toString(),
      name: asset.asset_no || asset.asset_id || 'Unnamed Asset',
      type: 'asset',
      details: {
        category: asset.category,
        type: asset.type,
        status: asset.status,
        condition: asset.condition,
        make: asset.make,
        model: asset.model,
        serial: asset.serial,
        area: asset.area,
        owner: asset.owner,
        serviceStatus: asset.service_status,
        dateOfInstallation: asset.date_of_installation,
        age: asset.age,
        purchaseCost: asset.purchase_cost_aud,
        currentValue: asset.current_book_value_aud
      },
      children: []
    }));

    // Create display name for floor
    let floorDisplayName = level;
    if (level === 'GF') {
      floorDisplayName = 'Ground Floor';
    } else if (level.startsWith('Lvl ')) {
      const levelNum = level.replace('Lvl ', '').replace(/^0+/, ''); // Remove leading zeros
      floorDisplayName = `Level ${levelNum}`;
    }

    const floor = {
      id: `${building._id}_floor_${index}`,
      name: floorDisplayName,
      type: 'floor',
      details: {
        buildingId: building._id,
        originalLevel: level,
        assetCount: assetNodes.length
      },
      children: assetNodes
    };

    return floor;
  });

  // Sort floors by level (Ground Floor first, then by number)
  floors.sort((a, b) => {
    if (a.details.originalLevel === 'GF') return -1;
    if (b.details.originalLevel === 'GF') return 1;

    const aLevel = a.details.originalLevel.replace('Lvl ', '').padStart(2, '0');
    const bLevel = b.details.originalLevel.replace('Lvl ', '').padStart(2, '0');
    return aLevel.localeCompare(bLevel);
  });

  return floors;
}

// GET /api/hierarchy/:customer_id - Get hierarchical structure for customer
router.get('/:customer_id', async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { site_id, building_id } = req.query;

    // Validate customer_id
    if (!mongoose.Types.ObjectId.isValid(customer_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID format'
      });
    }

    // Build aggregation pipeline for sites
    const siteMatchQuery = { customer_id: new mongoose.Types.ObjectId(customer_id) };
    if (site_id && mongoose.Types.ObjectId.isValid(site_id)) {
      siteMatchQuery._id = new mongoose.Types.ObjectId(site_id);
    }

    // First get sites with buildings
    const sites = await Site.aggregate([
      { $match: siteMatchQuery },
      {
        $lookup: {
          from: 'buildings',
          localField: '_id',
          foreignField: 'site_id',
          as: 'buildings'
        }
      }
    ]);

    // Then get all assets for this customer (since they might not have site_id set)
    const assetMatchQuery = { customer_id: new mongoose.Types.ObjectId(customer_id) };
    const assets = await Asset.find(assetMatchQuery).lean();

    if (sites.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No sites found for the specified customer'
      });
    }

    let totalSites = 0;
    let totalBuildings = 0;
    let totalAssets = 0;
    let generatedFloors = 0;

    // Transform sites into hierarchy structure
    const hierarchyData = sites.map(site => {
      totalSites++;

      // Filter buildings by building_id if specified
      let buildings = site.buildings;
      if (building_id && mongoose.Types.ObjectId.isValid(building_id)) {
        buildings = buildings.filter(building =>
          building._id.toString() === building_id
        );
      }

      totalBuildings += buildings.length;

      // Group assets by building - for now, assign all assets to the first building
      // or create an unassigned category if no buildings exist
      const assetsByBuilding = {};
      const siteAssets = assets; // All assets for this customer since site_id might be null

      if (buildings.length > 0) {
        // Assign all assets to the first building for now
        // In a real scenario, you'd match by floor/level or area
        assetsByBuilding[buildings[0]._id.toString()] = siteAssets;
      } else {
        // No buildings, create unassigned category
        assetsByBuilding['unassigned'] = siteAssets;
      }

      totalAssets += siteAssets.length;

      // Transform buildings into hierarchy nodes
      const buildingNodes = buildings.map(building => {
        const buildingAssets = assetsByBuilding[building._id.toString()] || [];
        const floors = generateFloors(building, buildingAssets);

        generatedFloors += floors.length;

        return {
          id: building._id.toString(),
          name: building.building_name || building.building_code || 'Unnamed Building',
          type: 'building',
          details: {
            buildingCode: building.building_code,
            category: building.category,
            buildingType: building.building_type,
            buildingGrade: building.building_grade,
            primaryUse: building.primary_use,
            numberOfFloors: building.number_of_floors,
            energyRating: building.energy_rating,
            status: building.status,
            totalAssets: building.total_assets,
            avgOccupancy: building.avg_occupancy,
            imageUrl: building.image_url
          },
          children: floors
        };
      });

      // Handle assets not assigned to any building (if any exist)
      const unassignedAssets = assetsByBuilding['unassigned'] || [];
      if (unassignedAssets.length > 0) {
        const unassignedFloor = {
          id: `${site._id}_unassigned_floor`,
          name: 'Unassigned Assets',
          type: 'floor',
          details: {
            siteId: site._id,
            assetCount: unassignedAssets.length
          },
          children: unassignedAssets.map(asset => ({
            id: asset._id.toString(),
            name: asset.asset_no || asset.asset_id || 'Unnamed Asset',
            type: 'asset',
            details: {
              category: asset.category,
              type: asset.type,
              status: asset.status,
              condition: asset.condition,
              make: asset.make,
              model: asset.model,
              serial: asset.serial,
              area: asset.area
            },
            children: []
          }))
        };

        generatedFloors++;

        // Add unassigned floor as a separate "building"
        buildingNodes.push({
          id: `${site._id}_unassigned_building`,
          name: 'Unassigned Assets',
          type: 'building',
          details: {
            category: 'Unassigned',
            status: 'Active',
            totalAssets: unassignedAssets.length
          },
          children: [unassignedFloor]
        });
      }

      return {
        id: site._id.toString(),
        name: site.site_name || 'Unnamed Site',
        type: 'site',
        details: {
          address: site.display_address || site.address,
          manager: site.manager ? {
            name: site.manager.name,
            email: site.manager.email,
            phone: site.manager.phone,
            title: site.manager.title
          } : null,
          status: site.status,
          buildingsCount: site.buildings_count,
          floorsCount: site.floors_count,
          tenantsCount: site.tenants_count,
          assetCount: site.assets_count,
          isActive: site.is_active
        },
        children: buildingNodes
      };
    });

    res.status(200).json({
      success: true,
      data: hierarchyData,
      metadata: {
        total_sites: totalSites,
        total_buildings: totalBuildings,
        total_assets: totalAssets,
        generated_floors: generatedFloors
      }
    });

  } catch (error) {
    console.error('Hierarchy API Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching hierarchy data',
      error: error.message
    });
  }
});

// GET /api/hierarchy/:customer_id/stats - Get hierarchy statistics
router.get('/:customer_id/stats', async (req, res) => {
  try {
    const { customer_id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(customer_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID format'
      });
    }

    const customerObjectId = new mongoose.Types.ObjectId(customer_id);

    // Get counts using aggregation for better performance
    const [siteStats, buildingStats, assetStats] = await Promise.all([
      Site.aggregate([
        { $match: { customer_id: customerObjectId } },
        {
          $group: {
            _id: null,
            totalSites: { $sum: 1 },
            activeSites: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
            totalBuildings: { $sum: '$buildings_count' },
            totalAssets: { $sum: '$assets_count' }
          }
        }
      ]),
      Building.aggregate([
        { $match: { customer_id: customerObjectId } },
        {
          $group: {
            _id: null,
            totalBuildings: { $sum: 1 },
            activeBuildings: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
            totalFloors: { $sum: '$number_of_floors' },
            avgEnergyRating: { $avg: '$energy_rating' }
          }
        }
      ]),
      Asset.aggregate([
        { $match: { customer_id: customerObjectId } },
        {
          $group: {
            _id: null,
            totalAssets: { $sum: 1 },
            activeAssets: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
            avgAge: { $avg: '$age' }
          }
        }
      ])
    ]);

    const stats = {
      sites: siteStats[0] || { totalSites: 0, activeSites: 0, totalBuildings: 0, totalAssets: 0 },
      buildings: buildingStats[0] || { totalBuildings: 0, activeBuildings: 0, totalFloors: 0, avgEnergyRating: 0 },
      assets: assetStats[0] || { totalAssets: 0, activeAssets: 0, avgAge: 0 }
    };

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Hierarchy Stats API Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching hierarchy statistics',
      error: error.message
    });
  }
});

module.exports = router;