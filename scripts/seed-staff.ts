import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'hospital_clinic_queue_management',
  waitForConnections: true,
});

const STAFF = [
  // ── Admins ──────────────────────────────────────────────────────────────────
  {
    full_name: 'Nkosi Mahlangu',
    email: 'admin@ucheck.co.za',
    password: 'Admin@123',
    phone: '0110001001',
    id_number: '8005155001081',
    dob: '1980-05-15',
    gender: 'Male',
    role: 'Admin',
  },
  {
    full_name: 'Thandi Molefe',
    email: 'thandi.admin@ucheck.co.za',
    password: 'Admin@123',
    phone: '0110001002',
    id_number: '8503124001083',
    dob: '1985-03-12',
    gender: 'Female',
    role: 'Admin',
  },
  // ── Receptionists (per province) ───────────────────────────────────────────
  {
    full_name: 'Liezel van Schalkwyk',
    email: 'receptionist.wc@ucheck.co.za',
    password: 'Staff@123',
    phone: '0210001001',
    id_number: '9002164001082',
    dob: '1990-02-16',
    gender: 'Female',
    role: 'Receptionist',
  },
  {
    full_name: 'Bongani Khumalo',
    email: 'receptionist.gp@ucheck.co.za',
    password: 'Staff@123',
    phone: '0110001003',
    id_number: '8807255009084',
    dob: '1988-07-25',
    gender: 'Male',
    role: 'Receptionist',
  },
  {
    full_name: 'Preethi Govender',
    email: 'receptionist.kzn@ucheck.co.za',
    password: 'Staff@123',
    phone: '0310001001',
    id_number: '9105034001089',
    dob: '1991-05-03',
    gender: 'Female',
    role: 'Receptionist',
  },
  {
    full_name: 'Andile Mthembu',
    email: 'receptionist.ec@ucheck.co.za',
    password: 'Staff@123',
    phone: '0430001001',
    id_number: '8612085009086',
    dob: '1986-12-08',
    gender: 'Male',
    role: 'Receptionist',
  },
  {
    full_name: 'Chantelle du Plessis',
    email: 'receptionist.fs@ucheck.co.za',
    password: 'Staff@123',
    phone: '0510001001',
    id_number: '9301194001087',
    dob: '1993-01-19',
    gender: 'Female',
    role: 'Receptionist',
  },
  {
    full_name: 'Tebogo Sekhoto',
    email: 'receptionist.lp@ucheck.co.za',
    password: 'Staff@123',
    phone: '0150001001',
    id_number: '8904095009083',
    dob: '1989-04-09',
    gender: 'Male',
    role: 'Receptionist',
  },
  {
    full_name: 'Zanele Shabangu',
    email: 'receptionist.mp@ucheck.co.za',
    password: 'Staff@123',
    phone: '0130001001',
    id_number: '9208074001085',
    dob: '1992-08-07',
    gender: 'Female',
    role: 'Receptionist',
  },
  {
    full_name: 'Pieter van der Walt',
    email: 'receptionist.nc@ucheck.co.za',
    password: 'Staff@123',
    phone: '0530001001',
    id_number: '7711185001082',
    dob: '1977-11-18',
    gender: 'Male',
    role: 'Receptionist',
  },
  {
    full_name: 'Mmapula Dithebe',
    email: 'receptionist.nw@ucheck.co.za',
    password: 'Staff@123',
    phone: '0140001001',
    id_number: '9406274001084',
    dob: '1994-06-27',
    gender: 'Female',
    role: 'Receptionist',
  },
];

async function run() {
  const conn = await pool.getConnection();
  console.log('Connected. Seeding staff accounts...\n');

  try {
    await conn.beginTransaction();

    for (const s of STAFF) {
      const hash = await bcrypt.hash(s.password, 10);

      // Check if email already exists
      const [existing] = await conn.execute<mysql.RowDataPacket[]>(
        'SELECT user_id FROM users WHERE email = ?', [s.email]
      );
      if ((existing as mysql.RowDataPacket[]).length > 0) {
        console.log(`  SKIP (exists): ${s.full_name} <${s.email}>`);
        continue;
      }

      const [uResult] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO users (email, password_hash, full_name, phone, id_number, date_of_birth, gender, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [s.email, hash, s.full_name, s.phone, s.id_number, s.dob, s.gender]
      );
      const uid = uResult.insertId;

      const [roleRow] = await conn.execute<mysql.RowDataPacket[]>(
        'SELECT role_id FROM roles WHERE role_name = ?', [s.role]
      );
      const roleId = (roleRow as mysql.RowDataPacket[])[0]?.role_id;
      if (!roleId) throw new Error(`Role not found: ${s.role}`);

      await conn.execute(
        'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [uid, roleId]
      );

      console.log(`  ✓ ${s.role.padEnd(12)} ${s.full_name.padEnd(28)} <${s.email}>  password: ${s.password}`);
    }

    await conn.commit();

    console.log('\n── Login credentials ──────────────────────────────────');
    console.log('Admin:        admin@ucheck.co.za         Admin@123');
    console.log('Admin:        thandi.admin@ucheck.co.za  Admin@123');
    console.log('Receptionist: receptionist.wc@ucheck.co.za  Staff@123');
    console.log('Receptionist: receptionist.gp@ucheck.co.za  Staff@123');
    console.log('  (+ 7 more receptionists, all password: Staff@123)');
    console.log('Doctor:       sarah.vandermerwe@ucheck.co.za  Doctor@123');
    console.log('  (+ 17 more doctors, all password: Doctor@123)');
    console.log('───────────────────────────────────────────────────────');
  } catch (err) {
    await conn.rollback();
    console.error('Failed, rolled back:', err);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
