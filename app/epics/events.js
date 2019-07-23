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
import { from, iif, of, timer, interval, throwError } from 'rxjs';
import { normalize, schema } from 'normalizr';
import { Client } from '@microsoft/microsoft-graph-client';
import * as RxDB from 'rxdb';
import {
  Appointment,
  ConflictResolutionMode,
  DateTime,
  ExchangeService,
  ExchangeCredentials,
  Item,
  MessageBody,
  Uri,
  SendInvitationsMode,
  SendInvitationsOrCancellationsMode,
  WellKnownFolderName
} from 'ews-javascript-api';
import moment from 'moment';
import _ from 'lodash';
import uuidv4 from 'uuid';
import { syncStoredEvents, retrieveStoreEvents, UPDATE_STORED_EVENTS } from '../actions/db/events';
import {
  loadClient,
  loadFullCalendar,
  loadSyncCalendar,
  loadNextPage,
  postGoogleEvent,
  deleteGoogleEvent,
  editGoogleEvent
} from '../utils/client/google';
import * as Providers from '../utils/constants';
import { getUserEvents, getAccessToken, filterEventToOutlook } from '../utils/client/outlook';
import {
  asyncCreateExchangeEvent,
  asyncDeleteExchangeEvent,
  asyncGetRecurrAndSingleExchangeEvents,
  asyncGetSingleExchangeEvent,
  asyncGetAllExchangeEvents,
  asyncUpdateExchangeEvent,
  asyncUpdateRecurrExchangeSeries,
  createEwsRecurrenceObj,
  parseEwsRecurringPatterns
} from '../utils/client/exchange';
import {
  GET_EVENTS_BEGIN,
  EDIT_EVENT_BEGIN,
  POST_EVENT_BEGIN,
  CLEAR_ALL_EVENTS,
  GET_OUTLOOK_EVENTS_BEGIN,
  GET_EXCHANGE_EVENTS_BEGIN,
  BEGIN_POLLING_EVENTS,
  END_POLLING_EVENTS,
  BEGIN_PENDING_ACTIONS,
  END_PENDING_ACTIONS,
  CLEAR_ALL_EVENTS_SUCCESS,
  EDIT_EXCHANGE_SINGLE_EVENT_BEGIN,
  EDIT_EXCHANGE_FUTURE_EVENT_BEGIN,
  EDIT_EXCHANGE_ALL_EVENT_BEGIN,
  apiFailure,
  getEventsSuccess,
  postEventSuccess,
  editEventSuccess,
  getEventsFailure,
  clearAllEventsSuccess,
  endPollingEvents,
  GET_CALDAV_EVENTS_BEGIN
} from '../actions/events';
import getDb from '../db';
import * as Credentials from '../utils/Credentials';
import * as CalDavActionCreators from '../actions/caldav';
import ServerUrls from '../utils/serverUrls';
import PARSER from '../utils/parser';
// import { storeCaldav } from './db/caldav';
import { processObjects } from '../reducers/caldav';
import { asyncGetAllCalDavEvents } from '../utils/client/caldav';

const dav = require('dav');

// ------------------------------------ GOOGLE ------------------------------------- //
export const beginGetEventsEpics = (action$) =>
  action$.pipe(
    ofType(GET_EVENTS_BEGIN),
    mergeMap((action) =>
      iif(
        () => action.payload !== undefined,
        from(loadClient()).pipe(
          mergeMap(() =>
            from(setCalendarRequest()).pipe(
              mergeMap((resp) =>
                from(eventsPromise(resp)).pipe(
                  // made some changes here for resp, unsure if it breaks.
                  map((resp2) => getEventsSuccess(resp2, Providers.GOOGLE))
                )
              )
            )
          )
        ),
        of(getEventsFailure('Google user undefined!!'))
      )
    )
  );

export const beginEditEventEpics = (action$) =>
  action$.pipe(
    ofType(EDIT_EVENT_BEGIN),
    mergeMap((action) =>
      from(editEvent(action.payload)).pipe(
        map((resp) => editEventSuccess(resp), catchError((error) => apiFailure(error)))
      )
    )
  );

const editEvent = async (payload) => {
  const calendarObject = payload.data;
  const { id } = payload;
  await loadClient();
  return editGoogleEvent(id, calendarObject);
};

const deleteEvent = async (id) => {
  await loadClient();
  return deleteGoogleEvent(id);
};

const setCalendarRequest = () => {
  let request;
  const syncToken = localStorage.getItem('sync');
  if (syncToken == null) {
    console.log('Performing full sync');
    request = loadFullCalendar();
  } else {
    console.log('Performing incremental sync');
    request = loadSyncCalendar(syncToken);
  }
  return request;
};

const eventsPromise = async (resp) => {
  const items = [];
  return new Promise((resolve, reject) => {
    fetchEvents(resp, items, resolve, reject);
  });
};

