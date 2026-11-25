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

let PASSWORD_HASH: string;

// ─── Hospitals ─────────────────────────────────────────────────────────────────
const HOSPITALS = [
  { name: 'Groote Schuur Hospital',                       type: 'Public Hospital',    city: 'Cape Town',      province: 'Western Cape',   phone: '0214044111', postal: '7925', addr: 'Main Road, Observatory' },
  { name: 'Charlotte Maxeke Johannesburg Academic Hospital', type: 'Tertiary Hospital',  city: 'Johannesburg',   province: 'Gauteng',        phone: '0117885000', postal: '2193', addr: '7 York Road, Parktown' },
  { name: 'Inkosi Albert Luthuli Central Hospital',       type: 'Central Hospital',   city: 'Durban',         province: 'KwaZulu-Natal',  phone: '0313604000', postal: '4091', addr: '800 Bellaire Drive, Cato Manor' },
  { name: 'Frere Tertiary Hospital',                      type: 'Regional Hospital',  city: 'East London',    province: 'Eastern Cape',   phone: '0437092000', postal: '5200', addr: 'Amalinda Main Road' },
  { name: 'Pelonomi Regional Hospital',                   type: 'Regional Hospital',  city: 'Bloemfontein',   province: 'Free State',     phone: '0514085911', postal: '9301', addr: 'Seloue Street, Heidedal' },
  { name: 'Polokwane Provincial Hospital',                type: 'District Hospital',  city: 'Polokwane',      province: 'Limpopo',        phone: '0152873000', postal: '0700', addr: 'Hospital Street' },
  { name: 'Rob Ferreira Hospital',                        type: 'Regional Hospital',  city: 'Mbombela',       province: 'Mpumalanga',     phone: '0137412000', postal: '1200', addr: 'General Dan Pienaar Drive' },
  { name: 'Kimberley Hospital Complex',                   type: 'Regional Hospital',  city: 'Kimberley',      province: 'Northern Cape',  phone: '0538028111', postal: '8300', addr: 'Du Toitspan Road' },
  { name: 'Mahikeng Provincial Hospital',                 type: 'Public Hospital',    city: 'Mahikeng',       province: 'North West',     phone: '0184848900', postal: '2745', addr: 'Sekame Road' },
];

// ─── Clinics ───────────────────────────────────────────────────────────────────
const CLINICS = [
  { name: 'Cape Medical & Specialist Centre',    type: 'Specialist Clinic',          city: 'Cape Town',      province: 'Western Cape',   phone: '0214483500', postal: '8001', addr: '21 Heerengracht Street, Foreshore' },
  { name: 'Sandton City Medical Centre',         type: 'General Practice',           city: 'Sandton',        province: 'Gauteng',        phone: '0118836900', postal: '2196', addr: 'Cnr Rivonia & Sandton Drive' },
  { name: 'Umhlanga Medical Centre',             type: 'Specialist Clinic',          city: 'Umhlanga',       province: 'KwaZulu-Natal',  phone: '0315604000', postal: '4319', addr: '323 Umhlanga Rocks Drive' },
  { name: 'Bay Specialist Clinic',               type: 'Specialist Clinic',          city: 'East London',    province: 'Eastern Cape',   phone: '0437265000', postal: '5201', addr: '8 Chamberlain Road' },
  { name: 'Medicross Bloemfontein',              type: 'Community Health Centre',    city: 'Bloemfontein',   province: 'Free State',     phone: '0514483700', postal: '9301', addr: '1 Dr Belcher Road' },
  { name: 'Mankweng Community Clinic',           type: 'Community Health Centre',    city: 'Polokwane',      province: 'Limpopo',        phone: '0152954000', postal: '0702', addr: 'Mankweng Township' },
  { name: 'Mpumalanga Wellness Centre',          type: 'Wellness Centre',            city: 'Mbombela',       province: 'Mpumalanga',     phone: '0137524000', postal: '1201', addr: '15 Ferreira Street' },
  { name: 'Sol Plaatje Medical Clinic',          type: 'General Practice',           city: 'Kimberley',      province: 'Northern Cape',  phone: '0538317000', postal: '8301', addr: '18 Chapel Street' },
  { name: 'Rustenburg Day Clinic',               type: 'Urgent Care Centre',         city: 'Rustenburg',     province: 'North West',     phone: '0142975000', postal: '0299', addr: '36 Boom Street' },
];

