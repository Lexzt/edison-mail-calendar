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

// Merge events is a tricky function.
// Currently, the goal of the function is to take two different providers,
// and append the events together.
// HOWEVER, when I delete an event, merge event is called, with the new items
// having one or more less element.
// Therefore, I need the function to remove from the new payload if it is missing
// from the newItems.
const mergeEvents = (oldEvents, newEvents, user) => {
  const nonUserEvents = oldEvents.filter(
    (e) =>
      e.providerType !== user.providerType &&
      e.owner !== user.email &&
      e.caldavType !== user.caldavType
  );

  const newPayload = [...nonUserEvents, ...newEvents];
  const newItemsId = newEvents.map((object) => object.id);
  const oldItemsId = oldEvents.map((object) => object.id);
  return newPayload;
};

const storeEvents = (oldEvents, newEvents, users) => {
  // debugger;
  const nonUserEvents = [];
  const userEvents = new Map();

  users.forEach((user) => {
    nonUserEvents.push(
      ...oldEvents.filter(
        (e) =>
          e.providerType !== user.providerType &&
          e.owner !== user.email &&
          e.caldavType !== user.caldavType
      )
    );

    if (user.providerType === 'CALDAV') {
      userEvents.set(
        user,
        oldEvents.filter(
          (e) =>
            e.providerType === user.providerType &&
            e.owner === user.email &&
            e.caldavType === user.caldavType
        )
      );
    } else if (user.providerType === 'EXCHANGE') {
      userEvents.set(
        user,
        oldEvents.filter((e) => e.providerType === user.providerType && e.owner === user.email)
      );
    }
  });

  // As newEvents might have some or none, we need to think if we should append or delete it.
  const newPayload = [...nonUserEvents];
  const newEventsId = newEvents.map((object) => object.id);
  const oldEventsId = oldEvents.map((object) => object.id);

  newEvents.forEach((e) => {
    newPayload.push(e);
  });

  userEvents.forEach((v, k) => {
    const oldUserEventsId = v.map((object) => object.id);
    // if there is an old user event that is
    // 1. not in the new events and in the old events, it is an added event
    // 2. in the new events but not in the old events, it is a deleted event
    //  it is an old event
    oldUserEventsId.forEach((id) => {
      if (!newEventsId.includes(id)) {
        if (oldUserEventsId.includes(id)) {
          newPayload.push(v.filter((e) => e.id === id)[0]);
        }
      }
    });
  });

  console.log(newPayload);
  return newPayload;
};

const syncEvents = (oldEvents, newEvents) => {
  const newPayload = [...oldEvents];
  for (const newEvent of newEvents) {
    const pos = newPayload.map((object) => object.id).indexOf(newEvent.event.id);
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
    case RETRIEVE_STORED_EVENTS: {
      return Object.assign({}, state, { providerType: action.payload.user.providerType });
    }
    case UPDATE_STORED_EVENTS: {
      const allEvents = mergeEvents(state.calEvents, action.payload.resp, action.payload.user);
      return Object.assign({}, state, { calEvents: allEvents });
    }
    case SUCCESS_STORED_EVENTS: {
      const newEvents = storeEvents(state.calEvents, action.payload.resp, action.payload.users);
      return Object.assign({}, state, { calEvents: newEvents });
    }

    // Sync stored events currently is not working.
    // It is currently syncing for one user only.
    // I need it to sync for every user that is valid.
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
