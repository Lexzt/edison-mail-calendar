import { map, mergeMap, catchError } from 'rxjs/operators';
import { ofType } from 'redux-observable';
import { from } from 'rxjs';
import uuidv4 from 'uuid';
import {
  SendInvitationsMode,
  ConflictResolutionMode,
  Recurrence,
  DateTime
} from 'ews-javascript-api';
import moment from 'moment';
import {
  RETRIEVE_STORED_EVENTS,
  BEGIN_STORE_EVENTS,
  updateStoredEvents,
  successStoringEvents,
  failStoringEvents,
  beginStoringEvents,
  retrieveStoreEvents
} from '../../actions/db/events';
import {
  POST_EVENT_SUCCESS,
  GET_EVENTS_SUCCESS,
  DELETE_EVENT_BEGIN,
  DELETE_RECURRENCE_SERIES_BEGIN,
  DELETE_RECURRENCE_SERIES_SUCCESS,
  DELETE_FUTURE_RECURRENCE_SERIES_BEGIN
} from '../../actions/events';
import { deleteGoogleEvent, loadClient } from '../../utils/client/google';
import { asyncGetSingleExchangeEvent, asyncDeleteExchangeEvent } from '../../utils/client/exchange';
import getDb from '../../db';
import * as Providers from '../../utils/constants';
import parser, { buildRuleSet } from '../../utils/parser';
import * as IcalStringBuilder from '../../utils/icalStringBuilder';
import serverUrls from '../../utils/serverUrls';
import credentials from '../../utils/Credentials';
import {
  deleteCalDavSingleEventBegin,
  deleteCalDavAllEventBegin,
  deleteCalDavFutureEventBegin
} from '../../actions/providers/caldav';
import {
  deleteEwsSingleEventBegin,
  deleteEwsAllEventBegin,
  deleteEwsFutureEventBegin
} from '../../actions/providers/exchange';

const dav = require('dav');

export const retrieveEventsEpic = (action$) =>
  action$.pipe(
    ofType(RETRIEVE_STORED_EVENTS),
    mergeMap((action) =>
      from(getDb()).pipe(
        mergeMap((db) =>
          from(db.events.find().exec()).pipe(
            map((events) =>
              // console.log(action);
              events.filter(
                (singleEvent) => singleEvent.providerType === action.payload.user.providerType
              )
            ),
            map((events) =>
              // console.log(events.map((e) => e.toJSON()));
              events.map((singleEvent) => ({
                id: singleEvent.id,
                end: singleEvent.end,
                start: singleEvent.start,
                summary: singleEvent.summary,
                organizer: singleEvent.organizer,
                recurrence: singleEvent.recurrence,
                iCalUID: singleEvent.iCalUID,
                iCALString: singleEvent.iCALString,
                attendees: singleEvent.attendees,
                originalId: singleEvent.originalId,
                owner: singleEvent.owner,
                hide: singleEvent.hide,
                isRecurring: singleEvent.isRecurring,
                isModifiedThenDeleted: singleEvent.isModifiedThenDeleted,
                calendarId: singleEvent.calendarId,
                providerType: singleEvent.providerType,
                isMaster: singleEvent.isMaster,
                caldavType: singleEvent.caldavType
              }))
            ),
            map((results) =>
              // console.log(results);
              updateStoredEvents(results, action.payload.user)
            )
          )
        )
      )
    )
  );

export const storeEventsEpic = (action$) =>
  action$.pipe(
    ofType(BEGIN_STORE_EVENTS),
    mergeMap((action) =>
      from(storeEvents(action.payload)).pipe(
        mergeMap((allEvents) => mergeRecurringAndNonRecurringEvents(allEvents)),
        map((results) => successStoringEvents(results)),
        catchError((error) => failStoringEvents(error))
      )
    )
  );

const mergeRecurringAndNonRecurringEvents = async (allEvents) => {
  // debugger;
  console.log('allEvents:', allEvents);
  const expandedEvents = await parser.expandRecurEvents(allEvents);

  // const db = await getDb();
  // expandedEvents.map((e) => {
  //   if (e.providerType === Providers.CALDAV) {
  //     db.events
  //       .findOne()
  //       .where('iCalUID')
  //       .eq(e.iCalUID)
  //       .where('start.dateTime')
  //       .eq(e.start.dateTime)
  //       .exec();
  //   }
  // })

  // return [...expandedEvents, ...allEvents.filter((e) => !e.isRecurring)];
  return allEvents;
};

export const beginStoreEventsEpic = (action$) =>
  action$.pipe(
    ofType(POST_EVENT_SUCCESS, GET_EVENTS_SUCCESS),
    map((action) => beginStoringEvents(action.payload))
  );