const fetchEvents = (resp, items, resolve, reject) => {
  const newItems = items.concat(resp.result.items);
  if (resp.result.nextPageToken !== undefined) {
    loadNextPage(resp.result.nextPageToken)
      .then((nextResp) => fetchEvents(nextResp, newItems, resolve, reject))
      .catch((e) => {
        if (e.code === 410) {
          console.log('Invalid sync token, clearing event store and re-syncing.');
          localStorage.deleteItem('sync');
          loadFullCalendar().then((newResp) => fetchEvents(newResp, items, resolve, reject));
        } else {
          console.log(e);
          reject('Something went wrong, Please refresh and try again');
        }
      });
  } else {
    localStorage.setItem('sync', resp.result.nextSyncToken);
    resolve(newItems);
  }
};
// ------------------------------------ GOOGLE ------------------------------------- //

// --------------------------------- CREATE EVENTS --------------------------------- //
export const beginPostEventEpics = (action$) =>
  action$.pipe(
    ofType(POST_EVENT_BEGIN),
    mergeMap((action) => {
      if (action.payload.providerType === Providers.GOOGLE) {
        return from(postEvent(action.payload)).pipe(
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
    })
  );

const postEvent = async (resource) => {
  const calendarObject = {
    calendarId: 'primary',
    resource: resource.data
  };
  await loadClient();
  return postGoogleEvent(calendarObject);
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
          const db = await getDb();
          await db.events.upsert(
            Providers.filterIntoSchema(item, Providers.EXCHANGE, payload.auth.email, false)
          );
          resolve(item);
        },
        // On error
        async (error) => {
          // Creating a temp object with uniqueid due to not having any internet, retry w/ pending action
          const db = await getDb();
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
          await db.events.upsert(savedObj);
          await db.pendingactions.upsert(obj);
          throw error;
        }
      )
      .catch((error) => throwError(error));
  });
// --------------------------------- CREATE EVENTS --------------------------------- //

const normalizeEvents = (response) => {
  const singleEvent = new schema.Entity('events');
  const results = normalize({ events: response }, { events: [singleEvent] });
  return results;
};

// ------------------------------------ OUTLOOK ------------------------------------ //
export const beginGetOutlookEventsEpics = (action$) =>
  action$.pipe(
    ofType(GET_OUTLOOK_EVENTS_BEGIN),
    mergeMap((action) =>
      from(
        new Promise((resolve, reject) => {
          if (action.payload === undefined) {
            reject(getEventsFailure('Outlook user undefined!!'));
          }

          console.log('Outlook Performing full sync', action);
          getUserEvents(
            action.payload.accessToken,
            action.payload.accessTokenExpiry,
            (events, error) => {
              if (error) {
                console.error(error);
                return;
              }

              resolve(events);
            }
          );
        })
      ).pipe(
        map((resp) => getEventsSuccess(resp, Providers.OUTLOOK, action.payload.email)),
        catchError((error) => of(error))
      )
    )
  );
// ------------------------------------ OUTLOOK ------------------------------------ //

// ----------------------------------- EXCHANGE ------------------------------------ //
export const beginGetExchangeEventsEpics = (action$) =>
  action$.pipe(
    ofType(GET_EXCHANGE_EVENTS_BEGIN),
    mergeMap((action) =>
      from(
        new Promise(async (resolve, reject) => {
          if (action.payload === undefined) {
            reject(getEventsFailure('Exchange user undefined!!'));
          }

          const exch = new ExchangeService();
          exch.Url = new Uri('https://outlook.office365.com/Ews/Exchange.asmx');
          exch.Credentials = new ExchangeCredentials(action.payload.email, action.payload.password);

          resolve(asyncGetRecurrAndSingleExchangeEvents(exch));
        })
      ).pipe(
        map((resp) => getEventsSuccess(resp, Providers.EXCHANGE, action.payload.email)),
        catchError((error) => of(error))
      )
    )
  );

export const editExchangeSingleEventEpics = (action$) =>
  action$.pipe(
    ofType(EDIT_EXCHANGE_SINGLE_EVENT_BEGIN),
    mergeMap((action) =>
      from(editEwsSingle(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.providerType, resp.user))
      )
    )
  );

