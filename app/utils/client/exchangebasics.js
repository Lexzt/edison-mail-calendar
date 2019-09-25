import {
  ExchangeService,
  Uri,
  ExchangeCredentials,
  Appointment,
  ItemId,
  CalendarView,
  DateTime,
  WellKnownFolderName,
  PropertySet,
  BasePropertySet,
  ItemSchema,
  BodyType,
  ItemView,
  AppointmentSchema
} from 'ews-javascript-api';
import moment from 'moment';
import * as dbRpActions from '../../sequelizeDB/operations/recurrencepatterns';
import { parseEwsRecurringPatterns } from './exchange';

export const asyncGetSingleExchangeEvent = async (username, password, url, itemId) => {
  try {
    const exch = new ExchangeService();
    exch.Url = new Uri(url);
    exch.Credentials = new ExchangeCredentials(username, password);

    const appointment = await Appointment.Bind(exch, new ItemId(itemId));
    return appointment;
  } catch (error) {
    console.log('(asyncGetSingleExchangeEvent) Error: ', error);
    throw error;
  }
};

export const asyncGetAllExchangeEvents = async (exch) => {
  let view;
  let exchangeEvents = [];
  const results = [];

  function loopEvents(response) {
    exchangeEvents = exchangeEvents.concat(response.Items);
  }
  const a = moment.unix(1451653200).add(23, 'month');
  let prev = moment.unix(1451653200);
  const b = moment.unix(1704114000); // Just some random super large time.

  for (let m = moment(a); m.isBefore(b); m.add(23, 'month')) {
    view = new CalendarView(new DateTime(prev), new DateTime(m));
    try {
      results.push(
        exch.FindAppointments(WellKnownFolderName.Calendar, view).then(
          (response) => loopEvents(response),
          (error) => {
            throw error;
          }
        )
      );
    } catch (error) {
      throw error;
    }
    prev = prev.add(23, 'month');
  }
  await Promise.all(results);
  return exchangeEvents;
};

export const asyncGetExchangeBodyEvents = async (exch, arrayOfNonRecurrIds, exchangeEvents) => {
  const exchangeEventsWithBody = [];
  const additonalProps = new PropertySet(BasePropertySet.IdOnly, ItemSchema.Body);
  additonalProps.RequestedBodyType = BodyType.Text;

  await exch.BindToItems(arrayOfNonRecurrIds, additonalProps).then(
    (resp) => {
      resp.responses.forEach((singleAppointment) => {
        const fullSizeAppointment = exchangeEvents.filter(
          (event) => event.Id.UniqueId === singleAppointment.item.Id.UniqueId
        )[0];
        fullSizeAppointment.Body = singleAppointment.item.Body.text;
        exchangeEventsWithBody.push(fullSizeAppointment);
      });
    },
    (error) => {
      console.log(error); // I got ECONNRESET or something the last time, idk how to break this so that I can ensure stability, figure out later.
      throw error;
    }
  );

  return exchangeEventsWithBody;
};

export const asyncGetExchangeRecurrMasterEvents = async (exch) => {
  let view;
  const exchangeEvents = new Map();
  const results = [];
  const debug = false;

  try {
    await exch
      .FindItems(WellKnownFolderName.Calendar, new ItemView(100))
      .then((resp) => resp.Items.filter((item) => item.AppointmentType === 'RecurringMaster'))
      .then((recurringMasterEvents) => {
        const setKeyId = new Set();
        recurringMasterEvents.forEach((item) => setKeyId.add(new ItemId(item.Id.UniqueId)));

        const additonalProps = new PropertySet(BasePropertySet.IdOnly, [
          AppointmentSchema.Recurrence,
          AppointmentSchema.Body,
          AppointmentSchema.Subject,
          AppointmentSchema.AppointmentType,
          AppointmentSchema.IsRecurring,
          AppointmentSchema.Start,
          AppointmentSchema.End,
          AppointmentSchema.ICalUid,
          AppointmentSchema.ICalRecurrenceId,
          AppointmentSchema.LastOccurrence,
          AppointmentSchema.ModifiedOccurrences,
          AppointmentSchema.DeletedOccurrences
        ]);
        additonalProps.RequestedBodyType = BodyType.Text;
        const promiseArr = [];
        if (setKeyId.size > 0) {
          promiseArr.push(exch.BindToItems([...setKeyId], additonalProps));
        }
        return Promise.all(promiseArr);
      })
      .then((recurrence) => {
        const promiseArr = [];
        recurrence[0].Responses.filter((resp) => resp.errorCode === 0)
          .map((resp) => resp.Item)
          .map(async (event) => {
            const dbRecurrencePattern = parseEwsRecurringPatterns(
              event.Id.UniqueId,
              event.Recurrence,
              event.ICalUid,
              event.DeletedOccurrences,
              event.ModifiedOccurrences
            );
            exchangeEvents.set(event.ICalUid, event);

            promiseArr.push(dbRpActions.getOneRpByOId(event.Id.UniqueId));
          });
        return Promise.all(promiseArr);
      })
      .then((existInDb) => {
        exchangeEvents.forEach((event, eventId) => {
          const prevDbObj = existInDb
            .filter((dbRecurrencePattern) => dbRecurrencePattern !== null)
            .filter((dbRecurrencePattern) => dbRecurrencePattern.iCalUID === eventId);

          if (debug) {
            console.log(prevDbObj, event, eventId, existInDb);
          }
          if (prevDbObj.length > 0) {
            if (prevDbObj.length > 1) {
              console.log('Duplicated database issue for recurrence pattern. Check please.');
            }

            const recurrencePattern = parseEwsRecurringPatterns(
              event.Id.UniqueId,
              event.Recurrence,
              event.ICalUid,
              event.DeletedOccurrences,
              event.ModifiedOccurrences
            );
            if (debug) {
              console.log(recurrencePattern);
              debugger;
            }

            results.push(
              dbRpActions.updateRpByOid(prevDbObj[0].originalId, {
                recurringTypeId: recurrencePattern.recurringTypeId,
                originalId: recurrencePattern.originalId,
                freq: recurrencePattern.freq,
                interval: recurrencePattern.interval,
                until: recurrencePattern.until,
                exDates: recurrencePattern.exDates,
                recurrenceIds: recurrencePattern.recurrenceIds,
                modifiedThenDeleted: recurrencePattern.modifiedThenDeleted,
                weeklyPattern: recurrencePattern.weeklyPattern,
                numberOfRepeats: recurrencePattern.numberOfRepeats,
                iCalUID: recurrencePattern.iCalUID,
                byWeekNo: recurrencePattern.byWeekNo,
                byWeekDay: recurrencePattern.byWeekDay,
                byMonth: recurrencePattern.byMonth,
                byMonthDay: recurrencePattern.byMonthDay
              })
            );
          } else {
            const recurrencePattern = parseEwsRecurringPatterns(
              event.Id.UniqueId,
              event.Recurrence,
              event.ICalUid,
              event.DeletedOccurrences,
              event.ModifiedOccurrences
            );
            results.push(dbRpActions.insertOrUpdateRp(recurrencePattern));
          }
        });
      });
  } catch (error) {
    console.log(error);
  }

  await Promise.all(results);
  return exchangeEvents;
};
