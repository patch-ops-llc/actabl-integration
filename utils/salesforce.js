import fetch from 'node-fetch';
import { getTokens, updateAccessToken } from '../db.js';

const SF_CLIENT_ID = process.env.SF_CLIENT_ID;
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET;
const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
const SF_API_VERSION = 'v59.0';

/**
 * Refresh the Salesforce access token using the refresh token
 * @returns {Object} New token data
 */
export async function refreshAccessToken() {
  const tokens = await getTokens();
  
  if (!tokens) {
    throw new Error('No tokens found in database');
  }
  
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
    refresh_token: tokens.refreshToken
  });
  
  const response = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Token refresh failed: ${errorData.error_description || errorData.error}`);
  }
  
  const data = await response.json();
  
  // Update the stored access token
  await updateAccessToken(tokens.id, data.access_token);
  
  return {
    accessToken: data.access_token,
    instanceUrl: data.instance_url || tokens.instanceUrl
  };
}

/**
 * Make an authenticated API call to Salesforce
 * Automatically handles 401 errors by refreshing the token
 * @param {string} endpoint - API endpoint (relative to instance URL)
 * @param {string} method - HTTP method (GET, POST, PATCH, DELETE)
 * @param {Object} body - Request body (optional)
 * @returns {Object} API response data
 */
export async function salesforceApiCall(endpoint, method = 'GET', body = null) {
  let tokens = await getTokens();
  
  if (!tokens) {
    throw new Error('Not connected to Salesforce');
  }
  
  const makeRequest = async (accessToken, instanceUrl) => {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (body && (method === 'POST' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }
    
    const url = `${instanceUrl}${endpoint}`;
    return fetch(url, options);
  };
  
  // First attempt
  let response = await makeRequest(tokens.accessToken, tokens.instanceUrl);
  
  // If 401, try refreshing token and retry
  if (response.status === 401) {
    console.log('Access token expired, refreshing...');
    
    try {
      const newTokens = await refreshAccessToken();
      tokens = await getTokens(); // Get updated tokens
      response = await makeRequest(tokens.accessToken, tokens.instanceUrl);
    } catch (refreshError) {
      throw new Error(`Token refresh failed: ${refreshError.message}`);
    }
  }
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }
    throw new Error(`Salesforce API error (${response.status}): ${JSON.stringify(errorData)}`);
  }
  
  return response.json();
}

/**
 * Execute a SOQL query
 * @param {string} query - SOQL query string
 * @returns {Object} Query results
 */
export async function executeQuery(query) {
  const encodedQuery = encodeURIComponent(query);
  return salesforceApiCall(`/services/data/${SF_API_VERSION}/query?q=${encodedQuery}`);
}

/**
 * Get object describe/schema information
 * @param {string} objectName - Salesforce object API name
 * @returns {Object} Object metadata
 */
export async function describeObject(objectName) {
  return salesforceApiCall(`/services/data/${SF_API_VERSION}/sobjects/${objectName}/describe`);
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from OAuth callback
 * @param {string} codeVerifier - PKCE code verifier
 * @param {string} redirectUri - Callback redirect URI
 * @returns {Object} Token response
 */
export async function exchangeCodeForTokens(code, codeVerifier, redirectUri) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
    redirect_uri: redirectUri,
    code: code,
    code_verifier: codeVerifier
  });
  
  const response = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error}`);
  }
  
  return response.json();
}

/**
 * Build the Salesforce authorization URL
 * @param {string} redirectUri - Callback URL
 * @param {string} codeChallenge - PKCE code challenge
 * @param {string} state - State parameter
 * @returns {string} Full authorization URL
 */
export function buildAuthorizationUrl(redirectUri, codeChallenge, state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SF_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'api refresh_token',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state
  });
  
  return `${SF_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`;
}
