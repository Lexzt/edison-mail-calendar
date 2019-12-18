import Sequelize, { Model, DataTypes } from 'sequelize';
import getDb from '../index';

const db = getDb();

export default class RecurrencePatterns extends Model {}
RecurrencePatterns.init(
  {
    id: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    recurringTypeId: {
      type: Sequelize.STRING
    },
    originalId: {
      type: Sequelize.STRING
    },
    freq: {
      type: Sequelize.STRING
    },
    interval: {
      type: Sequelize.INTEGER,
      defaultValue: 1
    },
    until: {
      type: Sequelize.STRING
    },

    wkSt: {
      type: Sequelize.STRING
    },

    exDates: {
      type: DataTypes.STRING,
      defaultValue: ''
    },
    recurrenceIds: {
      type: Sequelize.STRING,
      defaultValue: ''
    },

    modifiedThenDeleted: {
      type: Sequelize.BOOLEAN
    },
    weeklyPattern: {
      // type: Sequelize.ARRAY(Sequelize.RANGE(Sequelize.INTEGER))
      type: Sequelize.STRING
    },

    numberOfRepeats: {
      type: Sequelize.INTEGER
    },
    isCount: {
      type: Sequelize.BOOLEAN
    },

    iCalUID: {
      type: Sequelize.STRING
    },
    iCALString: {
      type: Sequelize.STRING
    },

    byWeekNo: {
      type: Sequelize.STRING,
      default: ''
    },
    byWeekDay: {
      type: Sequelize.STRING,
      default: ''
    },
    byMonth: {
      type: Sequelize.STRING,
      defaultValue: ''
    },
    byMonthDay: {
      type: Sequelize.STRING,
      defaultValue: ''
    },
    byYearDay: {
      type: Sequelize.STRING,
      defaultValue: ''
    },

    byHour: {
      type: Sequelize.STRING,
      defaultValue: ''
    },
    byMinute: {
      type: Sequelize.STRING,
      default: ''
    },
    bySecond: {
      type: Sequelize.STRING,
      defaultValue: ''
    },
    byEaster: {
      type: Sequelize.STRING,
      defaultValue: ''
    },
    bySetPos: {
      type: Sequelize.STRING,
      defaultValue: ''
    }
  },
  {
    sequelize: db,
    modelName: 'recurrencepatterns'
  }
);
RecurrencePatterns.sync();
db.recurrencepatterns = RecurrencePatterns;