const editEwsSingle = async (payload) => {
  const debug = true;

  try {
    const singleAppointment = await asyncGetSingleExchangeEvent(
      payload.user.email,
      payload.user.password,
      'https://outlook.office365.com/Ews/Exchange.asmx',
      payload.originalId
    );

    // TO DO, UPDATE MORE FIELDS
    singleAppointment.Subject = payload.title;
    // singleAppointment.Location = payload.place.name;

    if (debug) {
      console.log(singleAppointment);
    }

    await asyncUpdateExchangeEvent(singleAppointment, payload.user, () => {
      if (debug) {
        console.log('Updated!!');
      }
    });

    const db = await getDb();
    const dbdata = await db.recurrencepatterns.find().exec();

    dbdata.forEach((dbPatt) => console.log(dbPatt.toJSON()));

    if (singleAppointment.IsRecurring) {
      const singleApptRP = await db.recurrencepatterns
        .find()
        .where('iCalUid')
        .eq(singleAppointment.ICalUid)
        .exec();

      console.log(singleApptRP);

      if (singleApptRP.length > 1) {
        console.log('You have two RP in database, Fix that.');
      }
      if (debug) {
        console.log(singleApptRP, singleApptRP[0].toJSON());
      }
      await db.recurrencepatterns
        .find()
        .where('iCalUid')
        .eq(singleAppointment.ICalUid)
        .update({
          $addToSet: {
            recurrenceIds: singleAppointment.Start.MomentDate.format('YYYY-MM-DDTHH:mm:ssZ')
          }
        });

      if (debug) {
        const testresult = await db.recurrencepatterns
          .find()
          .where('iCalUid')
          .eq(singleAppointment.ICalUid)
          .exec();

        console.log(testresult);
      }
    }
  } catch (error) {
    console.log('(editEvent) Error, retrying with pending action!', error, payload.id);

    const db = await getDb();
    // Check if a pending action currently exist for the current item.
    const pendingDoc = db.pendingactions
      .find()
      .where('eventId')
      .eq(payload.id);
    const result = await pendingDoc.exec();
    if (result.length === 0) {
      await db.pendingactions.upsert({
        uniqueId: uuidv4(),
        eventId: payload.id,
        status: 'pending',
        type: 'update'
      });
    }

    const updateDoc = db.events
      .find()
      .where('originalId')
      .eq(payload.id);

    await updateDoc.update({
      $set: {
        summary: payload.title,
        location: payload.place.name,
        local: true
      }
    });
  }
  payload.props.history.push('/');
  return {
    providerType: Providers.EXCHANGE,
    user: payload.user
  };
};

export const editExchangeAllRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(EDIT_EXCHANGE_ALL_EVENT_BEGIN),
    mergeMap((action) =>
      from(editEwsAllRecurrenceEvents(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.providerType, resp.user))
      )
    )
  );

const editEwsAllRecurrenceEvents = async (payload) => {
  const debug = true;

  console.log(payload);
  try {
    const singleAppointment = await asyncGetSingleExchangeEvent(
      payload.user.email,
      payload.user.password,
      'https://outlook.office365.com/Ews/Exchange.asmx',
      payload.recurringEventId
    );

    // TO-DO, ADD MORE FIELDS AGAIN
    singleAppointment.Subject = payload.title;

    console.log(singleAppointment);
    const newRecurrence = createEwsRecurrenceObj(
      payload.firstOption,
      payload.secondOption,
      payload.recurrInterval,
      singleAppointment.Recurrence,
      payload.untilType,
      payload.untilDate,
      payload.untilAfter,
      payload.byMonth,
      payload.byMonthDay,
      payload.byWeekDay,
      payload.byWeekNo
    );

    console.log(newRecurrence);
    debugger;

    const exch = new ExchangeService();
    exch.Url = new Uri('https://outlook.office365.com/Ews/Exchange.asmx');
    exch.Credentials = new ExchangeCredentials(payload.user.email, payload.user.password);

    singleAppointment.Recurrence = newRecurrence;
    await asyncUpdateRecurrExchangeSeries(singleAppointment, payload.user, async () => {
      const allEwsEvents = await asyncGetRecurrAndSingleExchangeEvents(exch);
      if (debug) {
        console.log(allEwsEvents);
      }
      const db = await getDb();

      const updatedRecurrMasterAppointment = await asyncGetSingleExchangeEvent(
        payload.user.email,
        payload.user.password,
        'https://outlook.office365.com/Ews/Exchange.asmx',
        payload.recurringEventId
      );

      const dbRecurrencePattern = parseEwsRecurringPatterns(
        updatedRecurrMasterAppointment.Id.UniqueId,
        updatedRecurrMasterAppointment.Recurrence,
        updatedRecurrMasterAppointment.ICalUid,
        updatedRecurrMasterAppointment.DeletedOccurrences,
        updatedRecurrMasterAppointment.ModifiedOccurrences
      );

      const query = db.recurrencepatterns
        .find()
        .where('iCalUid')
        .eq(payload.iCalUID);

      if (debug) {
        const test = await query.exec();
        console.log(
          test,
          payload.recurrPatternId,
          dbRecurrencePattern,
          updatedRecurrMasterAppointment
        );
      }

      await query.update({
        $set: {
          freq: dbRecurrencePattern.freq,
          interval: dbRecurrencePattern.interval,
          until: dbRecurrencePattern.until,
          exDates: dbRecurrencePattern.exDates,
          recurrenceIds: dbRecurrencePattern.recurrenceIds,
          recurringTypeId: dbRecurrencePattern.recurringTypeId,
          modifiedThenDeleted: dbRecurrencePattern.modifiedThenDeleted,
          weeklyPattern: dbRecurrencePattern.weeklyPattern,
          numberOfRepeats: dbRecurrencePattern.numberOfRepeats,
          iCalUid: dbRecurrencePattern.iCalUid,
          byWeekNo: dbRecurrencePattern.byWeekNo,
          byWeekDay: dbRecurrencePattern.byWeekDay,
          byMonth: dbRecurrencePattern.byMonth,
          byMonthDay: dbRecurrencePattern.byMonthDay
        }
      });

      // const rpQuery = db.recurrencepatterns
      //   .find()
      //   .where('iCalUid')
      //   .eq(payload.iCalUID);

      // await rpQuery.update({
      //   $set: {
      //     freq: dbRecurrencePattern.freq,
      //     interval: dbRecurrencePattern.interval,
      //     until: dbRecurrencePattern.until,
      //     exDates: dbRecurrencePattern.exDates,
      //     recurrenceIds: dbRecurrencePattern.recurrenceIds,
      //     recurringTypeId: dbRecurrencePattern.recurringTypeId,
      //     modifiedThenDeleted: dbRecurrencePattern.modifiedThenDeleted,
      //     weeklyPattern: dbRecurrencePattern.weeklyPattern,
      //     numberOfRepeats: dbRecurrencePattern.numberOfRepeats,
      //     iCalUid: dbRecurrencePattern.iCalUid
      //   }
      // });

      // // We can just add it in as it is a new event from future events.
      // await db.recurrencepatterns.upsert(dbRecurrencePattern);

      await db.events
        .find()
        .where('iCalUID')
        .eq(singleAppointment.ICalUid)
        .remove();
      if (debug) {
        const data = await db.events
          .find()
          .where('iCalUID')
          .eq(singleAppointment.ICalUid)
          .exec();

        console.log(data);
        console.log(
          allEwsEvents.filter((ewsEvent) => ewsEvent.ICalUid === singleAppointment.ICalUid)
        );
      }
      await Promise.all(
        allEwsEvents
          .filter((ewsEvent) => ewsEvent.ICalUid === singleAppointment.ICalUid)
          .map((ewsEvent) =>
            Providers.filterIntoSchema(ewsEvent, Providers.EXCHANGE, payload.user.email, false)
          )
          .map((filteredEwsEvent) => {
            console.log(filteredEwsEvent);
            return db.events.upsert(filteredEwsEvent);
          })
      );
    });
    payload.props.history.push('/');
    return {
      providerType: Providers.EXCHANGE,
      user: payload.user
    };
  } catch (error) {
    console.log(
      '(editEwsAllRecurrenceEvents) Error, retrying with pending action!',
      error,
      payload.id
    );
  }
};

