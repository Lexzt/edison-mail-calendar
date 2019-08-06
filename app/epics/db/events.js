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

const dav = require('dav');

export const retrieveEventsEpic = (action$) =>
  action$.pipe(
    ofType(RETRIEVE_STORED_EVENTS),
    mergeMap((action) =>
      from(getDb()).pipe(
        mergeMap((db) =>
          from(db.events.find().exec()).pipe(
            map((events) => {
              console.log(action);
              return events.filter(
                (singleEvent) => singleEvent.providerType === action.payload.providerType
              );
            }),
            map((events) => {
              console.log(events.map((e) => e.toJSON()));
              return events.map((singleEvent) => ({
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
                isMaster: singleEvent.isMaster
              }));
            }),
            map((results) => {
              console.log(results);
              return updateStoredEvents(results, action.payload.user);
            })
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
    mergeMap((action) =>
      from(deleteSingleEvent(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.providerType, resp.user))
      )
    )
  );

export const deleteAllRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(DELETE_RECURRENCE_SERIES_BEGIN),
    mergeMap((action) =>
      from(deleteAllReccurenceEvent(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.providerType, resp.user))
      )
    )
  );

export const deleteFutureRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(DELETE_FUTURE_RECURRENCE_SERIES_BEGIN),
    mergeMap((action) =>
      from(deleteFutureReccurenceEvent(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.providerType, resp.user))
      )
    )
  );

