import React from 'react';
import ICAL from 'ical.js';
import moment from 'moment';
import { RRule, RRuleSet, rrulestr } from 'rrule';

const uuidv1 = require('uuid/v1');

// #region TO DELETE
export const buildICALStringUpdateOnly = (updatedEvent, calendarObject) => {
  const calendarData = ICAL.parse(calendarObject.ICALString);
  const calendarComp = new ICAL.Component(calendarData);
  const timezoneMetadata = calendarComp.getFirstSubcomponent('vtimezone');
  calendarComp.removeSubcomponent('vtimezone');
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  debugger;
  const jcalData = ICAL.parse(iCalendarData);
  const vevent = new ICAL.Component(jcalData);
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
  vevent.updatePropertyWithValue('summary', updatedEvent.summary);
  vevent.updatePropertyWithValue('location', updatedEvent.location);
  vevent.updatePropertyWithValue('tzid', 'US/Pacific');
  vevent.updatePropertyWithValue('sequence', 0);
  vevent.updatePropertyWithValue('recurrence-id', updatedEvent.start);
  vevent.getFirstProperty('recurrence-id').setParameter('tzid', 'US/Pacific');
  vevent.updatePropertyWithValue('uid', calendarObject.iCalUID);
  vevent.updatePropertyWithValue('created', ICAL.Time.now());
  vevent.updatePropertyWithValue('dtstart', updatedEvent.start);
  vevent.getFirstProperty('dtstart').setParameter('tzid', 'US/Pacific');
  vevent.updatePropertyWithValue('dtend', updatedEvent.end);
  vevent.getFirstProperty('dtend').setParameter('tzid', 'US/Pacific');

  vevent.updatePropertyWithValue('x-apple-travel-advisory-behavior', 'AUTOMATIC');
  vevent.updatePropertyWithValue('transp', 'OPAQUE');
  calendarComp.addSubcomponent(vevent);
  calendarComp.addSubcomponent(timezoneMetadata);
  // debugger;
  return calendarComp.toString();
};

export const buildICALStringUpdateAll = (eventObject) => {
  const calendarData = ICAL.parse(eventObject.ICALString);
  const calendarComp = new ICAL.Component(calendarData);
  const vevent = calendarComp.getFirstSubcomponent('vevent');
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
  vevent.updatePropertyWithValue('summary', eventObject.summary);
  vevent.updatePropertyWithValue('location', eventObject.location);
  vevent.updatePropertyWithValue('tzid', 'US/Pacific');
  vevent.updatePropertyWithValue('sequence', 0);
  vevent.updatePropertyWithValue('uid', eventObject.iCalUID);
  vevent.updatePropertyWithValue('created', eventObject.created);
  vevent.updatePropertyWithValue('dtstart', eventObject.start.dateTime);
  vevent.getFirstProperty('dtstart').setParameter('tzid', 'US/Pacific');
  vevent.updatePropertyWithValue('dtend', eventObject.end.dateTime);
  vevent.getFirstProperty('dtend').setParameter('tzid', 'US/Pacific');
  return calendarComp.toString();
};
// #endregion

