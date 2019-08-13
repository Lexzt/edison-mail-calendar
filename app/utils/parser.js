import React from 'react';
import ICAL from 'ical.js';
import moment from 'moment';
import uuidv4 from 'uuid';
import { RRule, RRuleSet, rrulestr } from 'rrule';
import getDb from '../db';

const TEMPORARY_RECURRENCE_END = new Date(2020, 12, 12);

const parseRecurrenceEvents = (calEvents) => {
  const recurringEvents = [];
  calEvents.forEach((calEvent) => {
    const { isRecurring } = calEvent.eventData;
    if (isRecurring && (calEvent.recurData !== undefined && calEvent.recurData !== null)) {
      debugger;
      const options = RRule.parseString(calEvent.recurData.rrule.stringFormat);
      options.dtstart = new Date(moment(calEvent.eventData.start.dateTime));
      const rrule = new RRule(options);
      recurringEvents.push({
        id: uuidv4(),
        recurringTypeId: calEvent.eventData.start.dateTime,
        originalId: calEvent.eventData.originalId,
        freq: calEvent.recurData.rrule.freq,
        interval: calEvent.recurData.rrule.interval,
        until: calEvent.recurData.rrule.until,
        exDates: calEvent.recurData.exDates,
        recurrenceIds: calEvent.recurData.recurrenceIds,
        modifiedThenDeleted: calEvent.recurData.modifiedThenDeleted,
        numberOfRepeats: calEvent.recurData.rrule.count,
        iCalUID: calEvent.eventData.iCalUID,
        iCALString: calEvent.recurData.iCALString,
        wkSt: calEvent.recurData.rrule.wkst,
        bySetPos: calEvent.recurData.rrule.bysetpos,
        byMonth: calEvent.recurData.rrule.bymonth,
        byMonthDay: calEvent.recurData.rrule.bymonthday,
        byYearDay: calEvent.recurData.rrule.byyearday,
        byWeekNo:
          rrule.origOptions.byweekday === undefined
            ? '()'
            : `(${rrule.origOptions.byweekday
                .filter((e) => e.n !== undefined)
                .map((e) => e.n)
                .join(',')})`,
        // byWeekDay: calEvent.recurData.rrule.byday
        //   ? `(${calEvent.recurData.rrule.byday.toString()})`
        //   : `(${parseWeekDayNoToString(moment(calEvent.eventData.start.dateTime).day() - 1)})`,
        byWeekDay:
          rrule.origOptions.byweekday === undefined
            ? '()'
            : `(${rrule.origOptions.byweekday
                .map((e) => parseWeekDayNoToString(e.weekday))
                .join(',')})`,
        byHour: calEvent.recurData.rrule.byhour,
        byMinute: calEvent.recurData.rrule.byminute,
        bySecond: calEvent.recurData.rrule.bysecond,
        byEaster: calEvent.recurData.rrule.byeaster
      });
    }
  });
  return recurringEvents;
};

const parseEventPersons = (events) => {
  const eventPersons = [];
  events.forEach((calEvent) => {
    const attendees = calEvent.eventData.attendee;
    if (attendees.length > 0) {
      // if there are attendees
      attendees.forEach((attendee) => {
        eventPersons.push({
          eventPersonId: uuidv4(),
          // this is null when status of event is not confirmed
          eventId: calEvent.eventData.id,
          // Update: Gonna use email as the personId
          personId: attendee.email !== undefined ? attendee.email : attendee.action
        });
      });
    }
  });
  return eventPersons;
};

const parseCal = (calendars) => {
  const parsedCalendars = calendars.map((calendar) => ({
    calendarId: calendar.data.href,
    ownerId: calendar.account.credentials.username,
    name: calendar.displayName,
    description: calendar.description,
    timezone: calendar.timezone,
    url: calendar.url
  }));
  return parsedCalendars;
};

const parseCalEvents = (calendars) => {
  const events = [];
  calendars.forEach((calendar) => {
    events.push(newParseCalendarObjects(calendar));
  });
  const flatEvents = events.reduce((acc, val) => acc.concat(val), []);
  const filteredEvents = flatEvents.filter((event) => event !== '');
  const flatFilteredEvents = filteredEvents.reduce((acc, val) => acc.concat(val), []);
  return flatFilteredEvents;
};