// ─── Doctors (2 per province) ──────────────────────────────────────────────────
const DOCTORS = [
  // Western Cape
  { full_name: 'Dr Sarah van der Merwe', email: 'sarah.vandermerwe@ucheck.co.za', id: '7503155001082', phone: '0821110001', gender: 'Female', dob: '1975-03-15', hpcsa: 'MP0011001', spec: 'Cardiology',      fee: 850, exp: 18, qual: 'MBChB (UCT), FC Cardiol (SA)', bio: 'Interventional cardiologist with 18 years at Groote Schuur.',  province: 'Western Cape' },
  { full_name: 'Dr James Mostert',       email: 'james.mostert@ucheck.co.za',     id: '8201205001088', phone: '0821110002', gender: 'Male',   dob: '1982-01-20', hpcsa: 'MP0011002', spec: 'General Practice', fee: 450, exp: 10, qual: 'MBChB (SU)',               bio: 'Family physician serving the greater Cape Town community.',     province: 'Western Cape' },
  // Gauteng
  { full_name: 'Dr Sipho Dlamini',       email: 'sipho.dlamini@ucheck.co.za',     id: '7808125009083', phone: '0821110003', gender: 'Male',   dob: '1978-08-12', hpcsa: 'MP0022001', spec: 'Paediatrics',     fee: 750, exp: 15, qual: 'MBChB (Wits), FC Paed (SA)', bio: 'Paediatrician at Charlotte Maxeke with special interest in neonatal care.', province: 'Gauteng' },
  { full_name: 'Dr Priya Naidoo',        email: 'priya.naidoo@ucheck.co.za',      id: '8504224009081', phone: '0821110004', gender: 'Female', dob: '1985-04-22', hpcsa: 'MP0022002', spec: 'Dermatology',     fee: 700, exp: 8,  qual: 'MBChB (Wits), FC Derm (SA)', bio: 'Dermatologist specialising in skin of colour and cosmetic dermatology.', province: 'Gauteng' },
  // KwaZulu-Natal
  { full_name: 'Dr Ayanda Zulu',         email: 'ayanda.zulu@ucheck.co.za',       id: '8003034009086', phone: '0821110005', gender: 'Female', dob: '1980-03-03', hpcsa: 'MP0033001', spec: 'Gynaecology',     fee: 800, exp: 13, qual: 'MBChB (UKZN), FCOG (SA)',    bio: 'Obstetrician and gynaecologist at Inkosi Albert Luthuli Central Hospital.', province: 'KwaZulu-Natal' },
  { full_name: 'Dr Ravi Pillay',         email: 'ravi.pillay@ucheck.co.za',       id: '7706175009087', phone: '0821110006', gender: 'Male',   dob: '1977-06-17', hpcsa: 'MP0033002', spec: 'Orthopaedics',    fee: 950, exp: 20, qual: 'MBChB (UKZN), FC Orth (SA)', bio: 'Orthopaedic surgeon specialising in joint replacement and sports injuries.', province: 'KwaZulu-Natal' },
  // Eastern Cape
  { full_name: 'Dr Nomsa Mbeki',         email: 'nomsa.mbeki@ucheck.co.za',       id: '8110064009089', phone: '0821110007', gender: 'Female', dob: '1981-10-06', hpcsa: 'MP0044001', spec: 'Psychiatry',      fee: 750, exp: 11, qual: 'MBChB (UFH), FC Psych (SA)', bio: 'Psychiatrist at Frere Hospital with focus on community mental health.', province: 'Eastern Cape' },
  { full_name: 'Dr Willem de Beer',      email: 'willem.debeer@ucheck.co.za',     id: '7404095001083', phone: '0821110008', gender: 'Male',   dob: '1974-04-09', hpcsa: 'MP0044002', spec: 'Surgery',         fee: 1100, exp: 22, qual: 'MBChB (UCT), FCS (SA)',    bio: 'Specialist surgeon with experience in laparoscopic and trauma surgery.', province: 'Eastern Cape' },
  // Free State
  { full_name: 'Dr Maria Swanepoel',     email: 'maria.swanepoel@ucheck.co.za',   id: '7902284009087', phone: '0821110009', gender: 'Female', dob: '1979-02-28', hpcsa: 'MP0055001', spec: 'Neurology',       fee: 900, exp: 14, qual: 'MBChB (UFS), FC Neurol (SA)', bio: 'Neurologist at Pelonomi Hospital specialising in epilepsy and stroke.', province: 'Free State' },
  { full_name: 'Dr Thabo Molefe',        email: 'thabo.molefe@ucheck.co.za',      id: '8309125009082', phone: '0821110010', gender: 'Male',   dob: '1983-09-12', hpcsa: 'MP0055002', spec: 'Gastroenterology', fee: 850, exp: 9,  qual: 'MBChB (UFS), FC Gastro (SA)', bio: 'Gastroenterologist with special interest in inflammatory bowel disease.', province: 'Free State' },
  // Limpopo
  { full_name: 'Dr Precious Sithole',   email: 'precious.sithole@ucheck.co.za',  id: '8607084009085', phone: '0821110011', gender: 'Female', dob: '1986-07-08', hpcsa: 'MP0066001', spec: 'General Practice', fee: 400, exp: 7,  qual: 'MBChB (Limpopo)',             bio: 'Passionate about primary health care in rural Limpopo communities.', province: 'Limpopo' },
  { full_name: 'Dr Emmanuel Mashaba',   email: 'emmanuel.mashaba@ucheck.co.za',  id: '7511255009081', phone: '0821110012', gender: 'Male',   dob: '1975-11-25', hpcsa: 'MP0066002', spec: 'Cardiology',      fee: 820, exp: 17, qual: 'MBChB (Limpopo), FC Cardiol (SA)', bio: 'Cardiologist serving the Limpopo province since 2008.', province: 'Limpopo' },
  // Mpumalanga
  { full_name: 'Dr Zanele Nkosi',       email: 'zanele.nkosi@ucheck.co.za',      id: '8812104009083', phone: '0821110013', gender: 'Female', dob: '1988-12-10', hpcsa: 'MP0077001', spec: 'Paediatrics',     fee: 720, exp: 6,  qual: 'MBChB (Wits), FC Paed (SA)', bio: 'Dedicated paediatrician supporting child health in Mpumalanga.', province: 'Mpumalanga' },
  { full_name: 'Dr Christiaan Botha',   email: 'christiaan.botha@ucheck.co.za',  id: '7609145001086', phone: '0821110014', gender: 'Male',   dob: '1976-09-14', hpcsa: 'MP0077002', spec: 'Radiology',       fee: 950, exp: 16, qual: 'MBChB (UP), FC Rad (SA)',    bio: 'Diagnostic radiologist at Rob Ferreira Hospital.', province: 'Mpumalanga' },
  // Northern Cape
  { full_name: 'Dr Fatima Domingo',     email: 'fatima.domingo@ucheck.co.za',    id: '8201264009088', phone: '0821110015', gender: 'Female', dob: '1982-01-26', hpcsa: 'MP0088001', spec: 'Ophthalmology',   fee: 780, exp: 11, qual: 'MBChB (UCT), FC Ophth (SA)', bio: 'Ophthalmologist covering Kimberley and surrounding areas.', province: 'Northern Cape' },
  { full_name: 'Dr Petrus van Wyk',     email: 'petrus.vanwyk@ucheck.co.za',     id: '7006035001089', phone: '0821110016', gender: 'Male',   dob: '1970-06-03', hpcsa: 'MP0088002', spec: 'ENT',             fee: 760, exp: 24, qual: 'MBChB (UP), FCS ENT (SA)',   bio: 'ENT specialist with the longest-serving practice in the Northern Cape.', province: 'Northern Cape' },
  // North West
  { full_name: 'Dr Lerato Mokoena',     email: 'lerato.mokoena@ucheck.co.za',    id: '9001014009087', phone: '0821110017', gender: 'Female', dob: '1990-01-01', hpcsa: 'MP0099001', spec: 'General Practice', fee: 420, exp: 4,  qual: 'MBChB (NWU)',                bio: 'Early-career GP committed to accessible healthcare in North West.', province: 'North West' },
  { full_name: 'Dr Johan Venter',       email: 'johan.venter@ucheck.co.za',      id: '7301255001084', phone: '0821110018', gender: 'Male',   dob: '1973-01-25', hpcsa: 'MP0099002', spec: 'Urology',         fee: 920, exp: 25, qual: 'MBChB (UP), FC Urol (SA)',   bio: 'Urologist with 25 years experience, based in Rustenburg.', province: 'North West' },
];