export const buildRruleObject = (recurrencePattern) => {
  debugger;
  console.log(recurrencePattern);
  let returnObj;
  if (recurrencePattern.numberOfRepeats > 0) {
    returnObj = {
      freq: recurrencePattern.freq,
      interval: recurrencePattern.interval,
      count: recurrencePattern.numberOfRepeats
      // // Commented out atm due to unsure how to parse it in, and not sure if needed.
      // wkst: recurrencePattern.wkSt,  // Type: ICAL.Time.weekDay
      // bysecond: recurrencePattern.bySecond, // Not sure if needed. Too detailed.
      // byminute: recurrencePattern.byMinute, // Not sure if needed. Too detailed.
      // byhour: recurrencePattern.byHour, // Not sure if needed. Too detailed.
      // byday: recurrencePattern.freq, // Currently missing in db schema
      // bymonthday: recurrencePattern.byMonthDay, // Different type, Array<Number> vs <String>
      // byyearday: recurrencePattern.byYearDay, // Different type, Array<Number> vs <String>
      // byweekno: recurrencePattern.byWeekNo, // Different type, Array<Number> vs <String>
      // bymonth: recurrencePattern.byMonth, // Different type, Array<Number> vs <String>
      // bysetpos: recurrencePattern.bySetPos, // Different type, Array<Number> vs <String>
    };
  } else if (recurrencePattern.until !== '') {
    const datetime = new ICAL.Time().fromJSDate(new Date(recurrencePattern.until));
    const dtTimezone = new ICAL.Time().fromData(
      {
        year: datetime.year,
        month: datetime.month,
        day: datetime.day,
        hour: datetime.hour,
        minute: datetime.minute,
        second: datetime.second
      },
      new ICAL.Timezone({ tzid: 'America/Los_Angeles' })
    );

    returnObj = {
      freq: recurrencePattern.freq,
      interval: recurrencePattern.interval,
      until: dtTimezone
      // // Commented out atm due to unsure how to parse it in, and not sure if needed.
      // wkst: recurrencePattern.wkSt,  // Type: ICAL.Time.weekDay
      // bysecond: recurrencePattern.bySecond, // Not sure if needed. Too detailed.
      // byminute: recurrencePattern.byMinute, // Not sure if needed. Too detailed.
      // byhour: recurrencePattern.byHour, // Not sure if needed. Too detailed.
      // byday: recurrencePattern.freq, // Currently missing in db schema
      // bymonthday: recurrencePattern.byMonthDay, // Different type, Array<Number> vs <String>
      // byyearday: recurrencePattern.byYearDay, // Different type, Array<Number> vs <String>
      // byweekno: recurrencePattern.byWeekNo, // Different type, Array<Number> vs <String>
      // bymonth: recurrencePattern.byMonth, // Different type, Array<Number> vs <String>
      // bysetpos: recurrencePattern.bySetPos, // Different type, Array<Number> vs <String>
    };
  } else {
    returnObj = {
      freq: recurrencePattern.freq,
      interval: recurrencePattern.interval
      // // Commented out atm due to unsure how to parse it in, and not sure if needed.
      // wkst: recurrencePattern.wkSt,  // Type: ICAL.Time.weekDay
      // bysecond: recurrencePattern.bySecond, // Not sure if needed. Too detailed.
      // byminute: recurrencePattern.byMinute, // Not sure if needed. Too detailed.
      // byhour: recurrencePattern.byHour, // Not sure if needed. Too detailed.
      // byday: recurrencePattern.freq, // Currently missing in db schema
      // bymonthday: recurrencePattern.byMonthDay, // Different type, Array<Number> vs <String>
      // byyearday: recurrencePattern.byYearDay, // Different type, Array<Number> vs <String>
      // byweekno: recurrencePattern.byWeekNo, // Different type, Array<Number> vs <String>
      // bymonth: recurrencePattern.byMonth, // Different type, Array<Number> vs <String>
      // bysetpos: recurrencePattern.bySetPos, // Different type, Array<Number> vs <String>
    };
  }
  return returnObj;
};

