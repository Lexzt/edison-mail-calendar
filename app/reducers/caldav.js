import * as CalDavActions from '../actions/caldav';
import * as DbCalDavActions from '../actions/db/caldav';

const initialState = {
  account: {},
  calendars: [],
  eventPersons: [],
  events: [],
  creatingAccount: false,
  storingCalDavObjects: false,
  createAccountError: '',
  storingCalDavObjectsError: ''
};

export const processObjects = (objects, colName) => {
  const results = [];
  objects.forEach((object) => {
    if (object.collection.name === colName) {
      results.push(object.toJSON());
    }
  });
  return results;
};

export default function caldavReducer(state = initialState, action) {
  switch (action.type) {
    case CalDavActions.BEGIN_CREATE_ACCOUNT:
      return Object.assign({}, state, { creatingAccount: true });
    case CalDavActions.SUCCESS_CREATE_ACCOUNT:
      return Object.assign({}, state, {
        creatingAccount: false,
        account: action.payload
      });
    case CalDavActions.FAIL_CREATE_ACCOUNT:
      return Object.assign({}, state, {
        creatingAccount: false,
        createAccountError: action.payload
      });
    case CalDavActions.CREATE_CALENDAR_OBJECT:
      return state;
    case CalDavActions.UPDATE_CALENDAR_OBJECT:
      return state;
    case CalDavActions.DELETE_CALENDAR_OBJECT:
      return state;
    case CalDavActions.SYNC_CALENDAR:
      return state;
    case CalDavActions.SYNC_CALDAV_ACCOUNT:
      return state;
    case DbCalDavActions.BEGIN_STORE_CALDAV_OBJECTS:
      return Object.assign({}, state, { storingCalDavObjects: true });
    case DbCalDavActions.SUCCESS_STORE_CALDAV_OBJECTS:
      return Object.assign({}, state, {
        storingCalDavObjects: false,
        calendars: processObjects(action.payload, 'calendars'),
        events: processObjects(action.payload, 'events')
      });
    case DbCalDavActions.FAIL_STORE_CALDAV_OBJECTS:
      return Object.assign({}, state, {
        storingCalDavObjects: false,
        storingCalDavObjectsError: ''
      });
    default:
      return state;
  }
}
