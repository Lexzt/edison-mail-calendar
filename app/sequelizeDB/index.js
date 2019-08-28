import path from 'path';
import fs from 'fs';
import Sequelize from 'sequelize';

let db;
export const getdb = () => {
  if (db) {
    return db;
  }
  // const configDirPath = AppEnv.getConfigDirPath();
  // const dbPath = path.join(configDirPath, 'calendar-db');

  const configDirPath = '../';
  const dbPath = path.join(configDirPath, 'calendar-db');
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
  }
  console.log('****storage', `${dbPath}/calendar-db.sqlite`);
  db = new Sequelize({
    dialect: 'sqlite',
    storage: `calendar-db.sqlite`,
    logging: false
    // storage: `${dbPath}/calendar-db.sqlite`
  });
  return db;
};

export default getdb;
