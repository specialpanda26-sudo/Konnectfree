const Package = require('../models/Package');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

// GET /api/packages — public, used by the portal to render package cards
const listPackages = asyncHandler(async (req, res) => {
  const packages = await Package.find({ active: true }).sort({ priceKsh: 1 });
  res.json({ packages });
});

// Admin CRUD
const createPackage = asyncHandler(async (req, res) => {
  const pkg = await Package.create(req.body);
  res.status(201).json({ package: pkg });
});

const updatePackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!pkg) throw new ApiError(404, 'Package not found');
  res.json({ package: pkg });
});

module.exports = { listPackages, createPackage, updatePackage };