const newParseCalendarObjects = (calendar) => {
  const calendarObjects = calendar.objects;
  const calendarId = calendar.url;
  return calendarObjects.map((calendarObject) => parseCalendarObject(calendarObject, calendarId));
};

const parseCalendarObject = (calendarObject, calendarId) => {
  const { etag, url, calendarData } = calendarObject;
  const etagClean = etag.slice(1, -1);

  let edisonEvent = {};
  if (calendarData !== undefined && calendarData !== '') {
    edisonEvent = parseCalendarData(calendarData, etagClean, url, calendarId);
  } else {
    edisonEvent = '';
  }
  return edisonEvent;
};

const parseCalendarData = (calendarData, etag, url, calendarId) => {
  const results = [];
  const jCalData = ICAL.parse(calendarData);
  const comp = new ICAL.Component(jCalData);
  const modifiedEvents = comp.getAllSubcomponents('vevent');
  const masterEvent = comp.getFirstSubcomponent('vevent');
  const icalMasterEvent = new ICAL.Event(masterEvent);
  const attendees = getAttendees(masterEvent);
  if (icalMasterEvent.isRecurring()) {
    const recurrenceIds = getRecurrenceIds(modifiedEvents);
    const exDates = getExDates(masterEvent);

    // I need to figure out how to parse the data into db here.
    const rrule = getRuleJSON(masterEvent, icalMasterEvent);
    const modifiedThenDeleted = isModifiedThenDeleted(masterEvent, exDates);

    const iCALString = masterEvent.getFirstPropertyValue('rrule').toString();
    if (recurrenceIds.length > 0) {
      // modified events from recurrence series
      for (let i = 1; i < modifiedEvents.length; i += 1) {
        results.push({
          eventData: parseModifiedEvent(comp, etag, url, modifiedEvents[i], calendarId)
        });
      }
    }

    debugger;

    // Recurring event
    results.push({
      recurData: { rrule, exDates, recurrenceIds, modifiedThenDeleted, iCALString },
      eventData: parseEvent(comp, true, etag, url, calendarId, true)
    });
  } else {
    // Non-recurring event
    results.push({
      eventData: parseEvent(comp, false, etag, url, calendarId, false)
    });
  }
  return results;
};

const parseModifiedEvent = (comp, etag, url, modifiedEvent, calendarId) => {
  const dtstart = modifiedEvent
    .getFirstPropertyValue('dtstart')
    .toJSDate()
    .toISOString();

  // // Cannot just set it to dtend, as dtend might not exist.
  // // Refer to RFC4791, PG 90.
  // const dtend = modifiedEvent
  //   .getFirstPropertyValue('dtend')
  //   .toJSDate()
  //   .toISOString();

  let dtend;
  if (modifiedEvent.hasProperty('dtend')) {
    if (!modifiedEvent.hasProperty('duration')) {
      dtend = modifiedEvent
        .getFirstPropertyValue('dtend')
        .toJSDate()
        .toISOString();
    }
  } else if (modifiedEvent.hasProperty('duration')) {
    if (modifiedEvent.getFirstPropertyValue('duration').toSeconds() > 0) {
      dtend = modifiedEvent.getFirstPropertyValue('dtstart').clone();
      dtend.addDuration(modifiedEvent.getFirstPropertyValue('duration'));
    }
  } else {
    // According to documentation, it ask me to add one day if both duration and dtend does not exist.
    dtend = modifiedEvent
      .getFirstPropertyValue('dtstart')
      .clone()
      .addDuration(
        new ICAL.Duration({
          days: 1
        })
      );
  }
  dtend = dtend.toJSDate().toISOString();

  return {
    id: uuidv4(),
    start: {
      dateTime: dtstart,
      timezone: 'timezone'
    },
    end: {
      dateTime: dtend,
      timezone: 'timezone'
    },
    originalId: modifiedEvent.getFirstPropertyValue('uid'),
    iCalUID: modifiedEvent.getFirstPropertyValue('uid'),
    created: new Date(modifiedEvent.getFirstPropertyValue('created')).toISOString(),
    updated: new Date(modifiedEvent.getFirstPropertyValue('last-modified')).toISOString(),
    summary: modifiedEvent.getFirstPropertyValue('summary'),
    description:
      modifiedEvent.getFirstPropertyValue('description') == null
        ? ''
        : modifiedEvent.getFirstPropertyValue('description'),
    location:
      modifiedEvent.getFirstPropertyValue('location') == null
        ? ''
        : modifiedEvent.getFirstPropertyValue('location'),
    // organizer:
    //   modifiedEvent.getFirstPropertyValue('organizer') == null
    //     ? modifiedEvent
    //     : modifiedEvent.getFirstPropertyValue('organizer'),
    originalStartTime: {
      dateTime: new Date(dtstart).toISOString(),
      timezone: 'timezone'
    },
    attendee: getAttendees(modifiedEvent),
    // calendarId,
    providerType: 'CALDAV',
    isRecurring: true,
    // isModifiedThenDeleted: mtd,
    etag,
    caldavUrl: url,
    calendarId,
    iCALString: comp.toString()
  };
};

