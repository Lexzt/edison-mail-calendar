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
// import getDb from '../../rxdb';
import {
  deleteEventSuccess,
  editEventSuccess,
  apiFailure,
  postEventSuccess
} from '../../actions/events';
import * as dbEventActions from '../../sequelizeDB/operations/events';
import * as dbRpActions from '../../sequelizeDB/operations/recurrencepatterns';
import * as ExchangeBasics from './exchangebasics';

export const filterExchangeUser = (jsonObj) => ({
  personId: uuidv4(),
  originalId: md5(jsonObj.username),
  email: jsonObj.username,
  providerType: ProviderTypes.EXCHANGE,
  password: jsonObj.password
});

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
          const result = await dbEventActions.getAllEventByOriginalId(newEvent.Id.UniqueId);

          if (result.length === 0) {
            await dbEventActions.insertEventsIntoDatabase(filteredItem);
          } else if (result.length === 1) {
            await dbEventActions.updateEventByOriginalId(newEvent.Id.UniqueId, filteredItem);
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
          const updatedItem = await ExchangeBasics.asyncGetSingleExchangeEvent(
            user.email,
            user.password,
            'https://outlook.office365.com/Ews/Exchange.asmx',
            singleAppointment.Id.UniqueId
          );

          const localDbCopy = await dbEventActions.getOneEventByOriginalId(
            singleAppointment.Id.UniqueId
          );
          updatedItem.RecurrenceMasterId = { UniqueId: localDbCopy.recurringEventId };

          const filteredItem = ProviderTypes.filterIntoSchema(
            updatedItem,
            ProviderTypes.EXCHANGE,
            user.email,
            false
          );
          filteredItem.id = localDbCopy.id;
          await dbEventActions.updateEventByOriginalId(singleAppointment.Id.UniqueId, filteredItem);
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
          const updatedItem = await ExchangeBasics.asyncGetSingleExchangeEvent(
            user.email,
            user.password,
            'https://outlook.office365.com/Ews/Exchange.asmx',
            singleAppointment.Id.UniqueId
          );
          const localDbItems = await dbEventActions.getAllEventsByRecurringEventId(
            singleAppointment.Id.UniqueId
          );

          await Promise.all(
            localDbItems.map((localRecurringItem) =>
              dbEventActions.updateEventRecurringEventId(localRecurringItem.recurringEventId, {
                // TO-DO, add more values for updating.
                summary: updatedItem.Subject
              })
            )
          );
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
        await dbEventActions.deleteEventByOriginalId(singleAppointment.Id.UniqueId);
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
  const exchangeEvents = await ExchangeBasics.asyncGetAllExchangeEvents(exch);

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

  const exchangeEventsWithBody = await ExchangeBasics.asyncGetExchangeBodyEvents(
    exch,
    arrayOfNonRecurrIds,
    exchangeEvents
  );

  const recurrMasterEvents = await ExchangeBasics.asyncGetExchangeRecurrMasterEvents(exch);
  for (const [key, value] of mapOfRecurrEvents) {
    const recurrMasterId = recurrMasterEvents.get(key).Id;
    value.forEach((event) => (event.RecurrenceMasterId = recurrMasterId));
    exchangeEventsWithBody.push(...value);
  }
  return exchangeEventsWithBody;
};

export const parseEwsRecurringPatterns = (
  id,
  ews,
  iCalUID,
  deletedOccurrences,
  editedOccurrences
  // eslint-disable-next-line arrow-body-style
) => {
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
        ? ''
        : deletedOccurrences.Items.map((deletedOccur) =>
            deletedOccur.OriginalStart.getMomentDate().format('YYYY-MM-DDTHH:mm:ssZ')
          )
            .filter(
              (deletedRecurrString) =>
                moment(deletedRecurrString).isAfter(ews.StartDate.getMomentDate()) &&
                (ews.EndDate === null ||
                  moment(deletedRecurrString).isBefore(ews.EndDate.getMomentDate()))
            )
            .join(','),
    recurrenceIds:
      editedOccurrences === null
        ? ''
        : editedOccurrences.Items.map((editedOccur) =>
            editedOccur.OriginalStart.getMomentDate().format('YYYY-MM-DDTHH:mm:ssZ')
          )
            .filter(
              (editedRecurrString) =>
                moment(editedRecurrString).isAfter(ews.StartDate.getMomentDate()) &&
                (ews.EndDate === null ||
                  moment(editedRecurrString).isBefore(ews.EndDate.getMomentDate()))
            )
            .join(','),
    modifiedThenDeleted: false,
    weeklyPattern:
      ews.XmlElementName === 'WeeklyRecurrence' ? convertDaysToArray(ews.DaysOfTheWeek.items) : '',
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
        recurrObj.DayOfTheWeekIndex = dayOfWeekIndexNum;
      }
      break;
    case 3:
      const parsedMonth = byMonth === '()' ? 0 : parseInt(byMonth.slice(1, -1), 10);
      if (secondOption[3] === 0) {
        // Slice off the (), and take the number by parsing, but ensure that if empty, not NaN.
        recurrObj = new Recurrence.YearlyPattern();
        recurrObj.DayOfMonth = byMonthDay === '()' ? 0 : parseInt(byMonthDay.slice(1, -1), 10);
      } else {
        const dayOfWeekIndexNum = parseInt(byWeekNo.slice(1, -1), 10);
        recurrObj = new Recurrence.RelativeYearlyPattern();
        recurrObj.DayOfTheWeek = parseStringToEwsWeekDay(byWeekDay);
        recurrObj.DayOfTheWeekIndex = dayOfWeekIndexNum;
      }
      recurrObj.Month = parsedMonth;
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
