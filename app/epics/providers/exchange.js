import { from, of } from 'rxjs';
import moment from 'moment';
import { map, mergeMap, catchError } from 'rxjs/operators';
import { ofType } from 'redux-observable';
import {
  Appointment,
  ConflictResolutionMode,
  DateTime,
  ExchangeService,
  ExchangeCredentials,
  Item,
  Uri,
  SendInvitationsMode,
  SendInvitationsOrCancellationsMode,
  WellKnownFolderName
} from 'ews-javascript-api';
import uuidv4 from 'uuid';

import { getEventsSuccess, getEventsFailure } from '../../actions/events';
import {
  GET_EXCHANGE_EVENTS_BEGIN,
  EDIT_EXCHANGE_SINGLE_EVENT_BEGIN,
  EDIT_EXCHANGE_FUTURE_EVENT_BEGIN,
  EDIT_EXCHANGE_ALL_EVENT_BEGIN,
  DELETE_EXCHANGE_SINGLE_EVENT_BEGIN,
  DELETE_EXCHANGE_FUTURE_EVENT_BEGIN,
  DELETE_EXCHANGE_ALL_EVENT_BEGIN
} from '../../actions/providers/exchange';
import { retrieveStoreEvents } from '../../actions/db/events';

import {
  asyncCreateExchangeEvent,
  asyncDeleteExchangeEvent,
  asyncGetRecurrAndSingleExchangeEvents,
  asyncUpdateExchangeEvent,
  asyncUpdateRecurrExchangeSeries,
  createEwsRecurrenceObj,
  parseEwsRecurringPatterns
} from '../../utils/client/exchange';
import {
  asyncGetSingleExchangeEvent,
  asyncGetAllExchangeEvents
} from '../../utils/client/exchangebasics';
import * as Providers from '../../utils/constants';

import * as dbEventActions from '../../sequelizeDB/operations/events';
import * as dbRpActions from '../../sequelizeDB/operations/recurrencepatterns';
import * as dbPendingActionsActions from '../../sequelizeDB/operations/pendingactions';

export const beginGetExchangeEventsEpics = (action$) =>
  action$.pipe(
    ofType(GET_EXCHANGE_EVENTS_BEGIN),
    mergeMap((action) =>
      from(
        new Promise(async (resolve, reject) => {
          if (action.payload === undefined) {
            reject(getEventsFailure('Exchange user undefined!!'));
          }

          try {
            const allExchangeUserEventsPromise = action.payload.map((user) => {
              const exch = new ExchangeService();
              exch.Url = new Uri('https://outlook.office365.com/Ews/Exchange.asmx');
              exch.Credentials = new ExchangeCredentials(user.email, user.password);

              return asyncGetRecurrAndSingleExchangeEvents(exch);
            });
            const allExchangeUserEvents = await Promise.all(allExchangeUserEventsPromise);
            resolve(allExchangeUserEvents);
          } catch (e) {
            console.log(e);
            throw e;
          }
        })
      ).pipe(
        map((resp) => getEventsSuccess(resp, Providers.EXCHANGE, action.payload)),
        catchError((error) => of(error))
      )
    )
  );

export const editExchangeSingleEventEpics = (action$) =>
  action$.pipe(
    ofType(EDIT_EXCHANGE_SINGLE_EVENT_BEGIN),
    mergeMap((action) =>
      from(editEwsSingle(action.payload)).pipe(map((resp) => retrieveStoreEvents(resp.user)))
    )
  );

export const editExchangeAllRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(EDIT_EXCHANGE_ALL_EVENT_BEGIN),
    mergeMap((action) =>
      from(editEwsAllRecurrenceEvents(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.user))
      )
    )
  );

export const editExchangeFutureRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(EDIT_EXCHANGE_FUTURE_EVENT_BEGIN),
    mergeMap((action) =>
      from(editEwsAllFutureRecurrenceEvents(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.user))
      )
    )
  );

