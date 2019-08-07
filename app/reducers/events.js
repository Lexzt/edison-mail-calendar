import {
  UPDATE_STORED_EVENTS,
  SUCCESS_STORED_EVENTS,
  RETRIEVE_STORED_EVENTS,
  DUPLICATE_ACTION,
  SYNC_STORED_EVENTS
} from '../actions/db/events';

const initialState = {
  calEvents: []
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
  // debugger;
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
    default:
      return state;
  }
}
