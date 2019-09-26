import {
  map,
  mergeMap,
  catchError,
  takeUntil,
  switchMap,
  concatMap,
  exhaustMap
} from 'rxjs/operators';
import { ofType } from 'redux-observable';
import { from, iif, of, interval, throwError } from 'rxjs';
import { Client } from '@microsoft/microsoft-graph-client';
import {
  Appointment,
  DateTime,
  ExchangeService,
  ExchangeCredentials,
  Item,
  MessageBody,
  Uri,
  SendInvitationsMode,
  WellKnownFolderName
} from 'ews-javascript-api';
import moment from 'moment';
import _ from 'lodash';
import uuidv4 from 'uuid';
// import { uuidv1 } from 'uuid/v1';
import ICAL from 'ical.js';

import { syncStoredEvents, retrieveStoreEvents, UPDATE_STORED_EVENTS } from '../actions/db/events';
// import {
//   loadClient,
//   loadFullCalendar,
//   loadSyncCalendar,
//   loadNextPage,
//   postGoogleEvent,
//   deleteGoogleEvent,
//   editGoogleEvent
// } from '../utils/client/google';
import * as Providers from '../utils/constants';
import { getUserEvents, getAccessToken, filterEventToOutlook } from '../utils/client/outlook';
import {
  asyncCreateExchangeEvent,
  asyncDeleteExchangeEvent,
  asyncGetRecurrAndSingleExchangeEvents,
  asyncUpdateExchangeEvent
} from '../utils/client/exchange';

import { asyncGetSingleExchangeEvent } from '../utils/client/exchangebasics';

import {
  // GET_EVENTS_BEGIN,
  // EDIT_EVENT_BEGIN,
  POST_EVENT_BEGIN,
  CLEAR_ALL_EVENTS,
  BEGIN_POLLING_EVENTS,
  END_POLLING_EVENTS,
  BEGIN_PENDING_ACTIONS,
  END_PENDING_ACTIONS,
  CLEAR_ALL_EVENTS_SUCCESS,
  apiFailure,
  getEventsSuccess,
  postEventSuccess,
  editEventSuccess,
  getEventsFailure,
  clearAllEventsSuccess,
  endPollingEvents,
  EDIT_EVENT_BEGIN
} from '../actions/events';
import * as Credentials from '../utils/Credentials';
import ServerUrls from '../utils/serverUrls';
import { asyncGetAllCalDavEvents } from '../utils/client/caldav';
import * as IcalStringBuilder from '../utils/icalStringBuilder';

import * as dbGeneralActions from '../sequelizeDB/operations/general';

import * as dbEventActions from '../sequelizeDB/operations/events';
import * as dbPendingActionActions from '../sequelizeDB/operations/pendingactions';

const dav = require('dav');
const uuidv1 = require('uuid/v1');

// #region Google (Not Working)
// export const beginGetEventsEpics = (action$) =>
//   action$.pipe(
//     ofType(GET_EVENTS_BEGIN),
//     mergeMap((action) =>
//       iif(
//         () => action.payload !== undefined,
//         from(loadClient()).pipe(
//           mergeMap(() =>
//             from(setCalendarRequest()).pipe(
//               mergeMap((resp) =>
//                 from(eventsPromise(resp)).pipe(
//                   // made some changes here for resp, unsure if it breaks.
//                   map((resp2) => getEventsSuccess(resp2, Providers.GOOGLE))
//                 )
//               )
//             )
//           )
//         ),
//         of(getEventsFailure('Google user undefined!!'))
//       )
//     )
//   );

// export const beginEditEventEpics = (action$) =>
//   action$.pipe(
//     ofType(EDIT_EVENT_BEGIN),
//     mergeMap((action) =>
//       from(editEvent(action.payload)).pipe(
//         map((resp) => editEventSuccess(resp), catchError((error) => apiFailure(error)))
//       )
//     )
//   );

// const editEvent = async (payload) => {
//   const calendarObject = payload.data;
//   const { id } = payload;
//   await loadClient();
//   return editGoogleEvent(id, calendarObject);
// };

// const deleteEvent = async (id) => {
//   await loadClient();
//   return deleteGoogleEvent(id);
// };

