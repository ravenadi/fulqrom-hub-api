/**
 * Validation middleware for document approval endpoints
 */

// Validate request approval request body
const validateRequestApproval = (req, res, next) => {
  const { assigned_to, requested_by } = req.body;
  const errors = [];

  // Validate assigned_to
  if (!assigned_to) {
    errors.push({ field: 'assigned_to', message: 'assigned_to is required' });
  } else if (typeof assigned_to !== 'string' || assigned_to.trim().length === 0) {
    errors.push({ field: 'assigned_to', message: 'assigned_to must be a non-empty string' });
  }

  // Validate requested_by
  if (!requested_by) {
    errors.push({ field: 'requested_by', message: 'requested_by is required' });
  } else if (typeof requested_by !== 'string' || requested_by.trim().length === 0) {
    errors.push({ field: 'requested_by', message: 'requested_by must be a non-empty string' });
  }

  // Validate optional fields
  if (req.body.assigned_to_name && typeof req.body.assigned_to_name !== 'string') {
    errors.push({ field: 'assigned_to_name', message: 'assigned_to_name must be a string' });
  }

  if (req.body.requested_by_name && typeof req.body.requested_by_name !== 'string') {
    errors.push({ field: 'requested_by_name', message: 'requested_by_name must be a string' });
  }

  if (req.body.comments && typeof req.body.comments !== 'string') {
    errors.push({ field: 'comments', message: 'comments must be a string' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

// Validate approve request body
const validateApprove = (req, res, next) => {
  const { approved_by } = req.body;
  const errors = [];

  // Validate approved_by
  if (!approved_by) {
    errors.push({ field: 'approved_by', message: 'approved_by is required' });
  } else if (typeof approved_by !== 'string' || approved_by.trim().length === 0) {
    errors.push({ field: 'approved_by', message: 'approved_by must be a non-empty string' });
  }

  // Validate optional fields
  if (req.body.approved_by_name && typeof req.body.approved_by_name !== 'string') {
    errors.push({ field: 'approved_by_name', message: 'approved_by_name must be a string' });
  }

  if (req.body.comments && typeof req.body.comments !== 'string') {
    errors.push({ field: 'comments', message: 'comments must be a string' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

// Validate reject request body
const validateReject = (req, res, next) => {
  const { rejected_by, comments } = req.body;
  const errors = [];

  // Validate rejected_by
  if (!rejected_by) {
    errors.push({ field: 'rejected_by', message: 'rejected_by is required' });
  } else if (typeof rejected_by !== 'string' || rejected_by.trim().length === 0) {
    errors.push({ field: 'rejected_by', message: 'rejected_by must be a non-empty string' });
  }

  // Validate comments (required for rejection)
  if (!comments) {
    errors.push({ field: 'comments', message: 'comments are required when rejecting a document' });
  } else if (typeof comments !== 'string' || comments.trim().length === 0) {
    errors.push({ field: 'comments', message: 'comments must be a non-empty string' });
  }

  // Validate optional fields
  if (req.body.rejected_by_name && typeof req.body.rejected_by_name !== 'string') {
    errors.push({ field: 'rejected_by_name', message: 'rejected_by_name must be a string' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

// Validate revoke approval request body
const validateRevokeApproval = (req, res, next) => {
  const { revoked_by } = req.body;
  const errors = [];

  // Validate revoked_by
  if (!revoked_by) {
    errors.push({ field: 'revoked_by', message: 'revoked_by is required' });
  } else if (typeof revoked_by !== 'string' || revoked_by.trim().length === 0) {
    errors.push({ field: 'revoked_by', message: 'revoked_by must be a non-empty string' });
  }

  // Validate optional fields
  if (req.body.revoked_by_name && typeof req.body.revoked_by_name !== 'string') {
    errors.push({ field: 'revoked_by_name', message: 'revoked_by_name must be a string' });
  }

  if (req.body.comments && typeof req.body.comments !== 'string') {
    errors.push({ field: 'comments', message: 'comments must be a string' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

module.exports = {
  validateRequestApproval,
  validateApprove,
  validateReject,
  validateRevokeApproval
};