export const deleteSingleEventEpics = (action$) =>
  action$.pipe(
    ofType(DELETE_EVENT_BEGIN),
    mergeMap((action) => from(deleteSingleEvent(action.payload)).pipe(map((resp) => resp)))
  );

export const deleteAllRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(DELETE_RECURRENCE_SERIES_BEGIN),
    mergeMap((action) => from(deleteAllReccurenceEvent(action.payload)).pipe(map((resp) => resp)))
  );

export const deleteFutureRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(DELETE_FUTURE_RECURRENCE_SERIES_BEGIN),
    mergeMap((action) =>
      from(deleteFutureReccurenceEvent(action.payload)).pipe(map((resp) => resp))
    )
  );

const storeEvents = async (payload) => {
  const db = await getDb();
  const addedEvents = [];
  const dbFindPromises = [];
  const dbUpsertPromises = [];
  const { data } = payload;
  const debug = false;

  if (debug) {
    console.log(data);
    const alle = await db.events.find().exec();
    console.log(alle.map((e) => e.toJSON().start));
  }

  // Create a list of promises to retrieve previous event from db first if it does not exist.
  for (const dbEvent of data) {
    // Filter into our schema object as we need to know how to deal with it for originalId.
    const filteredEvent = Providers.filterIntoSchema(
      dbEvent,
      payload.providerType,
      payload.owner,
      false
    );

    // Unable to use origianlId as originalId is duplicated for CalDav. Argh.
    dbFindPromises.push(
      db.events
        .findOne()
        .where('iCalUID')
        .eq(filteredEvent.iCalUID)
        .where('start.dateTime')
        .eq(filteredEvent.start.dateTime)
        .exec()
    );
  }

  // Wait for all the promises to complete
  const results = await Promise.all(dbFindPromises);
  // console.log(results.map((e) => e.toJSON()));
  debugger;

  // Assumtion here is that dbFindPromises is going to be the list of query that is our previous data accordingly.
  // dbFindPromises must have same length as results, as its just an array of same size.
  // This ensure the index of data is the same with find query index.
  for (let i = 0; i < results.length; i += 1) {
    // debugger;
    const filteredEvent = Providers.filterIntoSchema(
      data[i],
      payload.providerType,
      payload.owner,
      false
    );

    // Means it is a new object, we upsert coz filtered event already is new.
    if (results[i] === null) {
      dbUpsertPromises.push(db.events.upsert(filteredEvent));
    } else {
      // Take back old primary ID, so we do not create another object.
      filteredEvent.id = results[i].id;

      // eslint-disable-next-line no-await-in-loop
      await db.events
        .findOne()
        .where('iCalUID')
        .eq(filteredEvent.iCalUID)
        .where('start.dateTime')
        .eq(filteredEvent.start.dateTime)
        .update({ $set: filteredEvent });
    }

    // This is for all the events, for UI.
    addedEvents.push(filteredEvent);
  }
  debugger;
  try {
    await Promise.all(dbUpsertPromises);
    console.log(addedEvents);
  } catch (e) {
    console.log(e);
  }
  return addedEvents;
};

