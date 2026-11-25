const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Parse .env.local manually (no dotenv dependency needed)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  });
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  const sql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  console.log('Running seed...');
  await conn.query(sql);
  console.log('Seed complete.');
  await conn.end();
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
