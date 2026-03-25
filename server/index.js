const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios'); // For proxying
const { getPool, initDb } = require('./db');
const { runApiTest, runUiTest, getExecutionStatus, activeExecutions } = require('./runner');
require('dotenv').config();

const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
    optionsSuccessStatus: 200   // Some legacy browsers choke on 204
};
app.use(cors(corsOptions));
// Handle preflight requests for ALL routes explicitly
app.options('/{*any}', cors(corsOptions)); // Express 5 wildcard syntax

// Safety-net: stamp CORS headers on EVERY response (catches cases where
// Render's proxy or an unhandled error bypasses the cors() middleware)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, Accept, X-Requested-With');
    next();
});

app.use(express.json());
app.use('/screenshots', express.static('screenshots'));

// ── Health check (keeps Render from returning 520 on sleep wake-up) ──────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

const PORT = process.env.PORT || 5000;

// Initialize DB
initDb().catch(console.error);

// Auth Routes
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const result = await getPool().query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    const user = result.rows[0];
    if (user) {
        res.json({ id: user.id, username: user.username, role: user.role });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Project Routes
app.get('/api/projects', async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM projects');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects', details: error.message });
    }
});

app.post('/api/projects', async (req, res) => {
    try {
        const { name, websiteUrl, apiBaseUrl, description } = req.body;
        const result = await getPool().query(
            'INSERT INTO projects (name, "websiteUrl", "apiBaseUrl", description) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, websiteUrl, apiBaseUrl, description]
        );
        res.json({ id: result.rows[0].id });
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: 'Failed to create project', details: error.message });
    }
});

// Test Case Routes
app.get('/api/projects/:id/tests', async (req, res) => {
    const result = await getPool().query(`
        SELECT tc.*, 
               (SELECT status FROM test_results WHERE "testCaseId" = tc.id ORDER BY "createdAt" DESC LIMIT 1) as "lastStatus"
        FROM test_cases tc 
        WHERE tc."projectId" = $1
    `, [req.params.id]);
    res.json(result.rows);
});

app.post('/api/tests', async (req, res) => {
    const { projectId, type, name } = req.body;
    const result = await getPool().query(
        'INSERT INTO test_cases ("projectId", type, name) VALUES ($1, $2, $3) RETURNING id',
        [projectId, type, name]
    );
    res.json({ id: result.rows[0].id });
});

app.get('/api/tests/:id/steps', async (req, res) => {
    const result = await getPool().query('SELECT * FROM test_steps WHERE "testCaseId" = $1 ORDER BY "stepOrder" ASC', [req.params.id]);
    res.json(result.rows);
});

app.get('/api/tests/:id', async (req, res) => {
    const result = await getPool().query(`
        SELECT tc.*, p."apiBaseUrl", p."websiteUrl"
        FROM test_cases tc
        JOIN projects p ON tc."projectId" = p.id
        WHERE tc.id = $1
    `, [req.params.id]);
    res.json(result.rows[0]);
});