// const setCalendarRequest = () => {
//   let request;
//   const syncToken = localStorage.getItem('sync');
//   if (syncToken == null) {
//     console.log('Performing full sync');
//     request = loadFullCalendar();
//   } else {
//     console.log('Performing incremental sync');
//     request = loadSyncCalendar(syncToken);
//   }
//   return request;
// };

// const eventsPromise = async (resp) => {
//   const items = [];
//   return new Promise((resolve, reject) => {
//     fetchEvents(resp, items, resolve, reject);
//   });
// };

// const fetchEvents = (resp, items, resolve, reject) => {
//   const newItems = items.concat(resp.result.items);
//   if (resp.result.nextPageToken !== undefined) {
//     loadNextPage(resp.result.nextPageToken)
//       .then((nextResp) => fetchEvents(nextResp, newItems, resolve, reject))
//       .catch((e) => {
//         if (e.code === 410) {
//           console.log('Invalid sync token, clearing event store and re-syncing.');
//           localStorage.deleteItem('sync');
//           loadFullCalendar().then((newResp) => fetchEvents(newResp, items, resolve, reject));
//         } else {
//           console.log(e);
//           reject('Something went wrong, Please refresh and try again');
//         }
//       });
//   } else {
//     localStorage.setItem('sync', resp.result.nextSyncToken);
//     resolve(newItems);
//   }
// };
// #endregion

// #region Create Events Epics
export const beginPostEventEpics = (action$) =>
  action$.pipe(
    ofType(POST_EVENT_BEGIN),
    mergeMap((action) => {
      if (action.payload.providerType === Providers.GOOGLE) {
        return from(postEventGoogle(action.payload)).pipe(
          map(
            (resp) => postEventSuccess([resp.result], action.payload.providerType) // Think if you need to pass in owner here
          ),
          catchError((error) => apiFailure(error))
        );
      }
      if (action.payload.providerType === Providers.OUTLOOK) {
        return from(postEventsOutlook(action.payload)).pipe(
          map((resp) => postEventSuccess([resp], action.payload.providerType)), // Think if you need to pass in owner here
          catchError((error) => apiFailure(error))
        );
      }
      if (action.payload.providerType === Providers.EXCHANGE) {
        return from(postEventsExchange(action.payload)).pipe(
          map((resp) =>
            postEventSuccess([resp], action.payload.providerType, action.payload.auth.email)
          ),
          catchError((error) => apiFailure(error))
        );
      }
      if (action.payload.providerType === Providers.CALDAV) {
        return from(postEventsCalDav(action.payload)).pipe(
          map((resp) =>
            postEventSuccess(
              [resp],
              [action.payload.auth],
              action.payload.providerType,
              action.payload.auth.email
            )
          ),
          catchError((error) => apiFailure(error))
        );
      }
    })
  );

const postEventGoogle = async (resource) => {
  const calendarObject = {
    calendarId: 'primary',
    resource: resource.data
  };
  // await loadClient();
  // return postGoogleEvent(calendarObject);
  return apiFailure('Google post event unimplemented.');
};

const postEventsOutlook = (payload) =>
  new Promise((resolve, reject) => {
    getAccessToken(payload.auth.accessToken, payload.auth.accessTokenExpiry, (accessToken) => {
      if (accessToken) {
        // Create a Graph client
        const client = Client.init({
          authProvider: (done) => {
            // Just return the token
            done(null, accessToken);
          }
        });

        // This first select is to choose from the list of calendars
        resolve(
          client
            .api(
              '/me/calendars/AAMkAGZlZDEyNmMxLTMyNDgtNDMzZi05ZmZhLTU5ODk3ZjA5ZjQyOABGAAAAAAA-XPNVbhVJSbREEYK0xJ3FBwCK0Ut7mQOxT5W1Wd82ZSuqAAAAAAEGAACK0Ut7mQOxT5W1Wd82ZSuqAAGfLM-yAAA=/events'
            )
            .post(filterEventToOutlook(payload.data))
        );
      } else {
        const error = { responseText: 'Could not retrieve access token' };
        console.log(error);
        reject(error);
      }
    });
  });

