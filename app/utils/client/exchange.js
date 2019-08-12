import md5 from 'md5';
import {
  ExchangeService,
  DateTime,
  Uri,
  WellKnownFolderName,
  CalendarView,
  ExchangeCredentials,
  Appointment,
  SendInvitationsMode,
  Item,
  PropertySet,
  ItemSchema,
  ConflictResolutionMode,
  SendInvitationsOrCancellationsMode,
  MessageBody,
  ItemId,
  BasePropertySet,
  ExtendedPropertyDefinition,
  BodyType,
  PropertyDefinitionBase,
  DeleteMode,
  AppointmentSchema,
  AppointmentType,
  ItemView,
  Recurrence,
  DailyPattern,
  DayOfTheWeekCollection,
  DayOfTheWeek,
  Month,
  DayOfTheWeekIndex
} from 'ews-javascript-api';
import moment from 'moment';
import uuidv4 from 'uuid';
import * as ProviderTypes from '../constants';
import getDb from '../../db';
import {
  deleteEventSuccess,
  editEventSuccess,
  apiFailure,
  postEventSuccess
} from '../../actions/events';

export const filterExchangeUser = (jsonObj) => ({
  personId: md5(jsonObj.username),
  originalId: jsonObj.username,
  email: jsonObj.username,
  providerType: ProviderTypes.EXCHANGE,
  password: jsonObj.password
});

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

export const asyncCreateExchangeEvent = async (username, password, url, payload) => {
  try {
    const exch = new ExchangeService();
    exch.Url = new Uri(url);
    exch.Credentials = new ExchangeCredentials(username, password);

    const newEvent = new Appointment(exch);

    newEvent.Subject = payload.summary;
    newEvent.Body = new MessageBody('');
    newEvent.Start = new DateTime(moment.tz(payload.start.dateTime, payload.start.timezone));
    newEvent.End = new DateTime(moment.tz(payload.end.dateTime, payload.end.timezone));
    return await newEvent
      .Save(WellKnownFolderName.Calendar, SendInvitationsMode.SendToAllAndSaveCopy)
      .then(
        async () => {
          const item = await Item.Bind(exch, newEvent.Id);
          const filteredItem = ProviderTypes.filterIntoSchema(
            item,
            ProviderTypes.EXCHANGE,
            username,
            false
          );
          filteredItem.createdOffline = true;
          const db = await getDb();
          const eventDoc = db.events
            .find()
            .where('originalId')
            .eq(newEvent.Id.UniqueId);
          const temp = await db.events.find().exec();
          const result = await eventDoc.exec();

          if (result.length === 0) {
            db.events.upsert(filteredItem);
          } else if (result.length === 1) {
            await eventDoc.update({
              $set: filteredItem
            });
          } else {
            console.log('we should really not be here', result);
          }

          return postEventSuccess([item], 'EXCHANGE', username);
        },
        (error) => {
          throw error;
        }
      );
  } catch (error) {
    console.log('(asyncCreateExchangeEvent) Error: ', error);
    throw error;
  }
};

export const asyncUpdateExchangeEvent = async (singleAppointment, user, callback) => {
  try {
    return await singleAppointment
      .Update(ConflictResolutionMode.AlwaysOverwrite, SendInvitationsOrCancellationsMode.SendToNone)
      .then(
        async (success) => {
          // Re-Get the data for EWS to populate the fields, through server side.
          const updatedItem = await asyncGetSingleExchangeEvent(
            user.email,
            user.password,
            'https://outlook.office365.com/Ews/Exchange.asmx',
            singleAppointment.Id.UniqueId
          );

          // Get the previous copy from our DB through originalId.
          const db = await getDb();
          const query = db.events
            .findOne()
            .where('originalId')
            .eq(singleAppointment.Id.UniqueId);

          const localDbCopy = await query.exec();
          updatedItem.RecurrenceMasterId = { UniqueId: localDbCopy.recurringEventId };

          const filteredItem = ProviderTypes.filterIntoSchema(
            updatedItem,
            ProviderTypes.EXCHANGE,
            user.email,
            false
          );
          filteredItem.id = localDbCopy.id;
          // console.log(filteredItem);

          await query.update({
            $set: filteredItem
          });
          callback();
          return editEventSuccess(updatedItem);
        },
        (error) => {
          throw error;
        }
      );
  } catch (error) {
    console.log('(asyncUpdateExchangeEvent) Error: ', error);
    throw error;
  }
};

