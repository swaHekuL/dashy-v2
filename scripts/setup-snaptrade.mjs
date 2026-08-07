/**
 * SnapTrade one-time setup script (personal API key flow).
 *
 * SnapTrade personal keys (PERS-... prefix) do NOT use the commercial
 * registerUser / userId / userSecret flow. Instead:
 *   - The user is pre-provisioned at signup — no registerUser call needed.
 *   - All API calls are authenticated via HMAC signing using clientId + consumerKey.
 *   - loginSnapTradeUser() with no userId/userSecret generates an OAuth portal URL
 *     for connecting brokerage accounts.
 *
 * This script:
 *   1. Reads SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY from the Pi's .env.local.
 *   2. Calls loginSnapTradeUser() to generate an OAuth URL.
 *   3. Prints the URL for manual browser visit to connect Fidelity accounts.
 *
 * IMPORTANT: credentials are read from the Pi over SSH and never written to local files.
 */

import { execSync } from 'child_process';
import os from 'os';
import { Snaptrade } from 'snaptrade-typescript-sdk';

const SSH_HOST = 'swahekul@192.168.68.62';
const SSH_KEY = `${os.homedir()}/.ssh/id_ed25519_dashy`;
const ENV_PATH = '~/dashy-v2/.env.local';

function ssh(cmd) {
  return execSync(`ssh -i "${SSH_KEY}" ${SSH_HOST} "${cmd}"`, { encoding: 'utf8' });
}

function parseEnv(raw) {
  const env = {};
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}

console.log('Reading credentials from Pi...');
const envRaw = ssh(`cat ${ENV_PATH}`);
const env = parseEnv(envRaw);

const clientId = env['SNAPTRADE_CLIENT_ID'];
const consumerKey = env['SNAPTRADE_CONSUMER_KEY'];

if (!clientId || !consumerKey) {
  console.error('ERROR: SNAPTRADE_CLIENT_ID or SNAPTRADE_CONSUMER_KEY not found in Pi .env.local');
  console.error('SSH the keys onto the Pi manually first.');
  process.exit(1);
}

// Personal keys (PERS-...) do NOT use userId/userSecret — the HMAC signing handles auth.
// No registerSnapTradeUser call is needed or available for personal keys.
const client = new Snaptrade({ auth: { mode: 'personalApiKey', clientId, consumerKey } });

console.log('Generating brokerage connection OAuth URL...');
const loginRes = await client.authentication.loginSnapTradeUser({});
// The SDK may return the URL as loginRes.data.redirectURI or loginRes.data (string) — handle both
const redirectUri = (typeof loginRes.data === 'string') ? loginRes.data : loginRes.data.redirectURI;

console.log('\n========================================');
console.log('Open this URL in your browser to connect your brokerage accounts:');
console.log(redirectUri);
console.log('========================================\n');
console.log('After connecting all accounts, your Portfolio panel will auto-populate on next fetch.');
