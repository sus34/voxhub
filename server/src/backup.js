import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Copies the live database into one consistent file, without stopping the
 * server: `node src/backup.js /data/backup.db`. A plain `cp` of a WAL-mode
 * database can catch it mid-write and give you a broken copy.
 */

const dest = process.argv[2];
if (!dest) {
  console.error('usage: node src/backup.js <file>');
  process.exit(2);
}

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');
const db = new Database(path.join(dataDir, 'voxhub.db'), { readonly: true, fileMustExist: true });

await db.backup(dest);
db.close();
console.log(dest);