export const editExchangeFutureRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(EDIT_EXCHANGE_FUTURE_EVENT_BEGIN),
    mergeMap((action) =>
      from(editEwsAllFutureRecurrenceEvents(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.providerType, resp.user))
      )
    )
  );

const editEwsAllFutureRecurrenceEvents = async (payload) => {
  const debug = true;
  console.log(payload);
  try {
    // asyncGetSingleExchangeEvent will throw error when no internet or event missing.
    // Get master recurring event
    const recurrMasterAppointment = await asyncGetSingleExchangeEvent(
      payload.user.email,
      payload.user.password,
      'https://outlook.office365.com/Ews/Exchange.asmx',
      payload.recurringEventId
    );

    const newRecurr = createEwsRecurrenceObj(
      payload.firstOption,
      payload.secondOption,
      payload.recurrInterval,
      recurrMasterAppointment.Recurrence,
      payload.untilType,
      payload.untilDate,
      payload.untilAfter,
      payload.byMonth,
      payload.byMonthDay,
      payload.byWeekDay,
      payload.byWeekNo
    );
    console.log(newRecurr);
    const db = await getDb();

    // Get the selected event to update this event
    const singleAppointment = await asyncGetSingleExchangeEvent(
      payload.user.email,
      payload.user.password,
      'https://outlook.office365.com/Ews/Exchange.asmx',
      payload.originalId
    );

    if (debug) {
      console.log(singleAppointment);
    }

    const exch = new ExchangeService();
    exch.Url = new Uri('https://outlook.office365.com/Ews/Exchange.asmx');
    exch.Credentials = new ExchangeCredentials(payload.user.email, payload.user.password);

    // Create a new recurrence based off the old ones.
    const newEvent = new Appointment(exch);

    // TO-DO, add more fields for ews server in the future
    newEvent.Subject = payload.title;
    newEvent.Recurrence = newRecurr;
    newEvent.Recurrence.StartDate = singleAppointment.End;

    if (debug) {
      console.log(newEvent.Recurrence, newRecurr);
    }
    // Upload it to server via Save, then re-get the data due to server side ID population.
    await newEvent
      .Save(WellKnownFolderName.Calendar, SendInvitationsMode.SendToAllAndSaveCopy)
      .then(async () => {
        const item = await Item.Bind(exch, newEvent.Id);

        if (debug) {
          console.log(item);
        }

        // Get all expanded events, and find the new ones within the window
        const allExchangeEvents = await asyncGetAllExchangeEvents(exch);
        const localPrevExpandedItems = allExchangeEvents.filter(
          (event) => event.ICalUid === recurrMasterAppointment.ICalUid
        );
        const expandedItems = allExchangeEvents.filter((event) => event.ICalUid === item.ICalUid);

        // Set the recurrence master ID to link them back, for updating/deleting of series.
        expandedItems.forEach((event) => (event.RecurrenceMasterId = item.Id));

        // Build a new recurrence pattern object, and parse it into the db.
        const dbRecurrencePattern = parseEwsRecurringPatterns(
          item.Id.UniqueId,
          item.Recurrence,
          item.ICalUid,
          recurrMasterAppointment.DeletedOccurrences,
          recurrMasterAppointment.ModifiedOccurrences
        );

        if (debug) {
          console.log(
            allExchangeEvents,
            expandedItems,
            localPrevExpandedItems,
            dbRecurrencePattern,
            item.ICalUid
          );
        }

        const deletingItems = [];
        const nonDeletedItems = [];
        expandedItems.forEach((element) => {
          let added = false;
          dbRecurrencePattern.exDates.forEach((element2) => {
            if (element.Start.MomentDate.isSame(moment(element2), 'day')) {
              deletingItems.push(element);
              added = true;
            }
          });

          if (!added) {
            nonDeletedItems.push(element);
          }
        });

        const modifiedItems = [];
        const nonModifiedItems = [];
        expandedItems.forEach((element) => {
          let added = false;
          dbRecurrencePattern.recurrenceIds.forEach((element2) => {
            if (element.Start.MomentDate.isSame(moment(element2), 'day')) {
              modifiedItems.push(element);
              added = true;
            }
          });

          if (!added) {
            nonModifiedItems.push(element);
          }
        });
        await Promise.all(
          deletingItems.map((deletingAppt) =>
            asyncDeleteExchangeEvent(deletingAppt, payload.user, () => {
              console.log('DELETED SMTH');
            })
          )
        );

        if (debug) {
          console.log(modifiedItems, localPrevExpandedItems, expandedItems);
          console.log(nonModifiedItems, nonDeletedItems);
          const allRP = await db.recurrencepatterns.find().exec();
          console.log(allRP);
        }

        // Update previous recurrence pattern by removing all modified Items
        const rpUpdate = db.recurrencepatterns
          .findOne()
          .where('iCalUid')
          .eq(singleAppointment.ICalUid);
        const previousRp = await rpUpdate.exec();
        const array1 = modifiedItems.map((appt) =>
          appt.Start.MomentDate.format('YYYY-MM-DDTHH:mm:ssZ')
        );
        const array2 = deletingItems.map((appt) =>
          appt.Start.MomentDate.format('YYYY-MM-DDTHH:mm:ssZ')
        );
        if (debug) {
          console.log(previousRp, previousRp.exDates, previousRp.recurrenceIds, array1);
          console.log(previousRp.exDates.filter((exDate) => !array2.includes(exDate)));
          console.log(previousRp.recurrenceIds.filter((exDate) => !array1.includes(exDate)));

          const result = await rpUpdate.exec();
          console.log(result);
        }

        await rpUpdate.update({
          $set: {
            recurrenceIds: previousRp.recurrenceIds.filter((exDate) => !array1.includes(exDate)),
            exDates: previousRp.exDates.filter((exDate) => !array2.includes(exDate))
          }
        });

        if (debug) {
          const rpCheck = db.recurrencepatterns
            .find()
            .where('iCalUid')
            .eq(singleAppointment.ICalUid);

          const result = await rpCheck.exec();
          console.log(result);
        }

        async function asyncForEach(array, callback) {
          for (let index = 0; index < array.length; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            await callback(array[index], index, array);
          }
        }

        await asyncForEach(modifiedItems, async (modifiedAppt) => {
          // Find the specific appt from new list to edit
          const foundItem = localPrevExpandedItems.filter((justGotObj) =>
            justGotObj.Start.MomentDate.isSame(modifiedAppt.Start.MomentDate, 'day')
          )[0];

          if (debug) {
            console.log('Item: ', foundItem, modifiedAppt);
          }
          modifiedAppt.Subject = foundItem.Subject;

          await modifiedAppt
            .Update(
              ConflictResolutionMode.AlwaysOverwrite,
              SendInvitationsOrCancellationsMode.SendToNone
            )
            .then(async (success) => {
              const updatedItem = await asyncGetSingleExchangeEvent(
                payload.user.email,
                payload.user.password,
                'https://outlook.office365.com/Ews/Exchange.asmx',
                modifiedAppt.Id.UniqueId
              );

              const query = db.events
                .find()
                .where('originalId')
                .eq(foundItem.Id.UniqueId);
              await query.remove();
              return updatedItem;
            });
        });

        // We can just add it in as it is a new event from future events.
        await db.recurrencepatterns.upsert(dbRecurrencePattern);

        // Upsert into db, can assume it does not exist as it is a new appointment.
        const promiseArr = nonDeletedItems.map((event) => {
          const filteredEvent = Providers.filterIntoSchema(
            event,
            Providers.EXCHANGE,
            payload.user.email,
            false
          );
          return db.events.upsert(filteredEvent);
        });

        // Wait for all and push it in.
        await Promise.all(promiseArr);
      });

    const checkStart = singleAppointment.Start;

    if (debug) {
      console.log(
        recurrMasterAppointment.ICalUid,
        recurrMasterAppointment.Recurrence.EndDate,
        singleAppointment.Start,
        checkStart.AddDays(-1).MomentDate
      );
      console.log(
        checkStart
          .AddDays(-1)
          .MomentDate.isAfter(recurrMasterAppointment.Recurrence.EndDate.MomentDate)
      );
    }

    // Start is after last event, Deleting entire series.
    if (
      checkStart
        .AddDays(-1)
        .MomentDate.isAfter(recurrMasterAppointment.Recurrence.EndDate.MomentDate)
    ) {
      await asyncDeleteExchangeEvent(recurrMasterAppointment, payload.user, () => {
        console.log('Remote delete?');
      });

      if (debug) {
        const newRp = await db.recurrencepatterns.find().exec();
        console.log(newRp);
      }

      const removingRb = db.recurrencepatterns
        .find()
        .where('originalId')
        .eq(recurrMasterAppointment.Id.UniqueId);
      await removingRb.remove();

      if (debug) {
        const newRp = await db.recurrencepatterns.find().exec();
        console.log(newRp);
      }

      const removedDeletedEventsLocally = await db.events
        .find()
        .where('recurringEventId')
        .eq(payload.recurringEventId)
        .exec();

      if (debug) {
        const allEvents = await db.events.find().exec();
        console.log(removedDeletedEventsLocally, allEvents);
      }

      await Promise.all(
        removedDeletedEventsLocally.map((event) =>
          db.events
            .find()
            .where('originalId')
            .eq(event.originalId)
            .remove()
        )
      );
    } else {
      // Set the recurrance for the events not this and future to the end of selected
      recurrMasterAppointment.Recurrence.EndDate = singleAppointment.Start.AddDays(-1);

      // Update recurrence object for server, and remove the future items in local db
      await recurrMasterAppointment
        .Update(ConflictResolutionMode.AlwaysOverwrite, SendInvitationsMode.SendToNone)
        .then(async () => {
          const allevents = await db.events.find().exec();
          console.log(allevents);

          const removedDeletedEventsLocally = await db.events
            .find()
            .where('recurringEventId')
            .eq(payload.recurringEventId)
            .exec();

          if (debug) {
            console.log(removedDeletedEventsLocally);
          }

          const afterEvents = removedDeletedEventsLocally.filter(
            (event) =>
              moment(event.toJSON().start.dateTime).isAfter(singleAppointment.Start.MomentDate) ||
              moment(event.toJSON().start.dateTime).isSame(singleAppointment.Start.MomentDate)
          );

          if (debug) {
            console.log(afterEvents);
          }
          await Promise.all(
            afterEvents.map((event) =>
              db.events
                .find()
                .where('originalId')
                .eq(event.originalId)
                .remove()
            )
          );
        });
    }

    payload.props.history.push('/');
    return {
      providerType: Providers.EXCHANGE,
      user: payload.user
    };
  } catch (error) {
    console.log(
      '(editEwsAllFutureRecurrenceEvents) Error, retrying with pending action!',
      error,
      payload.id
    );
  }
};
// ----------------------------------- EXCHANGE ------------------------------------ //

