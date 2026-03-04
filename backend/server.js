require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ─── AWS Clients — c3l-NextLevelInsights (profile: c3l-analytics) ─────────────
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    QueryCommand,
    UpdateCommand
} = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { fromIni } = require('@aws-sdk/credential-providers');

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const AWS_PROFILE = process.env.AWS_PROFILE || 'c3l-analytics';   // local credential profile
const S3_BUCKET = process.env.NLI_S3_BUCKET || 'c3l-nextlevelinsights-data-lake';

const awsCredentials = fromIni({ profile: AWS_PROFILE });
const dynamo = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: AWS_REGION, credentials: awsCredentials })
);
const s3 = new S3Client({ region: AWS_REGION, credentials: awsCredentials });

// Table names
const TABLE_PERMISSIONS = 'c3l-NextLevelInsights-UserDevicePermissions';
const TABLE_SYNC_LOGS = 'c3l-NextLevelInsights-DataSyncLogs';

// ── Helper: upload a JSON object to S3 ───────────────────────────────────────
// Returns the full s3://bucket/key URI on success, null on failure
const uploadToS3 = async (key, data) => {
    try {
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: JSON.stringify(data, null, 2),
            ContentType: 'application/json'
        }));
        const uri = `s3://${S3_BUCKET}/${key}`;
        console.log(`[S3] Uploaded → ${uri}`);
        return uri;
    } catch (err) {
        console.error(`[S3] Upload failed for key ${key}:`, err.message);
        return null;
    }
};

// ── Helper: write a DataSyncLog entry (one per data type) ────────────────────
const writeSyncLog = async ({
    userId, deviceType, dataType, s3Path,
    dataStage, datazoneProductId, recordCount, status, errorMessage
}) => {
    const now = new Date().toISOString();
    try {
        await dynamo.send(new PutCommand({
            TableName: TABLE_SYNC_LOGS,
            Item: {
                sync_id: uuidv4(),
                timestamp: now,
                user_id: String(userId || 'unknown'),
                device_type: deviceType,
                data_type: dataType || deviceType,
                s3_path: s3Path || '',
                data_stage: dataStage || 'raw',
                record_count: recordCount || 0,
                datazone_product_id: datazoneProductId || `c3l-nli_${deviceType}_dev_raw_${dataType}`,
                status: status || 'success',
                error_message: errorMessage || null
            }
        }));
        console.log(`[DynamoDB] Sync log: ${deviceType}/${dataType} (${status}) → ${s3Path}`);
    } catch (err) {
        console.error('[DynamoDB] Failed to write sync log:', err.message);
    }
};
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());

// Ensure data directories exist
const DATA_DIR = path.join(__dirname, 'data');
const WHOOP_DIR = path.join(DATA_DIR, 'whoop');
const WHOOP_USER_DIR = path.join(WHOOP_DIR, 'user_data');
const WHOOP_SIGNUP_DIR = path.join(WHOOP_DIR, 'signup');
const APPLE_DIR = path.join(DATA_DIR, 'apple');

