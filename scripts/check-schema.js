const mysql = require('mysql2/promise');
const fs = require('fs');
fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const[k,...v]=l.split('=');if(k&&v.length)process.env[k.trim()]=v.join('=').trim();});

mysql.createConnection({
  host:process.env.DB_HOST, user:process.env.DB_USER,
  password:process.env.DB_PASSWORD, database:process.env.DB_NAME
}).then(async c=>{
  const [cols] = await c.execute("SHOW COLUMNS FROM hospitals");
  cols.forEach(col => console.log(col.Field, '|', col.Type, '| default:', col.Default));
  await c.end();
}).catch(e=>console.error(e.message));