export const asyncUpdateRecurrExchangeSeries = async (singleAppointment, user, callback) => {
  try {
    return await singleAppointment
      .Update(ConflictResolutionMode.AlwaysOverwrite, SendInvitationsOrCancellationsMode.SendToNone)
      .then(
        async (success) => {
          const updatedItem = await asyncGetSingleExchangeEvent(
            user.email,
            user.password,
            'https://outlook.office365.com/Ews/Exchange.asmx',
            singleAppointment.Id.UniqueId
          );

          const db = await getDb();
          const localDbItems = await db.events
            .find()
            .where('recurringEventId')
            .eq(singleAppointment.Id.UniqueId)
            .exec();
          console.log(localDbItems);

          // This needs to be atomic, due to how fast we are hitting the database, and performance issues. Fml. :|
          // In order to use atomic update for RxDb, it needs to be a function, and cannot use $set.
          // TO-DO, change to sequalize
          const changeFunction = (oldData) => {
            oldData.summary = updatedItem.Subject;
            return oldData;
          };

          // TO-DO, add more values for updating.
          localDbItems.forEach((localRecurringItem) => {
            localRecurringItem.update({
              $set: {
                summary: updatedItem.Subject
              }
            });
          });
          await callback();
          return editEventSuccess(updatedItem);
        },
        (error) => {
          throw error;
        }
      );
  } catch (error) {
    console.log('(asyncUpdateRecurrExchangeSeries) Error: ', error);
    throw error;
  }
};

export const asyncDeleteExchangeEvent = async (singleAppointment, user, callback) => {
  try {
    return await singleAppointment.Delete(DeleteMode.MoveToDeletedItems).then(
      async (success) => {
        const db = await getDb();
        const query = db.events
          .find()
          .where('originalId')
          .eq(singleAppointment.Id.UniqueId);
        await query.remove();
        callback();
        return deleteEventSuccess(singleAppointment.Id.UniqueId, user);
      },
      (error) => {
        console.log('error:', error);
        throw error;
      }
    );
  } catch (error) {
    console.log('(asyncDeleteExchangeEvent) Error: ', error);
    throw error;
  }
};

