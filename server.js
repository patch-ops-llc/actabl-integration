import 'dotenv/config';
import express from 'express';
import { initializeDatabase, storeTokens, getTokens, deleteTokens, hasTokens } from './db.js';
import { generateCodeVerifier, generateCodeChallenge, generateState, storeVerifier, getVerifier } from './utils/pkce.js';
import { buildAuthorizationUrl, exchangeCodeForTokens, executeQuery, describeObject } from './utils/salesforce.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Get the base URL for redirects
 */
function getBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}`;
}

/**
 * Generate HTML dashboard page
 */
function getDashboardHtml(isConnected) {
  const connectedContent = `
    <div class="status connected">
      <span class="status-icon">✓</span>
      Connected to Salesforce
    </div>
    <div class="button-group">
      <a href="/test" class="btn btn-primary">Test Connection</a>
      <a href="/leads" class="btn btn-secondary">Query Actabl Leads</a>
      <a href="/schema" class="btn btn-secondary">Get Schema</a>
      <form action="/disconnect" method="POST" style="display: inline;">
        <button type="submit" class="btn btn-danger">Disconnect</button>
      </form>
    </div>
  `;

  const disconnectedContent = `
    <div class="status disconnected">
      <span class="status-icon">○</span>
      Not connected to Salesforce
    </div>
    <div class="button-group">
      <a href="/auth" class="btn btn-primary btn-large">Connect to Salesforce</a>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Actabl Salesforce Integration</title>
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          padding: 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        h1 {
          color: #1a1a2e;
          margin-bottom: 8px;
          font-size: 28px;
        }
        .subtitle {
          color: #6b7280;
          margin-bottom: 32px;
        }
        .status {
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-weight: 500;
        }
        .status.connected {
          background: #d1fae5;
          color: #065f46;
        }
        .status.disconnected {
          background: #fef3c7;
          color: #92400e;
        }
        .status-icon {
          font-size: 20px;
        }
        .button-group {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
        }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
          font-size: 14px;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .btn-primary {
          background: #4f46e5;
          color: white;
        }
        .btn-primary:hover {
          background: #4338ca;
        }
        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
        }
        .btn-secondary:hover {
          background: #e5e7eb;
        }
        .btn-danger {
          background: #fee2e2;
          color: #dc2626;
        }
        .btn-danger:hover {
          background: #fecaca;
        }
        .btn-large {
          padding: 16px 32px;
          font-size: 16px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Actabl Integration</h1>
        <p class="subtitle">Salesforce OAuth 2.0 with PKCE</p>
        ${isConnected ? connectedContent : disconnectedContent}
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate success page HTML
 */
function getSuccessHtml() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Connected Successfully</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          padding: 40px;
          max-width: 400px;
          text-align: center;
        }
        .success-icon {
          width: 80px;
          height: 80px;
          background: #d1fae5;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          font-size: 40px;
        }
        h1 { color: #065f46; margin-bottom: 12px; }
        p { color: #6b7280; margin-bottom: 24px; }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          background: #4f46e5;
          color: white;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
        }
        .btn:hover { background: #4338ca; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success-icon">✓</div>
        <h1>Connected!</h1>
        <p>Successfully connected to Salesforce.</p>
        <a href="/" class="btn">Go to Dashboard</a>
      </div>
    </body>
    </html>
  `;
}

/**
 * GET / - Home/Dashboard
 */
app.get('/', async (req, res) => {
  try {
    const connected = await hasTokens();
    res.send(getDashboardHtml(connected));
  } catch (error) {
    console.error('Error checking connection status:', error);
    res.status(500).json({ error: 'Failed to check connection status' });
  }
});

/**
 * GET /auth - Initiate OAuth Flow
 */
app.get('/auth', (req, res) => {
  try {
    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    
    // Store verifier for callback
    storeVerifier(state, codeVerifier);
    
    // Build redirect URL
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/callback`;
    const authUrl = buildAuthorizationUrl(redirectUri, codeChallenge, state);
    
    console.log('Initiating OAuth flow...');
    console.log('Redirect URI:', redirectUri);
    
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating auth:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow' });
  }
});

