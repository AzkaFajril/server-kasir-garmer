const pool = require('../db/pool');

const formatLocalDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper: Dapatkan waktu sekarang dalam timezone Indonesia (WIB UTC+7)
const getNowWIB = () => {
    const now = new Date();
    // Konversi ke WIB (UTC+7)
    const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    return wib;
};

// Helper: Buat Date object dari tanggal + waktu WIB
const makeWIBDate = (dateStr, timeStr) => {
    // dateStr: "2026-02-28", timeStr: "08:20:00" atau "08:20"
    const t = timeStr.length === 5 ? timeStr + ':00' : timeStr;
    const d = new Date(`${dateStr}T${t}+07:00`);
    return d;
};

// ==========================================
// 1. MANAJEMEN SHIFT
// ==========================================
const getShifts = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM shifts ORDER BY is_flexible ASC, start_time ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createShift = async (req, res) => {
    try {
        const { name, start_time, end_time, is_flexible } = req.body;

        // Shift flexible: jam mulai/selesai tidak wajib (boleh NULL)
        const flexible = !!is_flexible;
        if (!flexible && (!start_time || !end_time)) {
            return res.status(400).json({ message: 'Jam mulai dan jam selesai wajib diisi untuk shift non-flexible' });
        }

        const result = await pool.query(
            'INSERT INTO shifts (name, start_time, end_time, is_flexible) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, flexible ? null : start_time, flexible ? null : end_time, flexible]
        );
        res.status(201).json({ message: 'Shift berhasil dibuat', data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateShift = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, start_time, end_time, is_flexible } = req.body;

        const flexible = !!is_flexible;
        if (!flexible && (!start_time || !end_time)) {
            return res.status(400).json({ message: 'Jam mulai dan jam selesai wajib diisi untuk shift non-flexible' });
        }

        const result = await pool.query(
            'UPDATE shifts SET name = $1, start_time = $2, end_time = $3, is_flexible = $4 WHERE id = $5 RETURNING *',
            [name, flexible ? null : start_time, flexible ? null : end_time, flexible, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Shift tidak ditemukan' });
        res.json({ message: 'Shift berhasil diperbarui', data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteShift = async (req, res) => {
    try {
        const { id } = req.params;
        // Set shift_id = NULL untuk semua user yang memakai shift ini
        await pool.query('UPDATE users SET shift_id = NULL WHERE shift_id = $1', [id]);
        // Hapus shift
        const result = await pool.query('DELETE FROM shifts WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Shift tidak ditemukan' });
        res.json({ message: 'Shift berhasil dihapus. Karyawan terkait sudah dilepas dari shift ini.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ==========================================
// 2. MANAJEMEN ABSENSI (ATTENDANCE)
// ==========================================
const clockIn = async (req, res) => {
    try {
        const { user_id } = req.body;
        const now = new Date();
        const nowWIB = getNowWIB();
        const todayStr = formatLocalDate(nowWIB);

        const userQuery = await pool.query(
            'SELECT u.shift_id, s.start_time, s.end_time, s.is_flexible FROM users u LEFT JOIN shifts s ON u.shift_id = s.id WHERE u.id = $1',
            [user_id]
        );

        if (userQuery.rows.length === 0) return res.status(404).json({ message: 'User tidak ditemukan' });
        if (!userQuery.rows[0].shift_id) return res.status(400).json({ message: 'Anda belum memiliki jadwal Shift.' });

        const isFlexible = userQuery.rows[0].is_flexible;
        const shiftDateStr = formatLocalDate(nowWIB);

        // ---- SHIFT FLEXIBLE: bisa absen kapan saja, tidak ada batas jam & tidak pernah telat ----
        if (isFlexible) {
            const result = await pool.query(
                'INSERT INTO attendances (user_id, date, clock_in, status, late_seconds) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [user_id, shiftDateStr, now, 'ontime', 0]
            );
            return res.status(201).json({ message: 'Berhasil Absen Masuk', data: result.rows[0] });
        }

        // ---- SHIFT TETAP: logika lama (batas waktu & perhitungan telat) ----
        const shiftStartTime = userQuery.rows[0].start_time; // "08:20:00"
        const shiftEndTime = userQuery.rows[0].end_time;

        // Buat Date objects dalam WIB timezone
        let shiftStart = makeWIBDate(todayStr, shiftStartTime);
        let shiftEnd = makeWIBDate(todayStr, shiftEndTime);

        // Handle shift melewati tengah malam
        if (shiftEnd <= shiftStart) {
            if (nowWIB.getHours() < 12) {
                shiftStart = new Date(shiftStart.getTime() - 24 * 60 * 60 * 1000);
            } else {
                shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
            }
        }

        const allowedStart = new Date(shiftStart.getTime() - 60 * 60 * 1000);

        if (now < allowedStart) return res.status(400).json({ message: `Belum waktunya! Shift dimulai jam ${shiftStartTime}` });
        if (now > shiftEnd) return res.status(400).json({ message: 'Shift Anda sudah berakhir!' });

        let status = 'ontime';
        let lateSeconds = 0;

        if (now > shiftStart) {
            status = 'late';
            lateSeconds = Math.floor((now - shiftStart) / 1000);
        }

        const result = await pool.query(
            'INSERT INTO attendances (user_id, date, clock_in, status, late_seconds) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [user_id, shiftDateStr, now, status, lateSeconds]
        );

        res.status(201).json({ message: 'Berhasil Absen Masuk', data: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') return res.status(400).json({ message: 'Anda sudah absen masuk untuk shift ini!' });
        res.status(500).json({ message: error.message });
    }
};

const clockOut = async (req, res) => {
    try {
        const { user_id } = req.body;
        const now = new Date();
        const nowWIB = getNowWIB();

        // Ambil data shift user untuk cap waktu clock_out
        const userQuery = await pool.query(
            'SELECT u.shift_id, s.start_time, s.end_time, s.is_flexible FROM users u LEFT JOIN shifts s ON u.shift_id = s.id WHERE u.id = $1',
            [user_id]
        );

        let clockOutTime = now;
        const isFlexible = userQuery.rows.length > 0 && userQuery.rows[0].is_flexible;

        // Shift flexible: clock-out selalu di waktu sekarang, tidak di-cap ke jam shift
        if (!isFlexible && userQuery.rows.length > 0 && userQuery.rows[0].end_time) {
            const todayStr = formatLocalDate(nowWIB);
            const shiftStartTime = userQuery.rows[0].start_time;
            const shiftEndTime = userQuery.rows[0].end_time;

            let shiftEnd = makeWIBDate(todayStr, shiftEndTime);
            let shiftStart = makeWIBDate(todayStr, shiftStartTime);

            // Handle shift yang melewati tengah malam
            if (shiftEnd <= shiftStart) {
                if (nowWIB.getHours() < 12) {
                    shiftStart = new Date(shiftStart.getTime() - 24 * 60 * 60 * 1000);
                } else {
                    shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
                }
            }

            // Cap: jika clock out setelah shift berakhir, gunakan waktu shift end
            if (now > shiftEnd) {
                clockOutTime = shiftEnd;
            }
        }

        const result = await pool.query(
            `UPDATE attendances SET clock_out = $1 
             WHERE id = (SELECT id FROM attendances WHERE user_id = $2 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1) 
             RETURNING *`,
            [clockOutTime, user_id]
        );

        if (result.rows.length === 0) return res.status(400).json({ message: 'Anda belum absen masuk atau sudah absen pulang' });
        res.json({ message: 'Berhasil Absen Pulang', data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteAttendance = async (req, res) => {
    try {
        const { id } = req.params;

        // Cek dulu apakah data ada
        const check = await pool.query(
            'SELECT id, status, user_id FROM attendances WHERE id = $1',
            [id]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({ message: 'Data kehadiran tidak ditemukan' });
        }

        const record = check.rows[0];

        // Hanya boleh hapus status sakit / izin
        if (record.status !== 'sick' && record.status !== 'leave') {
            return res.status(400).json({
                message: 'Hanya status Sakit atau Izin yang dapat dihapus'
            });
        }

        // Hapus record
        await pool.query('DELETE FROM attendances WHERE id = $1', [id]);

        res.json({ message: 'Status berhasil dihapus' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const checkTodayAttendance = async (req, res) => {
    try {
        const { user_id } = req.params;
        const result = await pool.query(
            'SELECT * FROM attendances WHERE user_id = $1 ORDER BY clock_in DESC LIMIT 1', 
            [user_id]
        );
        
        if(result.rows.length > 0) {
            const lastAbsen = result.rows[0];
            const nowWIB = getNowWIB();
            const today = formatLocalDate(nowWIB);
            const absenDate = formatLocalDate(new Date(lastAbsen.date));

            if(absenDate === today || lastAbsen.clock_out === null) {
                return res.json(lastAbsen);
            }
        }
        res.json(null);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const submitLeave = async (req, res) => {
    try {
        const { user_id, type, notes } = req.body; 
        const today = formatLocalDate(new Date());
        const result = await pool.query(
            'INSERT INTO attendances (user_id, date, status, notes) VALUES ($1, $2, $3, $4) RETURNING *',
            [user_id, today, type, notes]
        );
        res.status(201).json({ message: 'Keterangan berhasil dicatat', data: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') return res.status(400).json({ message: 'Anda sudah mengisi absensi hari ini!' });
        res.status(500).json({ message: error.message });
    }
};

// ==========================================
// 3. MANAJEMEN SDM & PAYROLL
// ==========================================
const getEmployees = async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.name, u.base_salary, u.shift_id, s.name as shift_name, s.start_time, s.end_time, s.is_flexible
            FROM users u LEFT JOIN shifts s ON u.shift_id = s.id ORDER BY u.id ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateEmployeeHr = async (req, res) => {
    try {
        const { id } = req.params;
        const { shift_id, base_salary } = req.body;
        await pool.query('UPDATE users SET shift_id = $1, base_salary = $2 WHERE id = $3', [shift_id || null, base_salary || 0, id]);
        res.json({ message: 'Data Karyawan berhasil diperbarui' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- FUNGSI SAKTI: MENCEGAH GAJI BUTA KARENA LUPA ABSEN PULANG ---
// Shift flexible: durasi kerja TIDAK di-cap oleh jam shift (karena tidak ada jam start/end),
// dihitung apa adanya dari clock_in sampai clock_out (atau NOW jika masih terbuka).
const getPayrollReport = async (req, res) => {
    const { month } = req.query; 
    if (!month) return res.status(400).json({ message: 'Bulan (month) wajib dikirim' });

    try {
        const query = `
            SELECT 
                u.id as user_id, u.name, u.base_salary,
                s.name as shift_name, s.start_time, s.end_time, s.is_flexible,
                -- Durasi shift dalam detik (handle overnight: end < start). NULL jika flexible.
                CASE 
                    WHEN s.is_flexible THEN NULL
                    WHEN s.end_time > s.start_time 
                    THEN EXTRACT(EPOCH FROM (s.end_time - s.start_time))
                    ELSE EXTRACT(EPOCH FROM (s.end_time - s.start_time + INTERVAL '24 hours'))
                END as shift_duration_seconds,
                MAX(CASE WHEN a.clock_out IS NULL AND a.clock_in IS NOT NULL THEN 1 ELSE 0 END) as is_active,
                COUNT(a.id) as present_days,
                SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_days,
                COALESCE(SUM(
                    CASE
                        WHEN s.is_flexible THEN
                            EXTRACT(EPOCH FROM (COALESCE(a.clock_out, CURRENT_TIMESTAMP) - a.clock_in))
                        ELSE
                            LEAST(
                                EXTRACT(EPOCH FROM (COALESCE(a.clock_out, CURRENT_TIMESTAMP) - a.clock_in)),
                                CASE 
                                    WHEN s.end_time > s.start_time 
                                    THEN EXTRACT(EPOCH FROM (s.end_time - s.start_time))
                                    ELSE EXTRACT(EPOCH FROM (s.end_time - s.start_time + INTERVAL '24 hours'))
                                END
                            )
                    END
                ), 0) as total_worked_seconds,
                p.id as payroll_id, p.bonus, p.deductions, p.net_salary, p.status as payroll_status, p.notes
            FROM users u
            LEFT JOIN shifts s ON u.shift_id = s.id
            LEFT JOIN attendances a ON u.id = a.user_id AND TO_CHAR(a.date, 'YYYY-MM') = $1 AND a.status IN ('ontime', 'late')
            LEFT JOIN payrolls p ON u.id = p.user_id AND p.period_month = $1
            WHERE u.shift_id IS NOT NULL
            GROUP BY u.id, u.name, u.base_salary, s.name, s.start_time, s.end_time, s.is_flexible, p.id, p.bonus, p.deductions, p.net_salary, p.status, p.notes
            ORDER BY u.name ASC
        `;
        const result = await pool.query(query, [month]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const savePayroll = async (req, res) => {
    const { user_id, period_month, base_salary, bonus, deductions, net_salary, status, notes } = req.body;
    try {
        const checkQuery = await pool.query('SELECT id FROM payrolls WHERE user_id = $1 AND period_month = $2', [user_id, period_month]);
        if (checkQuery.rows.length > 0) {
            await pool.query(
                'UPDATE payrolls SET base_salary=$1, bonus=$2, deductions=$3, net_salary=$4, status=$5, notes=$6, created_at=NOW() WHERE id=$7',
                [base_salary, bonus, deductions, net_salary, status, notes, checkQuery.rows[0].id]
            );
        } else {
            await pool.query(
                'INSERT INTO payrolls (user_id, period_month, base_salary, bonus, deductions, net_salary, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                [user_id, period_month, base_salary, bonus, deductions, net_salary, status, notes]
            );
        }
        res.json({ message: 'Data slip gaji berhasil disimpan dan diperbarui!' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- AUTO-CUTOFF: Gaji dihitung berdasarkan durasi shift, bukan terus berjalan ---
// Shift flexible: tidak ada cap durasi, dihitung dari waktu kerja aktual.
const getMyStats = async (req, res) => {
    try {
        const { user_id } = req.params;
        const month = formatLocalDate(new Date()).slice(0, 7); 

        const shiftQuery = await pool.query('SELECT s.name, s.start_time, s.end_time, s.is_flexible, u.base_salary FROM users u LEFT JOIN shifts s ON u.shift_id = s.id WHERE u.id = $1', [user_id]);
        
        const shift = shiftQuery.rows[0] || null;
        const isFlexible = shift && shift.is_flexible;

        // Hitung durasi shift dalam detik (untuk cap per hari). Tidak dipakai jika flexible.
        let shiftDurationSeconds = 28800; // default 8 jam
        if (!isFlexible && shift && shift.start_time && shift.end_time) {
            const today = formatLocalDate(new Date());
            let sStart = new Date(`${today}T${shift.start_time}`);
            let sEnd = new Date(`${today}T${shift.end_time}`);
            if (sEnd <= sStart) sEnd.setDate(sEnd.getDate() + 1);
            shiftDurationSeconds = Math.floor((sEnd - sStart) / 1000);
        }

        // Untuk shift flexible: total_worked_seconds dihitung tanpa cap (LEAST dilewati).
        // Untuk shift tetap: tetap di-cap oleh durasi shift seperti semula.
        const absentQuery = await pool.query(
            `SELECT COUNT(id) as total_hadir, 
             COALESCE(SUM(
                CASE WHEN $4::boolean THEN
                    EXTRACT(EPOCH FROM (COALESCE(clock_out, CURRENT_TIMESTAMP) - clock_in))
                ELSE
                    LEAST(
                        EXTRACT(EPOCH FROM (COALESCE(clock_out, CURRENT_TIMESTAMP) - clock_in)),
                        $3
                    )
                END
             ), 0) as total_worked_seconds
             FROM attendances WHERE user_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2 AND status IN ('ontime', 'late')`, 
            [user_id, month, shiftDurationSeconds, !!isFlexible]
        );
        
        const historyQuery = await pool.query("SELECT * FROM attendances WHERE user_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2 ORDER BY date DESC, clock_in DESC", [user_id, month]);
        const payrollQuery = await pool.query('SELECT * FROM payrolls WHERE user_id = $1 ORDER BY period_month DESC', [user_id]);

        res.json({
            shift: shiftQuery.rows[0] || null,
            attendance: absentQuery.rows[0],
            attendance_history: historyQuery.rows,
            payrolls: payrollQuery.rows 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAllAttendanceHistory = async (req, res) => {
    const { month } = req.query;
    try {
        let query = `
            SELECT a.*, u.name as user_name, s.name as shift_name, s.is_flexible
            FROM attendances a 
            JOIN users u ON a.user_id = u.id 
            LEFT JOIN shifts s ON u.shift_id = s.id
        `;
        const params = [];
        if (month) {
            query += ` WHERE TO_CHAR(a.date, 'YYYY-MM') = $1 `;
            params.push(month);
        }
        query += ` ORDER BY a.date DESC, a.clock_in DESC`;
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { 
    getShifts, createShift, updateShift, deleteShift, 
    clockIn, clockOut, checkTodayAttendance, 
    getEmployees, updateEmployeeHr, 
    getPayrollReport, savePayroll, 
    submitLeave, getMyStats, getAllAttendanceHistory,
    deleteAttendance          // ← tambahkan ini
};