export const buildICALStringDeleteRecurEvent = (recurrencePattern, exDate, eventObject) => {
  debugger;
  const calendarData = ICAL.parse(eventObject.iCALString);
  const vcalendar = new ICAL.Component(calendarData);

  const vevent = vcalendar.getFirstSubcomponent('vevent');
  vevent.removeAllProperties('exdate');

  const allEditedEvent = vcalendar
    .getAllSubcomponents('vevent')
    .filter((e) => e.getFirstPropertyValue('recurrence-id') !== null);

  recurrencePattern.exDates.forEach((date) => {
    const datetime = new ICAL.Time().fromJSDate(new Date(date));
    const timezone = new ICAL.Time().fromData(
      {
        year: datetime.year,
        month: datetime.month,
        day: datetime.day,
        hour: datetime.hour,
        minute: datetime.minute,
        second: datetime.second
      },
      new ICAL.Timezone({ tzid: 'America/Los_Angeles' })
    );
    vevent.addPropertyWithValue('exdate', timezone);
  });
  vevent.getAllProperties('exdate').forEach((e) => e.setParameter('tzid', 'America/Los_Angeles'));

  const rrule = new ICAL.Recur(buildRruleObject(recurrencePattern));
  recurrencePattern.iCALString = rrule.toString();
  vevent.updatePropertyWithValue('rrule', rrule);

  // This removes all the edited event, and the master.
  vcalendar.removeAllSubcomponents('vevent');

  vcalendar.addSubcomponent(vevent);

  debugger;

  recurrencePattern.recurrenceIds.forEach((date) => {
    debugger;
    const editedEvent = moment(date);
    const findingEditedComp = allEditedEvent.filter((e2) =>
      moment(e2.getFirstPropertyValue().toJSDate()).isSame(editedEvent, 'day')
    );
    if (findingEditedComp.length > 0) {
      console.log(findingEditedComp);
      vcalendar.addSubcomponent(findingEditedComp[0]);
    }
  });

  debugger;
  return vcalendar.toString();
  // const calendarData = ICAL.parse(eventObject.iCALString);
  // const vevent = new ICAL.Component(calendarData);
  // vevent.addPropertyWithValue('exdate', exDate);
  // return vevent.toString();
};

export const buildICALStringUpdateRecurEvent = (recurrencePattern, eventObject, updatedObject) => {
  debugger;
  const calendarData = ICAL.parse(eventObject.iCALString);
  const vcalendar = new ICAL.Component(calendarData);

  const timezoneMetadata = vcalendar.getFirstSubcomponent('vtimezone');
  vcalendar.removeSubcomponent('vtimezone');
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  debugger;
  const jcalData = ICAL.parse(iCalendarData);
  const vevent = new ICAL.Component(jcalData);
  // vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
  // vevent.updatePropertyWithValue('summary', eventObject.summary);
  // vevent.updatePropertyWithValue('location', eventObject.location);
  // vevent.updatePropertyWithValue('tzid', 'US/Pacific');
  // vevent.updatePropertyWithValue('sequence', 0);
  // vevent.updatePropertyWithValue('recurrence-id', eventObject.start.dateTime);
  // vevent.getFirstProperty('recurrence-id').setParameter('tzid', 'US/Pacific');
  // vevent.updatePropertyWithValue('uid', eventObject.iCalUID);
  // vevent.updatePropertyWithValue('created', ICAL.Time.now());
  // vevent.updatePropertyWithValue('dtstart', eventObject.start.dateTime);
  // vevent.getFirstProperty('dtstart').setParameter('tzid', 'US/Pacific');
  // vevent.updatePropertyWithValue('duration', 'PT1H');
  // vevent.updatePropertyWithValue('priority', 0);
  // vevent.updatePropertyWithValue('status', 'CONFIRMED');
  // vevent.updatePropertyWithValue('transp', 'OPAQUE');
  // vevent.updatePropertyWithValue('class', 'PUBLIC');
  // vevent.updatePropertyWithValue('x-apple-travel-advisory-behavior', 'AUTOMATIC');

  const startDateTime = ICAL.Time.fromJSDate(new Date(eventObject.start.dateTime), false);
  vevent.updatePropertyWithValue('recurrence-id', startDateTime);
  vevent.getFirstProperty('recurrence-id').setParameter('tzid', 'US/Pacific');

  vevent.updatePropertyWithValue('uid', eventObject.iCalUID);

  vevent.updatePropertyWithValue('dtstart', startDateTime);
  vevent.getFirstProperty('dtstart').setParameter('tzid', 'US/Pacific');

  vevent.updatePropertyWithValue('duration', 'PT1H');

  vevent.updatePropertyWithValue('sequence', 0);

  vevent.updatePropertyWithValue('created', ICAL.Time.now());

  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());

  vevent.updatePropertyWithValue('priority', 0);

  vevent.updatePropertyWithValue('summary', updatedObject.title);

  vevent.updatePropertyWithValue('status', 'CONFIRMED');

  vevent.updatePropertyWithValue('transp', 'OPAQUE');

  vevent.updatePropertyWithValue('class', 'PUBLIC');
  // TO-DO, ADD MORE FIELDS AND TEST IF IT WORKS.

  // vevent.updatePropertyWithValue('location', eventObject.location);
  // vevent.updatePropertyWithValue('tzid', 'US/Pacific');
  // vevent.updatePropertyWithValue('x-apple-travel-advisory-behavior', 'AUTOMATIC');

  // vevent.updatePropertyWithValue('dtend', eventObject.end.dateTime);
  // vevent.getFirstProperty('dtend').setParameter('tzid', 'US/Pacific');

  const filteredResult = vcalendar
    .getAllSubcomponents('vevent')
    .filter((e) => e.getFirstPropertyValue('recurrence-id') !== null)
    .map((e) => {
      console.log(
        moment(e.getFirstPropertyValue('recurrence-id').toJSDate()),
        moment(eventObject.start.dateTime),
        moment(e.getFirstPropertyValue('recurrence-id').toJSDate()).isSame(
          moment(eventObject.start.dateTime)
        )
      );
      return {
        e,
        result: moment(e.getFirstPropertyValue('recurrence-id').toJSDate()).isSame(
          moment(eventObject.start.dateTime)
        )
      };
    });
  const hasDuplicate = filteredResult.filter((anyTrue) => anyTrue.result === true).length > 0;

  if (hasDuplicate) {
    const removingVEvents = filteredResult.filter((anyTrue) => anyTrue.result === true);
    // console.log('has duplicate?', removingVEvents);
    removingVEvents.forEach((obj) => vcalendar.removeSubcomponent(obj.e));
  }
  vcalendar.addSubcomponent(vevent);
  vcalendar.addSubcomponent(timezoneMetadata);
  debugger;
  return vcalendar.toString();
};