export const deleteExchangeSingleEventEpics = (action$) =>
  action$.pipe(
    ofType(DELETE_EXCHANGE_SINGLE_EVENT_BEGIN),
    mergeMap((action) =>
      from(deleteEwsSingle(action.payload)).pipe(map((resp) => retrieveStoreEvents(resp.user)))
    )
  );

export const deleteExchangeAllRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(DELETE_EXCHANGE_ALL_EVENT_BEGIN),
    mergeMap((action) =>
      from(deleteEwsAllRecurrenceEvents(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.user))
      )
    )
  );

export const deleteExchangeFutureRecurrenceEventEpics = (action$) =>
  action$.pipe(
    ofType(DELETE_EXCHANGE_FUTURE_EVENT_BEGIN),
    mergeMap((action) =>
      from(deleteEwsAllFutureRecurrenceEvents(action.payload)).pipe(
        map((resp) => retrieveStoreEvents(resp.user))
      )
    )
  );

const editEwsSingle = async (payload) => {
  const debug = false;

  try {
    const singleAppointment = await asyncGetSingleExchangeEvent(
      payload.user.email,
      payload.user.password,
      'https://outlook.office365.com/Ews/Exchange.asmx',
      payload.originalId
    );

    // TO DO, UPDATE MORE FIELDS
    singleAppointment.Subject = payload.title;

    if (debug) {
      console.log(singleAppointment);
    }

    await asyncUpdateExchangeEvent(singleAppointment, payload.user, () => {
      if (debug) {
        console.log('Updated!!');
      }
    });

    if (debug) {
      const dbdata = await dbRpActions.getAllRp();
      dbdata.forEach((dbPatt) => console.log(dbPatt.toJSON()));
    }

    if (singleAppointment.IsRecurring) {
      const singleApptRP = await dbRpActions.getOneRpByiCalUID(singleAppointment.ICalUid);
      if (debug) {
        console.log(singleApptRP);
      }
      if (singleApptRP.length > 1) {
        console.log('You have two RP in database, Fix that.');
      }
      if (debug) {
        console.log(singleApptRP, singleApptRP[0].toJSON());
      }
      await dbRpActions.addRecurrenceIdsByiCalUID(
        singleAppointment.ICalUid,
        singleAppointment.Start.MomentDate.format('YYYY-MM-DDTHH:mm:ssZ')
      );

      if (debug) {
        const testresult = await dbRpActions.getOneRpByiCalUID(singleAppointment.ICalUid);
        if (debug) {
          console.log(testresult);
        }
      }
    }
  } catch (error) {
    console.log('(editEvent) Error, retrying with pending action!', error, payload.id);
    const result = await dbPendingActionsActions.findPendingActionById(payload.id);
    if (result.length === 0) {
      await dbPendingActionsActions.insertPendingActionIntoDatabase({
        uniqueId: uuidv4(),
        eventId: payload.id,
        status: 'pending',
        type: 'update'
      });
    }
    await dbEventActions.updateEventByOriginalId(payload.id, {
      summary: payload.title,
      location: payload.place.name,
      local: true
    });
  }
  payload.props.history.push('/');
  return {
    providerType: Providers.EXCHANGE,
    user: payload.user
  };
};

