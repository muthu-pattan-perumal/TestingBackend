const { getPool } = require('./db');
const puppeteer = require('puppeteer-core');
const chromeLauncher = require('chrome-launcher');

const activeExecutions = new Map();

function getExecutionStatus(testCaseId) {
    return activeExecutions.get(testCaseId) || null;
}

async function runApiTest(testCaseId) {
    const stepsRes = await getPool().query('SELECT * FROM test_steps WHERE "testCaseId" = $1 ORDER BY "stepOrder" ASC', [testCaseId]);
    const steps = stepsRes.rows;
    const startTime = Date.now();
    let logs = [];
    let status = 'Passed';
    let lastResponse = null;

    try {
        for (const step of steps) {
            const payload = JSON.parse(step.payload);
            logs.push(`Executing Step ${step.stepOrder}: ${step.type}`);

            if (['GET', 'POST', 'PUT', 'DELETE'].includes(step.type)) {
                let headers = payload.headers || {};
                if (payload.headersText) {
                    try {
                        headers = { ...headers, ...JSON.parse(payload.headersText) };
                    } catch (e) {
                        logs.push(`Warning: Invalid headers JSON: ${e.message}`);
                    }
                }

                const options = {
                    method: step.type,
                    headers: headers,
                };
                if (payload.body && step.type !== 'GET') {
                    options.body = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
                }

                const response = await fetch(payload.url, options);
                let data = {};
                try {
                    data = await response.json();
                } catch (e) {
                    logs.push(`Note: Response body is not JSON`);
                }

                lastResponse = {
                    status: response.status,
                    data: data,
                    time: Date.now() - startTime
                };
                
                logs.push(`Response Status: ${response.status} (${response.statusText})`);

                const expectedStatus = payload.expectedStatus || 200;
                if (response.status !== expectedStatus) {
                    throw new Error(`API Request Failed: Expected ${expectedStatus}, but got ${response.status} ${response.statusText}`);
                }
            } else if (step.type === 'VALIDATE_STATUS') {
                const expectedStatus = payload.expectedStatus || 200;
                if (lastResponse.status !== expectedStatus) {
                    throw new Error(`Status validation failed: Expected ${expectedStatus}, but got ${lastResponse.status}`);
                }
                logs.push(`Status validation passed: ${expectedStatus}`);
            } else if (step.type === 'VALIDATE_JSON') {
                const { field, expectedValue } = payload;
                if (lastResponse.data[field] !== expectedValue) {
                    throw new Error(`JSON validation failed: Expected "${field}" to be "${expectedValue}", but got "${lastResponse.data[field]}"`);
                }
                logs.push(`JSON validation passed: ${field} = ${expectedValue}`);
            }
        }
    } catch (error) {
        status = 'Failed';
        logs.push(`❌ FATAL ERROR: ${error.message}`);
    }

    const executionTime = Date.now() - startTime;
    await getPool().query(`
        INSERT INTO test_results ("testCaseId", status, "responseData", log, "executionTime")
        VALUES ($1, $2, $3, $4, $5)
    `, [testCaseId, status, JSON.stringify(lastResponse), logs.join('\n'), executionTime]);

    return { status, executionTime, logs };
}

