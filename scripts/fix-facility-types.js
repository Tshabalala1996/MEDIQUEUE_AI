const mysql = require('mysql2/promise');
const fs = require('fs');
fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const[k,...v]=l.split('=');if(k&&v.length)process.env[k.trim()]=v.join('=').trim();});

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });

  // Normalise all government/public hospital types to 'Public'
  const [pub] = await c.execute(
    `UPDATE hospitals SET facility_type = 'Public'
     WHERE facility_type IN ('Public Hospital','District Hospital','Regional Hospital',
                             'Tertiary Hospital','Central Hospital','Community Health Centre','')
        OR facility_type IS NULL`
  );
  console.log('Normalised to Public:', pub.affectedRows, 'rows');

  // Any remaining non-Public records → Private
  const [priv] = await c.execute(
    `UPDATE hospitals SET facility_type = 'Private'
     WHERE facility_type NOT IN ('Public','Private')`
  );
  console.log('Normalised to Private:', priv.affectedRows, 'rows');

  // Insert my new seed hospitals if they don't exist yet (use different names if duplicates)
  const hospitals = [
    ['Netcare Milpark Hospital','Private','Gauteng','Johannesburg','9 Guild Road, Parktown West'],
    ['Mediclinic Morningside','Private','Gauteng','Sandton','Rivonia Road, Morningside'],
    ['Netcare Sunninghill Hospital','Private','Gauteng','Sandton','16 Witkoppen Road, Sunninghill'],
    ['Life Wilgers Hospital','Private','Gauteng','Pretoria','60 Wilhelm Leuschner Street'],
    ['Netcare Christiaan Barnard Memorial','Private','Western Cape','Cape Town','181 Longmarket Street'],
    ['Life Vincent Pallotti Hospital','Private','Western Cape','Cape Town','Alexandra Road, Pinelands'],
    ['Netcare St Augustines Hospital','Private','KwaZulu-Natal','Durban','107 Chelmsford Road, Glenwood'],
    ['Life Entabeni Hospital','Private','KwaZulu-Natal','Durban','148 Mazisi Kunene Road, Berea'],
    ['Mediclinic Beacon Bay','Private','Eastern Cape','East London','1 Bonza Bay Road, Beacon Bay'],
    ['Life Tzaneen Private Hospital','Private','Limpopo','Tzaneen','Agatha Street, Tzaneen'],
    ['Mediclinic Nelspruit','Private','Mpumalanga','Nelspruit','Louis Trichardt Street'],
    ['Life Anncron Hospital','Private','North West','Klerksdorp','72 Annan Road, Klerksdorp'],
    ['Mediclinic Bloemfontein','Private','Free State','Bloemfontein','12 Pasteur Road, Universitas'],
    ['Life Gariep Private Hospital','Private','Northern Cape','Kimberley','Hulley Road, Royldene'],
  ];

  let inserted = 0;
  for (const [name, type, province, city, address] of hospitals) {
    const [existing] = await c.execute('SELECT hospital_id FROM hospitals WHERE name = ?', [name]);
    if (existing.length === 0) {
      await c.execute(
        'INSERT INTO hospitals (name, facility_type, province, city, address_line1, is_active) VALUES (?,?,?,?,?,1)',
        [name, type, province, city, address]
      );
      inserted++;
    } else {
      await c.execute('UPDATE hospitals SET facility_type = ? WHERE name = ?', [type, name]);
    }
  }
  console.log('Private hospitals inserted/updated:', inserted);

  // Final count
  const [counts] = await c.execute('SELECT facility_type, COUNT(*) n FROM hospitals GROUP BY facility_type');
  console.log('Final counts:', counts);
  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