const parseEvent = (component, isRecurring, etag, url, calendarId, cdIsMaster) => {
  // debugger;
  const masterEvent = component.getFirstSubcomponent('vevent');
  const dtstart =
    masterEvent.getFirstPropertyValue('dtstart') == null
      ? ''
      : masterEvent.getFirstPropertyValue('dtstart');

  let dtend;
  if (masterEvent.hasProperty('dtend')) {
    if (!masterEvent.hasProperty('duration')) {
      dtend = masterEvent
        .getFirstPropertyValue('dtend')
        .toJSDate()
        .toISOString();
    }
  } else if (masterEvent.hasProperty('duration')) {
    if (masterEvent.getFirstPropertyValue('duration').toSeconds() > 0) {
      dtend = masterEvent.getFirstPropertyValue('dtstart').clone();
      dtend.addDuration(masterEvent.getFirstPropertyValue('duration'));
    }
  } else {
    // According to documentation, it ask me to add one day if both duration and dtend does not exist.
    dtend = masterEvent
      .getFirstPropertyValue('dtstart')
      .clone()
      .addDuration(
        new ICAL.Duration({
          days: 1
        })
      );
  }
  // const dtend =
  //   masterEvent.getFirstPropertyValue('dtend') == null
  //     ? masterEvent
  //         .getFirstPropertyValue('dtstart')
  //         .adjust(0, 2, 0, 0)
  //         .toString()
  //     : masterEvent.getFirstPropertyValue('dtend');
  const event = {
    id: uuidv4(),
    start: {
      dateTime: dtstart.toString(),
      timezone: 'timezone'
    },
    end: {
      dateTime: dtend.toString(),
      timezone: 'timezone'
    },
    originalId: masterEvent.getFirstPropertyValue('uid'),
    iCalUID: masterEvent.getFirstPropertyValue('uid'),
    created: new Date(masterEvent.getFirstPropertyValue('created')).toISOString(),
    updated: new Date(masterEvent.getFirstPropertyValue('last-modified')).toISOString(),
    summary: masterEvent.getFirstPropertyValue('summary'),
    description:
      masterEvent.getFirstPropertyValue('description') == null
        ? ''
        : masterEvent.getFirstPropertyValue('description'),
    location:
      masterEvent.getFirstPropertyValue('location') == null
        ? ''
        : masterEvent.getFirstPropertyValue('location'),
    // organizer:
    //   masterEvent.getFirstPropertyValue('organizer') == null
    //     ? masterEvent
    //     : masterEvent.getFirstPropertyValue('organizer'),
    originalStartTime: {
      dateTime: new Date(dtstart).toISOString(),
      timezone: 'timezone'
    },
    attendee: getAttendees(masterEvent),
    providerType: 'CALDAV',
    isRecurring,
    // isModifiedThenDeleted: mtd,
    etag,
    caldavUrl: url,
    calendarId,
    isMaster: cdIsMaster,
    iCALString: component.toString()
  };
  return event;
};

