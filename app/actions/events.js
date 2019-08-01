export const GET_EVENTS_BEGIN = 'GET_EVENTS_BEGIN';
export const GET_EVENTS_SUCCESS = 'GET_EVENTS_SUCCESS';
export const GET_EVENTS_FAILURE = 'GET_EVENTS_FAILURE';

export const POST_EVENT_BEGIN = 'POST_EVENT_BEGIN';
export const POST_EVENT_SUCCESS = 'POST_EVENT_SUCCESS';
export const POST_EVENT_FAILURE = 'POST_EVENT_FAILURE';

export const MOVE_EVENT_BEGIN = 'BEGIN_MOVE_EVENT';
export const MOVE_EVENT_SUCCESS = 'MOVE_EVENT_SUCCESS';
export const MOVE_EVENT_FAILURE = 'MOVE_EVENT_FAILURE';

export const EDIT_EVENT_BEGIN = 'EDIT_EVENT_BEGIN';
export const EDIT_EVENT_SUCCESS = 'EDIT_EVENT_SUCCESS';
export const EDIT_EVENT_FAILURE = 'EDIT_EVENT_FAILURE';

export const EDIT_EVENT_BEGIN_CALDAV = 'EDIT_EVENT_BEGIN_CALDAV';

export const QUICK_ADD_EVENT_BEGIN = 'QUICK_ADD_EVENT_BEGIN';
export const QUICK_ADD_EVENT_SUCCESS = 'QUICK_ADD_EVENT_SUCCESS';
export const QUICK_ADD_EVENT_FAILURE = 'QUICK_ADD_EVENT_FAILURE';

export const UPDATE_EVENTS_BEGIN = 'UPDATE_EVENTS_BEGIN';
export const UPDATE_EVENTS_SUCCESS = 'UPDATE_EVENTS_SUCCESS';
export const UPDATE_EVENTS_FAILURE = 'UPDATE_EVENTS_FAILURE';

export const DELETE_EVENT_BEGIN = 'DELETE_EVENT_BEGIN';
export const DELETE_EVENT_SUCCESS = 'DELETE_EVENT_SUCCESS';
export const DELETE_EVENT_FAILURE = 'DELETE_EVENT_FAILURE';

export const DELETE_EVENT_BEGIN_API = 'DELETE_EVENT_BEGIN_API';
export const DELETE_EVENT_SUCCESS_API = 'DELETE_EVENT_SUCCESS_API';
export const DELETE_EVENT_FAILURE_API = 'DELETE_EVENT_FAILURE_API';

export const API_ERROR = 'API_ERROR';

export const BEGIN_POLLING_EVENTS = 'BEGIN_POLLING_EVENTS';
export const END_POLLING_EVENTS = 'END_POLLING_EVENTS';

export const BEGIN_PENDING_ACTIONS = 'BEGIN_PENDING_ACTIONS';
export const END_PENDING_ACTIONS = 'END_PENDING_ACTIONS';

export const DELETE_RECURRENCE_SERIES_BEGIN = 'DELETE_RECURRENCE_SERIES_BEGIN';
export const DELETE_RECURRENCE_SERIES_SUCCESS = 'DELETE_RECURRENCE_SERIES_SUCCESS';
export const DELETE_RECURRENCE_SERIES_FAILURE = 'DELETE_RECURRENCE_SERIES_FAILURE';

export const DELETE_FUTURE_RECURRENCE_SERIES_BEGIN = 'DELETE_FUTURE_RECURRENCE_SERIES_BEGIN';
export const DELETE_FUTURE_RECURRENCE_SERIES_SUCCESS = 'DELETE_FUTURE_RECURRENCE_SERIES_SUCCESS';
export const DELETE_FUTURE_RECURRENCE_SERIES_FAILURE = 'DELETE_FUTURE_RECURRENCE_SERIES_FAILURE';

export const beginGetGoogleEvents = (resp) => ({
  type: GET_EVENTS_BEGIN,
  payload: resp
});

export const postEventBegin = (calEvent, auth, providerType) => ({
  type: POST_EVENT_BEGIN,
  payload: {
    data: calEvent,
    auth,
    providerType
  }
});

export const getEventsFailure = (error) => ({
  type: GET_EVENTS_FAILURE,
  payload: {
    error
  }
});

export const getEventsSuccess = (response, providerType, owner) => ({
  type: GET_EVENTS_SUCCESS,
  payload: {
    data: response,
    providerType,
    owner // owner is needed as there are chances that the email is not readable for EXCHANGE servers.
  }
});

