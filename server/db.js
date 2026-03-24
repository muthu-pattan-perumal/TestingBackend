const { Pool } = require('pg');
require('dotenv').config();

let poolInstance;

const getPool = () => {
  if (!poolInstance) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    poolInstance = new Pool({
      connectionString: process.env.DATABASE_URL.split('?')[0],
      ssl: {
        rejectUnauthorized: false
      }
    });
  }
  return poolInstance;
};

const initDb = async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT,
                role TEXT
            );

            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                name TEXT,
                "websiteUrl" TEXT,
                "apiBaseUrl" TEXT,
                description TEXT
            );

            CREATE TABLE IF NOT EXISTS test_cases (
                id SERIAL PRIMARY KEY,
                "projectId" INTEGER,
                type TEXT, -- 'UI' or 'API'
                name TEXT,
                status TEXT DEFAULT 'Draft',
                FOREIGN KEY ("projectId") REFERENCES projects(id)
            );

            CREATE TABLE IF NOT EXISTS test_steps (
                id SERIAL PRIMARY KEY,
                "testCaseId" INTEGER,
                "stepOrder" INTEGER,
                type TEXT,
                payload TEXT, -- JSON string
                FOREIGN KEY ("testCaseId") REFERENCES test_cases(id)
            );

            CREATE TABLE IF NOT EXISTS test_results (
                id SERIAL PRIMARY KEY,
                "testCaseId" INTEGER,
                status TEXT, -- 'Passed', 'Failed'
                "responseData" TEXT,
                log TEXT,
                "screenshotPath" TEXT,
                "executionTime" INTEGER,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("testCaseId") REFERENCES test_cases(id)
            );
        `);

        // Seed default users if not exists
        const res = await client.query('SELECT * FROM users WHERE username = $1', ['admin']);
        if (res.rows.length === 0) {
            await client.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', ['admin', 'admin123', 'Admin']);
            await client.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', ['tester', 'tester123', 'Tester']);
            console.log('Default users seeded.');
        }
    } finally {
        client.release();
    }
};

const pool = {
    query: (...args) => getPool().query(...args),
    connect: () => getPool().connect()
};

module.exports = { getPool, initDb, pool };