[DATA_DIR, WHOOP_DIR, WHOOP_USER_DIR, WHOOP_SIGNUP_DIR, APPLE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Helper to check for duplicates
const checkUserExists = async (email) => {
    try {
        const files = fs.readdirSync(WHOOP_SIGNUP_DIR);
        const emailLower = email.toLowerCase();
        return files.some(file => file.toLowerCase().includes(emailLower));
    } catch (err) {
        console.error("Error checking duplicates:", err);
        return false;
    }
};

app.post('/api/signup', async (req, res) => {
    const userData = req.body;

    if (!userData.email || !userData.firstName || !userData.lastName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Duplicate Check
    const userExists = await checkUserExists(userData.email);
    if (userExists) {
        return res.status(409).json({ error: 'User already exists', message: 'You have signed up before, please log in.' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${userData.email}.json`;
    const filePath = path.join(WHOOP_SIGNUP_DIR, filename);

    try {
        fs.writeFileSync(filePath, JSON.stringify(userData, null, 2));
        console.log(`Successfully saved user data to ${filePath}`);
        res.status(200).json({ message: 'User data saved successfully', filename });
    } catch (err) {
        console.error("Error saving to local storage:", err);
        res.status(500).json({ error: 'Failed to save data', details: err.message });
    }
});

app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const userExists = await checkUserExists(email);

    if (userExists) {
        console.log(`Password reset requested for ${email}`);
        return res.status(200).json({ message: 'If this email exists, a password reset link has been sent.' });
    } else {
        return res.status(404).json({ error: 'Email not found.' });
    }
});

app.get('/api/auth/whoop', (req, res) => {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const redirectUri = process.env.WHOOP_REDIRECT_URI;
    const scope = 'offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement';
    const state = 'random_string_to_verify_later';

    console.log('--- Whoop Auth Request Init ---');
    console.log('Client ID present:', !!clientId);
    console.log('Redirect URI:', redirectUri);

    if (!clientId || !redirectUri || clientId === 'your_client_id_here') {
        console.log('Error: Missing configuration');
        const errorHtml = `
            <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: #e74c3c;">Configuration Required</h1>
                    <p>The Whoop Client ID has not been set.</p>
                    <p>Please open the <code>.env</code> file in your project root and replace 
                    <code>your_client_id_here</code> with your actual Whoop Client ID.</p>
                    <p>Current Client ID Status: ${clientId ? 'Set' : 'Missing'}</p>
                    <p>Current Redirect URI: ${redirectUri}</p>
                    <p>After saving the file, restart the backend server.</p>
                    <a href="http://localhost:5173/resources/whoop">Back to Dashboard</a>
                </body>
            </html>
        `;
        return res.send(errorHtml);
    }

    const authUrl = `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;

    console.log('Redirecting to Whoop:', authUrl);
    res.redirect(authUrl);
});

app.get('/api/auth/whoop/callback', async (req, res) => {
    const { code, state } = req.query;

    console.log('--- Whoop Callback Received ---');
    console.log('Code received:', !!code);

    if (!code) {
        console.error('Error: No authorization code received.');
        return res.status(400).json({ error: 'Authorization code missing' });
    }

    try {
        console.log('Exchanging code for token...');
        const tokenResponse = await axios.post('https://api.prod.whoop.com/oauth/oauth2/token', new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            client_id: process.env.WHOOP_CLIENT_ID,
            client_secret: process.env.WHOOP_CLIENT_SECRET,
            redirect_uri: process.env.WHOOP_REDIRECT_URI
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log('Token exchange successful.');
        const { access_token, refresh_token, expires_in, scope: granted_scope } = tokenResponse.data;
        console.log('Granted Scopes:', granted_scope);
        const authHeaders = { headers: { 'Authorization': `Bearer ${access_token}` } };

        console.log('Fetching Whoop data from API...');

        const fetchSafe = async (url, label) => {
            try {
                const res = await axios.get(url, authHeaders);
                console.log(`✓ Fetched ${label}`);
                return res.data;
            } catch (err) {
                console.error(`✗ Failed to fetch ${label}:`, err.response?.status, err.response?.statusText);
                return null;
            }
        };

        // Last 30 days
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const start = thirtyDaysAgo.toISOString();
        const end = now.toISOString();
        const queryParams = `?start=${start}&end=${end}&limit=25`;

        // Fetch all Whoop data concurrently
        const [profileRes, bodyRes, recoveryRes, cycleRes, sleepRes, workoutRes] = await Promise.all([
            fetchSafe('https://api.prod.whoop.com/developer/v1/user/profile/basic', 'Profile'),
            fetchSafe('https://api.prod.whoop.com/developer/v1/user/measurement/body', 'Body'),
            fetchSafe(`https://api.prod.whoop.com/developer/v2/recovery${queryParams}`, 'Recovery'),
            fetchSafe(`https://api.prod.whoop.com/developer/v2/cycle${queryParams}`, 'Cycle'),
            fetchSafe(`https://api.prod.whoop.com/developer/v2/activity/sleep${queryParams}`, 'Sleep'),
            fetchSafe(`https://api.prod.whoop.com/developer/v2/activity/workout${queryParams}`, 'Workout')
        ]);

        const userId = String(profileRes?.user_id || 'unknown');
        const dateStr = now.toISOString().slice(0, 10);
        const [yr, mo, dy] = dateStr.split('-');
        const tsLabel = now.toISOString().replace(/[:.]/g, '-');

        // ── 1. Save full session bundle locally (for dashboard display) ──
        const whoopData = {
            token_data: { access_token, refresh_token, expires_in },
            user_profile: profileRes,
            body_measurement: bodyRes,
            recovery_data: recoveryRes,
            cycle_data: cycleRes,
            sleep_data: sleepRes,
            workout_data: workoutRes,
            synced_at: now.toISOString()
        };
        const localFilename = `${tsLabel}_whoop_data.json`;
        fs.writeFileSync(path.join(WHOOP_USER_DIR, localFilename), JSON.stringify(whoopData, null, 2));
        console.log(`[Local] Saved → ${localFilename}`);

        // ── 2. Upload ALL 6 data types to S3 individually ────────────────
        // Each type gets its own S3 prefix, Glue table, and DataZone product.
        const uploads = [
            {
                dataType: 'recovery',
                s3Key: `raw/whoop/recovery/${yr}/${mo}/${dy}/${userId}_recovery.json`,
                payload: {
                    meta: { user_id: userId, synced_at: now.toISOString(), source: 'whoop-api-v2' },
                    user_profile: profileRes, records: recoveryRes?.records || []
                },
                count: recoveryRes?.records?.length || 0
            },
            {
                dataType: 'sleep',
                s3Key: `raw/whoop/sleep/${yr}/${mo}/${dy}/${userId}_sleep.json`,
                payload: {
                    meta: { user_id: userId, synced_at: now.toISOString(), source: 'whoop-api-v2' },
                    user_profile: profileRes, records: sleepRes?.records || []
                },
                count: sleepRes?.records?.length || 0
            },
            {
                dataType: 'cycles',
                s3Key: `raw/whoop/cycles/${yr}/${mo}/${dy}/${userId}_cycles.json`,
                payload: {
                    meta: { user_id: userId, synced_at: now.toISOString(), source: 'whoop-api-v2' },
                    user_profile: profileRes, records: cycleRes?.records || []
                },
                count: cycleRes?.records?.length || 0
            },
            {
                dataType: 'workout',
                s3Key: `raw/whoop/workout/${yr}/${mo}/${dy}/${userId}_workout.json`,
                payload: {
                    meta: { user_id: userId, synced_at: now.toISOString(), source: 'whoop-api-v2' },
                    user_profile: profileRes, records: workoutRes?.records || []
                },
                count: workoutRes?.records?.length || 0
            },
            {
                dataType: 'profile',
                s3Key: `raw/whoop/profile/${yr}/${mo}/${dy}/${userId}_profile.json`,
                payload: {
                    meta: { user_id: userId, synced_at: now.toISOString(), source: 'whoop-api-v2' },
                    ...profileRes
                },
                count: 1
            },
            {
                dataType: 'body_measurement',
                s3Key: `raw/whoop/body_measurement/${yr}/${mo}/${dy}/${userId}_body_measurement.json`,
                payload: {
                    meta: { user_id: userId, synced_at: now.toISOString(), source: 'whoop-api-v2' },
                    user_id: userId, ...bodyRes
                },
                count: 1
            }
        ];

        const results = [];
        for (const u of uploads) {
            const uri = await uploadToS3(u.s3Key, u.payload);
            await writeSyncLog({
                userId, deviceType: 'whoop', dataType: u.dataType,
                s3Path: uri || u.s3Key, dataStage: 'raw',
                datazoneProductId: `c3l-nli_whoop_dev_raw_${u.dataType}`,
                recordCount: u.count,
                status: uri ? 'success' : 'failed',
                errorMessage: uri ? null : 'S3 upload failed'
            });
            results.push(`${u.dataType}:${uri ? '✓' : '✗'}`);
        }

        console.log('[Pipeline] Whoop uploads →', results.join('  '));
        res.redirect('http://localhost:5173/connected-services?status=connected&service=whoop');

    } catch (err) {
        console.error("Error connecting to Whoop:", err.response ? err.response.data : err.message);
        res.redirect('http://localhost:5173/connected-services?status=error&message=whoop_connection_failed');
    }
});



app.get('/api/auth/apple', (req, res) => {
    const redirectUrl = `http://localhost:5173/apple-consent?state=mock_apple_state_xyz`;
    res.redirect(redirectUrl);
});

app.get('/api/auth/apple/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'Authorization code missing' });
    }

    const mockAppleData = {
        user: {
            id: "apple_user_998877",
            sourceName: "Apple Watch Series 9",
            osVersion: "10.1"
        },
        health_data: {
            heart_rate: {
                avg_bpm: 72,
                min_bpm: 58,
                max_bpm: 110,
                readings_count: 1450
            },
            steps: 8432,
            active_energy_burned_kcal: 450,
            stand_hours: 12,
            sleep_analysis: {
                in_bed_min: 480,
                asleep_min: 420
            }
        },
        synced_at: new Date().toISOString()
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_apple_data.json`;
    const filePath = path.join(APPLE_DIR, filename);

    try {
        fs.writeFileSync(filePath, JSON.stringify(mockAppleData, null, 2));
        console.log(`Successfully saved Apple Health data to ${filePath}`);

        // Log sync to c3l-NextLevelInsights-DataSyncLogs
        await writeSyncLog({
            userId: mockAppleData.user?.id || 'unknown',
            deviceType: 'applewatch',
            s3Path: `s3://c3l-nextlevelinsights-data-lake/raw/applewatch/${filename}`,
            dataStage: 'raw',
            datazoneProductId: 'c3l-nli_applewatch_dev_raw',
            status: 'success'
        });

        res.redirect('http://localhost:5173/connected-services?status=connected&service=apple-health');
    } catch (err) {
        console.error("Error saving Apple Health data:", err);
        await writeSyncLog({ deviceType: 'applewatch', status: 'failed', errorMessage: err.message });
        res.redirect('http://localhost:5173/connected-services?status=error&message=save_failed');
    }
});

app.post('/api/chat', async (req, res) => {
    const { message, model } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    await new Promise(resolve => setTimeout(resolve, 1500));

    let responseText = "";
    if (model === 'gpt-4') {
        responseText = `[GPT-4 Analysis] Based on your recent Whoop and Apple Health data...`;
    } else {
        responseText = `[AI Analysis] I processed: "${message}". Your physical strain levels are balanced.`;
    }
    res.json({ response: responseText });
});

app.get('/api/whoop/data', async (req, res) => {
    try {
        const files = fs.readdirSync(WHOOP_USER_DIR);
        if (files.length === 0) {
            return res.status(404).json({ error: 'No Whoop data found' });
        }

        // Sort by creation time (descending)
        const sortedFiles = files.map(file => {
            const filePath = path.join(WHOOP_USER_DIR, file);
            return {
                name: file,
                time: fs.statSync(filePath).mtime.getTime()
            };
        }).sort((a, b) => b.time - a.time);

        const latestFile = sortedFiles[0].name;
        const data = fs.readFileSync(path.join(WHOOP_USER_DIR, latestFile), 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        console.error("Error retrieving Whoop data:", err);
        res.status(500).json({ error: 'Failed to retrieve data', details: err.message });
    }
});

app.post('/api/whoop/refresh', async (req, res) => {
    try {
        console.log('--- Refreshing Whoop Data ---');

        // 1. Get latest file to retrieve refresh token
        const files = fs.readdirSync(WHOOP_USER_DIR);
        if (files.length === 0) {
            return res.status(404).json({ error: 'No existing connection found. Please connect first.' });
        }

        // Sort to get latest
        const sortedFiles = files.map(file => {
            const filePath = path.join(WHOOP_USER_DIR, file);
            return { name: file, time: fs.statSync(filePath).mtime.getTime() };
        }).sort((a, b) => b.time - a.time);

        const latestFile = sortedFiles[0];
        const oldData = JSON.parse(fs.readFileSync(path.join(WHOOP_USER_DIR, latestFile.name), 'utf8'));

        if (!oldData.token_data || !oldData.token_data.refresh_token) {
            return res.status(401).json({ error: 'No refresh token available. Please reconnect.' });
        }

        console.log('Using refresh token to get new access token...');

        // 2. Exchange refresh token for new access token
        const tokenResponse = await axios.post('https://api.prod.whoop.com/oauth/oauth2/token', new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: oldData.token_data.refresh_token,
            client_id: process.env.WHOOP_CLIENT_ID,
            client_secret: process.env.WHOOP_CLIENT_SECRET,
            scope: 'offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, refresh_token, expires_in, scope: granted_scope } = tokenResponse.data;
        const authHeaders = { headers: { 'Authorization': `Bearer ${access_token}` } };
        console.log('Token refreshed successfully.');
        console.log('Granted Scopes:', granted_scope);


        // 3. Fetch Fresh Data (Reuse logic from callback)
        const fetchSafe = async (url, label) => {
            try {
                const res = await axios.get(url, authHeaders);
                console.log(`✓ Fetched ${label}`);
                return res.data;
            } catch (err) {
                console.error(`✗ Failed to fetch ${label}:`, err.response?.status, err.response?.statusText);
                return null;
            }
        };

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const start = thirtyDaysAgo.toISOString();
        const end = now.toISOString();
        const queryParams = `?start=${start}&end=${end}&limit=25`;

        const [profileRes, bodyRes, recoveryRes, cycleRes, sleepRes, workoutRes] = await Promise.all([
            fetchSafe('https://api.prod.whoop.com/developer/v1/user/profile/basic', 'Profile'),
            fetchSafe('https://api.prod.whoop.com/developer/v1/user/measurement/body', 'Body'),
            fetchSafe(`https://api.prod.whoop.com/developer/v2/recovery${queryParams}`, 'Recovery'),
            fetchSafe(`https://api.prod.whoop.com/developer/v2/cycle${queryParams}`, 'Cycle'),
            fetchSafe(`https://api.prod.whoop.com/developer/v2/activity/sleep${queryParams}`, 'Sleep'),
            fetchSafe(`https://api.prod.whoop.com/developer/v2/activity/workout${queryParams}`, 'Workout')
        ]);

        const newData = {
            token_data: { access_token, refresh_token, expires_in }, // Save new refresh token!
            user_profile: profileRes || oldData.user_profile, // Fallback to old if fail
            body_measurement: bodyRes || oldData.body_measurement,
            recovery_data: recoveryRes || { records: [] },
            cycle_data: cycleRes || { records: [] },
            sleep_data: sleepRes || { records: [] },
            workout_data: workoutRes || { records: [] },
            synced_at: new Date().toISOString()
        };

        // 4. Save new file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${timestamp}_whoop_data.json`;
        const filePath = path.join(WHOOP_USER_DIR, filename);

        fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
        console.log(`Refreshed data saved to ${filePath}`);

        res.json(newData);

    } catch (err) {
        console.error("Error refreshing Whoop data:", err.response ? err.response.data : err.message);
        res.status(500).json({ error: 'Failed to refresh data', details: err.message });
    }
});

// ─── c3l-NextLevelInsights Permission APIs ───────────────────────────────────

// GET /api/permissions/:userId — get all device permissions for a user
app.get('/api/permissions/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await dynamo.send(new QueryCommand({
            TableName: TABLE_PERMISSIONS,
            KeyConditionExpression: 'user_id = :uid',
            ExpressionAttributeValues: { ':uid': userId }
        }));
        res.json({ user_id: userId, permissions: result.Items || [] });
    } catch (err) {
        console.error('[DynamoDB] Error fetching permissions:', err);
        res.status(500).json({ error: 'Failed to fetch permissions', details: err.message });
    }
});