export const postEventSuccess = (response, providerType, owner) => ({
  type: POST_EVENT_SUCCESS,
  payload: {
    data: response,
    providerType,
    owner
  }
});

export const beginDeleteEvent = (id) => ({
  type: DELETE_EVENT_BEGIN,
  payload: id
});

export const deleteEventSuccess = (id, user) => ({
  type: DELETE_EVENT_SUCCESS,
  payload: { id, user }
});

// ---------------------- OUTLOOK ---------------------- //
export const GET_OUTLOOK_EVENTS_BEGIN = 'GET_OUTLOOK_EVENTS_BEGIN';
export const GET_OUTLOOK_EVENTS_SUCCESS = 'GET_OUTLOOK_EVENTS_SUCCESS';
export const GET_OUTLOOK_EVENTS_FAILURE = 'GET_OUTLOOK_EVENTS_FAILURE';

export const beginGetOutlookEvents = (resp) => ({
  type: GET_OUTLOOK_EVENTS_BEGIN,
  payload: resp
});

export const postOutlookEventBegin = (calEvent) => ({
  type: GET_OUTLOOK_EVENTS_FAILURE,
  payload: calEvent
});

export const getOutlookEventsSuccess = (response) => ({
  type: GET_OUTLOOK_EVENTS_SUCCESS,
  payload: {
    data: response
  }
});
// ---------------------- OUTLOOK ---------------------- //

// ---------------------- EDIT EVENTS ---------------------- //
export const editEventBegin = (id, eventObject, providerType) => ({
  type: EDIT_EVENT_BEGIN,
  payload: {
    id,
    data: eventObject,
    providerType
  }
});

export const editEventSuccess = (resp) => ({
  type: EDIT_EVENT_SUCCESS,
  payload: {
    resp
  }
});

export const apiFailure = (error) => ({
  type: API_ERROR,
  payload: {
    error
  }
});

export const editEventsBeginCaldav = (currentEvent) => ({
  type: EDIT_EVENT_BEGIN_CALDAV,
  payload: currentEvent
});
// ---------------------- EDIT EVENTS ---------------------- //

// ---------------------- EXCHANGE ---------------------- //
export const GET_EXCHANGE_EVENTS_BEGIN = 'GET_EXCHANGE_EVENTS_BEGIN';
export const GET_EXCHANGE_EVENTS_SUCCESS = 'GET_EXCHANGE_EVENTS_SUCCESS';
export const GET_EXCHANGE_EVENTS_FAILURE = 'GET_EXCHANGE_EVENTS_FAILURE';

export const EDIT_EXCHANGE_SINGLE_EVENT_BEGIN = 'EDIT_EXCHANGE_SINGLE_EVENT_BEGIN';
export const EDIT_EXCHANGE_SINGLE_EVENT_SUCCESS = 'EDIT_EXCHANGE_SINGLE_EVENT_SUCCESS';
export const EDIT_EXCHANGE_SINGLE_EVENT_FAILURE = 'EDIT_EXCHANGE_SINGLE_EVENT_FAILURE';

export const EDIT_EXCHANGE_FUTURE_EVENT_BEGIN = 'EDIT_EXCHANGE_FUTURE_EVENT_BEGIN';
export const EDIT_EXCHANGE_FUTURE_EVENT_SUCCESS = 'EDIT_EXCHANGE_FUTURE_EVENT_SUCCESS';
export const EDIT_EXCHANGE_FUTURE_EVENT_FAILURE = 'EDIT_EXCHANGE_FUTURE_EVENT_FAILURE';

export const EDIT_EXCHANGE_ALL_EVENT_BEGIN = 'EDIT_EXCHANGE_ALL_EVENT_BEGIN';
export const EDIT_EXCHANGE_ALL_EVENT_SUCCESS = 'EDIT_EXCHANGE_ALL_EVENT_SUCCESS';
export const EDIT_EXCHANGE_ALL_EVENT_FAILURE = 'EDIT_EXCHANGE_ALL_EVENT_FAILURE';

export const beginGetExchangeEvents = (resp) => ({
  type: GET_EXCHANGE_EVENTS_BEGIN,
  payload: resp
});

export const getExchangeEventsSuccess = (resp) => ({
  type: GET_EXCHANGE_EVENTS_SUCCESS,
  payload: resp
});

export const editEwsSingleEventBegin = (resp) => ({
  type: EDIT_EXCHANGE_SINGLE_EVENT_BEGIN,
  payload: resp
});

export const editEwsFutureEventBegin = (resp) => ({
  type: EDIT_EXCHANGE_FUTURE_EVENT_BEGIN,
  payload: resp
});