export const asyncGetRecurrAndSingleExchangeEvents = async (exch) => {
  const exchangeEvents = await asyncGetAllExchangeEvents(exch);

  const arrayOfNonRecurrIds = [];
  const mapOfRecurrEvents = new Map();
  exchangeEvents.forEach((event) => {
    if (event.AppointmentType === 'Single') {
      arrayOfNonRecurrIds.push(new ItemId(event.Id.UniqueId));
    } else {
      let arrayOfRecurrIds = mapOfRecurrEvents.get(event.ICalUid);
      if (arrayOfRecurrIds === undefined) {
        arrayOfRecurrIds = [];
      }

      arrayOfRecurrIds.push(event);
      mapOfRecurrEvents.set(event.ICalUid, arrayOfRecurrIds);
    }
  });

  const exchangeEventsWithBody = await asyncGetExchangeBodyEvents(
    exch,
    arrayOfNonRecurrIds,
    exchangeEvents
  );

  const recurrMasterEvents = await asyncGetExchangeRecurrMasterEvents(exch);
  console.log(mapOfRecurrEvents, recurrMasterEvents);
  for (const [key, value] of mapOfRecurrEvents) {
    const recurrMasterId = recurrMasterEvents.get(key).Id;
    value.forEach((event) => (event.RecurrenceMasterId = recurrMasterId));
    exchangeEventsWithBody.push(...value);
  }
  // console.log(exchangeEventsWithBody);
  return exchangeEventsWithBody;
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

const asyncGetExchangeBodyEvents = async (exch, arrayOfNonRecurrIds, exchangeEvents) => {
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

export const parseEwsRecurringPatterns = (
  id,
  ews,
  iCalUID,
  deletedOccurrences,
  editedOccurrences
) => {
  console.log(ews);
  // debugger;
  return {
    id: uuidv4(),
    originalId: id,
    freq: parseEwsFreq(ews.XmlElementName),
    interval: ews.Interval === undefined || ews.Interval === null ? 0 : parseInt(ews.Interval, 10),
    recurringTypeId: ews.StartDate.getMomentDate().format('YYYY-MM-DDTHH:mm:ssZ'),
    until: ews.EndDate === null ? '' : ews.EndDate.getMomentDate().format('YYYY-MM-DDTHH:mm:ssZ'),
    iCalUID,
    // TO-DO, actually populate this properly.
    exDates:
      deletedOccurrences === null
        ? []
        : deletedOccurrences.Items.map((deletedOccur) =>
            deletedOccur.OriginalStart.getMomentDate().format('YYYY-MM-DDTHH:mm:ssZ')
          ).filter(
            (deletedRecurrString) =>
              moment(deletedRecurrString).isAfter(ews.StartDate.getMomentDate()) &&
              (ews.EndDate === null ||
                moment(deletedRecurrString).isBefore(ews.EndDate.getMomentDate()))
          ),
    recurrenceIds:
      editedOccurrences === null
        ? []
        : editedOccurrences.Items.map((editedOccur) =>
            editedOccur.OriginalStart.getMomentDate().format('YYYY-MM-DDTHH:mm:ssZ')
          ).filter(
            (editedRecurrString) =>
              moment(editedRecurrString).isAfter(ews.StartDate.getMomentDate()) &&
              (ews.EndDate === null ||
                moment(editedRecurrString).isBefore(ews.EndDate.getMomentDate()))
          ),
    modifiedThenDeleted: false,
    weeklyPattern:
      ews.XmlElementName === 'WeeklyRecurrence' ? convertDaysToArray(ews.DaysOfTheWeek.items) : [],
    numberOfRepeats: ews.NumberOfOccurrences === null ? 0 : ews.NumberOfOccurrences,
    byWeekNo:
      ews.DayOfTheWeekIndex === undefined || ews.DayOfTheWeekIndex === null
        ? '()'
        : parseEwsWeekDayIndex(ews.DayOfTheWeekIndex),
    byWeekDay:
      // eslint-disable-next-line no-nested-ternary
      ews.DaysOfTheWeek !== undefined && ews.DaysOfTheWeek !== null
        ? parseEwsWeekDay(ews.DaysOfTheWeek)
        : ews.DayOfTheWeek !== undefined && ews.DayOfTheWeek !== null
        ? parseEwsWeekDay({ items: [ews.DayOfTheWeek] })
        : '()',
    // ews.DaysOfTheWeek === undefined || ews.DaysOfTheWeek === null
    //   ? '()'
    //   : parseEwsWeekDay(ews.DaysOfTheWeek),
    byMonth: ews.Month === undefined || ews.Month === null ? '()' : parseEwsMonth(ews.Month),
    byMonthDay:
      ews.DayOfMonth === undefined || ews.DayOfMonth === null ? '()' : `(${ews.DayOfMonth})`
  };
};

const convertDaysToArray = (arrayVals) => {
  const arr = [0, 0, 0, 0, 0, 0, 0];
  arrayVals.forEach((val) => (arr[val] = 1));
  return arr;
};

const parseEwsWeekDayIndex = (ewsEnumDayOfTheWeekIndex) => {
  debugger;
  let val = '';
  switch (ewsEnumDayOfTheWeekIndex) {
    case DayOfTheWeekIndex.First:
      val = '0';
      break;
    case DayOfTheWeekIndex.Second:
      val = '1';
      break;
    case DayOfTheWeekIndex.Third:
      val = '2';
      break;
    case DayOfTheWeekIndex.Fourth:
      val = '3';
      break;
    case DayOfTheWeekIndex.Last:
      val = '-1';
      break;
    default:
      break;
  }
  return `(${val})`;
};

const parseEwsWeekDay = (ewsEnumDayOfTheWeek) => {
  let val = '';
  // debugger;
  ewsEnumDayOfTheWeek.items.forEach((item) => {
    let out = '';
    switch (item) {
      case DayOfTheWeek.Monday || 1:
        out = 'MO';
        break;
      case DayOfTheWeek.Tuesday || 2:
        out = 'TU';
        break;
      case DayOfTheWeek.Wednesday || 3:
        out = 'WE';
        break;
      case DayOfTheWeek.Thursday || 4:
        out = 'TH';
        break;
      case DayOfTheWeek.Friday || 5:
        out = 'FR';
        break;
      case DayOfTheWeek.Saturday || 6:
        out = 'SA';
        break;
      case DayOfTheWeek.Sunday || 0:
        out = 'SU';
        break;
      default:
        console.log('ERROR, WUT');
        break;
    }
    val += `${out},`;
  });
  return `(${val.slice(0, -1)})`;
};

const parseEwsMonth = (ewsEnumMonth) => {
  let val = '';
  switch (ewsEnumMonth) {
    case Month.January:
      val = '1';
      break;
    case Month.February:
      val = '2';
      break;
    case Month.March:
      val = '3';
      break;
    case Month.April:
      val = '4';
      break;
    case Month.May:
      val = '5';
      break;
    case Month.June:
      val = '6';
      break;
    case Month.July:
      val = '7';
      break;
    case Month.August:
      val = '8';
      break;
    case Month.September:
      val = '9';
      break;
    case Month.October:
      val = '10';
      break;
    case Month.November:
      val = '11';
      break;
    case Month.December:
      val = '12';
      break;
    default:
      break;
  }
  return `(${val})`;
};

export const asyncGetExchangeRecurrMasterEvents = async (exch) => {
  let view;
  const exchangeEvents = new Map();
  const results = [];

  const db = await getDb();

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
            console.log(event.Recurrence);
            const dbRecurrencePattern = parseEwsRecurringPatterns(
              event.Id.UniqueId,
              event.Recurrence,
              event.ICalUid,
              event.DeletedOccurrences,
              event.ModifiedOccurrences
            );
            console.log(dbRecurrencePattern);
            exchangeEvents.set(event.ICalUid, event);

            promiseArr.push(
              db.recurrencepatterns
                .findOne()
                .where('originalId')
                .eq(event.Id.UniqueId)
                .exec()
            );
          });
        return Promise.all(promiseArr);
      })
      .then((existInDb) => {
        exchangeEvents.forEach((event, eventId) => {
          const prevDbObj = existInDb
            .filter((dbRecurrencePattern) => dbRecurrencePattern !== null)
            .filter((dbRecurrencePattern) => dbRecurrencePattern.iCalUID === eventId);

          console.log(prevDbObj, event, eventId, existInDb);
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

            const query = db.recurrencepatterns
              .findOne()
              .where('originalId')
              .eq(prevDbObj[0].originalId);

            console.log(recurrencePattern);
            debugger;

            results.push(
              query.update({
                $set: {
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
                }
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
            results.push(db.recurrencepatterns.upsert(recurrencePattern));
          }
        });
      });
  } catch (error) {
    console.log(error);
  }

  await Promise.all(results);
  // const dbRecurrPatterns = await db.recurrencepatterns.find().exec();
  // console.log(dbRecurrPatterns, exchangeEvents);
  // dbRecurrPatterns.forEach((recurr) => console.log(recurr.toJSON()));
  return exchangeEvents;
};

