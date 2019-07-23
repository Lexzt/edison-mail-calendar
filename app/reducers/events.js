import {
  UPDATE_STORED_EVENTS,
  SUCCESS_STORED_EVENTS,
  RETRIEVE_STORED_EVENTS,
  DUPLICATE_ACTION,
  SYNC_STORED_EVENTS
} from '../actions/db/events';
import { EDIT_EVENT_BEGIN_CALDAV } from '../actions/events';
import { BEGIN_DELETE_CALENDAR_OBJECT, FAIL_DELETE_CALENDAR_OBJECT } from '../actions/caldav';

const initialState = {
  calEvents: [],
  deletedEventId: '',
  deleteError: '',
  updateEventObject: ''
};

const mergeEvents = (oldEvents, newItems) => {
  const oldIds = oldEvents.map((item) => item.id);
  const newPayload = [...oldEvents];

  for (const newItem of newItems) {
    if (!oldIds.includes(newItem.id)) {
      // Add it into our calendar events, as it does not exist!
      newPayload.push(newItem);
    } else {
      // Find the previous item, and update it by whatever came in from server.
      const pos = newPayload.map((object) => object.id).indexOf(newItem.id);
      newPayload[pos] = newItem;
    }
  }
  return newPayload;
};

const syncEvents = (oldEvents, newEvents) => {
  const newPayload = [...oldEvents];
  // console.log(oldEvents, newEvents);
  debugger;
  for (const newEvent of newEvents) {
    const pos = newPayload.map((object) => object.id).indexOf(newEvent.event.id);
    // console.log(pos);
    switch (newEvent.type) {
      case 'create':
        newPayload.push(newEvent.event);
        break;
      case 'delete':
        newPayload.splice(pos, 1);
        break;
      case 'update':
        newPayload[pos] = newEvent.event;
        break;
      default:
        break;
    }
  }
  return newPayload;
};

const hideEvent = (calEvents, deletedEventId) => {
  const newEvents = [];
  calEvents.forEach((calEvent) => {
    if (calEvent.id !== deletedEventId) {
      newEvents.push(calEvent);
    }
  });
  return newEvents;
};

export default function eventsReducer(state = initialState, action) {
  if (action === undefined) {
    return state;
  }
  switch (action.type) {
    case RETRIEVE_STORED_EVENTS:
      return Object.assign({}, state, { providerType: action.providerType });
    case UPDATE_STORED_EVENTS:
      return Object.assign({}, state, { calEvents: action.payload.resp });
    case SUCCESS_STORED_EVENTS: {
      const newEvents = mergeEvents(state.calEvents, action.payload);
      return Object.assign({}, state, { calEvents: newEvents });
    }
    case SYNC_STORED_EVENTS: {
      const newEvents = syncEvents(state.calEvents, action.payload);
      return Object.assign({}, state, { calEvents: newEvents });
    }
    case DUPLICATE_ACTION:
      return state;
    case BEGIN_DELETE_CALENDAR_OBJECT: {
      return Object.assign({}, state, { deletedEventId: action.payload });
    }
    case FAIL_DELETE_CALENDAR_OBJECT:
      return Object.assign({}, state, {
        deletedEventId: '',
        deleteError: action.payload
      });
    case EDIT_EVENT_BEGIN_CALDAV:
      return Object.assign({}, state, {
        updateEventObject: action.payload
      });
    default:
      return state;
  }
}
