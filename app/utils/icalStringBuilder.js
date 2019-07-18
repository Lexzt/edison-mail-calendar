import React from 'react';
import ICAL from 'ical.js';
import moment from 'moment';
import { RRule, RRuleSet, rrulestr } from 'rrule';

const uuidv1 = require('uuid/v1');

export const buildICALStringUpdateOnly = (updatedEvent, calendarObject) => {
  const calendarData = ICAL.parse(calendarObject.ICALString);
  const calendarComp = new ICAL.Component(calendarData);
  const timezoneMetadata = calendarComp.getFirstSubcomponent('vtimezone');
  calendarComp.removeSubcomponent('vtimezone');
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
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

export const buildICALStringDeleteRecurEvent = (recurPattern, exDate, eventObject) => {
  // debugger;
  const calendarData = ICAL.parse(eventObject.ICALString);
  const vcalendar = new ICAL.Component(calendarData);
  const vevent = vcalendar.getFirstSubcomponent('vevent');
  vevent.addPropertyWithValue('exdate', exDate);
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