export const buildICALStringUpdateSingleEvent = (updatedEvent, calendarObject) => {
  debugger;
  const calendarData = ICAL.parse(calendarObject.iCALString);
  const calendarComp = new ICAL.Component(calendarData);
  const timezoneMetadata = calendarComp.getFirstSubcomponent('vtimezone');

  calendarComp.removeSubcomponent('vtimezone');
  calendarComp.removeSubcomponent('vevent');

  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  debugger;
  const jcalData = ICAL.parse(iCalendarData);

  const vevent = new ICAL.Component(jcalData);
  const startDateTime = ICAL.Time.fromJSDate(new Date(calendarObject.start.dateTime), false);

  vevent.updatePropertyWithValue('sequence', 0);

  vevent.updatePropertyWithValue('uid', calendarObject.iCalUID);

  vevent.updatePropertyWithValue('dtstart', startDateTime);
  vevent.getFirstProperty('dtstart').setParameter('tzid', 'America/Los_Angeles');

  vevent.updatePropertyWithValue('duration', 'PT1H');

  vevent.updatePropertyWithValue('created', ICAL.Time.now());

  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());

  vevent.updatePropertyWithValue('priority', 0);
  // TO-DO, ADD MORE FIELDS HERE
  vevent.updatePropertyWithValue('summary', updatedEvent.title);

  vevent.updatePropertyWithValue('status', 'CONFIRMED');

  vevent.updatePropertyWithValue('transp', 'OPAQUE');

  // vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
  // vevent.updatePropertyWithValue('summary', updatedEvent.summary);
  // vevent.updatePropertyWithValue('location', updatedEvent.location);
  // vevent.updatePropertyWithValue('tzid', 'US/Pacific');
  // vevent.updatePropertyWithValue('sequence', 0);
  // vevent.updatePropertyWithValue('recurrence-id', updatedEvent.start);
  // vevent.getFirstProperty('recurrence-id').setParameter('tzid', 'US/Pacific');
  // vevent.updatePropertyWithValue('uid', calendarObject.iCalUID);
  // vevent.updatePropertyWithValue('created', ICAL.Time.now());
  // vevent.updatePropertyWithValue('dtstart', updatedEvent.start);
  // vevent.getFirstProperty('dtstart').setParameter('tzid', 'US/Pacific');
  // vevent.updatePropertyWithValue('dtend', updatedEvent.end);
  // vevent.getFirstProperty('dtend').setParameter('tzid', 'US/Pacific');

  // vevent.updatePropertyWithValue('x-apple-travel-advisory-behavior', 'AUTOMATIC');
  // vevent.updatePropertyWithValue('transp', 'OPAQUE');
  calendarComp.addSubcomponent(vevent);
  calendarComp.addSubcomponent(timezoneMetadata);
  // debugger;
  return calendarComp.toString();
};