const getRuleJSON = (masterEvent, icalMasterEvent) => {
  let rruleJSON = {};
  debugger;
  if (icalMasterEvent.isRecurring()) {
    const rrule = masterEvent.getFirstPropertyValue('rrule');
    rruleJSON = rrule.toJSON();
    rruleJSON.stringFormat = rrule.toString();
    if (rruleJSON.byday !== undefined) {
      if (typeof rruleJSON.byday === 'string') {
        rruleJSON.byday = [rruleJSON.byday];
      }
    }
  }
  return rruleJSON;
};

const getAttendees = (masterEvent) => {
  let attendees = [];
  if (masterEvent.hasProperty('attendee')) {
    attendees = parseAttendees(masterEvent.getAllProperties('attendee'));
  }
  return attendees;
};

const getExDates = (masterEvent) => {
  const exDates = [];
  if (masterEvent.hasProperty('exdate')) {
    const exdateProps = masterEvent.getAllProperties('exdate');
    exdateProps.forEach((exdate) => exDates.push(exdate.jCal[3]));
  }
  return exDates;
};

const getRecurrenceIds = (vevents) => {
  const recurrenceIds = [];
  vevents.forEach((evt, index) => {
    if (evt.getFirstPropertyValue('recurrence-id')) {
      recurrenceIds.push(evt.getFirstProperty('recurrence-id').jCal[3]);
    }
  });
  return recurrenceIds;
};

const isModifiedThenDeleted = (recurEvent, exDates) => {
  let isMtd = false;
  if (exDates === 0 || !recurEvent.hasProperty('recurrence-id')) {
    return isMtd;
  }
  const recurId = recurEvent.getFirstProperty('recurrence-id').jCal[3];
  exDates.forEach((exdate) => {
    if (exdate[3] === recurId) {
      isMtd = true;
      return isMtd;
    }
  });
  return isMtd;
};

/* Take Note that attendees with unconfirmed status do not have names */
const parseAttendees = (properties) =>
  properties.map((property) => ({
    status: property.jCal[1].partstat,
    action: property.jCal[3],
    email: property.jCal[1].email,
    displayName: property.jCal[1].cn !== undefined ? property.jCal[1].cn : property.jCal[1].email
  }));

const expandRecurEvents = async (results) => {
  const db = await getDb();
  const nonMTDresults = results.filter((result) => !result.isModifiedThenDeleted);
  const recurringEvents = nonMTDresults.filter(
    (nonMTDresult) =>
      nonMTDresult.isRecurring &&
      nonMTDresult.providerType === 'CALDAV' &&
      nonMTDresult.isMaster === true
  );
  let finalResults = [];
  if (recurringEvents.length === 0) {
    finalResults = nonMTDresults;
  } else {
    finalResults = expandSeries(recurringEvents, db);
  }
  return finalResults;
};

const expandSeries = async (recurringEvents, db) => {
  const resolved = await Promise.all(
    recurringEvents.map(async (recurMasterEvent) => {
      const recurPatternRecurId = await db.recurrencepatterns
        .find()
        .where('originalId')
        .eq(recurMasterEvent.iCalUID)
        .exec();
      return parseRecurrence(recurPatternRecurId[0].toJSON(), recurMasterEvent);
    })
  );
  const expandedSeries = resolved.reduce((acc, val) => acc.concat(val), []);
  return expandedSeries;
};

const parseRecurrence = (pattern, recurMasterEvent) => {
  debugger;
  const recurEvents = [];
  const ruleSet = buildRuleSet(pattern, recurMasterEvent.start.dateTime);
  const recurDates = ruleSet.all().map((date) => date.toJSON());
  const duration = getDuration(recurMasterEvent);
  debugger;
  recurDates.forEach((recurDateTime) => {
    recurEvents.push({
      id: uuidv4(),
      end: {
        dateTime: moment(recurDateTime)
          .add(duration)
          .toISOString(),
        timezone: 'timezone'
      },
      start: {
        dateTime: recurDateTime,
        timezone: 'timezone'
      },
      summary: recurMasterEvent.summary,
      // organizer: recurMasterEvent.organizer,
      // recurrence: recurMasterEvent.recurrence,
      iCalUID: recurMasterEvent.iCalUID,
      iCALString: recurMasterEvent.iCALString,
      attendee: recurMasterEvent.attendee,
      originalId: recurMasterEvent.originalId,
      // creator: recurMasterEvent.creator,
      isRecurring: recurMasterEvent.isRecurring,
      providerType: recurMasterEvent.providerType,
      calendarId: recurMasterEvent.calendarId,
      created: recurMasterEvent.created,
      description: recurMasterEvent.description,
      etag: recurMasterEvent.etag,
      caldavUrl: recurMasterEvent.caldavUrl,
      location: recurMasterEvent.location,
      originalStartTime: recurMasterEvent.originalStartTime,
      updated: recurMasterEvent.updated
    });
  });
  return recurEvents;
};

