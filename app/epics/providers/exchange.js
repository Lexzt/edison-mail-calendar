import { from, iif, of, timer, interval, throwError } from 'rxjs';
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

import {
  GET_EXCHANGE_EVENTS_BEGIN,
  EDIT_EXCHANGE_SINGLE_EVENT_BEGIN,
  EDIT_EXCHANGE_FUTURE_EVENT_BEGIN,
  EDIT_EXCHANGE_ALL_EVENT_BEGIN,
  EDIT_CALDAV_SINGLE_EVENT_BEGIN,
  getEventsSuccess,
  getEventsFailure
} from '../../actions/events';
import { retrieveStoreEvents } from '../../actions/db/events';

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
} from '../../utils/client/exchange';
import getDb from '../../db';
import * as Providers from '../../utils/constants';

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
        .where('iCalUID')
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
        .where('iCalUID')
        .eq(singleAppointment.ICalUid)
        .update({
          $addToSet: {
            recurrenceIds: singleAppointment.Start.MomentDate.format('YYYY-MM-DDTHH:mm:ssZ')
          }
        });

      if (debug) {
        const testresult = await db.recurrencepatterns
          .find()
          .where('iCalUID')
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
        .where('iCalUID')
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
          iCalUID: dbRecurrencePattern.iCalUID,
          byWeekNo: dbRecurrencePattern.byWeekNo,
          byWeekDay: dbRecurrencePattern.byWeekDay,
          byMonth: dbRecurrencePattern.byMonth,
          byMonthDay: dbRecurrencePattern.byMonthDay
        }
      });

      // const rpQuery = db.recurrencepatterns
      //   .find()
      //   .where('iCalUID')
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
      //     iCalUID: dbRecurrencePattern.iCalUID
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
          const allRP = await db.recurrencepatterns.find().exec();
          console.log(allRP);
        }

        // Update previous recurrence pattern by removing all modified Items
        const rpUpdate = db.recurrencepatterns
          .findOne()
          .where('iCalUID')
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
            .where('iCalUID')
            .eq(singleAppointment.iCalUID);

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