export const buildICALStringUpdateAllRecurEvent = (
  recurrencePattern,
  eventObject,
  updatedObject
) => {
  debugger;
  const calendarData = ICAL.parse(eventObject.iCALString);
  const vcalendar = new ICAL.Component(calendarData);

  const timezoneMetadata = vcalendar.getFirstSubcomponent('vtimezone');
  vcalendar.removeSubcomponent('vtimezone');
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  debugger;
  const jcalData = ICAL.parse(iCalendarData);
  const vevent = new ICAL.Component(jcalData);

  const recurringMaster = vcalendar
    .getAllSubcomponents('vevent')
    .filter((e) => e.getFirstPropertyValue('recurrence-id') === null)[0];

  const startDateTime = ICAL.Time.fromJSDate(new Date(eventObject.start.dateTime), false);

  vevent.updatePropertyWithValue('sequence', 0);

  vevent.updatePropertyWithValue('uid', eventObject.iCalUID);

  vevent.updatePropertyWithValue('dtstart', recurringMaster.getFirstPropertyValue('dtstart'));
  vevent.getFirstProperty('dtstart').setParameter('tzid', 'US/Pacific');

  vevent.updatePropertyWithValue('duration', 'PT1H');

  vevent.updatePropertyWithValue('created', ICAL.Time.now());

  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());

  vevent.updatePropertyWithValue('priority', 0);

  vevent.updatePropertyWithValue('summary', updatedObject.title);

  const rrule = new ICAL.Recur(buildRruleObject(recurrencePattern));
  recurrencePattern.iCALString = rrule.toString();
  vevent.updatePropertyWithValue('rrule', rrule);

  vevent.updatePropertyWithValue('status', 'CONFIRMED');

  vevent.updatePropertyWithValue('transp', 'OPAQUE');

  vevent.updatePropertyWithValue('class', 'PUBLIC');
  // TO-DO, ADD MORE FIELDS AND TEST IF IT WORKS.

  // vevent.updatePropertyWithValue('location', eventObject.location);
  // vevent.updatePropertyWithValue('tzid', 'US/Pacific');
  // vevent.updatePropertyWithValue('x-apple-travel-advisory-behavior', 'AUTOMATIC');

  // vevent.updatePropertyWithValue('dtend', eventObject.end.dateTime);
  // vevent.getFirstProperty('dtend').setParameter('tzid', 'US/Pacific');

  // Remove the previous master, by finding the object in the ical string that does not have
  // the recurring id, therefore, it is the master.

  vcalendar.removeSubcomponent(recurringMaster);

  vcalendar.addSubcomponent(vevent);
  vcalendar.addSubcomponent(timezoneMetadata);
  debugger;
  return vcalendar.toString();
};

