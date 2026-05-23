@AGENTS.md

## Project

Passive auto-rotating Next.js 16.2.6 (Turbopack) dashboard for Raspberry Pi 3B+ (800×480). 5 panels cycle every 7s: weather → calendar → gmail → news → steam.

## Config Files

- `config/credentials.json` — gitignored, Google OAuth secrets
- `config/settings.json` — tracked in git, non-sensitive (lat/lon for Open-Meteo weather)

## Pi Deployment

- SSH: `ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.59`
- Node via nvm: prefix commands with `export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH &&`
- Deploy from PowerShell (single quotes prevent $PATH expansion):
  `ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.59 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'`
- Logs: `~/dashy.log` on Pi

## Gotchas

- **SSR hydration**: Never `useState(new Date())` — use `useState(null)` + useEffect to set client-side
- **setData + await**: Resolve before updater: `const json = await res.json(); setData(prev => ({ ...prev, [panel]: json }))`
- **API routes are ESM**: `import x from '...'` only — `require()` throws ReferenceError at runtime
- **googleapis timeout**: Second argument only: `client.method(params, { timeout: 8000 })` — silently ignored inside params
