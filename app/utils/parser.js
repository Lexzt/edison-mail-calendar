/* eslint-disable no-lone-blocks */
import React from 'react';
import ICAL from 'ical.js';
import moment from 'moment';
import uuidv4 from 'uuid';
import { DateTime } from 'luxon';
import { RRule, RRuleSet, rrulestr } from 'rrule';
import * as dbRpActions from '../sequelizeDB/operations/recurrencepatterns';

const TEMPORARY_RECURRENCE_END = new Date(2020, 12, 12);

export const parseRecurrenceEvents = (calEvents) => {
  const recurringEvents = [];
  calEvents.forEach((calEvent) => {
    const { isRecurring } = calEvent.eventData;
    if (isRecurring && (calEvent.recurData !== undefined && calEvent.recurData !== null)) {
      const options = RRule.parseString(calEvent.recurData.rrule.stringFormat);
      options.dtstart = new Date(moment(calEvent.eventData.start.dateTime));
      const rrule = new RRule(options);
      recurringEvents.push({
        id: uuidv4(),
        recurringTypeId: calEvent.eventData.start.dateTime, // datetime here is alr unix
        originalId: calEvent.eventData.originalId,
        freq: calEvent.recurData.rrule.freq,
        interval: calEvent.recurData.rrule.interval,
        until:
          calEvent.recurData.rrule.until !== undefined
            ? moment(calEvent.recurData.rrule.until)
                .unix()
                .toString()
            : undefined,
        exDates: calEvent.recurData.exDates.join(','),
        recurrenceIds: calEvent.recurData.recurrenceIds.join(','),
        modifiedThenDeleted: calEvent.recurData.modifiedThenDeleted,
        numberOfRepeats: calEvent.recurData.rrule.count,
        iCalUID: calEvent.eventData.iCalUID,
        iCALString: calEvent.recurData.iCALString,
        wkSt: calEvent.recurData.rrule.wkst, // Prob not working
        byMonth:
          rrule.origOptions.bymonth === undefined ? '' : rrule.origOptions.bymonth.toString(),
        byMonthDay:
          // eslint-disable-next-line no-nested-ternary
          rrule.origOptions.bymonthday === undefined
            ? ''
            : rrule.origOptions.bymonthday === Array
            ? `(${rrule.origOptions.bymonthday.join(',')})`
            : `(${rrule.origOptions.bymonthday})`,
        byYearDay:
          rrule.origOptions.byyearday === undefined
            ? ''
            : `(${calEvent.recurData.rrule.byyearday.join(',')})`,
        byWeekNo:
          rrule.origOptions.byweekday === undefined
            ? '()'
            : `(${rrule.origOptions.byweekday
                .filter((e) => e.n !== undefined)
                .map((e) => e.n)
                .join(',')})`,
        byWeekDay:
          rrule.origOptions.byweekday === undefined
            ? '()'
            : `(${rrule.origOptions.byweekday
                .map((e) => parseWeekDayNoToString(e.weekday))
                .join(',')})`,
        weeklyPattern:
          calEvent.recurData.rrule.freq !== 'WEEKLY' ? '' : convertiCalWeeklyPattern(rrule),
        // Too much details, Prob not needed
        bySetPos: calEvent.recurData.rrule.bysetpos,
        byHour: calEvent.recurData.rrule.byhour,
        byMinute: calEvent.recurData.rrule.byminute,
        bySecond: calEvent.recurData.rrule.bysecond,
        byEaster: calEvent.recurData.rrule.byeaster
      });
    }
  });
  // debugger;
  return recurringEvents;
};

export const convertiCalWeeklyPattern = (rrule) => {
  // debugger;
  const weeklyPattern = [0, 0, 0, 0, 0, 0, 0];
  if (rrule.origOptions.byweekday) {
    // console.log(rrule.origOptions.byweekday);
    rrule.origOptions.byweekday.forEach((e) => {
      // Need +1 here because weekday starts from 0
      let index = e.weekday + 1;
      if (index >= 7) {
        index = 0;
      }
      weeklyPattern[index] = 1;
    });
  } else {
    const date = moment(rrule.options.dtstart);
    weeklyPattern[date.day()] = 1;
  }
  return weeklyPattern.join(',');
};

