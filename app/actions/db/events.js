export const BEGIN_STORE_EVENTS = 'BEGIN_STORE_EVENTS';
export const FAIL_STORE_EVENTS = 'FAIL_STORE_EVENTS';
export const SUCCESS_STORED_EVENTS = 'SUCCESS_STORED_EVENTS';
export const UPDATE_STORED_EVENTS = 'UPDATE_STORED_EVENTS';
export const RETRIEVE_STORED_EVENTS = 'RETRIEVE_STORED_EVENTS';
export const SYNC_STORED_EVENTS = 'SYNC_STORED_EVENTS';
export const DUPLICATE_ACTION = 'DUPLICATE_ACTION';

export const beginStoringEvents = (payload) => ({
  type: BEGIN_STORE_EVENTS,
  payload
});

export const failStoringEvents = () => ({
  type: FAIL_STORE_EVENTS
});

export const successStoringEvents = (resp, users) => ({
  type: SUCCESS_STORED_EVENTS,
  payload: { resp, users }
});

export const updateStoredEvents = (resp, user) => ({
  type: UPDATE_STORED_EVENTS,
  payload: { resp, user }
});

export const retrieveStoreEvents = (user) => ({
  type: RETRIEVE_STORED_EVENTS,
  payload: { user }
});

export const syncStoredEvents = (resp) => ({
  type: SYNC_STORED_EVENTS,
  payload: resp
});

export const duplicateAction = () => ({
  type: DUPLICATE_ACTION
});
