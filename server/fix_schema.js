const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const fixSchema = async () => {
    const client = await pool.connect();
    try {
        console.log('Checking and fixing schema...');
        
        // Projects table
        await client.query('ALTER TABLE projects RENAME COLUMN websiteurl TO "websiteUrl"').catch(e => console.log('websiteUrl already correct or table missing'));
        await client.query('ALTER TABLE projects RENAME COLUMN apibaseurl TO "apiBaseUrl"').catch(e => console.log('apiBaseUrl already correct or table missing'));
        
        // Test Cases table
        await client.query('ALTER TABLE test_cases RENAME COLUMN projectid TO "projectId"').catch(e => console.log('projectId already correct or table missing'));
        
        // Test Steps table
        await client.query('ALTER TABLE test_steps RENAME COLUMN testcaseid TO "testCaseId"').catch(e => console.log('testCaseId already correct or table missing'));
        await client.query('ALTER TABLE test_steps RENAME COLUMN steporder TO "stepOrder"').catch(e => console.log('stepOrder already correct or table missing'));
        
        // Test Results table
        await client.query('ALTER TABLE test_results RENAME COLUMN testcaseid TO "testCaseId"').catch(e => console.log('testCaseId already correct or table missing'));
        await client.query('ALTER TABLE test_results RENAME COLUMN responsedata TO "responseData"').catch(e => console.log('responseData already correct or table missing'));
        await client.query('ALTER TABLE test_results RENAME COLUMN screenshotpath TO "screenshotPath"').catch(e => console.log('screenshotPath already correct or table missing'));
        await client.query('ALTER TABLE test_results RENAME COLUMN executiontime TO "executionTime"').catch(e => console.log('executionTime already correct or table missing'));
        await client.query('ALTER TABLE test_results RENAME COLUMN createdat TO "createdAt"').catch(e => console.log('createdAt already correct or table missing'));

        console.log('Schema fix complete.');
    } catch (err) {
        console.error('Error fixing schema:', err);
    } finally {
        client.release();
        await pool.end();
    }
};

fixSchema();
