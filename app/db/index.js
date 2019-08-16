import * as RxDB from 'rxdb';
import schemas from './schemas';

RxDB.plugin(require('pouchdb-adapter-node-websql'));

let dbPromise = null;

export const createDb = async () => {
  const db = await RxDB.create({
    name: 'eventsdb',
    adapter: 'websql',
    queryChangeDetection: true
  });
  window.db = db;
  await Promise.all(
    Object.entries(schemas).map(([name, schema]) => db.collection({ name, schema }))
  );
  return db;
};

export const clearDb = async () => {
  await dbPromise.remove();
  await dbPromise.destroy();
};

export default () => {
  if (!dbPromise) {
    dbPromise = createDb();
  }
  return dbPromise;
};