const postEventsExchange = (payload) =>
  new Promise((resolve, reject) => {
    // Create Exchange Service and set up credientials
    const exch = new ExchangeService();
    exch.Url = new Uri('https://outlook.office365.com/Ews/Exchange.asmx');
    exch.Credentials = new ExchangeCredentials(payload.auth.email, payload.auth.password);

    // Posting event so create new appointment
    const newEvent = new Appointment(exch);

    // Map variables from local to server object
    newEvent.Subject = payload.data.summary;
    newEvent.Body = new MessageBody(payload.data.description);
    newEvent.Start = new DateTime(
      moment.tz(payload.data.start.dateTime, payload.data.start.timezone)
    );
    newEvent.End = new DateTime(moment.tz(payload.data.end.dateTime, payload.data.end.timezone));

    // Save to create a new event
    newEvent
      .Save(WellKnownFolderName.Calendar, SendInvitationsMode.SendToAllAndSaveCopy)
      .then(
        // On success
        async () => {
          // Re-get the new item with new variables set by EWS/
          const item = await Item.Bind(exch, newEvent.Id);

          // Update database by filtering the new item into our schema.
          await dbEventActions.insertEventsIntoDatabase(
            Providers.filterIntoSchema(item, Providers.EXCHANGE, payload.auth.email, false)
          );
          resolve(item);
        },
        // On error
        async (error) => {
          // Creating a temp object with uniqueid due to not having any internet, retry w/ pending action
          const obj = {
            uniqueId: uuidv4(),
            eventId: uuidv4(),
            status: 'pending',
            type: 'create'
          };

          // Filter temp object into our schema
          const savedObj = Providers.filterIntoSchema(
            newEvent,
            Providers.EXCHANGE,
            payload.auth.email,
            true,
            obj.eventId
          );
          savedObj.createdOffline = true;

          // Append pending actions for retrying and events for UI display.
          await dbEventActions.insertEventsIntoDatabase(savedObj);
          await dbPendingActionActions.insertPendingActionIntoDatabase(obj);
          throw error;
        }
      )
      .catch((error) => throwError(error));
  });

const postEventsCalDav = async (payload) => {
  const debug = true;

  // Parse user information from account layer to dav object.
  const xhrObject = new dav.transport.Basic(
    new dav.Credentials({
      username: payload.auth.email,
      password: payload.auth.password
    })
  );

  debugger;

  // Final iCalString to post out
  let newiCalString = '';

  // // Need calendar system to handle what URL is being parsed. For now, we hard code.
  // ICloud Calendar link
  const caldavUrl =
    'https://caldav.icloud.com/10224008189/calendars/F669E46B-E8BB-44C5-A714-2AE82012AE65/';

  // Yahoo Calendar Link
  // const caldavUrl =
  //   'https://caldav.calendar.yahoo.com/dav/oj242dvo2jivt6lfbyxqfherdqulvbiaprtaw5kv/Calendar/Fong%20Zhi%20Zhong/';

  const newETag = uuidv1();
  const { data } = payload;

  // Builds additional fields that are missing specifically for caldav.
  data.id = uuidv4();
  data.originalId = uuidv1();

  // Repopulate certain fields that are missing
  data.attendee = [];
  data.caldavUrl = caldavUrl;
  // data.created = moment().format('YYYY-MM-DDTHH:mm:ssZ');
  // data.updated = moment().format('YYYY-MM-DDTHH:mm:ssZ');
  data.iCalUID = data.originalId;
  // data.owner = payload.auth.email;
  data.providerType = Providers.CALDAV;
  data.caldavType = payload.auth.caldavType;
  data.isRecurring = data.rrule !== '';

  if (payload.data.isRecurring) {
    const newRecurrencePattern = {};
    const updatedId = uuidv1();
    const updatedUid = uuidv1();

    // eslint-disable-next-line no-underscore-dangle
    const jsonRecurr = ICAL.Recur._stringToData(data.rrule);

    Object.assign(newRecurrencePattern, {
      id: updatedId,
      originalId: updatedUid,
      // // // Temp take from the recurrence master first, will take from the UI in future.
      // // freq: payload.options.rrule.freq,
      // // interval: payload.options.rrule.interval,
      freq: jsonRecurr['rrule:freq'],
      interval: jsonRecurr.interval,
      numberOfRepeat: jsonRecurr.count !== undefined ? jsonRecurr.count : 0,
      until: jsonRecurr.until !== undefined ? jsonRecurr.until : null,
      // exDates: pattern.exDates.filter((exDate) =>
      //   moment(exDate).isAfter(moment(data.start.dateTime))
      // ),
      // recurrenceIds: pattern.recurrenceIds.filter((recurrId) =>
      //   moment(recurrId).isAfter(moment(data.start.dateTime))
      // ),
      recurringTypeId: data.start.dateTime.unix(),
      iCalUID: updatedUid,
      // byHour: '',
      // byMinute: '',
      // bySecond: '',
      // byEaster: '',
      // bySetPos: '',
      byWeekNo: '',
      byWeekDay: `${Array.isArray(jsonRecurr.BYDAY) ? jsonRecurr.BYDAY.join(',') : ''}`,
      byMonth: '',
      byMonthDay: '',
      byYearDay: ''
    });

    // Creates Recurring event.
    // This does not work atm. isRecurring is not defined too.
    newiCalString = IcalStringBuilder.buildICALStringCreateRecurEvent(
      payload.data,
      newRecurrencePattern
    );
  } else {
    data.isRecurring = false;

    // Creates non Recurring event.
    newiCalString = IcalStringBuilder.buildICALStringCreateEvent(payload.data);
  }
  data.iCALString = newiCalString;

  const calendar = new dav.Calendar();
  calendar.url = caldavUrl;

  const addCalendarObject = {
    data: newiCalString,
    filename: `${newETag}.ics`,
    xhr: xhrObject
  };

  const addResult = await dav.createCalendarObject(calendar, addCalendarObject);
  if (debug) {
    console.log('(postEventsCalDav)', addResult);
  }

  // You have to do a full sync as the .ics endpoint might not be valid
  const allEvents = await asyncGetAllCalDavEvents(
    payload.auth.email,
    payload.auth.password,
    payload.auth.url,
    payload.auth.caldavType
  );

  // Etag is a real problem here LOL. This does NOT WORK
  const justCreatedEvent = allEvents.filter((e) => e.originalId === data.originalId)[0];
  const appendedResult = await dbEventActions.insertEventsIntoDatabase(justCreatedEvent);
  return allEvents;
};
// #endregion