// ------------------------------------ GENERAL ------------------------------------ //
export const clearAllEventsEpics = (action$) =>
  action$.pipe(
    ofType(CLEAR_ALL_EVENTS),
    map(() => {
      localStorage.clear();
      RxDB.removeDatabase('eventsdb', 'websql');
      return clearAllEventsSuccess();
    })
  );
// ------------------------------------ GENERAL ------------------------------------ //

// ------------------------------------ CALDAV ------------------------------------ //
export const createCaldavAccountEpics = (action$) =>
  action$.pipe(
    ofType(CalDavActionCreators.RESET_CALDAV_ACCOUNT),
    map(() => {
      const xhrObject = new dav.transport.Basic(
        new dav.Credentials({
          username: Credentials.FASTMAIL_USERNAME,
          password: Credentials.FASTMAIL_PASSWORD
        })
      );
      return CalDavActionCreators.beginCreateAccount({
        server: ServerUrls.FASTMAIL,
        xhr: xhrObject,
        loadObjects: true
      });
    })
  );

export const beginGetCaldavEventsEpics = (action$) =>
  action$.pipe(
    ofType(GET_CALDAV_EVENTS_BEGIN),
    mergeMap((action) =>
      from(
        new Promise(async (resolve, reject) => {
          if (action.payload === undefined) {
            reject(getEventsFailure('Caldav user undefined!!'));
          }
          console.log(action);

          try {
            const cdEvents = await asyncGetAllCalDavEvents(
              action.payload.email,
              action.payload.password,
              action.payload.url
            );
            // debugger;
            console.log(cdEvents);
            resolve(cdEvents);
          } catch (e) {
            console.log(e);
            throw e;
          }
          // // debugger;
          // const resp = await dav.createAccount({
          //   server: action.payload.url,
          //   xhr: new dav.transport.Basic(
          //     new dav.Credentials({
          //       username: action.payload.email,
          //       password: action.payload.password
          //     })
          //   ),
          //   loadObjects: true
          // });

          // const db = await getDb();
          // // This breaks due to how our database works, with id being a uniqid.
          // // so we need find it first then upsert. Yay, no checks again.
          // try {
          //   const calendars = PARSER.parseCal(resp.calendars);
          //   const events = PARSER.parseCalEvents(resp.calendars);
          //   const flatEvents = events.reduce((acc, val) => acc.concat(val), []);
          //   const filteredEvents = flatEvents.filter((event) => event !== '');
          //   const flatFilteredEvents = filteredEvents.reduce((acc, val) => acc.concat(val), []);

          //   const eventPersons = PARSER.parseEventPersons(flatFilteredEvents);
          //   const recurrenceEvents = PARSER.parseRecurrenceEvents(flatFilteredEvents);

          //   const promises = [];
          //   // This is broke, upsert makes no sense atm.
          //   calendars.forEach((calendar) => {
          //     promises.push(db.calendars.upsert(calendar));
          //   });
          //   // Do not upsert here, let the get event success upsert. But handle the rest.
          //   // flatFilteredEvents.forEach((calEvent) => {
          //   //   promises.push(db.events.upsert(calEvent.eventData));
          //   // });

          //   // This has no use atm, upsert makes no sense atm.
          //   eventPersons.forEach((eventPerson) => {
          //     promises.push(db.eventpersons.upsert(eventPerson));
          //   });

          //   // debugger;

          //   const prevRPs = await Promise.all(
          //     recurrenceEvents.map((recurrenceEvent) =>
          //       db.recurrencepatterns
          //         .findOne()
          //         .where('originalId')
          //         .eq(recurrenceEvent.originalId)
          //         .exec()
          //     )
          //   );

          //   let i = 0;
          //   prevRPs.forEach((prevRP) => {
          //     const newRP = recurrenceEvents[i];
          //     if (prevRP === null) {
          //       promises.push(db.recurrencepatterns.upsert(newRP));
          //     } else {
          //       console.log(prevRP, newRP);
          //       promises.push(
          //         db.recurrencepatterns
          //           .findOne()
          //           .where('originalId')
          //           .eq(prevRP.originalId)
          //           .update({
          //             $set: {
          //               id: prevRP.id,
          //               originalId: newRP.originalId,
          //               freq: newRP.freq,
          //               interval: newRP.interval,
          //               until: newRP.until,
          //               exDates: newRP.exDates,
          //               recurrenceIds: newRP.recurrenceIds,
          //               modifiedThenDeleted: newRP.modifiedThenDeleted,
          //               numberOfRepeats: newRP.numberOfRepeats
          //             }
          //           })
          //       );
          //     }
          //     i += 1;
          //   });

          //   console.log(prevRPs);
          //   // debugger;
          //   // console.log(promises);
          //   const results = await Promise.all(promises);
          //   console.log(results, events, flatFilteredEvents);
          //   const expanded = await PARSER.expandRecurEvents(
          //     flatFilteredEvents.map((calEvent) => calEvent.eventData)
          //   );
          //   console.log(expanded, flatFilteredEvents.map((calEvent) => calEvent.eventData));
          //   // debugger;
          //   resolve(expanded);
          //   // resolve(flatFilteredEvents.map((calEvent) => calEvent.eventData));
          // } catch (e) {
          //   throw e;
          // }
        })
      ).pipe(
        map((resp) => getEventsSuccess(resp, Providers.CALDAV, action.payload.email)),
        catchError((error) => of(error))
      )
    )
  );
