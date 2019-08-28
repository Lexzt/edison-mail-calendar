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
  // debugger;
  // const oldIds = oldEvents.map((item) => item.id);
  // const newPayload = [...oldEvents];

  // const storeEvents = oldEvents.filter(
  //   (e) =>
  //     e.providerType === user.providerType &&
  //     e.owner === user.email &&
  //     e.caldavType === user.caldavType
  // );

  // debugger;

  const nonUserEvents = oldEvents.filter(
    (e) =>
      e.providerType !== user.providerType &&
      e.owner !== user.email &&
      e.caldavType !== user.caldavType
  );

  const newPayload = [...nonUserEvents, ...newEvents];
  const newItemsId = newEvents.map((object) => object.id);
  const oldItemsId = oldEvents.map((object) => object.id);

  // newItems.forEach((e) => {
  //   const user = users.filter(
  //     (loopUser) =>
  //       e.providerType === loopUser.providerType &&
  //       e.owner === loopUser.email &&
  //       e.caldavType === loopUser.caldavType
  //   );

  //   // NewItemsId contains a list of events for a specific user,
  //   // OldItemsId contain the list of all events from the store.
  //   // So if the database did not give me back a new item
  //   if (!newItemsId.includes(e.id) && oldItemsId.includes(e.id)) {
  //     // This means it is a deleted item, so have to splice it
  //     const pos = newPayload.map((object) => object.id).indexOf(e.id);
  //     newPayload.splice(pos, 1);
  //   } else if (oldItemsId.includes(e.id)) {
  //     // If it is part of the old item list, it is an update
  //     const pos = newPayload.map((object) => object.id).indexOf(e.id);
  //     newPayload[pos] = e;
  //   } else {
  //     // It is a new item
  //     newPayload.push(e);
  //   }
  // });
  return newPayload;

  // if (storeEvents.length > newItems.length) {
  //   // When it reach here, it is a deleted item.
  //   // In order to determine if it is a new or old item
  //   // I need to find all the events for that user, and find if it is > or <
  //   storeEvents
  //     .map((object) => object.id)
  //     .filter((tempId) => !newItems.map((obj) => obj.id).includes(tempId))
  //     .forEach((id) => {
  //       debugger;
  //       const pos = storeEvents.map((object) => object.id).indexOf(id);
  //       newPayload.splice(pos, 1);
  //     });
  //   debugger;
  // } else {
  //   for (const newItem of newItems) {
  //     if (!oldIds.includes(newItem.id)) {
  //       // Add it into our calendar events, as it does not exist!
  //       newPayload.push(newItem);
  //     } else {
  //       // Find the previous item, and update it by whatever came in from server.
  //       const pos = newPayload.map((object) => object.id).indexOf(newItem.id);
  //       newPayload[pos] = newItem;
  //     }
  //   }
  // }
  // return newPayload;
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

    userEvents.set(
      user,
      oldEvents.filter(
        (e) =>
          e.providerType === user.providerType &&
          e.owner === user.email &&
          e.caldavType === user.caldavType
      )
    );
  });

  // As newEvents might have some or none, we need to think if we should append or delete it.
  const newPayload = [...nonUserEvents];
  const newEventsId = newEvents.map((object) => object.id);
  const oldEventsId = oldEvents.map((object) => object.id);

  newEvents.forEach((e) => {
    newPayload.push(e);

    // const user = users.filter(
    //   (loopUser) =>
    //     e.providerType === loopUser.providerType &&
    //     e.owner === loopUser.email &&
    //     e.caldavType === loopUser.caldavType
    // );

    // // NewItemsId contains a list of events for a specific user,
    // // OldItemsId contain the list of all events from the store.
    // // So if the database did not give me back a new item
    // if (!oldUserEventsId.includes(e.id)) {
    //   // This means it is a new item
    //   newPayload.push(e);
    // } else {
    //   newPayload.push(e);
    //   // If it is part of the old item list, it is an update
    //   const pos = newPayload.map((object) => object.id).indexOf(e.id);
    //   newPayload[pos] = e;
    // }
  });

  userEvents.forEach((v, k) => {
    console.log(k, v);
    const oldUserEventsId = v.map((object) => object.id);
    // if there is an old user event that is
    // 1. not in the new events and in the old events, it is an added event
    // 2. in the new events but not in the old events, it is a deleted event
    //  it is an old event
    oldUserEventsId.forEach((e) => {
      if (!newEventsId.includes(e.id)) {
        if (oldUserEventsId.includes(e.id)) {
          newPayload.push(e);
        }
        // debugger;
        // const pos = newPayload.map((object) => object.id).indexOf(e.id);
        // newPayload.splice(pos, 1);
      }
    });
  });

  // debugger;
  console.log(newPayload);
  return newPayload;

  // if (storeEvents.length > newItems.length) {
  //   // When it reach here, it is a deleted item.
  //   // In order to determine if it is a new or old item
  //   // I need to find all the events for that user, and find if it is > or <
  //   storeEvents
  //     .map((object) => object.id)
  //     .filter((tempId) => !newItems.map((obj) => obj.id).includes(tempId))
  //     .forEach((id) => {
  //       debugger;
  //       const pos = storeEvents.map((object) => object.id).indexOf(id);
  //       newPayload.splice(pos, 1);
  //     });
  //   debugger;
  // } else {
  //   for (const newItem of newItems) {
  //     if (!oldIds.includes(newItem.id)) {
  //       // Add it into our calendar events, as it does not exist!
  //       newPayload.push(newItem);
  //     } else {
  //       // Find the previous item, and update it by whatever came in from server.
  //       const pos = newPayload.map((object) => object.id).indexOf(newItem.id);
  //       newPayload[pos] = newItem;
  //     }
  //   }
  // }
  // return newPayload;
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
    case RETRIEVE_STORED_EVENTS: {
      return Object.assign({}, state, { providerType: action.payload.user.providerType });
    }
    case UPDATE_STORED_EVENTS: {
      const allEvents = mergeEvents(state.calEvents, action.payload.resp, action.payload.user);
      return Object.assign({}, state, { calEvents: allEvents });
    }
    case SUCCESS_STORED_EVENTS: {
      // debugger;
      const newEvents = storeEvents(state.calEvents, action.payload.resp, action.payload.user);
      // debugger;
      return Object.assign({}, state, { calEvents: newEvents });
    }

    // Sync stored events currently is not working.
    // It is currently syncing for one user only.
    // I need it to sync for every user that is valid.
    case SYNC_STORED_EVENTS: {
      // debugger;
      const newEvents = syncEvents(state.calEvents, action.payload);
      return Object.assign({}, state, { calEvents: newEvents });
    }
    case DUPLICATE_ACTION:
      return state;
    default:
      return state;
  }
}
