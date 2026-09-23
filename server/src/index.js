import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomServiceClient } from 'livekit-server-sdk';
import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { newSetupCode } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = openDb(path.join(config.dataDir, 'voxhub.db'));
const roomService = new RoomServiceClient(
  config.livekitApiUrl,
  config.livekitApiKey,
  config.livekitApiSecret,
);

// Valid until someone sets the server up. A new one on every restart unless
// the installer pinned it with SETUP_CODE.
const setupCode = config.setupCode ?? newSetupCode();
const needsSetup = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;

const app = createApp({
  db,
  config,
  roomService,
  getSetupCode: () => setupCode,
  webDist: path.resolve(__dirname, '../../web/dist'),
  downloadDir: path.resolve(__dirname, '../../download'),
});

app.listen(config.port, () => {
  console.log(`[voxhub] token server on :${config.port}`);
  console.log(`[voxhub] SFU: ${config.livekitUrl}`);
  console.log(`[voxhub] data: ${config.dataDir}`);
  if (needsSetup()) {
    console.log('[voxhub] ---------------------------------------------');
    console.log('[voxhub] Сервер ещё не настроен. Открой его в браузере');
    console.log(`[voxhub] и введи код настройки: ${setupCode}`);
    console.log('[voxhub] ---------------------------------------------');
  }
});