// GET /api/permissions/:userId/:device — get permission for a specific device
app.get('/api/permissions/:userId/:device', async (req, res) => {
    const { userId, device } = req.params;
    try {
        const result = await dynamo.send(new GetCommand({
            TableName: TABLE_PERMISSIONS,
            Key: { user_id: userId, device_type: device }
        }));
        if (!result.Item) {
            return res.status(404).json({ message: 'No permission record found', user_id: userId, device_type: device });
        }
        res.json(result.Item);
    } catch (err) {
        console.error('[DynamoDB] Error fetching permission:', err);
        res.status(500).json({ error: 'Failed to fetch permission', details: err.message });
    }
});

// PUT /api/permissions/:userId/:device — create or update a device permission
app.put('/api/permissions/:userId/:device', async (req, res) => {
    const { userId, device } = req.params;
    const { sharing_allowed, data_stage, consent_version } = req.body;

    if (typeof sharing_allowed !== 'boolean') {
        return res.status(400).json({ error: 'sharing_allowed (boolean) is required' });
    }

    const allowedDevices = ['applewatch', 'whoop', 'fitbit'];
    if (!allowedDevices.includes(device)) {
        return res.status(400).json({ error: `device must be one of: ${allowedDevices.join(', ')}` });
    }

    const now = new Date().toISOString();
    try {
        await dynamo.send(new PutCommand({
            TableName: TABLE_PERMISSIONS,
            Item: {
                user_id: userId,
                device_type: device,
                sharing_allowed: sharing_allowed,
                data_stage: data_stage || 'processed',
                consent_version: consent_version || 'v1.0',
                updated_at: now,
                created_at: now  // will be overwritten on subsequent PutItem only if we use UpdateItem, but PutItem is simpler here
            },
            // Preserve original created_at if record already exists
            ConditionExpression: 'attribute_not_exists(created_at)',
        })).catch(async () => {
            // Record already exists — just update relevant fields
            await dynamo.send(new UpdateCommand({
                TableName: TABLE_PERMISSIONS,
                Key: { user_id: userId, device_type: device },
                UpdateExpression: 'SET sharing_allowed = :sa, data_stage = :ds, consent_version = :cv, updated_at = :ua',
                ExpressionAttributeValues: {
                    ':sa': sharing_allowed,
                    ':ds': data_stage || 'processed',
                    ':cv': consent_version || 'v1.0',
                    ':ua': now
                }
            }));
        });

        console.log(`[DynamoDB] Permission updated: ${userId}/${device} → sharing_allowed=${sharing_allowed}`);
        res.json({
            message: 'Permission saved',
            user_id: userId,
            device_type: device,
            sharing_allowed,
            datazone_product: `c3l-nli_${device}_dev_processed`
        });
    } catch (err) {
        console.error('[DynamoDB] Error saving permission:', err);
        res.status(500).json({ error: 'Failed to save permission', details: err.message });
    }
});