export const buildICALStringUpdateFutureRecurMasterEvent = (
  recurrencePattern,
  eventObject,
  updatedObject
) => {
  debugger;
  const calendarData = ICAL.parse(eventObject.iCALString);
  const vcalendar = new ICAL.Component(calendarData);

  const timezoneMetadata = vcalendar.getFirstSubcomponent('vtimezone');
  vcalendar.removeSubcomponent('vtimezone');

  // #region Updating Old Object, with all the previous values & new recurrence
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  const jcalData = ICAL.parse(iCalendarData);
  const vevent = new ICAL.Component(jcalData);

  const allVEvents = vcalendar.getAllSubcomponents('vevent');

  const recurringMaster = allVEvents.filter(
    (e) => e.getFirstPropertyValue('recurrence-id') === null
  )[0];

  const nonRecurringEvents = allVEvents.filter(
    (e) => e.getFirstPropertyValue('recurrence-id') !== null
  );

  const recurringChildren = [];

  const result = nonRecurringEvents.map((e2) => {
    const nonMasterVEventTime = moment(e2.getFirstPropertyValue('recurrence-id').toJSDate());
    if (nonMasterVEventTime.isSameOrAfter(moment(eventObject.start.dateTime), 'day')) {
      vcalendar.removeSubcomponent(e2);
      return 'deleted';
    }
    recurringChildren.push(e2);
    return 'ignored';
  });

  recurringMaster.getAllProperties('exdate').forEach((e) => {
    const exDateMoment = moment(e.getValues()[0].toJSDate());
    if (exDateMoment.isSameOrAfter(moment(eventObject.start.dateTime))) {
      recurringMaster.removeProperty(e);
    }
  });

  recurringChildren.forEach((e) => vcalendar.removeSubcomponent(e));

  debugger;

  const startDateTime = ICAL.Time.fromJSDate(new Date(eventObject.start.dateTime), false);

  vevent.updatePropertyWithValue('sequence', 0);

  vevent.updatePropertyWithValue('uid', eventObject.iCalUID);

  vevent.updatePropertyWithValue('dtstart', recurringMaster.getFirstPropertyValue('dtstart'));
  vevent.getFirstProperty('dtstart').setParameter('tzid', 'US/Pacific');

  vevent.updatePropertyWithValue('duration', 'PT1H');

  vevent.updatePropertyWithValue('created', ICAL.Time.now());

  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());

  vevent.updatePropertyWithValue('priority', 0);

  vevent.updatePropertyWithValue('summary', recurringMaster.getFirstPropertyValue('summary'));

  const rrule = new ICAL.Recur(buildRruleObject(recurrencePattern));
  recurrencePattern.iCALString = rrule.toString();
  vevent.updatePropertyWithValue('rrule', rrule);

  vevent.updatePropertyWithValue('status', 'CONFIRMED');

  vevent.updatePropertyWithValue('transp', 'OPAQUE');

  vevent.updatePropertyWithValue('class', 'PUBLIC');
  // TO-DO, ADD MORE FIELDS AND TEST IF IT WORKS.

  // vevent.updatePropertyWithValue('location', eventObject.location);
  // vevent.updatePropertyWithValue('tzid', 'US/Pacific');
  // vevent.updatePropertyWithValue('x-apple-travel-advisory-behavior', 'AUTOMATIC');

  // vevent.updatePropertyWithValue('dtend', eventObject.end.dateTime);
  // vevent.getFirstProperty('dtend').setParameter('tzid', 'US/Pacific');

  // Remove the previous master, by finding the object in the ical string that does not have
  // the recurring id, therefore, it is the master.

  vcalendar.removeSubcomponent(recurringMaster);
  // #endregion

  vcalendar.addSubcomponent(vevent);

  recurringChildren.forEach((e) => vcalendar.addSubcomponent(e));
  vcalendar.addSubcomponent(timezoneMetadata);
  debugger;
  return vcalendar.toString();
};