const getDuration = (master) => {
  const start = moment(master.start.dateTime);
  const end = moment(master.end.dateTime);
  return moment.duration(end.diff(start));
};

const parseStringToWeekDayNo = (stringEwsWeekDay) => {
  switch (stringEwsWeekDay) {
    case 'MO':
      return 0;
    case 'TU':
      return 1;
    case 'WE':
      return 2;
    case 'TH':
      return 3;
    case 'FR':
      return 4;
    case 'SA':
      return 5;
    case 'SU':
      return 6;
    default:
      break;
  }
};

const parseWeekDayNoToString = (stringEwsWeekDay) => {
  switch (stringEwsWeekDay) {
    case 0:
      return 'MO';
    case 1:
      return 'TU';
    case 2:
      return 'WE';
    case 3:
      return 'TH';
    case 4:
      return 'FR';
    case 5:
      return 'SA';
    case 6:
      return 'SU';
    default:
      break;
  }
};

const buildRuleObject = (pattern, startTime) => {
  debugger;
  const ruleObject = {};
  ruleObject.interval = pattern.interval;
  ruleObject.dtstart = new Date(startTime);
  // ruleObject.byweekday =
  //   pattern.byWeekDay !== '()'
  //     ? pattern.byWeekDay
  //         .slice(1, -1)
  //         .split(',')
  //         .map((day) => parseStringToWeekDayNo(day))
  //     : null;

  // ruleObject.byweekday = [{ weekday: 4, n: 2 }];
  // ruleObject.byweekno =
  //   pattern.byWeekNo !== '()'
  //     ? pattern.byWeekNo
  //         .slice(1, -1)
  //         .split(',')
  //         .map((weekNo) => parseInt(weekNo, 10))
  //     : null;

  // ruleObject.bymonth = pattern.byMonth ? pattern.byMonth : null;
  // ruleObject.bymonthday = pattern.byMonthDay ? pattern.byMonthDay : null;
  // ruleObject.byyearday = pattern.byYearDay ? pattern.byYearDay : null;

  // // Probably not used. Too detailed and not needed.
  // ruleObject.byhour = pattern.byHour ? pattern.byHour : null;
  // ruleObject.bysetpos = pattern.bySetPos ? pattern.bySetPos : null;
  // ruleObject.byminute = pattern.byMinute ? pattern.byMinute : null;
  // ruleObject.bysecond = pattern.bySecond ? pattern.bySecond : null;
  // ruleObject.byeaster = pattern.byEaster ? pattern.byEaster : null;

  // This is where it gets really really tricky, fml.
  // Due to RRule api limiation, if I set a byweekday/byweekno value and
  // it is a monthly recurrence, it will become weekly when .all() is called.
  // Resulting in a weird expansion of the recurrence series.
  // So based off each freq, you need to set the proper variable accordingly.
  switch (pattern.freq) {
    case 'YEARLY':
      ruleObject.freq = RRule.YEARLY;
      break;
    case 'MONTHLY':
      ruleObject.freq = RRule.MONTHLY;

      // Currently, I am facing a techincal limitation of the api.
      // But the idea here is there are different types of monthly events.

      // 1. Those that repeat on same (day of the week) and (week no)
      // 2. Those that repeat on the same (day every month)

      // Using the recurrence pattern, if it is blank which means '()',
      // .all behavior is it will auto expand on the frequency alone.
      // Therefore, I cannot even have a blank array, aka, ruleObject.byweekday.
      const byWeekDay = pattern.byWeekDay
        .slice(1, -1)
        .split(',')
        .filter((str) => str !== undefined && str !== null && str !== '')
        .map((day) => parseStringToWeekDayNo(day));

      const byWeekNo = pattern.byWeekNo
        .slice(1, -1)
        .split(',')
        .filter((str) => str !== undefined && str !== null && str !== '')
        .map((weekNo) => parseInt(weekNo, 10));

      if (byWeekNo.length !== byWeekDay.length) {
        console.log('WeekNo length not equals to WeekDay length!');
      } else if (byWeekNo.length !== 0) {
        // Both ways, you need to set the by week day number.
        ruleObject.byweekday = [];
        for (let i = 0; i < byWeekNo.length; i += 1) {
          ruleObject.byweekday.push({ weekday: byWeekDay[i], n: byWeekNo[i] });
        }
      }
      break;
    case 'WEEKLY':
      ruleObject.freq = RRule.WEEKLY;

      ruleObject.byweekday =
        pattern.byWeekDay !== '()'
          ? pattern.byWeekDay
              .slice(1, -1)
              .split(',')
              .map((day) => parseStringToWeekDayNo(day))
          : null;
      ruleObject.byweekno =
        pattern.byWeekNo !== '()'
          ? pattern.byWeekNo
              .slice(1, -1)
              .split(',')
              .map((weekNo) => parseInt(weekNo, 10))
          : null;
      break;
    case 'DAILY':
      ruleObject.freq = RRule.DAILY;
      break;
    default:
  }

  if (
    (pattern.until === undefined || pattern.until === null) &&
    (pattern.numberOfRepeats === undefined || pattern.numberOfRepeats === null)
  ) {
    ruleObject.until = TEMPORARY_RECURRENCE_END;
  } else if (pattern.until === undefined || pattern.until === null) {
    ruleObject.count = pattern.numberOfRepeats;
  } else {
    ruleObject.until = new Date(pattern.until);
  }

  // switch (pattern.wkst) {
  //   case 'MO':
  //     ruleObject.wkst = 0;
  //     break;
  //   case 'TU':
  //     ruleObject.wkst = 1;
  //     break;
  //   case 'WE':
  //     ruleObject.wkst = 2;
  //     break;
  //   case 'TH':
  //     ruleObject.wkst = 3;
  //     break;
  //   case 'FR':
  //     ruleObject.wkst = 4;
  //     break;
  //   case 'SA':
  //     ruleObject.wkst = 5;
  //     break;
  //   case 'SU':
  //     ruleObject.wkst = 6;
  //     break;
  //   default:
  //     ruleObject.wkst = null;
  // }
  return ruleObject;
};

