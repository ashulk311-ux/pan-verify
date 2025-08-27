const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Admin middleware - only admin users can access these routes
router.use(authenticateToken, requireRole(['admin']));

// Validation rules
const createUserValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().isLength({ min: 2 }),
  body('role').isIn(['user', 'admin'])
];

const updateUserValidation = [
  body('name').trim().isLength({ min: 2 }),
  body('role').isIn(['user', 'admin']),
  body('is_active').isBoolean()
];

// Routes
router.get('/users', adminController.getAllUsers);
router.post('/users', createUserValidation, adminController.createUser);
router.put('/users/:id', updateUserValidation, adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

router.get('/verifications', adminController.getAllVerifications);
router.get('/dashboard/stats', adminController.getDashboardStats);

module.exports = router;