export const buildICALStringUpdateFutureRecurCreateEvent = (
  recurrencePattern,
  eventObject,
  updatedObject
) => {
  debugger;
  const calendarData = ICAL.parse(eventObject.iCALString);
  const vcalendar = new ICAL.Component(calendarData);

  const timezoneMetadata = vcalendar.getFirstSubcomponent('vtimezone');
  vcalendar.removeSubcomponent('vtimezone');

  // #region Updating Old Object, with all the previous values & new recurrence
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  debugger;
  const jcalData = ICAL.parse(iCalendarData);
  const vevent = new ICAL.Component(jcalData);

  const allVEvents = vcalendar.getAllSubcomponents('vevent');

  const recurringMaster = allVEvents.filter(
    (e) => e.getFirstPropertyValue('recurrence-id') === null
  )[0];

  const nonRecurringEvents = allVEvents.filter(
    (e) => e.getFirstPropertyValue('recurrence-id') !== null
  );

  const recurringChildren = [];

  // The goal here is to remove any edited events from the calendar string based off the
  // recurrence id as the time of the event.
  // It checks it based off the recurrence pattern parsed in.
  // It then deletes it if it is before the selected event.
  // or if it is the same, it will edit it to details from the updated ui.
  // In the future, if the behavior of updating this and future events change, for e.g.
  // If it becomes let it automatically expand the events and not take the events from the parents,
  // Then, come here, and edit this code to not delete or edit but just remove all child elements.
  // Caldav will automatically handle the expansion.
  const startDt = moment(eventObject.start.dateTime);
  nonRecurringEvents.forEach((e) => {
    const nonMasterVEventTime = moment(e.getFirstPropertyValue('recurrence-id').toJSDate());
    debugger;
    let toDelete = false;
    let isSame = false;
    // for (let index = 0; index < recurrencePattern.recurrenceIds.length; index += 1) {
    //   const element = moment(recurrencePattern.recurrenceIds[index]);
    //   if (nonMasterVEventTime.isBefore(element)) {
    //     toDelete = true;
    //     break;
    //   } else if (nonMasterVEventTime.isSame(element)) {
    //     isSame = true;
    //     break;
    //   }
    // }
    if (nonMasterVEventTime.isBefore(startDt)) {
      toDelete = true;
    } else if (nonMasterVEventTime.isSame(startDt)) {
      isSame = true;
    }

    if (toDelete || isSame) {
      vcalendar.removeSubcomponent(e);
      // } else if (isSame) {
      //   e.updatePropertyWithValue('summary', updatedObject.title);
      //   e.updatePropertyWithValue('uid', recurrencePattern.originalId);
      //   recurringChildren.push(e);
    } else {
      e.updatePropertyWithValue('uid', recurrencePattern.originalId);
      recurringChildren.push(e);
    }
  });

  recurringChildren.forEach((e) => vcalendar.removeSubcomponent(e));

  const startDateTime = ICAL.Time.fromJSDate(new Date(eventObject.start.dateTime), false);

  vevent.updatePropertyWithValue('sequence', 0);

  vevent.updatePropertyWithValue('uid', recurrencePattern.originalId);

  vevent.updatePropertyWithValue('dtstart', startDateTime);
  vevent.getFirstProperty('dtstart').setParameter('tzid', 'US/Pacific');

  vevent.updatePropertyWithValue('duration', 'PT1H');

  vevent.updatePropertyWithValue('created', ICAL.Time.now());

  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());

  vevent.updatePropertyWithValue('priority', 0);

  vevent.updatePropertyWithValue('summary', updatedObject.title);

  const rrule = new ICAL.Recur(buildRruleObject(recurrencePattern));
  recurrencePattern.iCALString = rrule.toString();
  vevent.updatePropertyWithValue('rrule', rrule);

  vevent.updatePropertyWithValue('status', 'CONFIRMED');

  vevent.updatePropertyWithValue('transp', 'OPAQUE');

  vevent.updatePropertyWithValue('class', 'PUBLIC');

  recurrencePattern.exDates.forEach((date) => {
    const datetime = new ICAL.Time().fromJSDate(new Date(date));
    const timezone = new ICAL.Time().fromData(
      {
        year: datetime.year,
        month: datetime.month,
        day: datetime.day,
        hour: datetime.hour,
        minute: datetime.minute,
        second: datetime.second
      },
      new ICAL.Timezone({ tzid: 'America/Los_Angeles' })
    );
    vevent.addPropertyWithValue('exdate', timezone);
  });
  vevent.getAllProperties('exdate').forEach((e) => e.setParameter('tzid', 'America/Los_Angeles'));

  // TO-DO, ADD MORE FIELDS AND TEST IF IT WORKS.

  // vevent.updatePropertyWithValue('location', eventObject.location);
  // vevent.updatePropertyWithValue('tzid', 'US/Pacific');
  // vevent.updatePropertyWithValue('x-apple-travel-advisory-behavior', 'AUTOMATIC');

  // vevent.updatePropertyWithValue('dtend', eventObject.end.dateTime);
  // vevent.getFirstProperty('dtend').setParameter('tzid', 'US/Pacific');

  // Remove the previous master, by finding the object in the ical string that does not have
  // the recurring id, therefore, it is the master.

  vcalendar.removeSubcomponent(recurringMaster);
  // #endregion

  vcalendar.addSubcomponent(vevent);
  recurringChildren.forEach((e) => vcalendar.addSubcomponent(e));

  vcalendar.addSubcomponent(timezoneMetadata);
  debugger;
  return vcalendar.toString();
};

