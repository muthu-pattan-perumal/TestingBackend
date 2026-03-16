const express = require('express');
const cors = require('cors');
const { pool, initDb } = require('./db');
const { runApiTest, runUiTest } = require('./runner');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/screenshots', express.static('screenshots'));

const PORT = process.env.PORT || 5000;

// Initialize DB
initDb().catch(console.error);

// Auth Routes
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    const user = result.rows[0];
    if (user) {
        res.json({ id: user.id, username: user.username, role: user.role });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Project Routes
app.get('/api/projects', async (req, res) => {
    const result = await pool.query('SELECT * FROM projects');
    res.json(result.rows);
});

app.post('/api/projects', async (req, res) => {
    const { name, websiteUrl, apiBaseUrl, description } = req.body;
    const result = await pool.query(
        'INSERT INTO projects (name, "websiteUrl", "apiBaseUrl", description) VALUES ($1, $2, $3, $4) RETURNING id',
        [name, websiteUrl, apiBaseUrl, description]
    );
    res.json({ id: result.rows[0].id });
});

// Test Case Routes
app.get('/api/projects/:id/tests', async (req, res) => {
    const result = await pool.query(`
        SELECT tc.*, 
               (SELECT status FROM test_results WHERE "testCaseId" = tc.id ORDER BY "createdAt" DESC LIMIT 1) as "lastStatus"
        FROM test_cases tc 
        WHERE tc."projectId" = $1
    `, [req.params.id]);
    res.json(result.rows);
});

app.post('/api/tests', async (req, res) => {
    const { projectId, type, name } = req.body;
    const result = await pool.query(
        'INSERT INTO test_cases ("projectId", type, name) VALUES ($1, $2, $3) RETURNING id',
        [projectId, type, name]
    );
    res.json({ id: result.rows[0].id });
});

app.get('/api/tests/:id/steps', async (req, res) => {
    const result = await pool.query('SELECT * FROM test_steps WHERE "testCaseId" = $1 ORDER BY "stepOrder" ASC', [req.params.id]);
    res.json(result.rows);
});

app.get('/api/tests/:id', async (req, res) => {
    const result = await pool.query(`
        SELECT tc.*, p."apiBaseUrl", p."websiteUrl"
        FROM test_cases tc
        JOIN projects p ON tc."projectId" = p.id
        WHERE tc.id = $1
    `, [req.params.id]);
    res.json(result.rows[0]);
});

app.patch('/api/tests/:id/status', async (req, res) => {
    const { status } = req.body;
    await pool.query('UPDATE test_cases SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true });
});

app.post('/api/tests/:id/steps', async (req, res) => {
    const { steps } = req.body; // Array of steps
    await pool.query('DELETE FROM test_steps WHERE "testCaseId" = $1', [req.params.id]);
    
    for (let i = 0; i < steps.length; i++) {
        await pool.query(
            'INSERT INTO test_steps ("testCaseId", "stepOrder", type, payload) VALUES ($1, $2, $3, $4)',
            [req.params.id, i + 1, steps[i].type, JSON.stringify(steps[i].payload)]
        );
    }
    res.json({ success: true });
});

// Execution Routes
app.post('/api/tests/:id/run', async (req, res) => {
    const result = await pool.query('SELECT * FROM test_cases WHERE id = $1', [req.params.id]);
    const test = result.rows[0];
    if (!test) return res.status(404).json({ error: 'Test not found' });

    let runResult;
    if (test.type === 'API') {
        runResult = await runApiTest(test.id);
    } else {
        runResult = await runUiTest(test.id);
    }
    res.json(runResult);
});

app.get('/api/tests/:id/results', async (req, res) => {
    const result = await pool.query('SELECT * FROM test_results WHERE "testCaseId" = $1 ORDER BY "createdAt" DESC', [req.params.id]);
    res.json(result.rows);
});

app.get('/api/results', async (req, res) => {
    const result = await pool.query(`
        SELECT tr.*, tc.name as "testName", p.name as "projectName"
        FROM test_results tr
        JOIN test_cases tc ON tr."testCaseId" = tc.id
        JOIN projects p ON tc."projectId" = p.id
        ORDER BY tr."createdAt" DESC
        LIMIT 100
    `);
    res.json(result.rows);
});

// Stats Route
app.get('/api/stats', async (req, res) => {
    const projectsCount = await pool.query('SELECT COUNT(*) as count FROM projects');
    const testsCount = await pool.query('SELECT COUNT(*) as count FROM test_cases');
    const passedRes = await pool.query("SELECT COUNT(*) as count FROM test_results WHERE status = 'Passed'");
    const failedRes = await pool.query("SELECT COUNT(*) as count FROM test_results WHERE status = 'Failed'");
    const lastRunRes = await pool.query('SELECT "createdAt" FROM test_results ORDER BY "createdAt" DESC LIMIT 1');
    
    const totalProjects = parseInt(projectsCount.rows[0].count);
    const totalTests = parseInt(testsCount.rows[0].count);
    const passedTests = parseInt(passedRes.rows[0].count);
    const failedTests = parseInt(failedRes.rows[0].count);

    res.json({
        totalProjects,
        totalTests,
        passedTests,
        failedTests,
        lastRun: lastRunRes.rows[0] ? lastRunRes.rows[0].createdAt : 'Never',
        apiSuccessRate: totalTests > 0 ? Math.round((passedTests / (passedTests + failedTests || 1)) * 100) : 0
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