const deleteSingleEvent = async (id) => {
  const debug = true;

  // #region Getting information
  // Get database
  const db = await getDb();
  const query = db.events
    .find()
    .where('id')
    .eq(id);

  // Find the proper item on database
  const datas = await query.exec();
  if (datas.length !== 1) {
    console.error('Omg, actually a collision?');
  }
  const data = datas[0];
  console.log(datas, data);

  // Find the proper user on database
  const users = await db.users
    .find()
    .where('providerType')
    .eq(datas[0].providerType)
    .where('email')
    .eq(datas[0].owner)
    .exec();

  if (users.length !== 1) {
    console.error('Omg, actually a collision?');
  }
  const user = users[0];
  console.log(user);
  // #endregion

  // Edge case, means user created an event offline, and is yet to upload it to service.
  // In that case, we shuld remove it from pending action if it exists.
  if (data.local === true) {
    const pendingactionRemoval = db.pendingactions
      .find()
      .where('eventId')
      .eq(data.originalId);

    await pendingactionRemoval.remove();
    await query.remove();

    return {
      providerType: data.providerType,
      user: Providers.filterUsersIntoSchema(user)
    };
  }

  // if it is a recurring event, I need to add it into the ExDates, which is located in our RP database.
  if (data.isRecurring) {
    switch (data.providerType) {
      case Providers.GOOGLE:
        console.log(data.providerType, ' not handling adding of exDates for recurring pattern');
        break;
      case Providers.OUTLOOK:
        console.log(data.providerType, ' not handling adding of exDates for recurring pattern');
        break;
      case Providers.EXCHANGE:
        const addingIntoRpQuery = db.recurrencepatterns
          .find()
          .where('iCalUID')
          .eq(data.iCalUID);

        if (debug) {
          const result = await addingIntoRpQuery.exec();
          console.log(result[0].toJSON());
        }

        addingIntoRpQuery.update({
          $addToSet: {
            exDates: data.start.dateTime
          }
        });

        if (debug) {
          const addingIntoRpQuery2 = db.recurrencepatterns
            .find()
            .where('iCalUID')
            .eq(data.iCalUID);

          const result2 = await addingIntoRpQuery2.exec();
          console.log(result2[0].toJSON());
        }
        break;
      case Providers.CALDAV:
        const cdAddingIntoRpQuery = db.recurrencepatterns
          .find()
          .where('originalId')
          .eq(data.iCalUID);

        if (debug) {
          const result = await cdAddingIntoRpQuery.exec();
          console.log(result[0].toJSON());
        }

        await cdAddingIntoRpQuery.update({
          $addToSet: {
            exDates: data.start.dateTime
          }
        });
        break;
      default:
        console.log(
          'Unhandled provider: ',
          data.providerType,
          ' for adding of exDates for recurring pattern'
        );
        break;
    }
  }

  // Set up the payload for the providers to handle.
  const payload = {
    db,
    data,
    user
  };

  // Based off which provider, we will have different delete functions.
  switch (data.providerType) {
    case Providers.GOOGLE:
      try {
        // // Google is broken, ignore first.
        // await loadClient();
        // const responseFromAPI = await deleteGoogleEvent(data.get('originalId'));
        // await query.remove();
        console.log('Google, To-Do delete feature');
      } catch (googleError) {
        console.log('Handle Google pending action here', googleError);
      }
      break;
    case Providers.OUTLOOK:
      try {
        console.log('Outlook, To-Do delete feature');
      } catch (outlookError) {
        console.log('Handle Outlook pending action here', outlookError);
      }
      break;
    case Providers.EXCHANGE:
      // Try catch for HTTP errors, offline etc.
      try {
        return deleteEwsSingleEventBegin(payload);
      } catch (exchangeError) {
        // Delete doc is meant for both offline and online actions.
        const deleteDoc = db.events
          .find()
          .where('originalId')
          .eq(data.get('originalId'));

        // This means item has been deleted on server, maybe by another user
        // Handle this differently.
        if (exchangeError.ErrorCode === 249) {
          // Just remove it from database instead, and break;
          await deleteDoc.remove();
          break;
        }

        // Upsert it to the pending action, let pending action automatically handle it.
        db.pendingactions.upsert({
          uniqueId: uuidv4(),
          eventId: data.get('originalId'),
          status: 'pending',
          type: 'delete'
        });

        // Hide the item, and set it to local as it has been updated.
        await deleteDoc.update({
          $set: {
            hide: true,
            local: true
          }
        });
      }
      break;
    case Providers.CALDAV:
      try {
        return deleteCalDavSingleEventBegin(payload);
      } catch (caldavError) {
        console.log('Handle Caldav pending action here', caldavError);
      }
      break;
    default:
      console.log(`Delete feature for ${data.providerType} not handled`);
      break;
  }

  // Return which user has been edited.
  return {
    providerType: data.providerType,
    user: Providers.filterUsersIntoSchema(user)
  };
};

