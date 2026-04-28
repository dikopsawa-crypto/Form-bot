const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forms (
      id SERIAL PRIMARY KEY,
      form_id VARCHAR(50) UNIQUE NOT NULL,
      bank VARCHAR(20) NOT NULL,
      columns TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      form_id VARCHAR(50) NOT NULL,
      data JSONB NOT NULL,
      submitted_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function saveForm(formId, bank, columns) {
  await pool.query(
    `INSERT INTO forms (form_id, bank, columns)
     VALUES ($1, $2, $3)
     ON CONFLICT (form_id) DO NOTHING`,
    [formId, bank, JSON.stringify(columns)]
  );
}

async function getForm(formId) {
  const result = await pool.query(
    `SELECT * FROM forms WHERE form_id = $1`,
    [formId]
  );
  return result.rows[0];
}

async function saveSubmission(formId, data) {
  await pool.query(
    `INSERT INTO submissions (form_id, data) VALUES ($1, $2)`,
    [formId, JSON.stringify(data)]
  );
}

async function getSubmissions(formId) {
  const result = await pool.query(
    `SELECT * FROM submissions WHERE form_id = $1 ORDER BY submitted_at DESC`,
    [formId]
  );
  return result.rows;
}

module.exports = { initDB, saveForm, getForm, saveSubmission, getSubmissions };
