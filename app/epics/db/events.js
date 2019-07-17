import { map, mergeMap, catchError } from 'rxjs/operators';
import { ofType } from 'redux-observable';
import { from } from 'rxjs';
import uuidv4 from 'uuid';
import { SendInvitationsMode, ConflictResolutionMode, Recurrence } from 'ews-javascript-api';
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
import parser from '../../utils/parser';

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
            mergeMap((nonExpandedRecurr) => parser.expandRecurEvents(nonExpandedRecurr)),
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
        map((results) => successStoringEvents(results)),
        catchError((error) => failStoringEvents(error))
      )
    )
  );

export const beginStoreEventsEpic = (action$) =>
  action$.pipe(
    ofType(POST_EVENT_SUCCESS, GET_EVENTS_SUCCESS),
    map((action) => beginStoringEvents(action.payload))
  );

export const deleteSingleEventEpics = (action$) =>
  action$.pipe(
    ofType(DELETE_EVENT_BEGIN),
    mergeMap((action) =>
      from(deleteEvent(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.providerType, resp.user))
      )
    )
  );

export const deleteAllRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(DELETE_RECURRENCE_SERIES_BEGIN),
    mergeMap((action) =>
      from(deleteReccurenceEvent(action.payload)).pipe(
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

  console.log(data);

  // Create a list of promises to retrieve previous event from db first if it does not exist.
  for (const dbEvent of data) {
    // Filter into our schema object as we need to know how to deal with it for originalId.
    const filteredEvent = Providers.filterIntoSchema(
      dbEvent,
      payload.providerType,
      payload.owner,
      false
    );

    // As id is the uniqid on our side, we need to find and update or delete accordingly.
    // We use filtered object as it has casted it into our schema object type.
    dbFindPromises.push(
      db.events
        .findOne()
        .where('originalId')
        .eq(filteredEvent.originalId)
        .exec()
    );
  }

  // Wait for all the promises to complete
  const results = await Promise.all(dbFindPromises);

  console.log('here?');

  // Assumtion here is that dbFindPromises is going to be the list of query that is our previous data accordingly.
  // dbFindPromises must have same length as results, as its just an array of same size.
  // This ensure the index of data is the same with find query index.
  for (let i = 0; i < results.length; i += 1) {
    const filteredEvent = Providers.filterIntoSchema(
      data[i],
      payload.providerType,
      payload.owner,
      false
    );
    console.log('here?1');

    // Means it is a new object, we upsert coz filtered event already is new.
    if (results[i] === null) {
      dbUpsertPromises.push(db.events.upsert(filteredEvent));
    } else {
      // Take back old primary ID, so we do not create another object.
      filteredEvent.id = results[i].id;

      // Push an update query instead of a upsert. Ensure ID is the same.
      dbUpsertPromises.push(
        db.events
          .findOne()
          .where('originalId')
          .eq(filteredEvent.originalId)
          .update({
            $set: filteredEvent
          })
      );
    }

    // This is for all the events, for UI.
    addedEvents.push(filteredEvent);
  }
  console.log('here?2', dbUpsertPromises);

  await Promise.all(dbUpsertPromises);
  console.log(addedEvents);
  return addedEvents;
};

const deleteEvent = async (id) => {
  const debug = false;

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
          .where('iCalUid')
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
            .where('iCalUid')
            .eq(data.iCalUID);

          const result2 = await addingIntoRpQuery2.exec();
          console.log(result2[0].toJSON());
        }
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
        .where('originalId')
        .eq(data.get('originalId'));
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

const deleteReccurenceEvent = async (id) => {
  const debug = false;

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
          .where('iCalUid')
          .eq(data.iCalUID);
        await removingRb.remove();

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

      console.log(deleteDoc);

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
  const debug = false;

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
    case Providers.CALDAV:
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

        console.log(recurrMasterAppointment, data);
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
            .where('iCalUid')
            .eq(data.iCalUID);
          await removingRb.remove();
        } else {
          if (debug) {
            console.log('Editing end date of recurrence and re-getting');

            const rpDatabase = db.recurrencepatterns
              .find()
              .where('iCalUid')
              .eq(data.iCalUID);

            const rpDatabaseVals = await rpDatabase.exec();
            console.log('Before anything ', rpDatabaseVals);
          }
          recurrMasterAppointment.Recurrence.EndDate = singleAppointment.Start;
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
              console.log(removedDeletedEventsLocally, singleAppointment.End.MomentDate);

              const afterEvents = removedDeletedEventsLocally.filter((event) =>
                moment(event.toJSON().start.dateTime).isAfter(singleAppointment.End.MomentDate)
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
                .where('iCalUid')
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
                  .where('iCalUid')
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
