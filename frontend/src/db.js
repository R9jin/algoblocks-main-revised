// frontend/src/db.js
import Dexie from 'dexie';

export const db = new Dexie('AlgoBlocksDB');
db.version(1).stores({
  // 'isSynced' tracks if local changes have reached MongoDB
  projects: '++id, _id, title, data, owner_id, last_modified, isSynced, isTemplate, category',
  user_progress: 'email, last_path'
});