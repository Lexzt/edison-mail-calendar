import Sequelize, { Model } from 'sequelize';
import getDb from '../index';

const db = getDb();

export default class EventPersons extends Model {}
EventPersons.init(
  {
    eventPersonId: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    eventId: {
      type: Sequelize.STRING
    },
    personId: {
      type: Sequelize.STRING
    }
  },
  {
    sequelize: db,
    modelName: 'eventpersons'
  }
);
// EventPersons.sync().then(tableCompletedSync);
EventPersons.sync();
db.eventPersons = EventPersons;
