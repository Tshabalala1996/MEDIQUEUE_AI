const mysql = require('mysql2/promise');
const fs = require('fs');
fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const[k,...v]=l.split('=');if(k&&v.length)process.env[k.trim()]=v.join('=').trim();});

async function main() {
  const c = await mysql.createConnection({
    host:process.env.DB_HOST, user:process.env.DB_USER,
    password:process.env.DB_PASSWORD, database:process.env.DB_NAME
  });

  // Restore all empty facility_type to 'Public Hospital' (default recovery)
  const [fix] = await c.execute(
    "UPDATE hospitals SET facility_type = 'Public Hospital' WHERE facility_type = '' OR facility_type IS NULL"
  );
  console.log('Restored empty records to Public Hospital:', fix.affectedRows);

  // Insert private hospitals (use ON DUPLICATE KEY UPDATE to avoid IGNORE suppressing errors)
  const privateHospitals = [
    ['Netcare Milpark Hospital','Gauteng','Johannesburg','9 Guild Road, Parktown West, Johannesburg'],
    ['Mediclinic Morningside','Gauteng','Sandton','Rivonia Road, Morningside Manor, Sandton'],
    ['Netcare Sunninghill Hospital','Gauteng','Sandton','16 Witkoppen Road, Sunninghill, Sandton'],
    ['Life Wilgers Hospital','Gauteng','Pretoria','60 Wilhelm Leuschner Street, The Willows, Pretoria'],
    ['Netcare Christiaan Barnard Memorial Hospital','Western Cape','Cape Town','181 Longmarket Street, Cape Town'],
    ['Life Vincent Pallotti Hospital','Western Cape','Cape Town','Alexandra Road, Pinelands, Cape Town'],
    ['Netcare St Augustines Hospital','KwaZulu-Natal','Durban','107 Chelmsford Road, Glenwood, Durban'],
    ['Life Entabeni Hospital','KwaZulu-Natal','Durban','148 Mazisi Kunene Road, Berea, Durban'],
    ['Mediclinic Beacon Bay','Eastern Cape','East London','1 Bonza Bay Road, Beacon Bay, East London'],
    ['Life Tzaneen Private Hospital','Limpopo','Tzaneen','Agatha Street, Tzaneen'],
    ['Mediclinic Nelspruit','Mpumalanga','Nelspruit','Louis Trichardt Street, Nelspruit'],
    ['Life Anncron Hospital','North West','Klerksdorp','72 Annan Road, Klerksdorp'],
    ['Mediclinic Bloemfontein','Free State','Bloemfontein','12 Pasteur Road, Universitas, Bloemfontein'],
    ['Life Gariep Private Hospital','Northern Cape','Kimberley','Hulley Road, Royldene, Kimberley'],
  ];

  let added = 0;
  for (const [name, province, city, address] of privateHospitals) {
    const [existing] = await c.execute('SELECT hospital_id FROM hospitals WHERE name = ?', [name]);
    if (existing.length === 0) {
      await c.execute(
        "INSERT INTO hospitals (name, facility_type, province, city, address_line1, is_active) VALUES (?, 'Private Hospital', ?, ?, ?, 1)",
        [name, province, city, address]
      );
      added++;
    } else {
      await c.execute("UPDATE hospitals SET facility_type = 'Private Hospital' WHERE name = ?", [name]);
    }
  }
  console.log('Private hospitals added/updated:', added);

  // Final counts
  const [counts] = await c.execute("SELECT facility_type, COUNT(*) n FROM hospitals GROUP BY facility_type");
  console.log('\nFinal distribution:');
  counts.forEach(r => console.log(' ', r.facility_type, '→', r.n, 'hospitals'));
  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