app.patch('/api/tests/:id/status', async (req, res) => {
    const { status } = req.body;
    await getPool().query('UPDATE test_cases SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true });
});

app.post('/api/tests/:id/steps', async (req, res) => {
    const { steps } = req.body; // Array of steps
    await getPool().query('DELETE FROM test_steps WHERE "testCaseId" = $1', [req.params.id]);
    
    for (let i = 0; i < steps.length; i++) {
        await getPool().query(
            'INSERT INTO test_steps ("testCaseId", "stepOrder", type, payload) VALUES ($1, $2, $3, $4)',
            [req.params.id, i + 1, steps[i].type, JSON.stringify(steps[i].payload)]
        );
    }
    res.json({ success: true });
});

// Execution Routes
app.post('/api/tests/:id/run', async (req, res) => {
    try {
        const result = await getPool().query('SELECT * FROM test_cases WHERE id = $1', [req.params.id]);
        const test = result.rows[0];
        if (!test) return res.status(404).json({ error: 'Test not found' });

        const stepsRes = await getPool().query('SELECT type FROM test_steps WHERE "testCaseId" = $1', [req.params.id]);
        const uiStepTypes = ['OPEN_URL', 'CLICK', 'INPUT', 'WAIT_FOR', 'INTERCEPT_API', 'SCREENSHOT'];
        const hasUiSteps = stepsRes.rows.some(s => uiStepTypes.includes(s.type));

        let runResult;
        if (test.type === 'UI' || hasUiSteps) {
            runUiTest(test.id).catch(e => console.error('BG Run UI Error:', e));
        } else {
            runApiTest(test.id).catch(e => console.error('BG Run API Error:', e));
        }
        res.json({ message: 'Execution started' });
    } catch (error) {
        console.error('Execution Error:', error);
        res.status(500).json({ error: 'Internal Server Error during execution', details: error.message });
    }
});

app.get('/api/tests/:id/run-status', (req, res) => {
    const status = getExecutionStatus(req.params.id);
    // Use 200 always — HTTP 102 is non-standard and causes Render's proxy to
    // return a 520 error with no CORS headers, breaking the frontend poll.
    if (!status) return res.status(200).json({ waiting: true });
    res.json(status);
});

app.get('/api/tests/:id/results', async (req, res) => {
    const result = await getPool().query('SELECT * FROM test_results WHERE "testCaseId" = $1 ORDER BY "createdAt" DESC', [req.params.id]);
    res.json(result.rows);
});

app.get('/api/results', async (req, res) => {
    const result = await getPool().query(`
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
    const projectsCount = await getPool().query('SELECT COUNT(*) as count FROM projects');
    const testsCount = await getPool().query('SELECT COUNT(*) as count FROM test_cases');
    const passedRes = await getPool().query("SELECT COUNT(*) as count FROM test_results WHERE status = 'Passed'");
    const failedRes = await getPool().query("SELECT COUNT(*) as count FROM test_results WHERE status = 'Failed'");
    const lastRunRes = await getPool().query('SELECT "createdAt" FROM test_results ORDER BY "createdAt" DESC LIMIT 1');
    
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

// Global Error Handler (ensure CORS headers even on error)
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    res.header("Access-Control-Allow-Origin", "*");
    res.status(500).json({ 
        error: 'Internal Server Error', 
        details: err.message,
        path: req.path
    });
});

app.listen(PORT, () => {
    console.log(`Server is live on port ${PORT}`);
});

// ── Global crash guards (prevents 520 errors on Render) ──────────────────────
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception (server kept alive):', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection (server kept alive):', reason);
});
// --- PROXY RUNNER SYSTEM ---
app.get('/api/proxy', async (req, res) => {
    const { url, testId } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 10000
        });

        let html = response.data;
        const baseUrl = new URL(url).origin;

        // 1. Inject the Automation Engine
        const scriptInjection = `
            <script>
                window.__TEST_ID__ = "${testId}";
                window.__API_BASE__ = "${req.protocol}://${req.get('host')}";
            </script>
            <script src="/api/automation-engine.js"></script>
        `;
        
        // 2. Rewrite relative URLs and inject script
        html = html.replace('<head>', `<head><base href="${baseUrl}/">${scriptInjection}`);
        
        res.send(html);
    } catch (error) {
        res.status(500).send(`Proxy Error: ${error.message}`);
    }
});

app.get('/api/automation-engine.js', (req, res) => {
    const script = `
        (async function() {
            console.log("🤖 Automation Robot Active for Test #" + window.__TEST_ID__);
            
            async function executeSteps() {
                const testId = window.__TEST_ID__;
                const apiBase = window.__API_BASE__;
                
                // Fetch steps from backend
                const res = await fetch(apiBase + "/api/tests/" + testId + "/steps-data");
                const steps = await res.json();
                
                console.log("🚀 Loaded " + steps.length + " steps. Starting native execution...");

                for (let step of steps) {
                    const payload = JSON.parse(step.payload);
                    const label = payload.label || step.type;
                    console.log("⚡ Executing: " + label);
                    
                    try {
                        if (step.type === 'INPUT') {
                            const el = document.querySelector(payload.selector) || 
                                     ([...document.querySelectorAll('input,textarea')].find(e => e.labels?.[0]?.innerText.includes(payload.label)));
                            if (el) {
                                el.value = payload.value;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        } else if (step.type === 'CLICK') {
                            const el = document.querySelector(payload.selector) || 
                                     ([...document.querySelectorAll('button,a,input[type="submit"]')].find(e => e.innerText.includes(payload.label) || e.value?.includes(payload.label)));
                            if (el) el.click();
                        }
                        
                        // Small delay for visual feedback
                        await new Promise(r => setTimeout(r, 800));
                    } catch (e) {
                        console.error("❌ Step Failed: " + label, e);
                    }
                }
                
                console.log("🏁 Automation Finished!");
            }

            // Start after page load
            if (document.readyState === 'complete') executeSteps();
            else window.addEventListener('load', executeSteps);
        })();
    `;
    res.set('Content-Type', 'application/javascript');
    res.send(script);
});

// Helper for proxy to get steps directly
app.get('/api/tests/:id/steps-data', async (req, res) => {
    const stepsRes = await getPool().query('SELECT * FROM test_steps WHERE "testCaseId" = $1 ORDER BY "stepOrder" ASC', [req.params.id]);
    res.json(stepsRes.rows);
});