const deleteAllReccurenceEvent = async (id) => {
  const debug = false;

  // #region Getting information
  // Get database
  const db = await getDb();
  const query = db.events
    .find()
    .where('id')
    .eq(id);

  // Find the proper item on database
  const datas = await query.exec();
  if (datas.length !== 1) {
    console.error('Omg, actually a collision?');
  }
  const data = datas[0];
  console.log(data);

  // Find the proper user on database
  const users = await db.users
    .find()
    .where('providerType')
    .eq(datas[0].providerType)
    .where('email')
    .eq(datas[0].owner)
    .exec();

  if (users.length !== 1) {
    console.error('Omg, actually a collision?');
  }
  const user = users[0];
  // #endregion

  // Edge case, means user created an event offline, and is yet to upload it to service.
  // In that case, we shuld remove it from pending action if it exists.
  if (data.local === true) {
    const pendingactionRemoval = db.pendingactions
      .find()
      .where('eventId')
      .eq(data.originalId);

    await pendingactionRemoval.remove();
    await query.remove();

    return {
      providerType: data.providerType,
      user: Providers.filterUsersIntoSchema(user)
    };
  }

  // As we are deleting a series, we need to delete the recurrence pattern from db to ensure our databasedoes not blow up accordingly.
  if (data.isRecurring) {
    switch (data.providerType) {
      case Providers.GOOGLE:
        console.log(data.providerType, ' not handling deleting of recurring pattern');
        break;
      case Providers.OUTLOOK:
        console.log(data.providerType, ' not handling deleting of recurring pattern');
        break;
      case Providers.EXCHANGE:
        if (debug) {
          const allRP = await db.recurrencepatterns.find().exec();
          console.log(allRP);
        }

        const removingRb = db.recurrencepatterns
          .find()
          .where('iCalUID')
          .eq(data.iCalUID);
        await removingRb.remove();

        if (debug) {
          const newRp = await db.recurrencepatterns.find().exec();
          console.log(newRp);
        }
        break;
      case Providers.CALDAV:
        // Duplicate now, I just wanna get it working
        if (debug) {
          const allRP = await db.recurrencepatterns.find().exec();
          console.log(allRP);
        }

        const removingRbCd = db.recurrencepatterns
          .find()
          .where('iCalUID')
          .eq(data.iCalUID);
        await removingRbCd.remove();

        if (debug) {
          const newRp = await db.recurrencepatterns.find().exec();
          console.log(newRp);
        }
        break;
      default:
        console.log('Unhandled provider: ', data.providerType, ' for deleting recurring pattern');
        break;
    }
  }

  // Set up the payload for the providers to handle.
  const payload = {
    db,
    data,
    user
  };

  // Based off which provider, we will have different delete functions.
  switch (data.providerType) {
    case Providers.GOOGLE:
      await loadClient();
      const responseFromAPI = await deleteGoogleEvent(data.get('originalId'));
      await query.remove();
      break;
    case Providers.OUTLOOK:
      console.log('Outlook, To-Do delete feature');
      break;
    case Providers.EXCHANGE:
      try {
        return deleteEwsAllEventBegin(payload);
      } catch (error) {
        const deleteDoc = db.events
          .find()
          .where('recurringEventId')
          .eq(data.get('recurringEventId'));

        // This means item has been deleted on server, maybe by another user
        // Handle this differently.
        if (error.ErrorCode === 249) {
          // Just remove it from database instead, and break;
          await deleteDoc.remove();
          break;
        }

        // Upsert it to the pending action, let pending action automatically handle it.
        db.pendingactions.upsert({
          uniqueId: uuidv4(),
          eventId: data.get('originalId'),
          status: 'pending',
          type: 'delete'
        });

        // Hide the item, and set it to local as it has been updated.
        await deleteDoc.update({
          $set: {
            hide: true,
            local: true
          }
        });
      }
      break;
    case Providers.CALDAV:
      try {
        return deleteCalDavAllEventBegin(payload);
      } catch (caldavError) {
        console.log('Handle Caldav pending action here', caldavError);
      }
      break;
    default:
      console.log(`Delete feature for ${data.providerType} not handled`);
      break;
  }

  // Return which user has been edited.
  return {
    providerType: data.providerType,
    user: Providers.filterUsersIntoSchema(user)
  };
};

const deleteFutureReccurenceEvent = async (id) => {
  const debug = true;

  // #region Getting information
  // Get database
  const db = await getDb();
  const query = db.events
    .find()
    .where('id')
    .eq(id);

  // Find the proper item on database
  const datas = await query.exec();
  if (datas.length !== 1) {
    console.error('Omg, actually a collision?');
  }
  const data = datas[0];
  console.log(data);

  // Find the proper user on database
  const users = await db.users
    .find()
    .where('providerType')
    .eq(datas[0].providerType)
    .where('email')
    .eq(datas[0].owner)
    .exec();

  if (users.length !== 1) {
    console.error('Omg, actually a collision?');
  }
  const user = users[0];
  // #endregion

  // Edge case, means user created an event offline, and is yet to upload it to service.
  // In that case, we shuld remove it from pending action if it exists.
  if (data.local === true) {
    const pendingactionRemoval = db.pendingactions
      .find()
      .where('eventId')
      .eq(data.originalId);

    await pendingactionRemoval.remove();
    await query.remove();

    return {
      providerType: data.providerType,
      user: Providers.filterUsersIntoSchema(user)
    };
  }

  // Set up the payload for the providers to handle.
  const payload = {
    db,
    data,
    user
  };

  // Based off which provider, we will have different delete functions.
  switch (data.providerType) {
    case Providers.GOOGLE:
      await loadClient();
      const responseFromAPI = await deleteGoogleEvent(data.get('originalId'));
      await query.remove();
      break;
    case Providers.OUTLOOK:
      console.log('Outlook, To-Do delete feature');
      break;
    case Providers.EXCHANGE:
      try {
        return deleteEwsFutureEventBegin(payload);
      } catch (error) {
        console.log(error);
      }
      break;
    case Providers.CALDAV:
      try {
        return deleteCalDavFutureEventBegin(payload);
      } catch (caldavError) {
        console.log('Handle Caldav pending action here', caldavError);
      }
      break;
    default:
      console.log(`Delete feature for ${data.providerType} not handled`);
      break;
  }

  // Return which user has been edited.
  return {
    providerType: data.providerType,
    user: Providers.filterUsersIntoSchema(user)
  };
};
