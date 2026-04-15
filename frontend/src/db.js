import Dexie from 'dexie';

export const db = new Dexie('AlgoBlocksDB');

// Define your local schema
db.version(1).stores({
  projects: '++id, title, owner_id, last_modified, is_synced', // is_synced tracks cloud status
  user_progress: 'email, last_path'
});