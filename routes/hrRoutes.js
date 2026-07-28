const express = require('express');
const router = express.Router();
const { 
    getShifts, createShift, updateShift, deleteShift, 
    clockIn, clockOut, checkTodayAttendance, 
    getEmployees, updateEmployeeHr, 
    getPayrollReport, savePayroll, 
    submitLeave, getMyStats, getAllAttendanceHistory,
    deleteAttendance          // ← tambahkan
} = require('../controllers/hrController');

// Route untuk Shift
router.get('/shifts', getShifts);
router.post('/shifts', createShift);
router.put('/shifts/:id', updateShift);
router.delete('/shifts/:id', deleteShift);

// Route untuk Absensi
router.post('/attendance/clock-in', clockIn);
router.post('/attendance/clock-out', clockOut);
router.get('/attendance/today/:user_id', checkTodayAttendance);
router.post('/attendance/leave', submitLeave);
router.delete('/attendance/:id', deleteAttendance);   // ← tambahkan baris ini

// Route untuk Karyawan
router.get('/employees', getEmployees);
router.put('/employees/:id', updateEmployeeHr);
router.get('/my-stats/:user_id', getMyStats);

// Route untuk Penggajian (Payroll)
router.get('/payrolls', getPayrollReport);
router.post('/payrolls', savePayroll);

router.get('/attendance-history', getAllAttendanceHistory);

module.exports = router;