# Actabl Salesforce Integration

A Node.js/Express application that handles Salesforce OAuth 2.0 authentication with PKCE (Proof Key for Code Exchange). Designed for deployment on Railway.

## Features

- **OAuth 2.0 with PKCE**: Secure authorization code flow with proof key
- **Token Management**: Automatic token storage and refresh
- **Salesforce API Integration**: Query accounts, custom objects, and object schemas
- **PostgreSQL Storage**: Persistent token storage
- **Modern UI**: Clean dashboard for connection management

## Prerequisites

- Node.js v18 or later
- PostgreSQL database
- Salesforce Connected App with OAuth enabled

## Local Development

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your credentials.

3. **Start PostgreSQL** (if running locally)

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open** http://localhost:3000

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SF_CLIENT_ID` | Salesforce Connected App Consumer Key |
| `SF_CLIENT_SECRET` | Salesforce Connected App Consumer Secret |
| `SF_LOGIN_URL` | Salesforce login URL (default: https://login.salesforce.com) |
| `NODE_ENV` | Environment (development/production) |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard - shows connection status |
| `/auth` | GET | Initiates OAuth flow |
| `/callback` | GET | OAuth callback handler |
| `/test` | GET | Test connection - queries Accounts |
| `/leads` | GET | Query Actabl_Lead__c custom object |
| `/schema` | GET | Get Actabl_Lead__c object metadata |
| `/disconnect` | POST | Clear stored tokens |
| `/health` | GET | Health check endpoint |

## Railway Deployment

1. **Create a new Railway project**

2. **Add PostgreSQL database:**
   - Click "New" → "Database" → "PostgreSQL"
   - Railway automatically provides `DATABASE_URL`

3. **Deploy the application:**
   - Connect your GitHub repository, or
   - Use Railway CLI: `railway up`

4. **Set environment variables** in Railway dashboard:
   - `SF_CLIENT_ID`
   - `SF_CLIENT_SECRET`
   - `SF_LOGIN_URL`
   - `NODE_ENV=production`

5. **Update Salesforce Connected App:**
   - Add Railway domain to callback URLs:
   - `https://[YOUR-RAILWAY-DOMAIN]/callback`

## Database Schema

The application automatically creates the required table on startup:

```sql
CREATE TABLE salesforce_tokens (
  id SERIAL PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  instance_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Project Structure

```
project-root/
├── server.js           # Main Express application
├── db.js               # PostgreSQL connection and queries
├── utils/
│   ├── pkce.js         # PKCE generation functions
│   └── salesforce.js   # Salesforce API helper functions
├── .env.example        # Environment variables template
├── package.json
├── Procfile           # Railway/Heroku process file
└── README.md
```

## Security Notes

- Client secret is never exposed to client-side code
- PKCE verifiers are stored in memory with 30-minute TTL
- Tokens are automatically refreshed on 401 errors
- HTTPS is enforced in production (provided by Railway)

## Troubleshooting

### "Invalid or expired state parameter"
The OAuth flow took too long (>30 minutes). Start again from the dashboard.

### "Token refresh failed"
The refresh token may have been revoked in Salesforce. Disconnect and reconnect.

### Database connection errors
Verify `DATABASE_URL` is correctly set and the database is accessible.