export const fromICALString = (string, value) => {};

export const toICALString = (eventObject, options) => {
  const dtstamp = ICAL.Time.now().toICALString();
  const uid = uuidv1();

  // e.g 2015-01-02T03:04:05
  // Add Timezone support
  const { summary, description, dtstart, dtend, attendees, location } = eventObject;

  const icalString =
    'BEGIN:VCALENDAR\n' +
    'VERSION:2.0\n' +
    'PRODID:-//Apple Inc.//Mac OS X 10.13.6//EN\n' +
    'BEGIN:VEVENT\n' +
    'UID:' +
    `${uid}` +
    '\n' +
    'DTSTAMP:' +
    `${dtstamp}Z` +
    '\n' +
    'LOCATION:' +
    `${location}` +
    '\n' +
    // 'DTSTART:' +
    // `${dtstart}Z` +
    // '\n' +
    // 'DTEND:' +
    // `${dtend}Z` +
    // '\n' +
    'SUMMARY:' +
    `${summary}` +
    '\n' +
    'DESCRIPTION:' +
    `${description}` +
    '\n' +
    'END:VEVENT\n' +
    'END:VCALENDAR\n';

  const calendarData = ICAL.parse(icalString);
  const calendarComp = new ICAL.Component(calendarData);
  const vevent = calendarComp.getFirstSubcomponent('vevent');
  vevent.updatePropertyWithValue('dtstart', dtstart);
  vevent.getFirstProperty('dtstart').setParameter('tzid', 'US/Pacific');
  vevent.updatePropertyWithValue('dtend', dtend);
  vevent.getFirstProperty('dtend').setParameter('tzid', 'US/Pacific');
  if (options.isRecurring) {
    const rrule = new ICAL.Recur(options.rrule);
    vevent.updatePropertyWithValue('rrule', rrule);
  }
  if (options.hasAttendees) {
    attendees.forEach((attendee) => vevent.addPropertyWithValue('attendee', attendee));
  }
  if (options.hasAlarm) {
    const vAlarmData = 'BEGIN:VALARM\nEND:VALARM\n';
    const alarmParsed = ICAL.parse(vAlarmData);
    const valarm = new ICAL.Component(alarmParsed);
    const alarmUid = uuidv1();
    valarm.addPropertyWithValue('x-wr-alarmuid', alarmUid);
    valarm.addPropertyWithValue('uid', alarmUid);
    valarm.addPropertyWithValue('trigger', new ICAL.Duration({ hours: -1 }));
    valarm.addPropertyWithValue('description', 'Event Reminder');
    valarm.addPropertyWithValue('action', 'DISPLAY');
    vevent.addSubcomponent(valarm);
  }
  return calendarComp.toString();
};

export const updateICALStringDtStart = (eventObject) => {};
export const updateICALStringDtEnd = (eventObject) => {};
export const updateICALStringSummary = (eventObject) => {};
export const updateICALStringDescription = (eventObject) => {};
export const updateICALStringLocation = (eventObject) => {};
export const updateICALStringRrule = (eventObject, ruleSet) => {
  const calendarData = ICAL.parse(eventObject.ICALString);
  const calendarComp = new ICAL.Component(calendarData);
  const vevent = calendarComp.getFirstSubcomponent('vevent');
  const rrule = new ICAL.Recur(ruleSet);
  vevent.updatePropertyWithValue('rrule', rrule);
  return calendarComp.toString();
};
