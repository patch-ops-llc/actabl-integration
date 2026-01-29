import pg from 'pg';
const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Initialize the database schema
 */
export async function initializeDatabase() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS salesforce_tokens (
      id SERIAL PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      instance_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  try {
    await pool.query(createTableQuery);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  }
}

/**
 * Store OAuth tokens in database
 * @param {string} accessToken - Salesforce access token
 * @param {string} refreshToken - Salesforce refresh token
 * @param {string} instanceUrl - Salesforce instance URL
 */
export async function storeTokens(accessToken, refreshToken, instanceUrl) {
  // First, delete any existing tokens (single org for now)
  await pool.query('DELETE FROM salesforce_tokens');
  
  const insertQuery = `
    INSERT INTO salesforce_tokens (access_token, refresh_token, instance_url)
    VALUES ($1, $2, $3)
    RETURNING id;
  `;
  
  const result = await pool.query(insertQuery, [accessToken, refreshToken, instanceUrl]);
  return result.rows[0].id;
}

/**
 * Retrieve stored tokens from database
 * @returns {Object|null} Token object or null if not found
 */
export async function getTokens() {
  const query = 'SELECT * FROM salesforce_tokens ORDER BY id DESC LIMIT 1';
  const result = await pool.query(query);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return {
    accessToken: result.rows[0].access_token,
    refreshToken: result.rows[0].refresh_token,
    instanceUrl: result.rows[0].instance_url,
    id: result.rows[0].id
  };
}

/**
 * Update access token after refresh
 * @param {number} id - Token record ID
 * @param {string} newAccessToken - New access token
 */
export async function updateAccessToken(id, newAccessToken) {
  const updateQuery = `
    UPDATE salesforce_tokens
    SET access_token = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2;
  `;
  
  await pool.query(updateQuery, [newAccessToken, id]);
}

/**
 * Delete all stored tokens
 */
export async function deleteTokens() {
  await pool.query('DELETE FROM salesforce_tokens');
}

/**
 * Check if tokens exist
 * @returns {boolean} True if tokens exist
 */
export async function hasTokens() {
  const result = await pool.query('SELECT COUNT(*) FROM salesforce_tokens');
  return parseInt(result.rows[0].count) > 0;
}

// Export pool for direct queries if needed
export { pool };