// ------------------------------------ CALDAV ------------------------------------ //

// ------------------------------------ POLLING ------------------------------------ //
export const pollingEventsEpics = (action$) => {
  const stopPolling$ = action$.pipe(ofType(END_POLLING_EVENTS));
  return action$.pipe(
    // ofType(BEGIN_POLLING_EVENTS, UPDATE_STORED_EVENTS),
    ofType(BEGIN_POLLING_EVENTS),
    switchMap((action) =>
      interval(20 * 1000).pipe(
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
    username: Credentials.FASTMAIL_USERNAME,
    password: Credentials.FASTMAIL_PASSWORD,
    url: 'https://caldav.fastmail.com/dav/',
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
        const db = await getDb();
        const dbEvents = await db.events.find().exec();
        const updatedEvents = [];
        const listOfPriomises = [];

        console.log(appts);

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
            listOfPriomises.push(db.events.upsert(filteredEvent));
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
              const query = db.events
                .findOne()
                .where('originalId')
                .eq(filteredEvent.originalId);
              listOfPriomises.push(
                query.update({
                  $set: filteredEvent
                })
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

          const query = db.events
            .find()
            .where('originalId')
            .eq(dbEvent.originalId);
          listOfPriomises.push(query.remove());
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

        const db = await getDb();
        const dbEvents = await db.events.find().exec();
        const updatedEvents = [];
        const listOfPriomises = [];

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

          debugger;

          if (dbObj.length === 0) {
            // New object from server, add and move on to next one.
            updatedEvents.push({ event: filteredEvent, type: 'create' });
            listOfPriomises.push(db.events.upsert(filteredEvent));
          } else {
            // Sync old objects and compare in case.
            const dbEvent = dbObj[0];

            // Just update, coz caldav, server is always truth, no matter what
            // Also, the damn updated field is never updated. Wtf.
            updatedEvents.push({ event: filteredEvent, type: 'update' });
            filteredEvent.id = dbEvent.id;

            const query = db.events
              .findOne()
              .where('originalId')
              .eq(filteredEvent.originalId)
              .where('start.dateTime')
              .eq(event.start.dateTime);

            listOfPriomises.push(
              query.update({
                $set: filteredEvent
              })
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

          const query = db.events
            .find()
            .where('originalId')
            .eq(dbEvent.originalId);
          listOfPriomises.push(query.remove());
        }
        await Promise.all(listOfPriomises);
        console.log(updatedEvents);
        debugger;
        return updatedEvents;
      } catch (e) {
        console.log(e);
        return [];
      }
    default:
      break;
  }
};
// ------------------------------------ POLLING ------------------------------------ //

// -------------------------------- PENDING ACTIONS -------------------------------- //
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
        concatMap(() =>
          // Get the db
          from(getDb()).pipe(
            exhaustMap((db) =>
              // Get all the pending actions
              from(db.pendingactions.find().exec()).pipe(
                // For each pending action, run the correct result
                mergeMap((actions) =>
                  from(handlePendingActions(action.payload, actions, db)).pipe(
                    // Return an array of result, reduced accordingly.
                    mergeMap((result) => of(...result))
                  )
                )
              )
            )
          )
        )
      )
    )
  );
};