// #region General Epics
export const clearAllEventsEpics = (action$) =>
  action$.pipe(
    ofType(CLEAR_ALL_EVENTS),
    map(() => {
      localStorage.clear();
      dbGeneralActions.cleardb();
      return clearAllEventsSuccess();
    })
  );
// #endregion

// #region Polling Epics
export const pollingEventsEpics = (action$) => {
  const stopPolling$ = action$.pipe(ofType(END_POLLING_EVENTS));
  return action$.pipe(
    // ofType(BEGIN_POLLING_EVENTS, UPDATE_STORED_EVENTS),
    ofType(BEGIN_POLLING_EVENTS),
    switchMap((action) =>
      interval(10 * 1000).pipe(
        takeUntil(stopPolling$),
        switchMap(() => from(syncEvents(action))),
        map((results) => syncStoredEvents(results))
      )
    )
  );
};

const syncEvents = async (action) => {
  // Based off which user it is supposed to sync
  // const { user } = action.payload;
  const user = {
    username: Credentials.ICLOUD_USERNAME,
    password: Credentials.ICLOUD_PASSWORD,
    url: 'https://caldav.icloud.com/',
    providerType: Providers.CALDAV
  };

  // Check which provider
  switch (user.providerType) {
    case Providers.GOOGLE:
      break;
    case Providers.OUTLOOK:
      break;
    case Providers.EXCHANGE:
      // For Exchange, We get all appointments based off the user,
      // And we check if there is anything new.
      // If there is nothing new, we return nothing.
      try {
        const exch = new ExchangeService();
        exch.Url = new Uri('https://outlook.office365.com/Ews/Exchange.asmx');
        exch.Credentials = new ExchangeCredentials(user.email, user.password);

        const appts = await asyncGetRecurrAndSingleExchangeEvents(exch);

        // However, we need to get all items from database too, as created offline events
        // does not exist on the server yet.
        const dbEvents = await dbEventActions.getAllEvents();
        const updatedEvents = [];
        const listOfPriomises = [];

        for (const appt of appts) {
          const dbObj = dbEvents.filter((dbEvent) => dbEvent.originalId === appt.Id.UniqueId);
          const filteredEvent = Providers.filterIntoSchema(
            appt,
            Providers.EXCHANGE,
            user.email,
            false
          );

          if (dbObj.length === 0) {
            // New object from server, add and move on to next one.
            updatedEvents.push({ event: filteredEvent, type: 'create' });
            // listOfPriomises.push(db.events.upsert(filteredEvent));
            listOfPriomises.push(dbEventActions.insertEventsIntoDatabase(filteredEvent));
          } else {
            // Sync old objects and compare in case.
            const dbEvent = dbObj[0];
            const lastUpdatedTime = moment(dbEvent.updated);

            if (
              appt.Id.UniqueId === dbEvent.originalId &&
              appt.LastModifiedTime.getMomentDate() > lastUpdatedTime
            ) {
              console.log(
                appt.LastModifiedTime.getMomentDate(),
                lastUpdatedTime,
                appt.LastModifiedTime.getMomentDate() > lastUpdatedTime
              );

              updatedEvents.push({ event: filteredEvent, type: 'update' });
              // Problem here now is due to upsert changing its behavior.
              // Upsert is based on the primary key, and as our UUID is now not relying on originalId,
              // We got an issue.
              // This means we have to write a query to update based off the filteredEvent data
              // but keep the primary key.
              filteredEvent.id = dbEvent.id;
              listOfPriomises.push(
                dbEventActions.updateEventByOriginalId(filteredEvent.originalId, filteredEvent)
              );
            }
          }
        }

        // Check for deleted events, as if it not in the set, it means that it could be deleted.
        // In database, but not on server, as we are taking server, we just assume delete.
        for (const dbEvent of dbEvents) {
          const result = appts.find((appt) => appt.Id.UniqueId === dbEvent.originalId);
          // Means we found something, move on to next object or it has not been uploaded to the server yet.
          if (result !== undefined || dbEvent.createdOffline === true) {
            continue;
          }
          console.log('Found a event not on server, but is local', dbEvent);

          // Means not found, delete it if it is not a new object.
          updatedEvents.push({
            event: Providers.filterEventIntoSchema(dbEvent),
            type: 'delete'
          });
          listOfPriomises.push(dbEventActions.deleteEventByOriginalId(dbEvent.originalId));
        }
        await Promise.all(listOfPriomises);
        console.log(updatedEvents);
        return updatedEvents;
      } catch (error) {
        // Return empty array, let next loop handle syncing.
        return [];
      }
    case Providers.CALDAV:
      try {
        const events = await asyncGetAllCalDavEvents(user.username, user.password, user.url);
        const dbEvents = await dbEventActions.getAllEvents();
        const updatedEvents = [];
        const listOfPriomises = [];
        debugger;

        for (const event of events) {
          const dbObj = dbEvents.filter(
            (dbEvent) =>
              dbEvent.start.dateTime === event.start.dateTime &&
              dbEvent.originalId === event.originalId
          );
          const filteredEvent = Providers.filterIntoSchema(
            event,
            Providers.CALDAV,
            user.email,
            false
          );

          if (dbObj.length === 0) {
            // New object from server, add and move on to next one.
            updatedEvents.push({ event: filteredEvent, type: 'create' });
            listOfPriomises.push(dbEventActions.insertEventsIntoDatabase(filteredEvent));
          } else {
            // Sync old objects and compare in case.
            const dbEvent = dbObj[0];

            // Just update, coz caldav, server is always truth, no matter what
            // Also, the damn updated field is never updated. Wtf.
            updatedEvents.push({ event: filteredEvent, type: 'update' });
            filteredEvent.id = dbEvent.id;
            listOfPriomises.push(
              dbEventActions.updateEventByiCalUIDandStartDateTime(
                filteredEvent.iCalUID,
                event.start.dateTime,
                filteredEvent
              )
            );
          }
        }

        // Check for deleted events, as if it not in the set, it means that it could be deleted.
        // In database, but not on server, as we are taking server, we just assume delete.
        for (const dbEvent of dbEvents) {
          const result = events.find(
            (event) =>
              dbEvent.start.dateTime === event.start.dateTime &&
              dbEvent.originalId === event.originalId
          );
          // Means we found something, move on to next object or it has not been uploaded to the server yet.
          if (result !== undefined || dbEvent.createdOffline === true) {
            continue;
          }
          console.log('Found a event not on server, but is local', dbEvent);

          // Means not found, delete it if it is not a new object.
          updatedEvents.push({
            event: Providers.filterEventIntoSchema(dbEvent),
            type: 'delete'
          });
          listOfPriomises.push(
            dbEventActions.deleteEventByiCalUIDandStartDateTime(
              dbEvent.originalId,
              dbEvent.start.dateTime
            )
          );
        }
        await Promise.all(listOfPriomises);
        return updatedEvents;
      } catch (e) {
        console.log(e);
        return [];
      }
    default:
      break;
  }
};
// #endregion

