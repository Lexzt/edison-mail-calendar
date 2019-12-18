import Sequelize, { Model } from 'sequelize';
import getDb from '../index';

const db = getDb();

export default class PendingActions extends Model {}
PendingActions.init(
  {
    uniqueId: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    eventId: {
      type: Sequelize.STRING
    },
    status: {
      type: Sequelize.STRING
    },
    type: {
      type: Sequelize.STRING
    },
    recurrenceType: {
      type: Sequelize.STRING
    }
  },
  {
    sequelize: db,
    modelName: 'pendingactions'
  }
);
PendingActions.sync();
db.pendingactions = PendingActions;