// GET /api/sync-logs/:userId — get recent sync logs for a user
app.get('/api/sync-logs/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // Full table scan filtered by user_id (DataSyncLogs is append-only, so this is acceptable at small scale)
        const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
        const result = await dynamo.send(new ScanCommand({
            TableName: TABLE_SYNC_LOGS,
            FilterExpression: 'user_id = :uid',
            ExpressionAttributeValues: { ':uid': userId }
        }));
        res.json({ user_id: userId, logs: result.Items || [] });
    } catch (err) {
        console.error('[DynamoDB] Error fetching sync logs:', err);
        res.status(500).json({ error: 'Failed to fetch sync logs', details: err.message });
    }
});
// ─────────────────────────────────────────────────────────────────────────────

// ─── Admin Dashboard API ──────────────────────────────────────────────────────
//
// GET /api/admin/whoop-summary
// Reads all locally-stored Whoop session files and returns:
//   - rows[]:        one entry per distinct user (avg scores, record counts, email)
//   - data_products[]: the 6 Whoop data types each with total record counts
//
// In production this would be replaced by an Athena query against
// the processed/ prefix in S3 (via c3l-nli-AdminDashboard Lambda).
// The schema and columns intentionally mirror the Athena output so the
// frontend component requires no changes when the Lambda is deployed.
// ──────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/whoop-summary', (req, res) => {
    try {
        const files = fs.readdirSync(WHOOP_USER_DIR);
        if (files.length === 0) {
            return res.json({ rows: [], data_products: [], source: 'local_files' });
        }

        // Collect per-user data (keyed by user_id)
        const userMap = {};

        files.forEach(filename => {
            try {
                const raw = fs.readFileSync(path.join(WHOOP_USER_DIR, filename), 'utf8');
                const d = JSON.parse(raw);

                const profile = d.user_profile || {};
                const uid = String(profile.user_id || 'unknown');
                const email = profile.email || '';
                const firstName = profile.first_name || '';
                const lastName = profile.last_name || '';

                if (!userMap[uid]) {
                    userMap[uid] = {
                        user_id: uid,
                        email,
                        first_name: firstName,
                        last_name: lastName,
                        recovery_scores: [],
                        sleep_perf: [],
                        sleep_consistency: [],
                        sleep_efficiency: [],
                        hrv_values: [],
                        rhr_values: [],
                        recovery_count: 0,
                        sleep_count: 0,
                        cycle_count: 0,
                        workout_count: 0,
                        profile_count: 0,
                        body_count: 0,
                        synced_at: d.synced_at || ''
                    };
                }

                const u = userMap[uid];
                // update to newest sync
                if (d.synced_at > u.synced_at) u.synced_at = d.synced_at;

                // Recovery
                const recRecs = d.recovery_data?.records || [];
                recRecs.forEach(r => {
                    if (r.score_state === 'SCORED' && r.score) {
                        u.recovery_scores.push(r.score.recovery_score || 0);
                        u.hrv_values.push(r.score.hrv_rmssd_milli || 0);
                        u.rhr_values.push(r.score.resting_heart_rate || 0);
                    }
                });
                u.recovery_count += recRecs.length;

                // Sleep
                const slpRecs = d.sleep_data?.records || [];
                slpRecs.forEach(s => {
                    if (s.score_state === 'SCORED' && s.score) {
                        u.sleep_perf.push(s.score.sleep_performance_percentage || 0);
                        u.sleep_consistency.push(s.score.sleep_consistency_percentage || 0);
                        u.sleep_efficiency.push(s.score.sleep_efficiency_percentage || 0);
                    }
                });
                u.sleep_count += slpRecs.length;

                // Other types
                u.cycle_count += (d.cycle_data?.records || []).length;
                u.workout_count += (d.workout_data?.records || []).length;
                u.profile_count += d.user_profile ? 1 : 0;
                u.body_count += d.body_measurement ? 1 : 0;

            } catch (parseErr) {
                console.warn(`[Admin] Could not parse ${filename}:`, parseErr.message);
            }
        });

        const avg = arr => arr.length
            ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10
            : null;

        // Build rows array — one per user, Athena-compatible column names
        const rows = Object.values(userMap).map(u => ({
            owner_id: u.user_id,
            email: u.email,
            display_name: `${u.first_name} ${u.last_name}`.trim(),
            avg_recovery_score: avg(u.recovery_scores),
            avg_sleep_performance: avg(u.sleep_perf),
            avg_sleep_consistency: avg(u.sleep_consistency),
            avg_sleep_efficiency: avg(u.sleep_efficiency),
            avg_hrv_rmssd: avg(u.hrv_values),
            avg_resting_hr: avg(u.rhr_values),
            recovery_records: u.recovery_count,
            sleep_records: u.sleep_count,
            cycle_records: u.cycle_count,
            workout_records: u.workout_count,
            profile_records: u.profile_count,
            body_records: u.body_count,
            last_synced: u.synced_at
        }));

        // Aggregate totals for data products sidebar
        const totals = rows.reduce((acc, r) => {
            acc.recovery += r.recovery_records;
            acc.sleep += r.sleep_records;
            acc.cycles += r.cycle_records;
            workout: acc.workout += r.workout_records;
            acc.profile += r.profile_records;
            acc.body_measurement += r.body_records;
            return acc;
        }, { recovery: 0, sleep: 0, cycles: 0, workout: 0, profile: 0, body_measurement: 0 });

        const DATA_PRODUCTS = [
            { id: 'recovery', label: 'Whoop Recovery', glue_table: 'whoop_recovery_recovery', datazone_product: 'c3l-nli_whoop_dev_raw_recovery', s3_prefix: 'raw/whoop/recovery/', record_count: totals.recovery },
            { id: 'sleep', label: 'Whoop Sleep', glue_table: 'whoop_sleep_sleep', datazone_product: 'c3l-nli_whoop_dev_raw_sleep', s3_prefix: 'raw/whoop/sleep/', record_count: totals.sleep },
            { id: 'cycles', label: 'Whoop Cycles', glue_table: 'whoop_cycles_cycles', datazone_product: 'c3l-nli_whoop_dev_raw_cycles', s3_prefix: 'raw/whoop/cycles/', record_count: totals.cycles },
            { id: 'workout', label: 'Whoop Workout', glue_table: 'whoop_workout_workout', datazone_product: 'c3l-nli_whoop_dev_raw_workout', s3_prefix: 'raw/whoop/workout/', record_count: totals.workout },
            { id: 'profile', label: 'Whoop Profile', glue_table: 'whoop_profile_profile', datazone_product: 'c3l-nli_whoop_dev_raw_profile', s3_prefix: 'raw/whoop/profile/', record_count: totals.profile },
            { id: 'body_measurement', label: 'Whoop Body Measurement', glue_table: 'whoop_body_measurement_body_measurement', datazone_product: 'c3l-nli_whoop_dev_raw_body_measurement', s3_prefix: 'raw/whoop/body_measurement/', record_count: totals.body_measurement }
        ];

        console.log(`[Admin] whoop-summary: ${rows.length} users, ${files.length} sync files`);
        res.json({
            source: 'local_files',         // will be 'athena' when Lambda is deployed
            athena_note: 'In production: SELECT * FROM processed_health_metrics WHERE owner_id IN (...)',
            user_count: rows.length,
            sync_files: files.length,
            rows,
            data_products: DATA_PRODUCTS
        });
    } catch (err) {
        console.error('[Admin] whoop-summary error:', err);
        res.status(500).json({ error: 'Failed to compute summary', details: err.message });
    }
});
// ─────────────────────────────────────────────────────────────────────────────