// #region Pending Actions Epics
export const pendingActionsEpics = (action$) => {
  // Stop upon a end pending action trigger, for debugging/stopping if needed
  const stopPolling$ = action$.pipe(ofType(END_PENDING_ACTIONS));
  return action$.pipe(
    ofType(BEGIN_PENDING_ACTIONS),
    switchMap((action) =>
      // At a 5 second interval
      interval(5 * 1000).pipe(
        // Stop when epics see a end pending action
        takeUntil(stopPolling$),
        concatMap(
          () =>
            // Get the db
            // from(getDb()).pipe(
            // exhaustMap((db) =>
            // Get all the pending actions
            from(dbPendingActionActions.getAllPendingActions()).pipe(
              // For each pending action, run the correct result
              mergeMap((actions) =>
                from(handlePendingActions(action.payload, actions)).pipe(
                  // Return an array of result, reduced accordingly.
                  mergeMap((result) => of(...result))
                )
              )
            )
          // )
          // )
        )
      )
    )
  );
};

const reflect = (p) =>
  p.then((v) => ({ v, status: 'fulfilled' }), (e) => ({ e, status: 'rejected' }));

const handlePendingActions = async (users, actions) => {
  // Get all events for resolving conflict.
  // const docs = await db.events.find().exec();
  const docs = await dbEventActions.getAllEvents();

  // Promises array for each of our async action.
  const promisesArr = actions.map(async (action) => {
    // Find the corresponding item in our database that is in the pending action.
    const rxDbObj = docs.filter((obj) => obj.originalId === action.eventId)[0];
    // Find the correct user credentials.
    const user = users[rxDbObj.providerType].filter(
      (indivAcc) => indivAcc.owner === rxDbObj.email
    )[0];

    // Declare here for ease over all providers, not used for create events.
    let serverObj;

    // Try/Catch handles when there is any error, network or otherwise.
    try {
      switch (rxDbObj.providerType) {
        case Providers.GOOGLE:
          break;
        case Providers.OUTLOOK:
          break;
        case Providers.EXCHANGE:
          // For create, we need to handle differently as there is nothing on server,
          // So we ignore it.
          if (action.type !== 'create') {
            serverObj = await asyncGetSingleExchangeEvent(
              user.email,
              user.password,
              'https://outlook.office365.com/Ews/Exchange.asmx',
              rxDbObj.originalId
            );
          }
          break;
        default:
          return apiFailure('Unhandled provider for Pending actions');
      }

      // Get a resulting action from the merge function.
      const resultingAction = await handleMergeEvents(rxDbObj, serverObj, action.type, user);

      // Return object to be reduced down later on, with the proper user information.
      return { result: resultingAction, user };
    } catch (error) {
      // Just remove it from database instead, and break;
      // This is when the item has been deleted on server, but not local due to sync.
      // Error is thrown by asyncGetSingleExchangeEvent
      // console.log(error);
      if (error.ErrorCode === 249) {
        console.log('removing action', action);
        await action.remove();
      }
      throw error;
    }
  });

  // The logic here, is to wait for all promises to complete, NO MATTER SUCCESS OR FAILURE
  // Reason being is we want it to requeue the failed ones, but still not block the UI.
  // We use a techinque called reflect for this, https://stackoverflow.com/questions/31424561/wait-until-all-es6-promises-complete-even-rejected-promises
  // Based on each result, if ANY of them is a success, we start retrieving stored events
  // and assume that our queue is still valid, and let it re-run on its own next cycle.
  // However, I need to retrieve stored events for the providers that are fulfilled, and not those who are not.
  const result = await Promise.all(promisesArr.map(reflect));
  const appendedUsers = [];
  const noDuplicateUsers = result.reduce((a, b) => {
    if (
      b.status === 'fulfilled' && // ensure that it is a success
      !a.some((singleUser) => _.isEqual(singleUser.v.user, b.v.user)) && // ensure that the same user is not inside
      !(appendedUsers.filter((appendedUser) => _.isEqual(appendedUser, b.v.user)).length > 1) // ensure that the return array does not contain that user
    ) {
      a.push(b);
      appendedUsers.push(b.v.user);
    }
    return a;
  }, []);

  // For every successful user, it will map a retrieve stored event for it.
  // Returns multiple action due to filtering on UI selector, updates specific providers only, not all of them.
  const resultingAction = noDuplicateUsers.map((indivAcc) => retrieveStoreEvents(indivAcc.v.user));

  // Unsure if needed due to if all fail to send
  return resultingAction;
};