async function runUiTest(testCaseId) {
    activeExecutions.set(testCaseId, { logs: '', snapshots: [] });
    const stepsRes = await getPool().query('SELECT * FROM test_steps WHERE "testCaseId" = $1 ORDER BY "stepOrder" ASC', [testCaseId]);
    const steps = stepsRes.rows;
    const startTime = Date.now();
    let logs = [];
    let status = 'Passed';
    let browser = null;
    let page = null;
    const networkHistory = [];
    const requestMap = new Map();
    const stepScreenshots = [];
    let pendingRequests = 0;
    const UI_TIMEOUT = 60000;

    const waitForNetworkIdle = async (timeout = 5000) => {
        const start = Date.now();
        while (pendingRequests > 0 && Date.now() - start < timeout) {
            await new Promise(r => setTimeout(r, 100));
        }
    };

    try {
        let chromePath = process.env.CHROME_PATH || chromeLauncher.Launcher.getInstallations()[0];
        
        // Manual check for common Render/Heroku Chrome paths if still not found
        if (!chromePath && process.env.RENDER === 'true') {
            chromePath = '/opt/render/project/.render/chrome/opt/google/chrome/chrome';
        }

        if (!chromePath) {
            logs.push("❌ Error: Google Chrome not found. If running on Render, ensure you have the Chrome Buildpack installed and CHROME_PATH set.");
            throw new Error("Google Chrome not found on this system.");
        }
        logs.push(`Using Chrome at: ${chromePath}`);

        const isCloudEnv = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: isCloudEnv ? true : false,
            slowMo: 300, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720']
        });
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setRequestInterception(true);

        // Phase 14, 15 & 17: Network History & Detailed Debugging

        page.on('request', (req) => {
            const method = req.method();
            if (method === 'OPTIONS') {
                req.continue();
                return;
            }
            const entry = { 
                url: req.url(), 
                method, 
                status: 'pending', 
                startTime: Date.now(),
                payload: req.postData() || '',
                headers: req.headers(),
                resourceType: req.resourceType()
            };
            networkHistory.push(entry);
            requestMap.set(req, entry);
            pendingRequests++;
            req.continue();
        });

        page.on('response', async (res) => {
            const entry = requestMap.get(res.request());
            if (entry) {
                entry.status = res.status();
                entry.endTime = Date.now();
                entry.duration = entry.endTime - entry.startTime;
                entry.responseHeaders = res.headers();
                try {
                    const contentType = res.headers()['content-type'] || '';
                    if (contentType.includes('application/json')) {
                        const json = await res.json();
                        entry.responseBody = JSON.stringify(json, null, 2);
                    } else if (contentType.includes('text/')) {
                        entry.responseBody = await res.text();
                    }
                } catch (e) {
                    entry.responseBody = '[Body not captured]';
                }
                entry.res = res;
                pendingRequests--;
            }
        });

        page.on('requestfailed', (req) => {
            const entry = requestMap.get(req);
            if (entry) {
                entry.status = 'failed';
                pendingRequests--;
            }
        });


        // Helper to find element by label text or attributes, returns specific index
        const getElementByLabel = async (labelText, index = 1) => {
            return await page.evaluateHandle((text, i) => {
                const findInLabel = (l) => {
                    if (l.htmlFor) return document.getElementById(l.htmlFor);
                    return l.querySelector('input, select, textarea, button');
                };

                const labels = Array.from(document.querySelectorAll('label'));
                const matchingLabels = labels.filter(l => l.innerText.trim().toLowerCase().includes(text.toLowerCase()));
                
                let matches = [];
                matchingLabels.forEach(label => {
                    const el = findInLabel(label);
                    if (el) matches.push(el);
                });

                const inputs = Array.from(document.querySelectorAll('input, button, select, textarea, a, [role="button"]'));
                inputs.forEach(input => {
                    if ((input.getAttribute('aria-label') || '').toLowerCase().includes(text.toLowerCase()) ||
                        (input.placeholder || '').toLowerCase().includes(text.toLowerCase()) ||
                        (input.innerText || '').toLowerCase().includes(text.toLowerCase())) {
                        matches.push(input);
                    }
                });
                
                // Return unique visible elements at requested index
                const uniqueVisible = [...new Set(matches)].filter(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                });
                
                return uniqueVisible[i - 1] || null;
            }, labelText, index);
        };
            // Screenshots removed as per request

        for (const step of steps) {
            const payload = JSON.parse(step.payload);
            const label = payload.label || step.type;
            const strategy = payload.strategy || 'css';
            const mIndex = payload.matchIndex || 1;
            logs.push(`Step ${step.stepOrder}: ${label} (Index: ${mIndex})`);
            const exec = activeExecutions.get(testCaseId);
            if (exec) exec.logs = logs.join('\n');

            if (step.type === 'OPEN_URL') {
                const response = await page.goto(payload.url, { waitUntil: 'networkidle2', timeout: 30000 });
                if (response && !response.ok()) {
                    throw new Error(`Failed to load page: ${payload.url} (Status: ${response.status()})`);
                }
                logs.push(`Page loaded: ${payload.url}`);
            } else if (['GET', 'POST', 'PUT', 'DELETE'].includes(step.type)) {
                let headers = payload.headers || {};
                if (payload.headersText) {
                    try { headers = { ...headers, ...JSON.parse(payload.headersText) }; } catch (e) {}
                }
                const res = await fetch(payload.url, { method: step.type, headers, body: payload.body ? JSON.stringify(payload.body) : undefined });
                logs.push(`API ${step.type} called: ${payload.url} (Status: ${res.status})`);
                if (payload.expectedStatus && res.status !== payload.expectedStatus) {
                    throw new Error(`API Step Failed: Expected ${payload.expectedStatus}, got ${res.status}`);
                }
            } else if (step.type === 'INTERCEPT_API') {
                const pattern = payload.urlPattern.toLowerCase();
                logs.push(`Searching history for background API call matching: "${payload.urlPattern}" (Case-Insensitive)`);
                
                let response = null;
                const checkHistory = () => {
                    for (const item of networkHistory) {
                        const urlMatch = item.url.toLowerCase().includes(pattern);
                        const methodMatch = payload.method === 'ANY' ? item.method !== 'OPTIONS' : item.method === payload.method;
                        if (urlMatch && methodMatch && item.res) {
                            return item.res;
                        }
                    }
                    return null;
                };

                // 1. Search history first
                response = checkHistory();
                if (response) {
                    logs.push(`[History] Found matching call: ${response.url()}`);
                }

                // 2. If not found, wait live
                if (!response) {
                    logs.push(`Not found in history. Waiting live for: "${payload.urlPattern}"...`);
                    try {
                        response = await page.waitForResponse(
                            res => {
                                const urlMatch = res.url().toLowerCase().includes(pattern);
                                const methodMatch = payload.method === 'ANY' ? res.request().method() !== 'OPTIONS' : res.request().method() === payload.method;
                                return urlMatch && methodMatch;
                            },
                            { timeout: 60000 }
                        );
                    } catch (e) {
                        // On timeout, log the network snapshot to help the user
                        logs.push(`❌ INTERCEPTION TIMEOUT (60s): Could not find "${payload.urlPattern}"`);
                        logs.push(`--- NETWORK SNAPSHOT (Last 15 calls) ---`);
                        const snapshot = networkHistory.slice(-15).reverse();
                        snapshot.forEach(item => {
                            logs.push(`[${item.method}] ${item.url} (Status: ${item.status})`);
                        });
                        logs.push(`------------------------------------------`);
                        throw new Error(`Interception Timed Out. See log above for seen URLs.`);
                    }
                }
                
                const method = response.request().method();
                let responseBody = '';
                const status = response.status();
                logs.push(`Intercepted ${method} Request: ${response.url()} (Status: ${status})`);

                if (status === 204 || status === 304) {
                    responseBody = '[No Content]';
                } else {
                    try {
                        const contentType = response.headers()['content-type'] || '';
                        if (contentType.includes('application/json')) {
                            const json = await response.json();
                            responseBody = JSON.stringify(json, null, 2);
                        } else {
                            responseBody = await response.text();
                        }
                    } catch (e) {
                        responseBody = `[Could not parse response content: ${e.message}]`;
                    }
                }

                logs.push(`Response Data:\n${responseBody}`);

                if (payload.expectedStatus && response.status() !== payload.expectedStatus) {
                    throw new Error(`Intercepted API Step Failed: Expected ${payload.expectedStatus}, got ${response.status()}`);
                }
            } else if (step.type === 'CLICK') {
                if (strategy === 'label') {
                    const elHandle = await getElementByLabel(payload.selector, mIndex);
                    const el = elHandle.asElement();
                    if (el) {
                        await el.scrollIntoView();
                        await el.click();
                        logs.push(`Clicked element ${mIndex} with label: "${payload.selector}"`);
                    } else {
                        throw new Error(`Could not find or click element ${mIndex} with label "${payload.selector}"`);
                    }
                } else {
                    try {
                        await page.waitForSelector(payload.selector, { visible: true, timeout: UI_TIMEOUT });
                    } catch (e) {
                        const suggestions = await page.evaluate((target) => {
                            const targetClean = target.replace('.', '').toLowerCase();
                            const all = Array.from(document.querySelectorAll('*'));
                            const classes = new Set();
                            all.forEach(el => el.classList.forEach(c => classes.add(c)));
                            const classList = Array.from(classes);
                            
                            // Find classes containing the target string (typo detection)
                            const similar = classList.filter(c => 
                                c.toLowerCase().includes(targetClean) || 
                                targetClean.includes(c.toLowerCase())
                            );
                            return similar.slice(0, 10);
                        }, payload.selector);

                        logs.push(`❌ Selector Error: Could not find "${payload.selector}" within ${UI_TIMEOUT/1000}s.`);
                        if (suggestions.length > 0) {
                            logs.push(`💡 Did you mean one of these? : ${suggestions.join(', ')}`);
                        } else {
                            logs.push(`💡 Tip: Make sure the element is not inside an iframe and the class name is correct.`);
                        }
                        throw new Error(`Waiting for selector "${payload.selector}" failed. Check for typos.`);
                    }
                    const elements = await page.$$(payload.selector);
                    if (elements[mIndex - 1]) {
                        await elements[mIndex - 1].scrollIntoView();
                        await elements[mIndex - 1].click();
                        logs.push(`Clicked element ${mIndex} matching selector: ${payload.selector}`);
                    } else {
                        throw new Error(`Could not find element at index ${mIndex} for selector: ${payload.selector}`);
                    }
                }
            } else if (step.type === 'INPUT') {
                if (strategy === 'label') {
                    const elHandle = await getElementByLabel(payload.selector, mIndex);
                    const el = elHandle.asElement();
                    if (el) {
                        await el.scrollIntoView();
                        await el.focus();
                        await page.keyboard.down('Control');
                        await page.keyboard.press('A');
                        await page.keyboard.up('Control');
                        await page.keyboard.press('Backspace');
                        await page.keyboard.type(payload.value);
                        logs.push(`Entered text into element ${mIndex} with label "${payload.selector}": ${payload.value}`);
                    } else {
                        throw new Error(`Could not find input field ${mIndex} with label "${payload.selector}"`);
                    }
                } else {
                    try {
                        await page.waitForSelector(payload.selector, { visible: true, timeout: UI_TIMEOUT });
                    } catch (e) {
                        const suggestions = await page.evaluate((target) => {
                            const targetClean = target.replace('.', '').toLowerCase();
                            const all = Array.from(document.querySelectorAll('*'));
                            const classes = new Set();
                            all.forEach(el => el.classList.forEach(c => classes.add(c)));
                            const classList = Array.from(classes);
                            const similar = classList.filter(c => 
                                c.toLowerCase().includes(targetClean) || 
                                targetClean.includes(c.toLowerCase())
                            );
                            return similar.slice(0, 10);
                        }, payload.selector);
                        logs.push(`❌ Input Error: Could not find "${payload.selector}" within ${UI_TIMEOUT/1000}s.`);
                        if (suggestions.length > 0) {
                            logs.push(`💡 Did you mean one of these? : ${suggestions.join(', ')}`);
                        }
                        throw new Error(`Waiting for selector "${payload.selector}" failed.`);
                    }
                    const elements = await page.$$(payload.selector);
                    if (elements[mIndex - 1]) {
                        await elements[mIndex - 1].scrollIntoView();
                        await elements[mIndex - 1].click({ clickCount: 3 }); 
                        await page.keyboard.press('Backspace');
                        await elements[mIndex - 1].type(payload.value);
                        logs.push(`Entered text into element ${mIndex} matching selector: ${payload.selector}`);
                    } else {
                        throw new Error(`Could not find element at index ${mIndex} for selector: ${payload.selector}`);
                    }
                }
            } else if (step.type === 'WAIT_FOR') {
                if (strategy === 'label') {
                    const elHandle = await getElementByLabel(payload.selector, mIndex);
                    if (!elHandle.asElement()) throw new Error(`Timeout waiting for label "${payload.selector}" at index ${mIndex}`);
                } else {
                    try {
                        await page.waitForSelector(payload.selector, { visible: true, timeout: UI_TIMEOUT });
                    } catch (e) {
                        const suggestions = await page.evaluate((target) => {
                            const targetClean = target.replace('.', '').toLowerCase();
                            const all = Array.from(document.querySelectorAll('*'));
                            const classes = new Set();
                            all.forEach(el => el.classList.forEach(c => classes.add(c)));
                            const classList = Array.from(classes);
                            const similar = classList.filter(c => 
                                c.toLowerCase().includes(targetClean) || 
                                targetClean.includes(c.toLowerCase())
                            );
                            return similar.slice(0, 10);
                        }, payload.selector);
                        logs.push(`❌ Wait Error: Could not find "${payload.selector}" within ${UI_TIMEOUT/1000}s.`);
                        if (suggestions.length > 0) {
                            logs.push(`💡 Did you mean one of these? : ${suggestions.join(', ')}`);
                        }
                        throw new Error(`Waiting for selector "${payload.selector}" failed.`);
                    }
                    const elements = await page.$$(payload.selector);
                    if (!elements[mIndex - 1]) throw new Error(`Timeout waiting for selector "${payload.selector}" at index ${mIndex}`);
                }
                logs.push(`Successfully waited for element ${mIndex} matching: ${payload.selector}`);
            } else if (step.type === 'SCREENSHOT') {
                const screenshotName = `screenshot_${testCaseId}_${Date.now()}.png`;
                await page.screenshot({ path: `./screenshots/${screenshotName}` });
                logs.push(`Screenshot saved: ${screenshotName}`);
                stepScreenshots.push({ stepOrder: step.stepOrder, label, fileName: screenshotName });
            }
            
            // Artificial delay to make it more "visual" in logs
            await new Promise(r => setTimeout(r, 500));
        }
    } catch (error) {
        status = 'Failed';
        logs.push(`Error: ${error.message}`);
    } finally {
        activeExecutions.delete(testCaseId);
        // Phase 18: Ensure all background APIs are captured
        if (page) {
            await waitForNetworkIdle(5000); 
            await new Promise(r => setTimeout(r, 500)); // Final stability breath
        }
        if (browser) await browser.close(); 
    }

    const executionTime = Date.now() - startTime;
    const cleanHistory = networkHistory.map(item => {
        const { res, ...rest } = item;
        return rest;
    });

    await getPool().query(`
        INSERT INTO test_results ("testCaseId", status, log, "executionTime", "responseData")
        VALUES ($1, $2, $3, $4, $5)
    `, [testCaseId, status, logs.join('\n'), executionTime, JSON.stringify({ networkHistory: cleanHistory, snapshots: stepScreenshots })]);

    return { status, executionTime, logs: logs.join('\n'), networkHistory: cleanHistory, snapshots: stepScreenshots };
}

module.exports = { runApiTest, runUiTest, getExecutionStatus };
