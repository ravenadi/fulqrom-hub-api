const express = require('express');
const mongoose = require('mongoose');
const Site = require('../models/Site');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
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
    const { site_id, building_id, floor_number, floor_level } = req.query;

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

    // If floor_level and building_id are specified, return floor-level hierarchy by level (MOST SPECIFIC)
    if (floor_level && building_id && mongoose.Types.ObjectId.isValid(building_id)) {
      // Get all assets for this customer first
      const assetMatchQuery = { customer_id: new mongoose.Types.ObjectId(customer_id) };

      // Filter assets by building_id and level
      const floorAssets = assets.filter(asset => {
        return asset.building_id &&
               asset.building_id.toString() === building_id &&
               asset.level === floor_level;
      });

      if (floorAssets.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No assets found for level '${floor_level}' in the specified building`
        });
      }

      // Get building information for context
      const targetBuilding = await Building.findById(building_id)
        .populate('site_id', 'site_name address display_address')
        .populate('customer_id', 'organisation.organisation_name');

      if (!targetBuilding) {
        return res.status(404).json({
          success: false,
          message: 'Building not found'
        });
      }

      totalAssets = floorAssets.length;

      // Transform assets to hierarchy nodes
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

      // Create display name for floor level
      let floorDisplayName = floor_level;
      if (floor_level === 'GF') {
        floorDisplayName = 'Ground Floor';
      } else if (floor_level.startsWith('Lvl ')) {
        const levelNum = floor_level.replace('Lvl ', '').replace(/^0+/, '');
        floorDisplayName = `Level ${levelNum}`;
      }

      // Return the floor hierarchy by level
      const floorHierarchy = {
        id: `${building_id}_${floor_level}`,
        name: floorDisplayName,
        type: 'floor',
        details: {
          originalLevel: floor_level,
          assetsCount: floorAssets.length,
          buildingInfo: {
            id: targetBuilding._id.toString(),
            name: targetBuilding.building_name,
            code: targetBuilding.building_code,
            type: targetBuilding.building_type
          },
          siteInfo: {
            id: targetBuilding.site_id._id.toString(),
            name: targetBuilding.site_id.site_name,
            address: targetBuilding.site_id.display_address || targetBuilding.site_id.address
          }
        },
        children: assetNodes
      };

      return res.status(200).json({
        success: true,
        data: [floorHierarchy],
        metadata: {
          total_floors: 1,
          total_assets: totalAssets,
          view_level: 'floor_level',
          level: floor_level
        }
      });
    }

    // If building_id is specified, return only building-level hierarchy
    if (building_id && mongoose.Types.ObjectId.isValid(building_id)) {
      // Find the specific building across all sites
      let targetBuilding = null;
      let targetSite = null;

      for (const site of sites) {
        const building = site.buildings.find(b => b._id.toString() === building_id);
        if (building) {
          targetBuilding = building;
          targetSite = site;
          break;
        }
      }

      if (!targetBuilding) {
        return res.status(404).json({
          success: false,
          message: 'Building not found'
        });
      }

      // Get assets for this building (filter by building context)
      const buildingAssets = assets.filter(asset => {
        // Filter assets by building_id if it exists on the asset
        return asset.building_id && asset.building_id.toString() === building_id;
      });

      totalAssets = buildingAssets.length;
      const floors = generateFloors(targetBuilding, buildingAssets);

      // Return only the building hierarchy
      const buildingHierarchy = {
        id: targetBuilding._id.toString(),
        name: targetBuilding.building_name || targetBuilding.building_code || 'Unnamed Building',
        type: 'building',
        details: {
          buildingCode: targetBuilding.building_code,
          buildingType: targetBuilding.building_type,
          numberOfFloors: targetBuilding.number_of_floors,
          totalArea: targetBuilding.total_area,
          yearBuilt: targetBuilding.year_built,
          nabersRating: targetBuilding.nabers_rating,
          status: targetBuilding.status,
          manager: targetBuilding.manager,
          imageUrl: targetBuilding.image_url,
          siteInfo: {
            id: targetSite._id.toString(),
            name: targetSite.site_name,
            address: targetSite.display_address || targetSite.address
          }
        },
        children: floors
      };

      return res.status(200).json({
        success: true,
        data: [buildingHierarchy],
        metadata: {
          total_buildings: 1,
          total_assets: totalAssets,
          generated_floors: floors.length,
          view_level: 'building'
        }
      });
    }

    // If floor_number and building_id are specified, return only floor-level hierarchy
    if (floor_number && building_id && mongoose.Types.ObjectId.isValid(building_id)) {
      // Find the specific floor by floor_number and building_id
      const targetFloor = await Floor.findOne({
        floor_number: parseInt(floor_number),
        building_id: new mongoose.Types.ObjectId(building_id)
      })
        .populate('site_id', 'site_name address display_address')
        .populate('building_id', 'building_name building_code building_type status manager image_url')
        .populate('customer_id', 'organisation.organisation_name');

      if (!targetFloor) {
        return res.status(404).json({
          success: false,
          message: `Floor ${floor_number} not found in the specified building`
        });
      }

      // Get assets for this floor (filter by floor_id if it exists on assets, or by level matching)
      const floorAssets = assets.filter(asset => {
        // Try to match by floor_id first
        if (asset.floor_id && asset.floor_id.toString() === targetFloor._id.toString()) {
          return true;
        }
        // Fallback: match by building_id and level string matching
        if (asset.building_id && asset.building_id.toString() === building_id) {
          if (asset.level && targetFloor.floor_name) {
            return asset.level.toLowerCase().includes(targetFloor.floor_name.toLowerCase()) ||
                   asset.level.includes(floor_number.toString());
          }
        }
        return false;
      });

      totalAssets = floorAssets.length;

      // Transform assets to hierarchy nodes
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

      // Return only the floor hierarchy
      const floorHierarchy = {
        id: targetFloor._id.toString(),
        name: targetFloor.floor_name || 'Unnamed Floor',
        type: 'floor',
        details: {
          floorNumber: targetFloor.floor_number,
          floorType: targetFloor.floor_type,
          status: targetFloor.status,
          occupancy: targetFloor.current_occupancy || targetFloor.occupancy,
          maxOccupancy: targetFloor.max_occupancy,
          floorArea: targetFloor.floor_area || targetFloor.area_number,
          floorAreaUnit: targetFloor.floor_area_unit || targetFloor.area_unit,
          ceilingHeight: targetFloor.ceiling_height,
          assetsCount: floorAssets.length,
          buildingInfo: {
            id: targetFloor.building_id._id.toString(),
            name: targetFloor.building_id.building_name,
            code: targetFloor.building_id.building_code
          },
          siteInfo: {
            id: targetFloor.site_id._id.toString(),
            name: targetFloor.site_id.site_name,
            address: targetFloor.site_id.display_address || targetFloor.site_id.address
          }
        },
        children: assetNodes
      };

      return res.status(200).json({
        success: true,
        data: [floorHierarchy],
        metadata: {
          total_floors: 1,
          total_assets: totalAssets,
          view_level: 'floor'
        }
      });
    }


    // Transform sites into hierarchy structure (full hierarchy)
    const hierarchyData = sites.map(site => {
      totalSites++;

      // Get all buildings for site-level view
      let buildings = site.buildings;

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