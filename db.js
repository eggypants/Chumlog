import { TABLES, LEGACY_TABLES, SCHEMA_VERSION, makeBackup, validateBackup, migrateV1 } from './model.js';

// Separate databases for different deployment paths on the same GitHub Pages origin.
const DB_NAME = `chumlog:${new URL('.', import.meta.url).pathname}`;
let connection;
const req = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const completed = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('ABORTED')); });
export async function openDB() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    request.onupgradeneeded = event => {
      const db = request.result, tx = request.transaction;
      if (event.oldVersion === 0) {
        for (const table of TABLES) {
          const store = db.createObjectStore(table, { keyPath: 'id' });
          if (table !== 'people') store.createIndex('personId', 'personId');
        }
        db.createObjectStore('meta', { keyPath: 'id' });
      } else if (event.oldVersion === 1) {
        // All reads/writes and the store removal share the upgrade transaction.
        // Failure rolls everything back to v1; no partial migration is visible.
        const dates = db.createObjectStore('importantDates', { keyPath: 'id' });
        dates.createIndex('personId', 'personId');
        const legacy = {};
        let remaining = LEGACY_TABLES.length;
        for (const table of LEGACY_TABLES) {
          const read = tx.objectStore(table).getAll();
          read.onsuccess = () => {
            legacy[table] = read.result;
            if (--remaining) return;
            try {
              const migrated = migrateV1(legacy);
              for (const name of TABLES) {
                const store = tx.objectStore(name);
                store.clear();
                for (const row of migrated[name]) store.add(row);
              }
              db.deleteObjectStore('things');
              const revision = tx.objectStore('meta').get('revision');
              revision.onsuccess = () => tx.objectStore('meta').put({ id: 'revision', value: (revision.result?.value || 0) + 1 });
            } catch { tx.abort(); }
          };
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { connection = null; reject(new Error('BLOCKED')); };
  });
  return connection;
}
export async function snapshot() {
  const db = await openDB();
  const tx = db.transaction([...TABLES, 'meta'], 'readonly');
  const done = completed(tx);
  const requests = TABLES.map(k => req(tx.objectStore(k).getAll()));
  const revision = req(tx.objectStore('meta').get('revision'));
  const rows = await Promise.all(requests);
  const rev = await revision;
  await done;
  return { data: Object.fromEntries(TABLES.map((k, i) => [k, rows[i]])), revision: rev?.value || 0 };
}
async function write(work) {
  const db = await openDB();
  const tx = db.transaction([...TABLES, 'meta'], 'readwrite');
  const done = completed(tx);
  try {
    const revision = (await req(tx.objectStore('meta').get('revision')))?.value || 0;
    await work(tx, revision);
    tx.objectStore('meta').put({ id: 'revision', value: revision + 1 });
    await done;
  } catch (error) {
    try { tx.abort(); } catch { /* Already completed/aborted. */ }
    await done.catch(() => {});
    throw error;
  }
}
async function checkExisting(store, original, id) {
  const existing = await req(store.get(id));
  const matches = existing && original && Object.keys(existing).length === Object.keys(original).length && Object.entries(original).every(([key,value]) => existing[key] === value);
  if (original ? !matches : existing !== undefined) throw new Error('CONFLICT');
}
export async function saveRecord(table, values, original = null) {
  if (!TABLES.includes(table)) throw new Error('TABLE');
  const timestamp = [new Date().toISOString(), original?.updatedAt || '', original?.createdAt || ''].sort().at(-1);
  const record = { ...values, id: original?.id || crypto.randomUUID(), createdAt: original?.createdAt || timestamp, updatedAt: timestamp };
  await write(async tx => {
    const store = tx.objectStore(table);
    await checkExisting(store, original, record.id);
    if (table !== 'people' && !await req(tx.objectStore('people').get(record.personId))) throw new Error('PERSON_MISSING');
    store.put(record);
  });
  return record;
}
export async function removeRecord(table, original) {
  await write(async tx => {
    await checkExisting(tx.objectStore(table), original, original.id);
    tx.objectStore(table).delete(original.id);
    if (table === 'people') {
      for (const child of TABLES.slice(1)) {
        const store = tx.objectStore(child);
        const keys = await req(store.index('personId').getAllKeys(original.id));
        for (const key of keys) store.delete(key);
      }
    }
  });
}
export async function replaceAll(backup, expectedRevision) {
  const data = validateBackup(backup);
  await write(async (tx, revision) => {
    if (revision !== expectedRevision) throw new Error('STALE_IMPORT');
    for (const table of TABLES) {
      const store = tx.objectStore(table);
      store.clear();
      for (const row of data[table]) store.add(row);
    }
  });
}
export const deleteAll = expectedRevision => replaceAll(makeBackup(Object.fromEntries(TABLES.map(k => [k, []]))), expectedRevision);