const editEwsAllRecurrenceEvents = async (payload) => {
  const debug = false;

  try {
    const singleAppointment = await asyncGetSingleExchangeEvent(
      payload.user.email,
      payload.user.password,
      'https://outlook.office365.com/Ews/Exchange.asmx',
      payload.recurringEventId
    );

    // TO-DO, ADD MORE FIELDS AGAIN
    singleAppointment.Subject = payload.title;

    if (debug) {
      console.log(singleAppointment);
      debugger;
    }
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

    if (debug) {
      console.log(newRecurrence);
      debugger;
    }

    const exch = new ExchangeService();
    exch.Url = new Uri('https://outlook.office365.com/Ews/Exchange.asmx');
    exch.Credentials = new ExchangeCredentials(payload.user.email, payload.user.password);

    singleAppointment.Recurrence = newRecurrence;
    await asyncUpdateRecurrExchangeSeries(singleAppointment, payload.user, async () => {
      const allEwsEvents = await asyncGetRecurrAndSingleExchangeEvents(exch);
      if (debug) {
        console.log(allEwsEvents);
      }
      const updatedRecurrMasterAppointment = await asyncGetSingleExchangeEvent(
        payload.user.email,
        payload.user.password,
        'https://outlook.office365.com/Ews/Exchange.asmx',
        payload.recurringEventId
      );

      if (debug) {
        debugger;
      }
      const dbRecurrencePattern = parseEwsRecurringPatterns(
        updatedRecurrMasterAppointment.Id.UniqueId,
        updatedRecurrMasterAppointment.Recurrence,
        updatedRecurrMasterAppointment.ICalUid,
        updatedRecurrMasterAppointment.DeletedOccurrences,
        updatedRecurrMasterAppointment.ModifiedOccurrences
      );
      if (debug) {
        debugger;
      }
      const rp = await dbRpActions.getOneRpByiCalUID(payload.iCalUID);

      if (debug) {
        console.log(
          rp,
          payload.recurrPatternId,
          dbRecurrencePattern,
          updatedRecurrMasterAppointment
        );
      }
      await dbRpActions.updateRpByiCalUID(payload.iCalUID, {
        freq: dbRecurrencePattern.freq,
        interval: dbRecurrencePattern.interval,
        until: dbRecurrencePattern.until,
        exDates: dbRecurrencePattern.exDates,
        recurrenceIds: dbRecurrencePattern.recurrenceIds,
        recurringTypeId: dbRecurrencePattern.recurringTypeId,
        modifiedThenDeleted: dbRecurrencePattern.modifiedThenDeleted,
        weeklyPattern: dbRecurrencePattern.weeklyPattern,
        numberOfRepeats: dbRecurrencePattern.numberOfRepeats,
        iCalUID: dbRecurrencePattern.iCalUID,
        byWeekNo: dbRecurrencePattern.byWeekNo,
        byWeekDay: dbRecurrencePattern.byWeekDay,
        byMonth: dbRecurrencePattern.byMonth,
        byMonthDay: dbRecurrencePattern.byMonthDay
      });

      await dbEventActions.deleteEventByOriginaliCalUID(singleAppointment.ICalUid);
      if (debug) {
        // const data = await db.events
        //   .find()
        //   .where('iCalUID')
        //   .eq(singleAppointment.ICalUid)
        //   .exec();
        const data = await dbEventActions.getOneEventByiCalUID(singleAppointment.ICalUid);

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
            // return db.events.upsert(filteredEwsEvent);
            return dbEventActions.insertEventsIntoDatabase(filteredEwsEvent);
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

const editEwsAllFutureRecurrenceEvents = async (payload) => {
  const debug = false;
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
      .Save(WellKnownFolderName.Calendar, SendInvitationsMode.SendToNone)
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
          const allRP = await dbRpActions.getAllRp();
          console.log(allRP);
        }

        // Update previous recurrence pattern by removing all modified Items
        const previousRp = await dbRpActions.getOneRpByiCalUID(singleAppointment.ICalUid);
        const array1 = modifiedItems.map((appt) =>
          appt.Start.MomentDate.format('YYYY-MM-DDTHH:mm:ssZ')
        );
        const array2 = deletingItems.map((appt) =>
          appt.Start.MomentDate.format('YYYY-MM-DDTHH:mm:ssZ')
        );
        if (debug) {
          console.log(previousRp, previousRp.exDates, previousRp.recurrenceIds, array1);
          console.log(previousRp.exDates.split(',').filter((exDate) => !array2.includes(exDate)));
          console.log(
            previousRp.recurrenceIds.split(',').filter((exDate) => !array1.includes(exDate))
          );
          const result = await dbRpActions.getOneRpByiCalUID(singleAppointment.ICalUid);
          console.log(result);
        }

        await dbRpActions.updateRpByiCalUID(singleAppointment.ICalUid, {
          recurrenceIds: previousRp.recurrenceIds
            .split(',')
            .filter((exDate) => !array1.includes(exDate))
            .join(','),
          exDates: previousRp.exDates
            .split(',')
            .filter((exDate) => !array2.includes(exDate))
            .join(',')
        });

        if (debug) {
          const result = await dbRpActions.getOneRpByiCalUID(singleAppointment.ICalUid);
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
              await dbEventActions.deleteEventByOriginalId(foundItem.Id.UniqueId);
              return updatedItem;
            });
        });

        // We can just add it in as it is a new event from future events.
        await dbRpActions.insertOrUpdateRp(dbRecurrencePattern);

        // Upsert into db, can assume it does not exist as it is a new appointment.
        const promiseArr = nonDeletedItems.map((event) => {
          const filteredEvent = Providers.filterIntoSchema(
            event,
            Providers.EXCHANGE,
            payload.user.email,
            false
          );
          return dbEventActions.insertEventsIntoDatabase(filteredEvent);
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
        const newRp = await dbRpActions.getAllRp();
        console.log(newRp);
      }
      await dbRpActions.deleteRpByOid(recurrMasterAppointment.Id.UniqueId);

      if (debug) {
        const newRp = await dbRpActions.getAllRp();
        console.log(newRp);
      }
      const removedDeletedEventsLocally = await dbEventActions.getAllEventsByRecurringEventId(
        payload.recurringEventId
      );
      console.log('recurring event delete is broken here');

      if (debug) {
        const allEvents = await dbEventActions.getAllEvents();
        console.log(removedDeletedEventsLocally, allEvents);
      }

      await Promise.all(
        removedDeletedEventsLocally.map((event) =>
          dbEventActions.deleteEventByOriginalId(event.originalId)
        )
      );
    } else {
      // Set the recurrance for the events not this and future to the end of selected
      recurrMasterAppointment.Recurrence.EndDate = singleAppointment.Start.AddDays(-1);

      // Update recurrence object for server, and remove the future items in local db
      await recurrMasterAppointment
        .Update(ConflictResolutionMode.AlwaysOverwrite, SendInvitationsMode.SendToNone)
        .then(async () => {
          // const allevents = await db.events.find().exec();
          const allevents = await dbEventActions.getAllEvents();
          console.log(allevents);

          // const removedDeletedEventsLocally = await db.events
          //   .find()
          //   .where('recurringEventId')
          //   .eq(payload.recurringEventId)
          //   .exec();
          const removedDeletedEventsLocally = await dbEventActions.getAllEventsByRecurringEventId(
            payload.recurringEventId
          );

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
              // db.events
              //   .find()
              //   .where('originalId')
              //   .eq(event.originalId)
              //   .remove()
              dbEventActions.deleteEventByOriginalId(event.originalId)
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

const deleteEwsSingle = async (payload) => {
  const { data, user } = payload;
  const debug = false;

  // Try catch for HTTP errors, offline etc.
  try {
    // asyncGetSingleExchangeEvent will throw error when no internet or event missing.
    const singleAppointment = await asyncGetSingleExchangeEvent(
      user.email,
      user.password,
      'https://outlook.office365.com/Ews/Exchange.asmx',
      data.originalId
    );

    await asyncDeleteExchangeEvent(singleAppointment, user, () => {
      // Lambda for future if needed.
    });

    await dbEventActions.deleteEventByOriginalId(data.originalId);
  } catch (exchangeError) {
    // This means item has been deleted on server, maybe by another user
    // Handle this differently.
    if (exchangeError.ErrorCode === 249) {
      // Just remove it from database instead, and break;
      // await deleteDoc.remove();
      await dbEventActions.deleteEventByOriginalId(data.originalId);
      // break;
    }

    // Upsert it to the pending action, let pending action automatically handle it.
    // db.pendingactions.upsert({
    //   uniqueId: uuidv4(),
    //   eventId: data.get('originalId'),
    //   status: 'pending',
    //   type: 'delete'
    // });
    await dbPendingActionsActions.insertPendingActionIntoDatabase({
      uniqueId: uuidv4(),
      eventId: data.originalId,
      status: 'pending',
      type: 'delete'
    });

    // // Hide the item, and set it to local as it has been updated.
    // await deleteDoc.update({
    //   $set: {
    //     hide: true,
    //     local: true
    //   }
    // });

    await dbEventActions.updateEventByOriginalId(data.originalId, {
      hide: true,
      local: true
    });
  }

  return { user };
};

const deleteEwsAllRecurrenceEvents = async (payload) => {
  const { data, user } = payload;
  const debug = false;

  try {
    // asyncGetSingleExchangeEvent will throw error when no internet or event missing.
    const singleAppointment = await asyncGetSingleExchangeEvent(
      user.email,
      user.password,
      'https://outlook.office365.com/Ews/Exchange.asmx',
      data.recurringEventId
    );

    await asyncDeleteExchangeEvent(singleAppointment, user, () => {
      // Lambda for future if needed.
    });

    await dbEventActions.deleteAllEventByRecurringEventId(data.recurringEventId);
  } catch (error) {
    console.log(error);
    debugger;
    // This means item has been deleted on server, maybe by another user
    // Handle this differently.
    if (error.ErrorCode === 249) {
      // Just remove it from database instead, and break;
      await dbEventActions.deleteAllEventByRecurringEventId(data.recurringEventId);
      // await deleteDoc.remove();
      // break;
    }

    // Upsert it to the pending action, let pending action automatically handle it.
    // db.pendingactions.upsert({
    //   uniqueId: uuidv4(),
    //   eventId: data.get('originalId'),
    //   status: 'pending',
    //   type: 'delete'
    // });
    await dbPendingActionsActions.insertPendingActionIntoDatabase({
      uniqueId: uuidv4(),
      eventId: data.originalId,
      status: 'pending',
      type: 'delete'
    });

    // Hide the item, and set it to local as it has been updated.
    // await deleteDoc.update({
    //   $set: {
    //     hide: true,
    //     local: true
    //   }
    // });

    await dbEventActions.updateEventRecurringEventId(data.recurringEventId, {
      hide: true,
      local: true
    });
  }

  return { user };
};

const deleteEwsAllFutureRecurrenceEvents = async (payload) => {
  const { data, user } = payload;
  const debug = false;

  try {
    // asyncGetSingleExchangeEvent will throw error when no internet or event missing.
    const recurrMasterAppointment = await asyncGetSingleExchangeEvent(
      user.email,
      user.password,
      'https://outlook.office365.com/Ews/Exchange.asmx',
      data.recurringEventId
    );

    const singleAppointment = await asyncGetSingleExchangeEvent(
      user.email,
      user.password,
      'https://outlook.office365.com/Ews/Exchange.asmx',
      data.originalId
    );

    if (debug) {
      console.log(recurrMasterAppointment, data, singleAppointment);
      debugger;
    }
    if (
      recurrMasterAppointment.Recurrence.StartDate.MomentDate.isSame(
        moment(data.start.dateTime),
        'day'
      )
    ) {
      if (debug) {
        console.log('Deleting entire series');
      }
      await asyncDeleteExchangeEvent(recurrMasterAppointment, user, () => {
        // Lambda for future if needed.
      });
      await dbRpActions.deleteRpByiCalUID(data.iCalUID);
    } else {
      if (debug) {
        console.log('Editing end date of recurrence and re-getting');

        // const rpDatabase = db.recurrencepatterns
        //   .find()
        //   .where('iCalUID')
        //   .eq(data.iCalUID);
        // const rpDatabaseVals = await rpDatabase.exec();

        const rpDatabaseVals = await dbRpActions.getOneRpByiCalUID(data.iCalUID);
        console.log('Before anything ', rpDatabaseVals.toJSON());
      }
      const newStartTime = singleAppointment.Start.MomentDate.clone();
      const dt = new DateTime(newStartTime.startOf('day').add(-1, 'day'));
      recurrMasterAppointment.Recurrence.EndDate = dt;
      await recurrMasterAppointment
        .Update(ConflictResolutionMode.AlwaysOverwrite, SendInvitationsMode.SendToNone)
        .then(async () => {
          if (debug) {
            console.log('here', data.recurringEventId);
            // const allevents = await db.events.find().exec();
            const allevents = await dbEventActions.getAllEvents();
            console.log(allevents);
          }

          // const removedDeletedEventsLocally = await db.events
          //   .find()
          //   .where('recurringEventId')
          //   .eq(data.get('recurringEventId'))
          //   .exec();
          const removedDeletedEventsLocally = await dbRpActions.getAllEventsByRecurringEventId(
            data.recurringEventId
          );

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
              // db.events
              //   .find()
              //   .where('originalId')
              //   .eq(event.originalId)
              //   .remove()
              dbEventActions.deleteEventByOriginalId(event.originalId)
            )
          );

          // const updatingDb = db.recurrencepatterns
          //   .find()
          //   .where('iCalUID')
          //   .eq(data.iCalUID);
          // const updateDbVals = await updatingDb.exec();
          const updateDbVals = await dbRpActions.getOneRpByiCalUID(data.iCalUID);

          if (debug) {
            const checkingData = await dbRpActions.getOneRpByiCalUID(data.iCalUID);
            console.log('Before ', checkingData);
            console.log(updateDbVals.exDates);
          }

          // // Filter ex dates down so that when we scale, ex dates does not constantly expand.
          // const newExDates = updateDbVals[0].exDates.filter(
          //   (dateTimeString) =>
          //     moment(dateTimeString).isAfter(moment(updateDbVals[0].recurringTypeId), 'day') &&
          //     moment(dateTimeString).isBefore(
          //       recurrMasterAppointment.Recurrence.EndDate.MomentDate
          //     ),
          //   'day'
          // );

          // Filter ex dates down so that when we scale, ex dates does not constantly expand.
          const newExDates = updateDbVals.exDates
            .split(',')
            .filter(
              (dateTimeString) =>
                moment(dateTimeString).isAfter(moment(updateDbVals.recurringTypeId), 'day') &&
                moment(dateTimeString).isBefore(
                  recurrMasterAppointment.Recurrence.EndDate.MomentDate
                ),
              'day'
            );

          if (debug) {
            console.log(newExDates);
          }

          // await updatingDb.update({
          //   $set: {
          //     until: recurrMasterAppointment.Recurrence.EndDate.MomentDate.format(
          //       'YYYY-MM-DDTHH:mm:ssZ'
          //     ),
          //     exDates: newExDates
          //   }
          // });

          await dbRpActions.updateRpByiCalUID(data.iCalUID, {
            until: recurrMasterAppointment.Recurrence.EndDate.MomentDate.format(
              'YYYY-MM-DDTHH:mm:ssZ'
            ),
            exDates: newExDates.join(',')
          });

          if (debug) {
            // const newUpdatingDb = db.recurrencepatterns
            //   .find()
            //   .where('iCalUID')
            //   .eq(data.iCalUID);

            // const newData = await newUpdatingDb.exec();
            const newData = await dbRpActions.getOneRpByiCalUID(data.iCalUID);
            console.log('After ', newData.toJSON());
          }
        });
    }
  } catch (error) {
    console.log(error);
  }

  return { user };
};