const handleMergeEvents = async (localObj, serverObj, type, user) => {
  let result = '';

  // Create is a specific type, as it assumes local is the source of truth.
  // So I can assume if success, just return.
  // If error, let pending actions automatically try, without the need of triggering it.
  if (type === 'create') {
    switch (localObj.providerType) {
      case Providers.GOOGLE:
        break;
      case Providers.OUTLOOK:
        break;
      case Providers.EXCHANGE:
        result = await asyncCreateExchangeEvent(
          user.email,
          user.password,
          'https://outlook.office365.com/Ews/Exchange.asmx',
          localObj
        );
        break;
      default:
        console.log('(Handle Merge Events) Provider not accounted for');
        break;
    }

    // Only if success
    if (result.type === 'POST_EVENT_SUCCESS') {
      // Remove the pending action first
      await dbPendingActionActions.deletePendingActionById(localObj.originalId);

      // Remove the temp event if it exists. For newly created events.
      await dbEventActions.deleteEventByOriginalId(localObj.originalId);

      return result;
    }
  }

  // Merging main code!
  const filteredServerObj = Providers.filterIntoSchema(
    serverObj,
    localObj.providerType,
    localObj.owner,
    false
  );

  // Parse time into moment so we can handle them.
  const localUpdatedTime = moment(localObj.updated);
  const serverUpdatedTime = moment(filteredServerObj.updated);

  // Not used now, but can be used for future merging if needed.
  const dateIsAfter = localUpdatedTime.isAfter(serverUpdatedTime);
  const dateIsBefore = localUpdatedTime.isBefore(serverUpdatedTime);

  // Local means changes has been made to it. So if it is new, then compare.
  // Else, take the server always.
  if (localObj.local) {
    const dateIsSame = localUpdatedTime.isSame(serverUpdatedTime);

    // Only if date between server and local is the same, then we take local.
    if (dateIsSame) {
      // Take local
      switch (localObj.providerType) {
        case Providers.GOOGLE:
          break;
        case Providers.OUTLOOK:
          break;
        case Providers.EXCHANGE:
          switch (type) {
            case 'update':
              // TO-DO, add more update fields
              serverObj.Subject = localObj.summary;
              serverObj.Location = localObj.location;

              result = await asyncUpdateExchangeEvent(serverObj, user, () => {
                console.log('conflict solved exchange');
              });

              if (result.type === 'EDIT_EVENT_SUCCESS') {
                await dbPendingActionActions.deletePendingActionById(filteredServerObj.originalId);
              }
              return result;
            case 'delete':
              result = await asyncDeleteExchangeEvent(serverObj, user, () => {
                console.log('deleted exchange event');
              });

              if (result.type === 'DELETE_EVENT_SUCCESS') {
                await dbPendingActionActions.deletePendingActionById(filteredServerObj.originalId);
              }
              return result;
            default:
              console.log('(Exchange, Merge) Unhandled CRUD type');
              break;
          }
          break;
        default:
          console.log('(Handle Merge Events) Provider not accounted for');
          break;
      }
    } else if (dateIsBefore) {
      // Keep server
      await dbEventActions.insertEventsIntoDatabase(filteredServerObj);
      await dbPendingActionActions.deletePendingActionById(filteredServerObj.originalId);

      return editEventSuccess(serverObj);
    }
  } else {
    // Keep server
    await dbEventActions.insertEventsIntoDatabase(filteredServerObj);
    await dbPendingActionActions.deletePendingActionById(filteredServerObj.originalId);
    return editEventSuccess(serverObj);
  }
};
// #endregion