export const parseEventPersons = (events) => {
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

export const parseCal = (calendars) => {
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

export const parseCalEvents = (calendars) => {
  const events = [];
  calendars.forEach((calendar) => {
    events.push(newParseCalendarObjects(calendar));
  });
  const flatEvents = events.reduce((acc, val) => acc.concat(val), []);
  const filteredEvents = flatEvents.filter((event) => event !== '');
  const flatFilteredEvents = filteredEvents.reduce((acc, val) => acc.concat(val), []);
  return flatFilteredEvents;
};

export const newParseCalendarObjects = (calendar) => {
  const calendarObjects = calendar.objects;
  const calendarId = calendar.url;
  return calendarObjects.map((calendarObject) => parseCalendarObject(calendarObject, calendarId));
};

export const parseCalendarObject = (calendarObject, calendarId) => {
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

export const parseCalendarData = (calendarData, etag, url, calendarId) => {
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

export const parseModifiedEvent = (comp, etag, url, modifiedEvent, calendarId) => {
  const dtstart =
    modifiedEvent.getFirstPropertyValue('dtstart') == null
      ? ''
      : modifiedEvent.getFirstPropertyValue('dtstart');

  const tz = modifiedEvent.getFirstPropertyValue('tzid');
  let dtstartMoment = moment.tz(dtstart.toUnixTime() * 1000, tz);
  dtstartMoment = dtstartMoment.tz('GMT').tz(tz, true);

  let dtend;
  let dtendMoment;
  if (modifiedEvent.hasProperty('dtend')) {
    if (!modifiedEvent.hasProperty('duration')) {
      dtendMoment = moment.tz(modifiedEvent.getFirstPropertyValue('dtend').toUnixTime() * 1000, tz);
      dtendMoment = dtendMoment.tz('GMT').tz(tz, true);
    }
  } else if (modifiedEvent.hasProperty('duration')) {
    if (modifiedEvent.getFirstPropertyValue('duration').toSeconds() > 0) {
      dtend = modifiedEvent.getFirstPropertyValue('dtstart').clone();
      dtend.addDuration(modifiedEvent.getFirstPropertyValue('duration'));
      dtendMoment = moment.tz(dtend.toUnixTime() * 1000, tz);
      dtendMoment = dtendMoment.tz('GMT').tz(tz, true);
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
    dtendMoment = moment.tz(dtend.toUnixTime() * 1000, tz);
    dtendMoment = dtendMoment.tz('GMT').tz(tz, true);
  }

  return {
    id: uuidv4(),
    start: {
      dateTime: dtstartMoment.unix(),
      timezone: 'America/Los_Angeles'
    },
    end: {
      dateTime: dtendMoment.unix(),
      timezone: 'America/Los_Angeles'
    },
    originalId: modifiedEvent.getFirstPropertyValue('uid'),
    iCalUID: modifiedEvent.getFirstPropertyValue('uid'),
    created:
      modifiedEvent.getFirstPropertyValue('created') !== null
        ? moment(modifiedEvent.getFirstPropertyValue('created')).unix()
        : 0,
    // new Date(modifiedEvent.getFirstPropertyValue('created')).toISOString(),
    updated:
      // modifiedEvent.getFirstPropertyValue('last-modified') !== null
      //   ? moment(modifiedEvent.getFirstPropertyValue('last-modified').toJSDate()).unix()
      //   : 0,
      modifiedEvent.getFirstPropertyValue('last-modified') !== null
        ? moment(modifiedEvent.getFirstPropertyValue('last-modified').toJSDate()).unix()
        : 0,
    // updated: new Date(modifiedEvent.getFirstPropertyValue('last-modified')).toISOString(),
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
      dateTime: moment(dtstart).unix(),
      timezone: 'America/Los_Angeles'
    },
    // attendee: getAttendees(modifiedEvent),
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

export const parseEvent = (component, isRecurring, etag, url, calendarId, cdIsMaster) => {
  const masterEvent = component.getFirstSubcomponent('vevent');
  const tz = component.getFirstSubcomponent('vtimezone').getFirstPropertyValue('tzid');

  const dtstart =
    masterEvent.getFirstPropertyValue('dtstart') == null
      ? ''
      : masterEvent.getFirstPropertyValue('dtstart');

  let dtstartMoment = moment.tz(dtstart.toUnixTime() * 1000, tz);
  dtstartMoment = dtstartMoment.tz('GMT').tz(tz, true);

  let dtend;
  let dtendMoment;
  if (masterEvent.hasProperty('dtend')) {
    if (!masterEvent.hasProperty('duration')) {
      dtendMoment = moment.tz(masterEvent.getFirstPropertyValue('dtend').toUnixTime() * 1000, tz);
      dtendMoment = dtendMoment.tz('GMT').tz(tz, true);
    }
  } else if (masterEvent.hasProperty('duration')) {
    if (masterEvent.getFirstPropertyValue('duration').toSeconds() > 0) {
      dtend = masterEvent.getFirstPropertyValue('dtstart').clone();
      dtend.addDuration(masterEvent.getFirstPropertyValue('duration'));
      dtendMoment = moment.tz(dtend.toUnixTime() * 1000, tz);
      dtendMoment = dtendMoment.tz('GMT').tz(tz, true);
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
    dtendMoment = moment.tz(dtend.toUnixTime() * 1000, tz);
    dtendMoment = dtendMoment.tz('GMT').tz(tz, true);
  }
  const event = {
    id: uuidv4(),
    start: {
      dateTime: dtstartMoment.unix(),
      timezone: 'America/Los_Angeles'
    },
    end: {
      dateTime: dtendMoment.unix(),
      timezone: 'America/Los_Angeles'
    },
    originalId: masterEvent.getFirstPropertyValue('uid'),
    iCalUID: masterEvent.getFirstPropertyValue('uid'),
    created:
      masterEvent.getFirstPropertyValue('created') !== null
        ? moment(masterEvent.getFirstPropertyValue('created')).unix()
        : 0,
    // created: new Date(masterEvent.getFirstPropertyValue('created')).toISOString(),
    updated:
      masterEvent.getFirstPropertyValue('last-modified') !== null
        ? moment(masterEvent.getFirstPropertyValue('last-modified').toJSDate()).unix()
        : 0,
    // updated: new Date(masterEvent.getFirstPropertyValue('last-modified')).toISOString(),
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
      dateTime: moment(dtstart).unix(),
      // dateTime: new Date(dtstart).toISOString(),
      timezone: 'America/Los_Angeles'
    },
    // attendee: getAttendees(masterEvent),
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

export const getRuleJSON = (masterEvent, icalMasterEvent) => {
  let rruleJSON = {};
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

export const getAttendees = (masterEvent) => {
  let attendees = [];
  if (masterEvent.hasProperty('attendee')) {
    attendees = parseAttendees(masterEvent.getAllProperties('attendee'));
  }
  return attendees;
};

export const getExDates = (masterEvent) => {
  const exDates = [];
  if (masterEvent.hasProperty('exdate')) {
    const exdateProps = masterEvent.getAllProperties('exdate');
    exdateProps.forEach((exdate) => {
      const tz = exdate.getParameter('tzid');
      let deletedEventMoment = moment.tz(exdate.getFirstValue().toUnixTime() * 1000, tz);
      deletedEventMoment = deletedEventMoment.tz('GMT').tz(tz, true);

      exDates.push(deletedEventMoment.unix().toString());
    });
  }
  return exDates;
};

export const getRecurrenceIds = (vevents) => {
  const recurrenceIds = [];
  vevents.forEach((evt, index) => {
    if (evt.getFirstPropertyValue('recurrence-id')) {
      const tz = evt.getFirstPropertyValue('tzid');
      let editedIdMoment = moment.tz(
        evt.getFirstPropertyValue('recurrence-id').toUnixTime() * 1000,
        tz
      );
      editedIdMoment = editedIdMoment.tz('GMT').tz(tz, true);
      recurrenceIds.push(editedIdMoment.unix().toString());
    }
  });
  return recurrenceIds;
};

export const isModifiedThenDeleted = (recurEvent, exDates) => {
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
export const parseAttendees = (properties) =>
  properties.map((property) => ({
    status: property.jCal[1].partstat,
    action: property.jCal[3],
    email: property.jCal[1].email,
    displayName: property.jCal[1].cn !== undefined ? property.jCal[1].cn : property.jCal[1].email
  }));

export const expandRecurEvents = async (results) => {
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
    finalResults = expandSeries(recurringEvents);
  }
  return finalResults;
};

export const expandSeries = async (recurringEvents) => {
  const resolved = await Promise.all(
    recurringEvents.map(async (recurMasterEvent) => {
      const recurPatternRecurId = await dbRpActions.getOneRpByOId(recurMasterEvent.iCalUID);
      return parseRecurrence(recurPatternRecurId.toJSON(), recurMasterEvent);
    })
  );
  const expandedSeries = resolved.reduce((acc, val) => acc.concat(val), []);
  return expandedSeries;
};

export const parseRecurrence = (pattern, recurMasterEvent) => {
  const recurEvents = [];
  const ruleSet = buildRuleSet(pattern, recurMasterEvent.start.dateTime);

  // Edge case for when there is two timezones due to daylight savings
  // e.g. you will get one -800, and one -700 due to change of daylight savings
  // resulting in ruleSet generating wrong values as it does an === check.
  // In order to fix, just run a fitler on the recurDates as a safety net check.
  const mergedList = [
    ...pattern.recurrenceIds
      .split(',')
      .filter((str) => str !== '')
      .map((str) => parseInt(str, 10)),
    ...pattern.exDates
      .split(',')
      .filter((str) => str !== '')
      .map((str) => parseInt(str, 10))
  ];

  const allDates = ruleSet.all();
  if (allDates.length <= 0) {
    console.log('IDK WHAT THE FK IS GOING ON ANYMORE');
    console.log(pattern, recurMasterEvent);
    debugger;
    return [];
  }
  const base = allDates[0];
  const isNormalizedTz = ruleSet
    .all()
    .every((element) => element.getTimezoneOffset() === base.getTimezoneOffset());
  let recurDates = [];
  const serverTz = 'US/Pacific';
  const clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!isNormalizedTz) {
    // SUPER FUNKY WEIRD EDGE CASE, rulestring breaks across timezones.
    // The pattern here is to always take the master time.
    // console.log(moment(base).toString(), recurMasterEvent.summary);
    recurDates.push(moment(base.toJSON()).unix());
    for (let i = 1; i < allDates.length; i += 1) {
      recurDates.push(
        moment.unix(allDates[i].setHours(base.getHours(), base.getMinutes())).unix() / 1000
      );
    }
  } else if (serverTz !== clientTz) {
    const tzedRuleset = ruleSet.all().map((date) => moment.tz(date.getTime(), serverTz));
    if (tzedRuleset.length > 0) {
      const newBase = tzedRuleset[0];
      // console.log(newBase);
      recurDates.push(moment(newBase.toJSON()).unix());
      for (let i = 1; i < tzedRuleset.length; i += 1) {
        tzedRuleset[i].hour(newBase.hour());
        tzedRuleset[i].minute(newBase.minute());
        recurDates.push(tzedRuleset[i].unix());
      }
    } else {
      debugger;
    }
  } else {
    recurDates = ruleSet.all().map((date) => moment(date.toJSON()).unix());
  }
  recurDates = recurDates.filter((date) => !mergedList.includes(date));

  const duration = getDuration(recurMasterEvent);
  recurDates.forEach((recurDateTime) => {
    recurEvents.push({
      id: uuidv4(),
      end: {
        dateTime: moment
          .unix(recurDateTime)
          .add(duration)
          .unix(),
        timezone: 'America/Los_Angeles'
      },
      start: {
        dateTime: recurDateTime,
        timezone: 'America/Los_Angeles'
      },
      summary: recurMasterEvent.summary,
      // organizer: recurMasterEvent.organizer,
      // recurrence: recurMasterEvent.recurrence,
      recurringEventId: recurMasterEvent.iCalUID,
      iCalUID: recurMasterEvent.iCalUID,
      iCALString: recurMasterEvent.iCALString,
      // attendee: recurMasterEvent.attendee,
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

export const getDuration = (master) => {
  const start = moment.unix(master.start.dateTime);
  const end = moment.unix(master.end.dateTime);
  return moment.duration(end.diff(start));
};

export const parseStringToWeekDayNo = (stringEwsWeekDay) => {
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

export const parseWeekDayNoToString = (stringEwsWeekDay) => {
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

export const buildRuleObject = (pattern, startTime) => {
  const ruleObject = {};
  ruleObject.interval = pattern.interval;

  const jsonObj = moment.tz(startTime * 1000, 'US/Pacific');
  ruleObject.dtstart = jsonObj.toDate();

  // // Not used at the moment, Need to ensure other providers do not use them too.
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
  // Something to note, variables that are not NULL or UNDEFINED, will somehow affect
  // the result from .all from a ruleset.
  // Therefore, DO NOT SET THEM, even a blank array breaks something.
  switch (pattern.freq) {
    case 'YEARLY':
      {
        ruleObject.freq = RRule.YEARLY;
        // Using the recurrence pattern, if it is blank which means '()',
        // .all behavior is it will auto expand on the frequency alone.
        // Therefore, I cannot even have a blank array, aka, ruleObject.byweekday.
        const byMonth = parseInt(pattern.byMonth, 10);

        if (byMonth) {
          ruleObject.bymonth = byMonth;
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
            console.log('(Yearly) WeekNo length not equals to WeekDay length!');
          } else if (byWeekNo.length !== 0) {
            // Both ways, you need to set the by week day number.
            ruleObject.byweekday = [];
            for (let i = 0; i < byWeekNo.length; i += 1) {
              ruleObject.byweekday.push({ weekday: byWeekDay[i], n: byWeekNo[i] });
            }
          }
        }
      }
      break;
    case 'MONTHLY':
      {
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
          console.log('(Monthly) WeekNo length not equals to WeekDay length!');
        } else if (byWeekNo.length !== 0) {
          // Both ways, you need to set the by week day number.
          ruleObject.byweekday = [];
          for (let i = 0; i < byWeekNo.length; i += 1) {
            ruleObject.byweekday.push({ weekday: byWeekDay[i], n: byWeekNo[i] });
          }
        }

        const byMonthDay = pattern.byMonthDay
          .slice(1, -1)
          .split(',')
          .filter((str) => str !== undefined && str !== null && str !== '')
          .map((monthDay) => parseInt(monthDay, 10));

        if (byMonthDay.length > 0) {
          ruleObject.bymonthday = [];
          for (let i = 0; i < byMonthDay.length; i += 1) {
            ruleObject.bymonthday.push(byMonthDay[i]);
          }
        }
      }
      break;
    case 'WEEKLY':
      {
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
      }
      break;
    case 'DAILY':
      {
        ruleObject.freq = RRule.DAILY;
      }
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
    const patternJson = moment.tz(pattern.until * 1000, 'US/Pacific').toObject();
    ruleObject.until = new Date(
      Date.UTC(
        patternJson.years,
        patternJson.months,
        patternJson.date,
        patternJson.hours,
        patternJson.minutes
      )
    );
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

export const getModifiedThenDeletedDates = (exDates, recurDates) => {
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
    exDates
      .split(',')
      .filter((s) => s !== '')
      .forEach((exdate) => {
        const momentdate = moment.unix(exdate);
        rruleSet.exdate(momentdate.toDate());
      });
  }
  // Here, I am unsure if I am handling it correctly as
  // an edited occurance is also a exdate techincally speaking
  if (recurrenceIds !== undefined) {
    recurrenceIds
      .split(',')
      .filter((s) => s !== '')
      .forEach((recurDate) => {
        const momentdate = moment.unix(recurDate);
        rruleSet.exdate(momentdate.toDate());
      });
  }

  // const modifiedThenDeletedDates = getModifiedThenDeletedDates(exDates, recurrenceIds);
  /* To remove start date duplicate */
  return rruleSet;
};

export default {
  parseRecurrenceEvents,
  convertiCalWeeklyPattern,
  parseEventPersons,
  parseCal,
  parseCalEvents,
  newParseCalendarObjects,
  parseCalendarObject,
  parseCalendarData,
  parseModifiedEvent,
  parseEvent,
  getRuleJSON,
  getAttendees,
  getExDates,
  getRecurrenceIds,
  isModifiedThenDeleted,
  parseAttendees,
  expandRecurEvents,
  expandSeries,
  parseRecurrence,
  getDuration,
  parseStringToWeekDayNo,
  parseWeekDayNoToString,
  buildRuleObject,
  getModifiedThenDeletedDates,
  buildRuleSet
};
