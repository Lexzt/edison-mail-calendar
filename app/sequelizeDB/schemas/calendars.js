import Sequelize, { Model } from 'sequelize';
import getDb from '../index';

const db = getDb();

export default class Calendars extends Model {}
Calendars.init(
  {
    calendarId: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    ownerId: {
      type: Sequelize.STRING
    },
    name: {
      type: Sequelize.STRING
    },
    description: {
      type: Sequelize.STRING
    },
    location: {
      type: Sequelize.STRING
    },
    timezone: {
      type: Sequelize.STRING
    },
    url: {
      type: Sequelize.STRING
    }
  },
  {
    sequelize: db,
    modelName: 'calendars'
  }
);
// Calendars.sync().then(tableCompletedSync);
Calendars.sync();
db.calendars = Calendars;
