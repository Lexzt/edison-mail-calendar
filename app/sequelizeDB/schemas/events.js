import Sequelize, { Model } from 'sequelize';
import getDb from '../index';

const db = getDb();

export default class Events extends Model {}
Events.init(
  {
    id: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    originalId: {
      type: Sequelize.STRING
    },
    htmlLink: {
      type: Sequelize.STRING
    },
    status: {
      type: Sequelize.STRING,
      defaultValue: 'confirmed'
    },
    created: {
      type: Sequelize.STRING
    },
    updated: {
      type: Sequelize.STRING
    },
    summary: {
      type: Sequelize.STRING
    },
    description: {
      type: Sequelize.STRING,
      defaultValue: 'confirmed'
    },
    location: {
      type: Sequelize.STRING,
      defaultValue: 'confirmed'
    },
    colorId: {
      type: Sequelize.STRING
    },
    creator: {
      type: Sequelize.STRING
    },
    organizer: {
      type: Sequelize.STRING
    },
    start: {
      type: Sequelize.JSON
    },
    end: {
      type: Sequelize.JSON
    },
    endTimeUnspecified: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    recurrence: {
      type: Sequelize.ARRAY(Sequelize.RANGE(Sequelize.STRING))
    },
    recurringEventId: {
      type: Sequelize.STRING
    },
    originalStartTime: {
      type: Sequelize.JSON
    },
    transparency: {
      type: Sequelize.STRING
    },
    visibility: {
      type: Sequelize.STRING
    },
    iCalUID: {
      type: Sequelize.STRING
    },
    sequence: {
      type: Sequelize.INTEGER
    },
    attendee: {
      type: Sequelize.STRING
    },
    anyoneCanAddSelf: {
      type: Sequelize.BOOLEAN
    },
    guestsCanInviteOthers: {
      type: Sequelize.BOOLEAN
    },
    guestsCanModify: {
      type: Sequelize.BOOLEAN
    },
    guestsCanSeeOtherGuests: {
      type: Sequelize.BOOLEAN
    },
    privateCopy: {
      type: Sequelize.BOOLEAN
    },
    locked: {
      type: Sequelize.BOOLEAN
    },
    allDay: {
      type: Sequelize.BOOLEAN
    },
    calendarId: {
      type: Sequelize.STRING
    },
    hangoutLink: {
      type: Sequelize.STRING
    },
    source: {
      type: Sequelize.JSON
    },
    providerType: {
      type: Sequelize.STRING
    },
    caldavType: {
      type: Sequelize.STRING
    },
    owner: {
      // email that it belongs to as exchange users might not have email
      type: Sequelize.STRING
    },
    incomplete: {
      // incomplete is a flag to mark that it was just created and might not be complete
      type: Sequelize.BOOLEAN
    },
    local: {
      // local for dealing with pending actions
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    hide: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    createdOffline: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    isRecurring: {
      type: Sequelize.BOOLEAN
    },
    isModifiedThenDeleted: {
      type: Sequelize.BOOLEAN
    },
    caldavUrl: {
      type: Sequelize.STRING
    },
    etag: {
      type: Sequelize.STRING
    },
    iCALString: {
      type: Sequelize.TEXT
    },
    isMaster: {
      type: Sequelize.BOOLEAN
    }
  },
  {
    sequelize: db,
    modelName: 'events'
  }
);
Events.sync();
db.events = Events;