// ─── Raw Data Preview Endpoint ───────────────────────────────────────────────
// GET /api/admin/whoop-raw/:productId
// Reads user_data files, returns flat dataframe rows for one Whoop data product.
// productId = recovery | sleep | cycles | workout | profile | body_measurement
app.get('/api/admin/whoop-raw/:productId', (req, res) => {
    const { productId } = req.params;
    const PRODUCT_KEY_MAP = {
        recovery: 'recovery_data',
        sleep: 'sleep_data',
        cycles: 'cycle_data',
        workout: 'workout_data',
        profile: 'user_profile',
        body_measurement: 'body_measurement'
    };
    if (!PRODUCT_KEY_MAP[productId]) {
        return res.status(400).json({ error: `Unknown product: ${productId}` });
    }

    function flattenObj(obj, prefix = '') {
        const out = {};
        for (const [k, v] of Object.entries(obj || {})) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                Object.assign(out, flattenObj(v, key));
            } else {
                out[key] = v;
            }
        }
        return out;
    }

    try {
        const files = fs.readdirSync(WHOOP_USER_DIR).sort().reverse();
        const allRows = [];
        const fileSources = [];

        files.forEach(filename => {
            try {
                const raw = fs.readFileSync(path.join(WHOOP_USER_DIR, filename), 'utf8');
                const d = JSON.parse(raw);
                const profile = d.user_profile || {};
                const email = profile.email || 'unknown';
                const userId = String(profile.user_id || 'unknown');

                let records = [];
                if (productId === 'profile') records = [d.user_profile].filter(Boolean);
                else if (productId === 'body_measurement') records = [d.body_measurement].filter(Boolean);
                else records = (d[PRODUCT_KEY_MAP[productId]]?.records) || [];

                records.forEach(rec => {
                    const flat = flattenObj(rec);
                    allRows.push({ _user_id: userId, _email: email, ...flat });
                });
                fileSources.push({ filename, records: records.length });
            } catch (e) {
                console.warn(`[Raw] Skip ${filename}:`, e.message);
            }
        });

        const colSet = [];
        const colSeen = new Set();
        allRows.forEach(row => Object.keys(row).forEach(k => {
            if (!colSeen.has(k)) { colSeen.add(k); colSet.push(k); }
        }));

        const MAX_ROWS = 100;
        res.json({
            product_id: productId,
            total: allRows.length,
            showing: Math.min(allRows.length, MAX_ROWS),
            columns: colSet,
            rows: allRows.slice(0, MAX_ROWS),
            sources: fileSources
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load raw data', details: err.message });
    }
});
// ─────────────────────────────────────────────────────────────────────────────

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
    console.log(`[c3l-NextLevelInsights] DynamoDB region: ${AWS_REGION}`);
    console.log(`[c3l-NextLevelInsights] Permissions table: ${TABLE_PERMISSIONS}`);
    console.log(`[c3l-NextLevelInsights] Sync logs table:   ${TABLE_SYNC_LOGS}`);
    console.log(`Local data storage initialized at ${DATA_DIR}`);
});