const parseEwsFreq = (ewsAppointmentPattern) => {
  switch (ewsAppointmentPattern) {
    case 'DailyRecurrence':
      return 'DAILY';
    case 'AbsoluteMonthlyRecurrence':
      return 'MONTHLY';
    case 'RelativeMonthlyRecurrence':
      return 'MONTHLY';
    case 'RelativeYearlyRecurrence':
      return 'YEARLY';
    case 'WeeklyRecurrence':
      return 'WEEKLY';
    case 'AbsoluteYearlyRecurrence':
      return 'YEARLY';
    default:
      break;
  }
};

const parseStringToEwsWeekDay = (stringEwsWeekDay) => {
  stringEwsWeekDay = stringEwsWeekDay.slice(1, -1);
  switch (stringEwsWeekDay) {
    case 'MO':
      return DayOfTheWeek.Monday;
    case 'TU':
      return DayOfTheWeek.Tuesday;
    case 'WE':
      return DayOfTheWeek.Wednesday;
    case 'TH':
      return DayOfTheWeek.Thursday;
    case 'FR':
      return DayOfTheWeek.Friday;
    case 'SA':
      return DayOfTheWeek.Saturday;
    case 'SU':
      return DayOfTheWeek.Sunday;
    default:
      break;
  }
};

export const createEwsRecurrenceObj = (
  firstOption, // Daily, Weekly, Monthly or Yearly.
  secondOption, // Weekly, which dates.
  recurrInterval, // Recurring Intervals.
  ewsRecurr, // Origianl Recurring interval.
  untilType, // End Type, Never, On, or After x amount.
  untilDate, // End Type, On Value, String, Date time.
  untilAfter, // End Type, After Value, String, but number parsed.
  byMonth, // Used for Monthly/Yearly, Repeat on which month.
  byMonthDay, // Used for Monthly/Yearly, Repeat on which day of a month
  byWeekDay, // Used for Weekly/Monthly/Yearly, Repeat on which week day, E.g. Mon, tues
  byWeekNo // Used for Weekly/Monthly/Yearly, Repeat on a specified week number. E.g. 1-4, or last.
) => {
  let recurrObj;
  // console.log(DayOfTheWeek[1]);
  // console.log(DayOfTheWeek[DayOfTheWeek[1]]);
  debugger;
  switch (firstOption) {
    case 0:
      recurrObj = new Recurrence.DailyPattern();
      break;
    case 1:
      recurrObj = new Recurrence.WeeklyPattern();

      const DayOfWeekArr = [];
      for (let i = 0; i < secondOption[1].length; i += 1) {
        if (secondOption[1][i] === 1) {
          recurrObj.DaysOfTheWeek.Add(i);
        }
      }
      break;
    case 2:
      debugger;
      // We assume EWS only allows one month day due to its API limitation.
      if (secondOption[2] === 0) {
        recurrObj = new Recurrence.MonthlyPattern();
        // Slice off the (), and take the number by parsing, but ensure that if empty, not NaN.
        recurrObj.DayOfMonth = byMonthDay === '()' ? 0 : parseInt(byMonthDay.slice(1, -1), 10);
        // Hard code to test stuff first.
        // recurrObj.DayOfMonth = 21;
      } else {
        const dayOfWeekIndexNum = parseInt(byWeekNo.slice(1, -1), 10);
        recurrObj = new Recurrence.RelativeMonthlyPattern();
        recurrObj.DayOfTheWeek = parseStringToEwsWeekDay(byWeekDay);
        // recurrObj.DayOfTheWeek = 1
        recurrObj.DayOfTheWeekIndex = dayOfWeekIndexNum;
      }
      break;
    case 3:
      const parsedMonth = byMonth === '()' ? 0 : parseInt(byMonth.slice(1, -1), 10);
      if (secondOption[3] === 0) {
        recurrObj = new Recurrence.YearlyPattern();
        // Slice off the (), and take the number by parsing, but ensure that if empty, not NaN.
        recurrObj.DayOfMonth = byMonthDay === '()' ? 0 : parseInt(byMonthDay.slice(1, -1), 10);
        // recurrObj.DayOfMonth = 21;
      } else {
        const dayOfWeekIndexNum = parseInt(byWeekNo.slice(1, -1), 10);
        recurrObj = new Recurrence.RelativeYearlyPattern();
        recurrObj.DayOfTheWeek = parseStringToEwsWeekDay(byWeekDay);
        recurrObj.DayOfTheWeekIndex = dayOfWeekIndexNum;
        // recurrObj.DayOfTheWeek = 1;
        // recurrObj.DayOfTheWeekIndex = 2;
      }
      recurrObj.Month = parsedMonth;
      // recurrObj.Month = Month.September;
      break;
    default:
      console.log('(createEwsRecurrenceObj) Default 1');
      return -1;
  }

  recurrObj.StartDate = ewsRecurr.StartDate;

  switch (untilType) {
    case 'o':
      // Filter to just Y/M/D, don't need any time.
      recurrObj.EndDate = new DateTime(moment(untilDate));
      break;
    case 'a':
      // Ensure it is a number.
      recurrObj.NumberOfOccurrences = parseInt(untilAfter, 10);
      break;
    case 'n':
      // No end, rip. Constant expansion here we go.
      recurrObj.HasEnd = false;
      break;
    default:
      console.log('(createEwsRecurrenceObj) Default 2');
      return -1;
  }

  recurrObj.Interval = recurrInterval.toString();
  return recurrObj;
};
