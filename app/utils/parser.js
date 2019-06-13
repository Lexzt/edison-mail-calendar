import React from 'react';
import ICAL from 'ical.js';
import moment from 'moment';
import uniqid from 'uniqid';
import { RRule, RRuleSet, rrulestr } from 'rrule';
import getDb from '../db';

const TEMPORARY_RECURRENCE_END = new Date(2020, 12, 12);

const parseRecurrenceEvents = (calEvents) => {
  const recurringEvents = [];
  calEvents.forEach((calEvent) => {
    const { isRecurring } = calEvent.eventData;
    if (isRecurring) {
      recurringEvents.push({
        id: uniqid(),
        originalId: calEvent.eventData.originalId,
        freq: calEvent.recurData.rrule.freq,
        interval: calEvent.recurData.rruleinterval,
        until: calEvent.recurData.rrule.until,
        exDates: calEvent.recurData.exDates,
        recurrenceIds: calEvent.recurData.recurrenceIds,
        modifiedThenDeleted: calEvent.recurData.modifiedThenDeleted
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
          eventPersonId: uniqid(),
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
    timezone: calendar.timezone
  }));
  return parsedCalendars;
};

const parseCalEvents = (calendars) => {
  const events = [];
  calendars.forEach((calendar) => {
    events.push(
      // parseEvents(
      //   calendar.objects,
      //   calendar.data.href,
      //   calendar.account.credentials.username
      // )
      newParseCalendarObjects(calendar)
    );
  });
  // debugger;
  return events;
};

const newParseCalendarObjects = (calendar) => {
  const calendarObjects = calendar.objects;
  return calendarObjects.map((calendarObject) => parseCalendarObject(calendarObject));
};

const parseCalendarObject = (calendarObject) => {
  const { etag, url, calendarData } = calendarObject;
  let edisonEvent = {};
  if (calendarData !== undefined && calendarData !== '') {
    edisonEvent = parseCalendarData(calendarData, etag, url);
  } else {
    edisonEvent = '';
  }
  return edisonEvent;
};

const parseCalendarData = (calendarData, etag, url) => {
  const results = [];
  const jCalData = ICAL.parse(calendarData);
  const comp = new ICAL.Component(jCalData);
  // debugger;
  const modifiedEvents = comp.getAllSubcomponents('vevent');
  const masterEvent = comp.getFirstSubcomponent('vevent');
  const icalMasterEvent = new ICAL.Event(masterEvent);
  const attendees = getAttendees(masterEvent);
  if (icalMasterEvent.isRecurring()) {
    const recurrenceIds = getRecurrenceIds(modifiedEvents);
    const rrule = getRuleJSON(masterEvent, icalMasterEvent);
    const exDates = getExDates(masterEvent);
    const modifiedThenDeleted = isModifiedThenDeleted(masterEvent, exDates);
    if (recurrenceIds.length > 0) {
      // modified events from recurrence series
      for (let i = 1; i < modifiedEvents.length; i += 1) {
        results.push({
          eventData: parseModifiedEvent(comp, etag, url, modifiedEvents[i])
        });
      }
    }
    // Recurring event
    results.push({
      recurData: { rrule, exDates, recurrenceIds, modifiedThenDeleted },
      eventData: parseEvent(comp, true, etag, url)
    });
  } else {
    // Non-recurring event
    results.push({
      eventData: parseEvent(comp, false, etag, url)
    });
  }
  return results;
};

const parseModifiedEvent = (comp, etag, url, modifiedEvent) => {
  const dtstart = modifiedEvent.getFirstPropertyValue('dtstart');
  const dtend = modifiedEvent.getFirstPropertyValue('dtend');
  return {
    id: uniqid(),
    start: {
      dateTime: new Date(dtstart).toISOString(),
      timezone: 'timezone'
    },
    end: {
      dateTime: new Date(dtend).toISOString(),
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
    providerType: 'caldav',
    isRecurring: false,
    // isModifiedThenDeleted: mtd,
    etag,
    caldavUrl: url,
    ICALString: comp.toString()
  };
};

const parseEvent = (component, isRecurring, etag, url) => {
  const masterEvent = component.getFirstSubcomponent('vevent');
  const dtstart = masterEvent.getFirstPropertyValue('dtstart').toString();
  const dtend = masterEvent.getFirstPropertyValue('dtend').toString();

  const event = {
    id: uniqid(),
    start: {
      dateTime: dtstart,
      timezone: 'timezone'
    },
    end: {
      dateTime: dtend,
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
    // calendarId,
    providerType: 'caldav',
    isRecurring,
    // isModifiedThenDeleted: mtd,
    etag,
    caldavUrl: url,
    ICALString: component.toString()
  };
  return event;
};

const getRuleJSON = (masterEvent, icalMasterEvent) => {
  let rruleJSON = {};
  if (icalMasterEvent.isRecurring()) {
    const rrule = masterEvent.getFirstPropertyValue('rrule');
    rruleJSON = rrule.toJSON();
    rruleJSON = { ...rruleJSON, interval: rrule.interval };
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
  const recurringEvents = nonMTDresults.filter((nonMTDresult) => nonMTDresult.isRecurring);
  let merged = nonMTDresults;
  let finalResults = [];
  if (recurringEvents.length === 0) {
    finalResults = nonMTDresults;
  } else {
    finalResults = recurringEvents.map(async (recurMasterEvent) => {
      const recurPatternRecurId = await db.recurrencepatterns
        .find()
        .where('originalId')
        .eq(recurMasterEvent.originalId)
        .exec();
      const recurTemp = parseRecurrence(recurPatternRecurId[0].toJSON(), recurMasterEvent);
      console.log('here!!', recurTemp, merged);
      merged = [...merged, ...recurTemp];
      console.log(merged);
      const final = merged.reduce((acc, val) => acc.concat(val), []);
      // debugger;
      return final;
    });
  }
  return finalResults;
};

const parseRecurrence = (pattern, recurMasterEvent) => {
  // debugger;
  const recurEvents = [];
  const ruleSet = buildRuleSet(pattern, recurMasterEvent);
  const recurDates = ruleSet.all().map((date) => date.toJSON());
  const duration = getDuration(recurMasterEvent);

  recurDates.forEach((recurDateTime) => {
    recurEvents.push({
      id: uniqid(),
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
      organizer: recurMasterEvent.organizer,
      recurrence: recurMasterEvent.recurrence,
      iCalUID: recurMasterEvent.iCalUID,
      attendees: recurMasterEvent.attendee,
      originalId: recurMasterEvent.originalId,
      creator: recurMasterEvent.creator,
      isRecurring: recurMasterEvent.isRecurring
    });
  });
  console.log(recurEvents);
  return recurEvents;
};

const buildRuleSet = (pattern, master) => {
  // debugger;
  const rruleSet = new RRuleSet();
  const ruleObject = buildRuleObject(pattern, master);
  rruleSet.rrule(new RRule(ruleObject));
  const { exDates } = pattern;
  exDates.forEach((exdate) => rruleSet.exdate(new Date(exdate)));
  const { recurrenceIds } = pattern;
  recurrenceIds.forEach((recurDate) => rruleSet.exdate(new Date(recurDate)));
  const modifiedThenDeletedDates = getModifiedThenDeletedDates(exDates, recurrenceIds);
  /* To remove start date duplicate */
  rruleSet.exdate(new Date(master.start.dateTime));
  return rruleSet;
};

const getDuration = (master) => {
  const start = moment(master.start.dateTime);
  const end = moment(master.end.dateTime);
  return moment.duration(end.diff(start));
};

const buildRuleObject = (pattern, master) => {
  const ruleObject = {};
  ruleObject.interval = pattern.interval;
  ruleObject.dtstart = new Date(master.start.dateTime);
  switch (pattern.freq) {
    case 'YEARLY':
      ruleObject.freq = 0;
      break;
    case 'MONTHLY':
      ruleObject.freq = 1;
      break;
    case 'WEEKLY':
      ruleObject.freq = 2;
      break;
    case 'DAILY':
      ruleObject.freq = 3;
      break;
    default:
  }
  ruleObject.until = pattern.until ? new Date(pattern.until) : TEMPORARY_RECURRENCE_END;
  return ruleObject;
};

const getModifiedThenDeletedDates = (exDates, recurDates) => {
  const modifiedThenDeletedDates = [];
  // debugger;
  exDates.forEach((exdate) => {
    recurDates.forEach((recurDate) => {
      if (exdate === recurDate) {
        modifiedThenDeletedDates.push(exdate);
      }
    });
  });
  return modifiedThenDeletedDates;
};

export default {
  parseCal,
  parseCalEvents,
  parseEventPersons,
  parseRecurrenceEvents,
  expandRecurEvents,
  parseRecurrence
};