/**
 * GET /callback - OAuth Callback Handler
 */
app.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    
    // Check for OAuth errors
    if (error) {
      console.error('OAuth error:', error, error_description);
      return res.status(400).json({ 
        error: 'OAuth authorization failed', 
        details: error_description || error 
      });
    }
    
    // Validate required parameters
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    // Retrieve code verifier
    const codeVerifier = getVerifier(state);
    if (!codeVerifier) {
      return res.status(400).json({ error: 'Invalid or expired state parameter' });
    }
    
    // Exchange code for tokens
    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/callback`;
    
    console.log('Exchanging authorization code for tokens...');
    
    const tokenResponse = await exchangeCodeForTokens(code, codeVerifier, redirectUri);
    
    // Store tokens in database
    await storeTokens(
      tokenResponse.access_token,
      tokenResponse.refresh_token,
      tokenResponse.instance_url
    );
    
    console.log('OAuth flow completed successfully');
    console.log('Instance URL:', tokenResponse.instance_url);
    
    res.send(getSuccessHtml());
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({ 
      error: 'Failed to complete OAuth flow', 
      details: error.message 
    });
  }
});

/**
 * GET /test - Test Connection
 */
app.get('/test', async (req, res) => {
  try {
    const tokens = await getTokens();
    if (!tokens) {
      return res.status(401).json({ error: 'Not connected to Salesforce' });
    }
    
    console.log('Testing Salesforce connection...');
    
    const result = await executeQuery('SELECT Id, Name FROM Account LIMIT 5');
    
    res.json({
      success: true,
      message: 'Connection successful',
      data: {
        totalSize: result.totalSize,
        records: result.records.map(r => ({ Id: r.Id, Name: r.Name }))
      }
    });
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json({ 
      error: 'Test connection failed', 
      details: error.message 
    });
  }
});

/**
 * GET /leads - Query Actabl Leads Custom Object
 */
app.get('/leads', async (req, res) => {
  try {
    const tokens = await getTokens();
    if (!tokens) {
      return res.status(401).json({ error: 'Not connected to Salesforce' });
    }
    
    console.log('Querying Actabl Leads...');
    
    const result = await executeQuery(
      'SELECT Id, Name, CreatedDate FROM Actabl_Lead__c ORDER BY CreatedDate DESC LIMIT 10'
    );
    
    res.json({
      success: true,
      data: {
        totalSize: result.totalSize,
        records: result.records
      }
    });
  } catch (error) {
    console.error('Query leads error:', error);
    res.status(500).json({ 
      error: 'Failed to query Actabl Leads', 
      details: error.message 
    });
  }
});

/**
 * GET /schema - Get Actabl_Lead__c Object Schema
 */
app.get('/schema', async (req, res) => {
  try {
    const tokens = await getTokens();
    if (!tokens) {
      return res.status(401).json({ error: 'Not connected to Salesforce' });
    }
    
    console.log('Fetching Actabl_Lead__c schema...');
    
    const schema = await describeObject('Actabl_Lead__c');
    
    // Extract relevant field information
    const fields = schema.fields.map(field => ({
      name: field.name,
      label: field.label,
      type: field.type,
      required: !field.nillable && !field.defaultedOnCreate,
      length: field.length,
      picklistValues: field.picklistValues?.map(v => v.value) || []
    }));
    
    res.json({
      success: true,
      data: {
        name: schema.name,
        label: schema.label,
        labelPlural: schema.labelPlural,
        fieldCount: fields.length,
        fields: fields
      }
    });
  } catch (error) {
    console.error('Schema fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch schema', 
      details: error.message 
    });
  }
});

/**
 * POST /disconnect - Clear Tokens
 */
app.post('/disconnect', async (req, res) => {
  try {
    await deleteTokens();
    console.log('Disconnected from Salesforce');
    
    // Redirect back to dashboard
    res.redirect('/');
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ 
      error: 'Failed to disconnect', 
      details: error.message 
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * Start server
 */
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
