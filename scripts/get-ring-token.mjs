import { RingApi } from 'ring-client-api';
import { createInterface } from 'readline';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

const email    = await ask('Ring email: ');
const password = await ask('Ring password: ');

let token = null;

const mkApi = (extra = {}) => new RingApi({
  email,
  password,
  ...extra,
  onRefreshTokenUpdated: (t) => { token = t; },
});

// First attempt — Ring will send a 2FA code to your phone/email
try {
  await mkApi().getProfile();
} catch (e) {
  if (!/two.factor|verification|code/i.test(e.message)) throw e;
  const code = await ask('2FA code sent to your phone: ');
  await mkApi({ twoFactorAuthCode: code }).getProfile();
}

rl.close();

if (!token) {
  console.error('ERROR: no refresh token received — check credentials and try again');
  process.exit(1);
}

const envPath = resolve(process.cwd(), '.env.local');
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
if (/^RING_REFRESH_TOKEN=/m.test(env)) {
  env = env.replace(/^RING_REFRESH_TOKEN=.*/m, `RING_REFRESH_TOKEN=${token}`);
} else {
  env = env.trimEnd() + `\nRING_REFRESH_TOKEN=${token}\n`;
}
writeFileSync(envPath, env);
console.log(`✓ RING_REFRESH_TOKEN written to .env.local`);