const getModifiedThenDeletedDates = (exDates, recurDates) => {
  const modifiedThenDeletedDates = [];
  exDates.forEach((exdate) => {
    recurDates.forEach((recurDate) => {
      if (exdate === recurDate) {
        modifiedThenDeletedDates.push(exdate);
      }
    });
  });
  return modifiedThenDeletedDates;
};

export const buildRuleSet = (pattern, start) => {
  // Create new ruleset based off the rule object.
  const rruleSet = new RRuleSet();
  const ruleObject = buildRuleObject(pattern, start);
  rruleSet.rrule(new RRule(ruleObject));

  // Get the deleted and updated occurances from the recurrence pattern.
  const { exDates, recurrenceIds } = pattern;

  // For each of them, set the ex date so to not include them in the list.
  if (exDates !== undefined) {
    exDates.forEach((exdate) => rruleSet.exdate(new Date(exdate)));
  }
  // Here, I am unsure if I am handling it correctly as
  // an edited occurance is also a exdate techincally speaking
  if (recurrenceIds !== undefined) {
    recurrenceIds.forEach((recurDate) => rruleSet.exdate(new Date(recurDate)));
  }

  // const modifiedThenDeletedDates = getModifiedThenDeletedDates(exDates, recurrenceIds);
  /* To remove start date duplicate */
  return rruleSet;
};

export default {
  parseCal,
  parseCalEvents,
  parseCalendarData,
  parseEventPersons,
  parseRecurrenceEvents,
  expandRecurEvents,
  parseRecurrence
};
