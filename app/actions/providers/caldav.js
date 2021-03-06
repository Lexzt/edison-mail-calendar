// #region CalDav
export const GET_CALDAV_EVENTS_BEGIN = 'GET_CALDAV_EVENTS_BEGIN';
export const GET_CALDAV_EVENTS_SUCCESS = 'GET_CALDAV_EVENTS_SUCCESS';
export const GET_CALDAV_EVENTS_FAILURE = 'GET_CALDAV_EVENTS_FAILURE';

export const CREATE_CALDAV_EVENTS_BEGIN = 'CREATE_CALDAV_EVENTS_BEGIN';
export const CREATE_CALDAV_EVENTS_SUCCESS = 'CREATE_CALDAV_EVENTS_SUCCESS';
export const CREATE_CALDAV_EVENTS_FAILURE = 'CREATE_CALDAV_EVENTS_FAILURE';

export const EDIT_CALDAV_SINGLE_EVENT_BEGIN = 'EDIT_CALDAV_SINGLE_EVENT_BEGIN';
export const EDIT_CALDAV_SINGLE_EVENT_SUCCESS = 'EDIT_CALDAV_SINGLE_EVENT_SUCCESS';
export const EDIT_CALDAV_SINGLE_EVENT_FAILURE = 'EDIT_CALDAV_SINGLE_EVENT_FAILURE';

export const EDIT_CALDAV_FUTURE_EVENT_BEGIN = 'EDIT_CALDAV_FUTURE_EVENT_BEGIN';
export const EDIT_CALDAV_FUTURE_EVENT_SUCCESS = 'EDIT_CALDAV_FUTURE_EVENT_SUCCESS';
export const EDIT_CALDAV_FUTURE_EVENT_FAILURE = 'EDIT_CALDAV_FUTURE_EVENT_FAILURE';

export const EDIT_CALDAV_ALL_EVENT_BEGIN = 'EDIT_CALDAV_ALL_EVENT_BEGIN';
export const EDIT_CALDAV_ALL_EVENT_SUCCESS = 'EDIT_CALDAV_ALL_EVENT_SUCCESS';
export const EDIT_CALDAV_ALL_EVENT_FAILURE = 'EDIT_CALDAV_ALL_EVENT_FAILURE';

export const DELETE_CALDAV_SINGLE_EVENT_BEGIN = 'DELETE_CALDAV_SINGLE_EVENT_BEGIN';
export const DELETE_CALDAV_SINGLE_EVENT_SUCCESS = 'DELETE_CALDAV_SINGLE_EVENT_SUCCESS';
export const DELETE_CALDAV_SINGLE_EVENT_FAILURE = 'DELETE_CALDAV_SINGLE_EVENT_FAILURE';

export const DELETE_CALDAV_FUTURE_EVENT_BEGIN = 'DELETE_CALDAV_FUTURE_EVENT_BEGIN';
export const DELETE_CALDAV_FUTURE_EVENT_SUCCESS = 'DELETE_CALDAV_FUTURE_EVENT_SUCCESS';
export const DELETE_CALDAV_FUTURE_EVENT_FAILURE = 'DELETE_CALDAV_FUTURE_EVENT_FAILURE';

export const DELETE_CALDAV_ALL_EVENT_BEGIN = 'DELETE_CALDAV_ALL_EVENT_BEGIN';
export const DELETE_CALDAV_ALL_EVENT_SUCCESS = 'DELETE_CALDAV_ALL_EVENT_SUCCESS';
export const DELETE_CALDAV_ALL_EVENT_FAILURE = 'DELETE_CALDAV_ALL_EVENT_FAILURE';

export const beginGetCaldavEvents = (resp) => ({
  type: GET_CALDAV_EVENTS_BEGIN,
  payload: resp
});

export const createCaldavEventBegin = (resp) => ({
  type: CREATE_CALDAV_EVENTS_BEGIN,
  payload: resp
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

export const deleteCalDavSingleEventBegin = (resp) => ({
  type: DELETE_CALDAV_SINGLE_EVENT_BEGIN,
  payload: resp
});

export const deleteCalDavAllEventBegin = (resp) => ({
  type: DELETE_CALDAV_ALL_EVENT_BEGIN,
  payload: resp
});

export const deleteCalDavFutureEventBegin = (resp) => ({
  type: DELETE_CALDAV_FUTURE_EVENT_BEGIN,
  payload: resp
});
// #endregion