const storeEvents = async (payload) => {
  const db = await getDb();
  const addedEvents = [];
  const dbFindPromises = [];
  const dbUpsertPromises = [];
  const { data } = payload;

  // debugger;

  console.log(data);

  // if (debug) {
  const alle = await db.events.find().exec();
  console.log(alle.map((e) => e.toJSON().start));
  // }

  // Create a list of promises to retrieve previous event from db first if it does not exist.
  for (const dbEvent of data) {
    // Filter into our schema object as we need to know how to deal with it for originalId.
    const filteredEvent = Providers.filterIntoSchema(
      dbEvent,
      payload.providerType,
      payload.owner,
      false
    );
    console.log(filteredEvent);

    // As id is the uniqid on our side, we need to find and update or delete accordingly.
    // We use filtered object as it has casted it into our schema object type.
    // dbFindPromises.push(
    //   db.events
    //     .findOne()
    //     .where('originalId')
    //     .eq(filteredEvent.originalId)
    //     .exec()
    // );

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

  console.log('herE?');

  // Wait for all the promises to complete
  const results = await Promise.all(dbFindPromises);
  console.log(results);
  // console.log(results.map((e) => e.toJSON()));

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
    console.log(filteredEvent);

    // Means it is a new object, we upsert coz filtered event already is new.
    if (results[i] === null) {
      dbUpsertPromises.push(db.events.upsert(filteredEvent));
    } else {
      // Take back old primary ID, so we do not create another object.
      filteredEvent.id = results[i].id;

      // Push an update query instead of a upsert. Ensure ID is the same.
      // dbUpsertPromises.push(
      //   db.events
      //     .findOne()
      //     .where('originalId')
      //     .eq(filteredEvent.originalId)
      //     .update({
      //       $set: filteredEvent
      //     })
      // );

      // dbUpsertPromises.push(
      //   db.events
      //     .findOne()
      //     .where('originalId')
      //     .eq(filteredEvent.originalId)
      //     .atomicUpdate(changeFunc)
      // );

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
  console.log('here?2', dbUpsertPromises);

  await Promise.all(dbUpsertPromises);
  console.log(addedEvents);
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
      // Delete doc is meant for both offline and online actions.
      const deleteDoc = db.events
        .find()
        .where('originalId')
        .eq(data.get('originalId'));

      // Try catch for HTTP errors, offline etc.
      try {
        // asyncGetSingleExchangeEvent will throw error when no internet or event missing.
        const singleAppointment = await asyncGetSingleExchangeEvent(
          user.email,
          user.password,
          'https://outlook.office365.com/Ews/Exchange.asmx',
          data.get('originalId')
        );

        await asyncDeleteExchangeEvent(singleAppointment, user, () => {
          // Lambda for future if needed.
        });

        await deleteDoc.remove();
      } catch (exchangeError) {
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
      // Try catch for HTTP errors, offline etc.
      try {
        let result;

        // Needed information for deleting of Caldav information.
        // etag - Event tag, there is the same for calendar if needed.
        //   UUID generated by caldav servers
        // caldavUrl - URL of specific endpoint for deleting single or recurrring events
        const { etag, caldavUrl } = data;

        // Parse user information from account layer to dav object.
        const xhrObject = new dav.transport.Basic(
          new dav.Credentials({
            username: user.email,
            password: user.password
          })
        );
        // Ensure etag is set in option for no 412 http error.
        const option = {
          xhr: xhrObject,
          etag
        };

        // For recurring events, we want to just add it to ex dates instead
        // Due to caldav nature, deleting an etag instead of updating results in deleting of
        // entire series.
        // Updating is done by pushing the entire iCal string to the server
        if (data.isRecurring) {
          // Get recurring pattern to build new iCal string for updating
          const recurrenceObjectQuery = db.recurrencepatterns
            .findOne()
            .where('originalId')
            .eq(data.iCalUID);
          const recurrence = await recurrenceObjectQuery.exec();
          const recurrenceObject = recurrence.toJSON();

          // Builds the iCal string
          const iCalString = IcalStringBuilder.buildICALStringDeleteRecurEvent(
            recurrenceObject,
            data.start.dateTime,
            data
          );
          console.log(iCalString);

          // Due to how there is no master,
          // We need to ensure all events that are part of the series
          // have the same iCal string such that we do not have inconsistency.
          // Run a db query, to update them all to the new iCalString.
          const allRecurringEvents = db.events
            .find()
            .where('originalId')
            .eq(data.iCalUID);
          await allRecurringEvents.update({
            $set: {
              iCALString: iCalString
            }
          });

          // To delete a single recurring pattern, the calendar object is different.
          // So we add the string into the object we are PUT-ing to the server
          const calendarData = iCalString;
          const calendarObject = {
            url: caldavUrl,
            calendarData
          };
          // Result will throw error, we can do a seperate check here if needed.
          result = await dav.updateCalendarObject(calendarObject, option);
        } else {
          // As we are deleting a single object, non recurring event
          // It is identified by etag. So for our calendar object,
          // We just need to know the endpoint, which is the caldavUrl
          const calendarObject = {
            url: caldavUrl
          };
          // Result will throw error, we can do a seperate check here if needed.
          result = await dav.deleteCalendarObject(calendarObject, option);
        }
        console.log(result);

        // Remove it from the database for updating of UI.
        const removedEvent = await query.remove();
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
      const deleteDoc = db.events
        .find()
        .where('recurringEventId')
        .eq(data.get('recurringEventId'));

      try {
        // asyncGetSingleExchangeEvent will throw error when no internet or event missing.
        const singleAppointment = await asyncGetSingleExchangeEvent(
          user.email,
          user.password,
          'https://outlook.office365.com/Ews/Exchange.asmx',
          data.get('recurringEventId')
        );

        console.log(singleAppointment);

        await asyncDeleteExchangeEvent(singleAppointment, user, () => {
          // Lambda for future if needed.
        });

        await deleteDoc.remove();
      } catch (error) {
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
      const deleteDocs = db.events
        .find()
        .where('originalId')
        .eq(data.iCalUID);

      try {
        // Needed information for deleting of Caldav information.
        // etag - Event tag, there is the same for calendar if needed.
        //   UUID generated by caldav servers
        // caldavUrl - URL of specific endpoint for deleting single or recurrring events
        const { etag, caldavUrl } = data;

        // Parse user information from account layer to dav object.
        const xhrObject = new dav.transport.Basic(
          new dav.Credentials({
            username: user.email,
            password: user.password
          })
        );
        // Ensure etag is set in option for no 412 http error.
        const option = {
          xhr: xhrObject,
          etag
        };

        // To delete the entire series, find a event with an etag, and run delete on it.
        // Do not need calendar as etag is the only identifier you need.
        const calendarObject = {
          url: caldavUrl
        };
        // Result will throw error, we can do a seperate check here if needed.
        const result = await dav.deleteCalendarObject(calendarObject, option);
        console.log(result);

        // Remove all the recurring events accordingly.
        const removedEvent = await deleteDocs.remove();
      } catch (caldavError) {
        console.log('Handle Caldav pending action here', caldavError);
      }
      break;
    default:
      console.log(`Delete feature for ${data.providerType} not handled`);
      break;
  }

  // const rpRemoveQuery = db.recurrencepatterns
  //   .find()
  //   .where('originalId')
  //   .eq(data.iCalUID);

  // // Remove all the recurring events accordingly.
  // const removedEvent = await rpRemoveQuery.remove();

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
        // asyncGetSingleExchangeEvent will throw error when no internet or event missing.
        const recurrMasterAppointment = await asyncGetSingleExchangeEvent(
          user.email,
          user.password,
          'https://outlook.office365.com/Ews/Exchange.asmx',
          data.get('recurringEventId')
        );

        const singleAppointment = await asyncGetSingleExchangeEvent(
          user.email,
          user.password,
          'https://outlook.office365.com/Ews/Exchange.asmx',
          data.get('originalId')
        );

        console.log(recurrMasterAppointment, data, singleAppointment);
        debugger;
        if (
          recurrMasterAppointment.Recurrence.StartDate.MomentDate.isSame(
            moment(data.start.dateTime),
            'day'
          )
        ) {
          console.log('Deleting entire series');

          await asyncDeleteExchangeEvent(recurrMasterAppointment, user, () => {
            // Lambda for future if needed.
          });

          const removingRb = db.recurrencepatterns
            .find()
            .where('iCalUID')
            .eq(data.iCalUID);
          await removingRb.remove();
        } else {
          if (debug) {
            console.log('Editing end date of recurrence and re-getting');

            const rpDatabase = db.recurrencepatterns
              .find()
              .where('iCalUID')
              .eq(data.iCalUID);

            const rpDatabaseVals = await rpDatabase.exec();
            console.log('Before anything ', rpDatabaseVals);
          }
          const newStartTime = singleAppointment.Start.MomentDate.clone();
          const dt = new DateTime(newStartTime.startOf('day').add(-1, 'day'));
          recurrMasterAppointment.Recurrence.EndDate = dt;
          await recurrMasterAppointment
            .Update(ConflictResolutionMode.AlwaysOverwrite, SendInvitationsMode.SendToNone)
            .then(async () => {
              if (debug) {
                console.log('here', data.get('recurringEventId'));
                const allevents = await db.events.find().exec();
                console.log(allevents);
              }

              const removedDeletedEventsLocally = await db.events
                .find()
                .where('recurringEventId')
                .eq(data.get('recurringEventId'))
                .exec();

              console.log(
                removedDeletedEventsLocally,
                singleAppointment.Start.MomentDate,
                singleAppointment.End.MomentDate,
                singleAppointment
              );

              const endTime = singleAppointment.Start.MomentDate.clone();

              const afterEvents = removedDeletedEventsLocally.filter((event) =>
                moment(event.toJSON().start.dateTime).isSameOrAfter(endTime)
              );

              await Promise.all(
                afterEvents.map((event) =>
                  db.events
                    .find()
                    .where('originalId')
                    .eq(event.originalId)
                    .remove()
                )
              );

              const updatingDb = db.recurrencepatterns
                .find()
                .where('iCalUID')
                .eq(data.iCalUID);

              const updateDbVals = await updatingDb.exec();

              if (debug) {
                const checkingData = await updatingDb.exec();
                console.log('Before ', checkingData);
                console.log(updateDbVals[0].exDates);
              }

              // Filter ex dates down so that when we scale, ex dates does not constantly expand.
              const newExDates = updateDbVals[0].exDates.filter(
                (dateTimeString) =>
                  moment(dateTimeString).isAfter(moment(updateDbVals[0].recurringTypeId), 'day') &&
                  moment(dateTimeString).isBefore(
                    recurrMasterAppointment.Recurrence.EndDate.MomentDate
                  ),
                'day'
              );

              if (debug) {
                console.log(newExDates);
              }

              await updatingDb.update({
                $set: {
                  until: recurrMasterAppointment.Recurrence.EndDate.MomentDate.format(
                    'YYYY-MM-DDTHH:mm:ssZ'
                  ),
                  exDates: newExDates
                }
              });

              if (debug) {
                const newUpdatingDb = db.recurrencepatterns
                  .find()
                  .where('iCalUID')
                  .eq(data.iCalUID);

                const newData = await newUpdatingDb.exec();
                console.log('After ', newData);
              }
            });
        }
      } catch (error) {
        console.log(error);
      }
      break;
    case Providers.CALDAV:
      try {
        // Needed information for deleting of Caldav information.
        // etag - Event tag, there is the same for calendar if needed.
        //   UUID generated by caldav servers
        // caldavUrl - URL of specific endpoint for deleting single or recurrring events
        const { etag, caldavUrl } = data;

        // Parse user information from account layer to dav object.
        const xhrObject = new dav.transport.Basic(
          new dav.Credentials({
            username: user.email,
            password: user.password
          })
        );
        // Ensure etag is set in option for no 412 http error.
        const option = {
          xhr: xhrObject,
          etag
        };

        // For recurring events, we want to ensure exdates is clean too.
        // Clean means no duplicate, and has the right values.
        // This ensures that if we re-expand the series, the exdates are not copied over
        // It is starting to look like CalDav is just a storage service, as there can be duplicates.
        // Due to caldav nature, we can just update the end condition accordingly.
        // As we are deleting this and future events, we just need to update the end condition.
        // Updating is done by pushing the entire iCal string to the server
        // Get recurring pattern to build new iCal string for updating
        const recurrenceObjectQuery = db.recurrencepatterns
          .findOne()
          .where('originalId')
          .eq(data.iCalUID);
        const recurrence = await recurrenceObjectQuery.exec();
        const recurrencePattern = recurrence.toJSON();
        console.log(data);
        debugger;

        // Problem here is that updating the rp based on the exDates and recurringIds.
        // This means we need to remove it from the rp and build the rp based on them.
        // Note that we cannot edit the RxDoc directly, therefore, we use the JsonObject
        // We set the exDates according to if it is before the selected start time.
        // Compared using moment.
        recurrencePattern.exDates = recurrencePattern.exDates.filter((date) =>
          moment(date).isBefore(moment(data.start.dateTime))
        );

        // Do the same for edited ids.
        recurrencePattern.recurrenceIds = recurrencePattern.recurrenceIds.filter((date) =>
          moment(date).isBefore(moment(data.start.dateTime))
        );

        const ruleSet = buildRuleSet(recurrencePattern, data.originalStartTime.dateTime);
        const recurDates = ruleSet.all().map((date) => date.toJSON());
        const recurrAfterDates = recurDates.filter((date) =>
          moment(date).isSameOrAfter(moment(data.start.dateTime))
        );

        // To settle the end condition
        if (recurrencePattern.numberOfRepeats > 0) {
          recurrencePattern.numberOfRepeats -= recurrAfterDates.length;
        } else if (recurrencePattern.until !== '') {
          // Need to test util end date, coz date time is ical type.
          recurrencePattern.until = data.start.dateTime;
        } else {
          // Yet to figure out how to deal with no end date.
        }

        // Builds the iCal string
        const iCalString = IcalStringBuilder.buildICALStringDeleteRecurEvent(
          recurrencePattern,
          data.start.dateTime,
          data
        );
        console.log(iCalString);

        // Due to how there is no master,
        // We need to ensure all events that are part of the series
        // have the same iCal string such that we do not have inconsistency.
        // Run a db query, to update them all to the new iCalString.
        const allRecurringEvents = db.events
          .find()
          .where('originalId')
          .eq(data.iCalUID);
        await allRecurringEvents.update({
          $set: {
            iCALString: iCalString
          }
        });

        await recurrenceObjectQuery.update({
          $set: recurrencePattern
        });

        // To delete a single recurring pattern, the calendar object is different.
        // So we add the string into the object we are PUT-ing to the server
        const calendarData = iCalString;
        const calendarObject = {
          url: caldavUrl,
          calendarData
        };
        // Result will throw error, we can do a seperate check here if needed.
        const result = await dav.updateCalendarObject(calendarObject, option);
        console.log(result);

        const deletingEvents = await Promise.all(
          recurrAfterDates.map((date) => {
            console.log(data.iCalUID, date);
            return db.events
              .findOne()
              .where('originalId')
              .eq(data.iCalUID)
              .where('start.dateTime')
              .eq(date)
              .remove();
          })
        );

        console.log(deletingEvents);
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
