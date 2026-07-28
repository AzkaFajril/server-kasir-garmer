const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, changePassword } = require('../controllers/profileController');

router.get('/:id', getProfile);
router.put('/:id', updateProfile);
router.post('/change-password', changePassword);

module.exports = router;