async function run() {
  PASSWORD_HASH = await bcrypt.hash('Doctor@123', 10);
  const conn = await pool.getConnection();
  console.log('Connected to database.');

  try {
    await conn.beginTransaction();

    // ── Insert hospitals ────────────────────────────────────────────────────────
    const hospitalIds: Record<string, number> = {};
    for (const h of HOSPITALS) {
      const [r] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO hospitals (name, facility_type, city, province, address_line1, postal_code, phone, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [h.name, h.type, h.city, h.province, h.addr, h.postal, h.phone]
      );
      hospitalIds[h.province] = r.insertId;
      console.log(`  Hospital: ${h.name} (id=${r.insertId})`);
    }

    // ── Insert clinics ──────────────────────────────────────────────────────────
    const clinicIds: Record<string, number> = {};
    const hours = JSON.stringify({ Mon: '08:00-17:00', Tue: '08:00-17:00', Wed: '08:00-17:00', Thu: '08:00-17:00', Fri: '08:00-16:00', Sat: '08:00-12:00' });
    for (const c of CLINICS) {
      const [r] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO clinics (name, clinic_type, city, province, address_line1, postal_code, phone, operating_hours, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [c.name, c.type, c.city, c.province, c.addr, c.postal, c.phone, hours]
      );
      clinicIds[c.province] = r.insertId;
      console.log(`  Clinic:   ${c.name} (id=${r.insertId})`);
    }

    // ── Get role id for Doctor ──────────────────────────────────────────────────
    const [roleRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT role_id FROM roles WHERE role_name = 'Doctor' LIMIT 1`
    );
    const doctorRoleId = roleRows[0].role_id as number;

    // ── Get specialization ids ──────────────────────────────────────────────────
    const [specRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT specialization_id, name FROM specializations`
    );
    const specMap: Record<string, number> = {};
    for (const s of specRows) specMap[s.name as string] = s.specialization_id as number;

    // ── Insert doctors ──────────────────────────────────────────────────────────
    const weekdays = JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    const doctorIds: number[] = [];

    for (const d of DOCTORS) {
      // 1. User
      const [uResult] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO users (email, password_hash, full_name, phone, id_number, date_of_birth, gender, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [d.email, PASSWORD_HASH, d.full_name, d.phone, d.id, d.dob, d.gender]
      );
      const uid = uResult.insertId;

      // 2. Role
      await conn.execute(
        `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [uid, doctorRoleId]
      );

      // 3. Doctor record
      const specId = specMap[d.spec];
      if (!specId) throw new Error(`Specialization not found: ${d.spec}`);
      const [dResult] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO doctors (user_id, specialization_id, hpcs_registration_number, years_of_experience,
          consultation_fee, qualification, bio, is_available)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [uid, specId, d.hpcsa, d.exp, d.fee, d.qual, d.bio]
      );
      const did = dResult.insertId;
      doctorIds.push(did);
      console.log(`  Doctor:   ${d.full_name} (did=${did}, spec=${d.spec}, province=${d.province})`);

      // 4. Hospital assignment
      const hid = hospitalIds[d.province];
      await conn.execute(
        `INSERT INTO doctor_hospital_assignments
           (doctor_id, hospital_id, is_primary, consultation_days, consultation_hours_start, consultation_hours_end, is_active)
         VALUES (?, ?, 1, ?, '08:00:00', '13:00:00', 1)`,
        [did, hid, weekdays]
      );

      // 5. Clinic assignment
      const cid = clinicIds[d.province];
      await conn.execute(
        `INSERT INTO doctor_clinic_assignments
           (doctor_id, clinic_id, is_primary, consultation_days, consultation_hours_start, consultation_hours_end, is_active)
         VALUES (?, ?, 1, ?, '14:00:00', '17:00:00', 1)`,
        [did, cid, weekdays]
      );

      // 6. Time slots — next 14 days (Mon–Fri only)
      for (let offset = 1; offset <= 14; offset++) {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends
        const dateStr = date.toISOString().slice(0, 10);

        // Hospital: 08:00–13:00, 1-hour slots
        const hospitalSlots = [
          { start: '08:00:00', end: '09:00:00' },
          { start: '09:00:00', end: '10:00:00' },
          { start: '10:00:00', end: '11:00:00' },
          { start: '11:00:00', end: '12:00:00' },
          { start: '12:00:00', end: '13:00:00' },
        ];
        for (const slot of hospitalSlots) {
          await conn.execute(
            `INSERT IGNORE INTO hospital_time_slots (hospital_id, doctor_id, slot_date, start_time, end_time, max_patients, is_available)
             VALUES (?, ?, ?, ?, ?, 5, 1)`,
            [hid, did, dateStr, slot.start, slot.end]
          );
        }

        // Clinic: 14:00–17:00, 1-hour slots
        const clinicSlots = [
          { start: '14:00:00', end: '15:00:00' },
          { start: '15:00:00', end: '16:00:00' },
          { start: '16:00:00', end: '17:00:00' },
        ];
        for (const slot of clinicSlots) {
          await conn.execute(
            `INSERT IGNORE INTO clinic_time_slots (clinic_id, doctor_id, slot_date, start_time, end_time, max_patients, is_available)
             VALUES (?, ?, ?, ?, ?, 5, 1)`,
            [cid, did, dateStr, slot.start, slot.end]
          );
        }
      }
    }

    await conn.commit();
    console.log('\n✓ Seeded successfully:');
    console.log(`  ${HOSPITALS.length} hospitals`);
    console.log(`  ${CLINICS.length} clinics`);
    console.log(`  ${DOCTORS.length} doctors (password: Doctor@123)`);
    console.log('  Time slots: next 14 weekdays per doctor (hospital 08:00–13:00, clinic 14:00–17:00)');
  } catch (err) {
    await conn.rollback();
    console.error('Seed failed, rolled back:', err);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