export const editEwsAllEventBegin = (resp) => ({
  type: EDIT_EXCHANGE_ALL_EVENT_BEGIN,
  payload: resp
});
// ---------------------- EXCHANGE ---------------------- //

// ---------------------- GENERAL ---------------------- //
export const CLEAR_ALL_EVENTS = 'CLEAR_ALL_EVENTS';
export const CLEAR_ALL_EVENTS_SUCCESS = 'CLEAR_ALL_EVENTS_SUCCESS';

export const clearAllEvents = () => ({
  type: CLEAR_ALL_EVENTS
});

export const clearAllEventsSuccess = () => ({
  type: CLEAR_ALL_EVENTS_SUCCESS
});
// ---------------------- GENERAL ---------------------- //

// ---------------------- POLLING ---------------------- //
export const beginPollingEvents = (payload) => ({
  type: BEGIN_POLLING_EVENTS
});

export const endPollingEvents = (payload) => ({
  type: END_POLLING_EVENTS
});
// ---------------------- POLLING ---------------------- //

// ---------------------- POLLING ---------------------- //
export const beginPendingActions = (payload) => ({
  type: BEGIN_PENDING_ACTIONS,
  payload
});

export const endPendingActions = (payload) => ({
  type: END_PENDING_ACTIONS
});
// ---------------------- POLLING ---------------------- //

// --------------- DELETE RECURR SERIES ---------------- //
export const beginDeleteRecurrenceSeries = (id) => ({
  type: DELETE_RECURRENCE_SERIES_BEGIN,
  payload: id
});

export const beginDeleteFutureRecurrenceSeries = (id) => ({
  type: DELETE_FUTURE_RECURRENCE_SERIES_BEGIN,
  payload: id
});
// --------------- DELETE RECURR SERIES ---------------- //

// ---------------------- CALDAV ---------------------- //
export const GET_CALDAV_EVENTS_BEGIN = 'GET_CALDAV_EVENTS_BEGIN';
export const GET_CALDAV_EVENTS_SUCCESS = 'GET_CALDAV_EVENTS_SUCCESS';
export const GET_CALDAV_EVENTS_FAILURE = 'GET_CALDAV_EVENTS_FAILURE';

export const EDIT_CALDAV_SINGLE_EVENT_BEGIN = 'EDIT_CALDAV_SINGLE_EVENT_BEGIN';
export const EDIT_CALDAV_SINGLE_EVENT_SUCCESS = 'EDIT_CALDAV_SINGLE_EVENT_SUCCESS';
export const EDIT_CALDAV_SINGLE_EVENT_FAILURE = 'EDIT_CALDAV_SINGLE_EVENT_FAILURE';

export const EDIT_CALDAV_FUTURE_EVENT_BEGIN = 'EDIT_CALDAV_FUTURE_EVENT_BEGIN';
export const EDIT_CALDAV_FUTURE_EVENT_SUCCESS = 'EDIT_CALDAV_FUTURE_EVENT_SUCCESS';
export const EDIT_CALDAV_FUTURE_EVENT_FAILURE = 'EDIT_CALDAV_FUTURE_EVENT_FAILURE';

export const EDIT_CALDAV_ALL_EVENT_BEGIN = 'EDIT_CALDAV_ALL_EVENT_BEGIN';
export const EDIT_CALDAV_ALL_EVENT_SUCCESS = 'EDIT_CALDAV_ALL_EVENT_SUCCESS';
export const EDIT_CALDAV_ALL_EVENT_FAILURE = 'EDIT_CALDAV_ALL_EVENT_FAILURE';

export const beginGetCaldavEvents = (resp) => ({
  type: GET_CALDAV_EVENTS_BEGIN,
  payload: resp
});

export const postCaldavEventBegin = (calEvent) => ({
  type: GET_CALDAV_EVENTS_FAILURE,
  payload: calEvent
});

export const getCaldavEventsSuccess = (response) => ({
  type: GET_CALDAV_EVENTS_SUCCESS,
  payload: {
    data: response
  }
});

export const editCalDavSingleEventBegin = (resp) => ({
  type: EDIT_CALDAV_SINGLE_EVENT_BEGIN,
  payload: resp
});

export const editCalDavFutureEventBegin = (resp) => ({
  type: EDIT_CALDAV_FUTURE_EVENT_BEGIN,
  payload: resp
});

export const editCalDavAllEventBegin = (resp) => ({
  type: EDIT_CALDAV_ALL_EVENT_BEGIN,
  payload: resp
});
// ---------------------- CALDAV ---------------------- //