const reflect = (p) =>
  p.then((v) => ({ v, status: 'fulfilled' }), (e) => ({ e, status: 'rejected' }));

const handlePendingActions = async (users, actions, db) => {
  // Get all events for resolving conflict.
  const docs = await db.events.find().exec();

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
      const resultingAction = await handleMergeEvents(rxDbObj, serverObj, db, action.type, user);

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
  const resultingAction = noDuplicateUsers.map((indivAcc) =>
    retrieveStoreEvents(indivAcc.v.user.providerType, indivAcc.v.user)
  );

  // // Unsure if needed due to if all fail to send
  // if (resultingAction.length === 0) {
  //   return [];
  // }
  return resultingAction;
};

const handleMergeEvents = async (localObj, serverObj, db, type, user) => {
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
      const query = db.pendingactions
        .find()
        .where('eventId')
        .eq(localObj.originalId);
      await query.remove();

      // Remove the temp event if it exists. For newly created events.
      const removeFromEvents = db.events
        .find()
        .where('originalId')
        .eq(localObj.originalId);
      await removeFromEvents.remove();

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
                const query = db.pendingactions
                  .find()
                  .where('eventId')
                  .eq(filteredServerObj.originalId);
                await query.remove();
              }
              return result;
            case 'delete':
              result = await asyncDeleteExchangeEvent(serverObj, user, () => {
                console.log('deleted exchange event');
              });

              if (result.type === 'DELETE_EVENT_SUCCESS') {
                const query = db.pendingactions
                  .find()
                  .where('eventId')
                  .eq(filteredServerObj.originalId);
                await query.remove();
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
      // console.log(
      //   'Handle merging here, but for now, discard all pending actions and keep server'
      // );

      // Keep server
      await db.events.upsert(filteredServerObj);
      const query = db.pendingactions
        .find()
        .where('eventId')
        .eq(filteredServerObj.originalId);
      await query.remove();

      return editEventSuccess(serverObj);
    }
  } else {
    // Keep server
    db.events.upsert(filteredServerObj);

    const query = db.pendingactions
      .find()
      .where('eventId')
      .eq(filteredServerObj.originalId);
    await query.remove();

    return editEventSuccess(serverObj);
  }
};
// -------------------------------- PENDING ACTIONS -------------------------------- //
