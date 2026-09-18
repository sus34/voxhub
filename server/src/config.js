import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing required env var: ${name}`);
    console.error('[config] Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),

  // LiveKit SFU credentials — must match deploy/livekit.yaml
  livekitApiKey: required('LIVEKIT_API_KEY'),
  livekitApiSecret: required('LIVEKIT_API_SECRET'),

  // Public websocket URL of the SFU, e.g. wss://vox.example.com
  livekitUrl: required('LIVEKIT_URL'),

  // Single shared password for the whole server. Five friends, no user database.
  serverPassword: required('SERVER_PASSWORD'),

  // Fixed channel list, Discord style.
  rooms: (process.env.ROOMS ?? 'general,games,music')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean),

  tokenTtl: process.env.TOKEN_TTL ?? '12h',

  // Version the desktop app compares itself against.
  desktopVersion: process.env.DESKTOP_VERSION ?? '0.1.0',
};
