import crypto from 'crypto';

/**
 * Convert buffer to base64url encoding
 * (standard base64 but replace + with -, / with _, and remove = padding)
 */
function base64urlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a cryptographically random code verifier
 * @returns {string} 43-character base64url encoded string
 */
export function generateCodeVerifier() {
  const buffer = crypto.randomBytes(32);
  return base64urlEncode(buffer);
}

/**
 * Generate code challenge from verifier using SHA-256
 * @param {string} verifier - The code verifier
 * @returns {string} base64url encoded SHA-256 hash
 */
export function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64urlEncode(hash);
}

/**
 * Generate a unique state parameter for OAuth
 * @returns {string} State string combining timestamp and random value
 */
export function generateState() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * In-memory storage for PKCE verifiers with TTL cleanup
 * Key: state parameter
 * Value: { verifier, createdAt }
 */
const verifierStore = new Map();
const VERIFIER_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Store a code verifier with its associated state
 * @param {string} state - The state parameter
 * @param {string} verifier - The code verifier
 */
export function storeVerifier(state, verifier) {
  // Clean up expired entries first
  cleanupExpiredVerifiers();
  
  verifierStore.set(state, {
    verifier,
    createdAt: Date.now()
  });
}

/**
 * Retrieve and remove a code verifier by state
 * @param {string} state - The state parameter
 * @returns {string|null} The code verifier or null if not found/expired
 */
export function getVerifier(state) {
  const entry = verifierStore.get(state);
  
  if (!entry) {
    return null;
  }
  
  // Remove the entry (one-time use)
  verifierStore.delete(state);
  
  // Check if expired
  if (Date.now() - entry.createdAt > VERIFIER_TTL) {
    return null;
  }
  
  return entry.verifier;
}

/**
 * Remove expired verifiers from storage
 */
function cleanupExpiredVerifiers() {
  const now = Date.now();
  for (const [state, entry] of verifierStore.entries()) {
    if (now - entry.createdAt > VERIFIER_TTL) {
      verifierStore.delete(state);
    }
  }
}
