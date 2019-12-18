import Sequelize, { Model } from 'sequelize';
import getDb from '../index';

const db = getDb();

export default class Users extends Model {}
Users.init(
  {
    personId: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    originalId: {
      type: Sequelize.STRING
    },
    email: {
      type: Sequelize.STRING
    },
    providerType: {
      type: Sequelize.STRING
    },
    accessToken: {
      type: Sequelize.STRING
    },
    accessTokenExpiry: {
      type: Sequelize.INTEGER
    },
    password: {
      type: Sequelize.STRING
    },
    url: {
      type: Sequelize.STRING
    },
    caldavType: {
      type: Sequelize.STRING
    }
  },
  {
    sequelize: db,
    modelName: 'users'
  }
);
Users.sync();
db.users = Users;
