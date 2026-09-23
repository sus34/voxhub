import 'dotenv/config';
import path from 'node:path';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing required env var: ${name}`);
    console.error('[config] Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  return value;
}

const livekitUrl = required('LIVEKIT_URL');

export const config = {
  port: Number(process.env.PORT ?? 3000),

  // LiveKit SFU credentials — must match deploy/livekit.yaml
  livekitApiKey: required('LIVEKIT_API_KEY'),
  livekitApiSecret: required('LIVEKIT_API_SECRET'),

  // Public websocket URL of the SFU, e.g. wss://vox.example.com
  livekitUrl,

  // Where the server talks to LiveKit's API (to kick people). On the same box
  // that is the local port; by default derived from the public URL.
  livekitApiUrl:
    process.env.LIVEKIT_API_URL ?? livekitUrl.replace(/^ws(s?):\/\//, 'http$1://'),

  // The SQLite file lives here. Back it up and you have backed up the server.
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),

  // Channels created when the server is first set up; after that they live in
  // the database.
  seedChannels: (process.env.ROOMS ?? 'general,games,music')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean),

  // Short on purpose: LiveKit refreshes the token for connected clients, and
  // a short one limits how long a banned person could reuse theirs.
  tokenTtl: process.env.TOKEN_TTL ?? '10m',

  // How long "remember me" lasts. Sliding: using it renews it.
  sessionDays: Number(process.env.SESSION_DAYS ?? 90),

  // Fixed setup code, e.g. from an installer; otherwise one is generated and
  // printed to the log while the server is not set up yet.
  setupCode: process.env.SETUP_CODE || null,

  // Version the desktop app compares itself against.
  desktopVersion: process.env.DESKTOP_VERSION ?? '0.1.0',
};
