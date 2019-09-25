import ICAL from 'ical.js';
import moment from 'moment';
import { RRule, RRuleSet } from 'rrule';
import uuidv1 from 'uuid';
import * as icalTookKit from 'ical-toolkit';

export const buildRruleObject = (recurrencePattern) => {
  // debugger;
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
    // const datetime = new ICAL.Time().fromJSDate(new Date(recurrencePattern.until));
    // const dtTimezone = new ICAL.Time().fromData(
    //   {
    //     year: datetime.year,
    //     month: datetime.month,
    //     day: datetime.day,
    //     hour: datetime.hour,
    //     minute: datetime.minute,
    //     second: datetime.second
    //   },
    //   new ICAL.Timezone({ tzid: 'America/Los_Angeles' })
    // );

    const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const datetime = moment.tz(recurrencePattern.until * 1000, tzid);
    const dtTimezone = new ICAL.Time().fromData(
      {
        year: datetime.year(),
        month: datetime.month() + 1,
        day: datetime.date(),
        hour: datetime.hour(),
        minute: datetime.minute(),
        second: datetime.second()
      },
      new ICAL.Timezone({ tzid })
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
  // Build the Dav Calendar Object from the iCalString
  const calendarData = ICAL.parse(eventObject.iCALString);
  const vcalendar = new ICAL.Component(calendarData);

  // Get the master event, as they are in order, and remove the ExDates.
  // ExDates are from the recurrence pattern.
  const vevent = vcalendar.getFirstSubcomponent('vevent');
  vevent.removeAllProperties('exdate');

  // Get all the Edited event to work on later.
  const allEditedEvent = vcalendar
    .getAllSubcomponents('vevent')
    .filter((e) => e.getFirstPropertyValue('recurrence-id') !== null);

  // debugger;
  const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Based off the ExDates, set the new event accordingly.
  recurrencePattern.exDates.split(',').forEach((date) => {
    const datetime = moment.tz(date * 1000, tzid);
    const timezone = new ICAL.Time().fromData(
      {
        year: datetime.year(),
        month: datetime.month() + 1,
        day: datetime.date(),
        hour: datetime.hour(),
        minute: datetime.minute(),
        second: datetime.second()
      },
      new ICAL.Timezone({ tzid })
    );
    vevent.addPropertyWithValue('exdate', timezone);
  });
  // Ensure the proper Timezone ID.
  vevent.getAllProperties('exdate').forEach((e) => e.setParameter('tzid', tzid));

  // Build the new recurrence pattern off the database which is updated.
  const rrule = new ICAL.Recur(buildRruleObject(recurrencePattern));
  recurrencePattern.iCALString = rrule.toString();
  vevent.updatePropertyWithValue('rrule', rrule);

  // This removes all the edited event and the master, and add the new master.
  vcalendar.removeAllSubcomponents('vevent');
  vcalendar.addSubcomponent(vevent);

  // For each edited event, find the right one to add.
  recurrencePattern.recurrenceIds.split(',').forEach((date) => {
    const editedEvent = moment(date);
    const findingEditedComp = allEditedEvent.filter((e2) =>
      moment(e2.getFirstPropertyValue().toJSDate()).isSame(editedEvent, 'day')
    );
    if (findingEditedComp.length > 0) {
      vcalendar.addSubcomponent(findingEditedComp[0]);
    }
  });

  // debugger;
  return vcalendar.toString();
};

export const buildICALStringUpdateRecurEvent = (recurrencePattern, eventObject, updatedObject) => {
  // Build the Dav Calendar Object from the iCalString.
  const calendarData = ICAL.parse(eventObject.iCALString);
  const vcalendar = new ICAL.Component(calendarData);

  // Remove Timezone data as there might be duplicates.
  const timezoneMetadata = vcalendar.getFirstSubcomponent('vtimezone');
  const tzid = timezoneMetadata.getFirstPropertyValue('tzid');
  // const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
  vcalendar.removeSubcomponent('vtimezone');

  // Create new event structure, and parse it into a component.
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  const jcalData = ICAL.parse(iCalendarData);
  const vevent = new ICAL.Component(jcalData);

  debugger;

  // Updating Single Recurring event, so update the recurrence-id based off the start time.
  // const startDateTime = ICAL.Time.fromJSDate(new Date(eventObject.start.dateTime), false);
  const datetime = moment.tz(eventObject.start.dateTime * 1000, tzid);
  const startDateTime = new ICAL.Time().fromData(
    {
      year: datetime.year(),
      month: datetime.month() + 1,
      day: datetime.date(),
      hour: datetime.hour(),
      minute: datetime.minute(),
      second: datetime.second()
    },
    new ICAL.Timezone({ tzid })
  );
  vevent.updatePropertyWithValue('recurrence-id', startDateTime);
  vevent.getFirstProperty('recurrence-id').setParameter('tzid', tzid);

  // UID ensures the connection to the Recurring Master
  vevent.updatePropertyWithValue('uid', eventObject.iCalUID);

  // DateTime start of the selected event, set the Timezone ID properly.
  vevent.updatePropertyWithValue('dtstart', startDateTime);
  vevent.getFirstProperty('dtstart').setParameter('tzid', tzid);

  // Temp set the duration to all an hour, Will change in the future. (TO-DO)
  vevent.updatePropertyWithValue('duration', 'PT1H');

  // The other fields.
  vevent.updatePropertyWithValue('sequence', 0);
  vevent.updatePropertyWithValue('created', ICAL.Time.now());
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());

  vevent.updatePropertyWithValue('priority', 0);

  // Currently, only updating the title. (TO-DO)
  vevent.updatePropertyWithValue('summary', updatedObject.title);

  // The other fields.
  vevent.updatePropertyWithValue('status', 'CONFIRMED');
  vevent.updatePropertyWithValue('transp', 'OPAQUE');
  vevent.updatePropertyWithValue('class', 'PUBLIC');

  // Ensure no duplicates!
  const filteredResult = vcalendar
    .getAllSubcomponents('vevent')
    .filter((e) => e.getFirstPropertyValue('recurrence-id') !== null)
    .map((e) => ({
      e,
      result: moment(e.getFirstPropertyValue('recurrence-id').toJSDate()).isSame(
        moment(eventObject.start.dateTime)
      )
    }));
  const hasDuplicate = filteredResult.filter((anyTrue) => anyTrue.result === true).length > 0;

  if (hasDuplicate) {
    const removingVEvents = filteredResult.filter((anyTrue) => anyTrue.result === true);
    removingVEvents.forEach((obj) => vcalendar.removeSubcomponent(obj.e));
  }

  // Add the new master, and the timezone after that.
  vcalendar.addSubcomponent(vevent);
  vcalendar.addSubcomponent(timezoneMetadata);
  // debugger;
  return vcalendar.toString();
};

export const buildICALStringUpdateSingleEvent = (updatedEvent, calendarObject) => {
  // Build the Dav Calendar Object from the iCalString.
  const calendarData = ICAL.parse(calendarObject.iCALString);
  const calendarComp = new ICAL.Component(calendarData);

  // Remove Timezone data as there might be duplicates.
  const timezoneMetadata = calendarComp.getFirstSubcomponent('vtimezone');
  const tzid = timezoneMetadata.getFirstPropertyValue('tzid');
  calendarComp.removeSubcomponent('vtimezone');

  // Remove the previous event, as we are building a new one.
  calendarComp.removeSubcomponent('vevent');

  // Create new event structure, and parse it into a component.
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  const jcalData = ICAL.parse(iCalendarData);
  const vevent = new ICAL.Component(jcalData);

  // Updating Single Recurring event, so update the recurrence-id based off the start time.
  // const startDateTime = ICAL.Time.fromJSDate(new Date(calendarObject.start.dateTime), false);
  const datetime = moment.tz(calendarObject.start.dateTime * 1000, tzid);
  const startDateTime = new ICAL.Time().fromData(
    {
      year: datetime.year(),
      month: datetime.month() + 1,
      day: datetime.date(),
      hour: datetime.hour(),
      minute: datetime.minute(),
      second: datetime.second()
    },
    new ICAL.Timezone({ tzid })
  );

  // The order might matter, did not test it yet, but sequence is usually at the top.
  vevent.updatePropertyWithValue('sequence', 0);

  // Take UID from previous object, so that it will replace it.
  vevent.updatePropertyWithValue('uid', calendarObject.iCalUID);

  // DateTime start of the selected event, set the Timezone ID properly.
  vevent.updatePropertyWithValue('dtstart', startDateTime);
  vevent.getFirstProperty('dtstart').setParameter('tzid', tzid);

  // Temp set the duration to all an hour, Will change in the future. (TO-DO)
  vevent.updatePropertyWithValue('duration', 'PT1H');

  // The other fields.
  vevent.updatePropertyWithValue('created', ICAL.Time.now());
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
  vevent.updatePropertyWithValue('priority', 0);

  // Currently, only updating the title. (TO-DO)
  vevent.updatePropertyWithValue('summary', updatedEvent.title);

  // The other fields.
  vevent.updatePropertyWithValue('status', 'CONFIRMED');
  vevent.updatePropertyWithValue('transp', 'OPAQUE');

  // Add the new master, and the timezone after that.
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
  // Build the Dav Calendar Object from the iCalString.
  const calendarData = ICAL.parse(eventObject.iCALString);
  const vcalendar = new ICAL.Component(calendarData);

  // Remove Timezone data as there might be duplicates.
  const timezoneMetadata = vcalendar.getFirstSubcomponent('vtimezone');
  const tzid = timezoneMetadata.getFirstPropertyValue('tzid');
  vcalendar.removeSubcomponent('vtimezone');

  // Create new event structure, and parse it into a component.
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  const jcalData = ICAL.parse(iCalendarData);
  const vevent = new ICAL.Component(jcalData);

  // Updating whole series, so just find the recurring master, and update that.
  const recurringMaster = vcalendar
    .getAllSubcomponents('vevent')
    .filter((e) => e.getFirstPropertyValue('recurrence-id') === null)[0];

  // Updating Single Recurring event, so update the recurrence-id based off the start time.
  // // const startDateTime = ICAL.Time.fromJSDate(new Date(eventObject.start.dateTime), false);
  // const datetime = moment.tz(calendarObject.start.dateTime * 1000, tzid);
  // const startDateTime = new ICAL.Time().fromData(
  //   {
  //     year: datetime.year(),
  //     month: datetime.month(),
  //     day: datetime.date(),
  //     hour: datetime.hour(),
  //     minute: datetime.minute(),
  //     second: datetime.second()
  //   },
  //   new ICAL.Timezone({ tzid })
  // );

  // The order might matter, did not test it yet, but sequence is usually at the top.
  vevent.updatePropertyWithValue('sequence', 0);

  // Take UID from previous object, so that it will replace it.
  vevent.updatePropertyWithValue('uid', eventObject.iCalUID);

  // DateTime start of the selected event, set the Timezone ID properly.
  vevent.updatePropertyWithValue('dtstart', recurringMaster.getFirstPropertyValue('dtstart'));
  vevent.getFirstProperty('dtstart').setParameter('tzid', tzid);

  // Temp set the duration to all an hour, Will change in the future. (TO-DO)
  vevent.updatePropertyWithValue('duration', 'PT1H');

  // The other fields.
  vevent.updatePropertyWithValue('created', ICAL.Time.now());
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
  vevent.updatePropertyWithValue('priority', 0);

  // Currently, only updating the title. (TO-DO)
  vevent.updatePropertyWithValue('summary', updatedObject.title);

  // Update the rule based off the recurrence pattern.
  const rrule = new ICAL.Recur(buildRruleObject(recurrencePattern));
  recurrencePattern.iCALString = rrule.toString();
  vevent.updatePropertyWithValue('rrule', rrule);

  // The other fields.
  vevent.updatePropertyWithValue('status', 'CONFIRMED');
  vevent.updatePropertyWithValue('transp', 'OPAQUE');
  vevent.updatePropertyWithValue('class', 'PUBLIC');

  // Remove the recurring maaster, add the new master, and the timezone after that.
  vcalendar.removeSubcomponent(recurringMaster);
  vcalendar.addSubcomponent(vevent);
  vcalendar.addSubcomponent(timezoneMetadata);
  // debugger;
  return vcalendar.toString();
};

export const buildICALStringUpdateFutureRecurMasterEvent = (
  recurrencePattern,
  eventObject,
  updatedObject
) => {
  // Build the Dav Calendar Object from the iCalString.
  const calendarData = ICAL.parse(eventObject.iCALString);
  const vcalendar = new ICAL.Component(calendarData);

  // Remove Timezone data as there might be duplicates.
  const timezoneMetadata = vcalendar.getFirstSubcomponent('vtimezone');
  const tzid = timezoneMetadata.getFirstPropertyValue('tzid');
  vcalendar.removeSubcomponent('vtimezone');

  // #region Updating Old Object, with all the previous values & new recurrence
  // Create new event structure, and parse it into a component.
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  const jcalData = ICAL.parse(iCalendarData);
  const vevent = new ICAL.Component(jcalData);

  // As we are dealing with future events, get all events,
  // Filter them to master and non recurring master.
  const allVEvents = vcalendar.getAllSubcomponents('vevent');
  const recurringMaster = allVEvents.filter(
    (e) => e.getFirstPropertyValue('recurrence-id') === null
  )[0];
  const nonRecurringEvents = allVEvents.filter(
    (e) => e.getFirstPropertyValue('recurrence-id') !== null
  );

  // Used to append the edited events after the recurrence master.
  // Order matters. If you move the order, something will break.
  const recurringChildren = [];

  // Result used for debugging.
  // Idea is to remove the edited events that are the selected event or the following events.
  const result = nonRecurringEvents.map((e2) => {
    const nonMasterVEventTime = moment(e2.getFirstPropertyValue('recurrence-id').toJSDate());
    if (nonMasterVEventTime.isSameOrAfter(moment(eventObject.start.dateTime), 'day')) {
      vcalendar.removeSubcomponent(e2);
      return 'deleted';
    }
    recurringChildren.push(e2);
    return 'ignored';
  });

  // Same as previous chunk, but for deleted events now.
  recurringMaster.getAllProperties('exdate').forEach((e) => {
    const exDateMoment = moment(e.getValues()[0].toJSDate());
    if (exDateMoment.isSameOrAfter(moment(eventObject.start.dateTime))) {
      recurringMaster.removeProperty(e);
    }
  });

  // Remove them first, add them back later.
  recurringChildren.forEach((e) => vcalendar.removeSubcomponent(e));

  // Updating Single Recurring event, so update the recurrence-id based off the start time.
  const startDateTime = ICAL.Time.fromJSDate(new Date(eventObject.start.dateTime), false);

  // The order might matter, did not test it yet, but sequence is usually at the top.
  vevent.updatePropertyWithValue('sequence', 0);

  // Take UID from previous object, so that it will replace it.
  vevent.updatePropertyWithValue('uid', eventObject.iCalUID);

  // DateTime start of the selected event, set the Timezone ID properly.
  vevent.updatePropertyWithValue('dtstart', recurringMaster.getFirstPropertyValue('dtstart'));
  vevent.getFirstProperty('dtstart').setParameter('tzid', tzid);

  // Temp set the duration to all an hour, Will change in the future. (TO-DO)
  vevent.updatePropertyWithValue('duration', 'PT1H');

  // The other fields.
  vevent.updatePropertyWithValue('created', ICAL.Time.now());
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
  vevent.updatePropertyWithValue('priority', 0);

  // Currently, only updating the title. (TO-DO)
  // Update all the events based of the recurring master property,
  // as only the future events are changed.
  vevent.updatePropertyWithValue('summary', recurringMaster.getFirstPropertyValue('summary'));

  // Update the rule based off the recurrence pattern.
  const rrule = new ICAL.Recur(buildRruleObject(recurrencePattern));
  recurrencePattern.iCALString = rrule.toString();
  vevent.updatePropertyWithValue('rrule', rrule);

  // The other fields.
  vevent.updatePropertyWithValue('status', 'CONFIRMED');
  vevent.updatePropertyWithValue('transp', 'OPAQUE');
  vevent.updatePropertyWithValue('class', 'PUBLIC');
  // #endregion

  // Remove the recurring maaster, add the new master,
  // edited events still within range and the timezone after that.
  vcalendar.removeSubcomponent(recurringMaster);
  vcalendar.addSubcomponent(vevent);
  recurringChildren.forEach((e) => vcalendar.addSubcomponent(e));
  vcalendar.addSubcomponent(timezoneMetadata);
  // debugger;
  return vcalendar.toString();
};

export const buildICALStringUpdateFutureRecurCreateEvent = (
  recurrencePattern,
  eventObject,
  updatedObject
) => {
  // Build the Dav Calendar Object from the iCalString.
  const calendarData = ICAL.parse(eventObject.iCALString);
  const vcalendar = new ICAL.Component(calendarData);

  // Remove Timezone data as there might be duplicates.
  const timezoneMetadata = vcalendar.getFirstSubcomponent('vtimezone');
  const tzid = timezoneMetadata.getFirstPropertyValue('tzid');
  vcalendar.removeSubcomponent('vtimezone');

  // #region Updating Old Object, with all the previous values & new recurrence
  // Create new event structure, and parse it into a component.
  const iCalendarData = 'BEGIN:VEVENT\nEND:VEVENT\n';
  const jcalData = ICAL.parse(iCalendarData);
  const vevent = new ICAL.Component(jcalData);

  // As we are dealing with future events, get all events,
  // Filter them to master and non recurring master.
  const allVEvents = vcalendar.getAllSubcomponents('vevent');
  const recurringMaster = allVEvents.filter(
    (e) => e.getFirstPropertyValue('recurrence-id') === null
  )[0];
  const nonRecurringEvents = allVEvents.filter(
    (e) => e.getFirstPropertyValue('recurrence-id') !== null
  );

  // Used to append the edited events after the recurrence master.
  // Order matters. If you move the order, something will break.
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
    let toDelete = false;
    let isSame = false;
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

  // Remove them first, add them back later.
  recurringChildren.forEach((e) => vcalendar.removeSubcomponent(e));

  // Updating Single Recurring event, so update the recurrence-id based off the start time.
  // const startDateTime = ICAL.Time.fromJSDate(new Date(eventObject.start.dateTime), false);
  const datetime = moment.tz(eventObject.start.dateTime * 1000, tzid);
  const startDateTime = new ICAL.Time().fromData(
    {
      year: datetime.year(),
      month: datetime.month(),
      day: datetime.date(),
      hour: datetime.hour(),
      minute: datetime.minute(),
      second: datetime.second()
    },
    new ICAL.Timezone({ tzid })
  );

  // The order might matter, did not test it yet, but sequence is usually at the top.
  vevent.updatePropertyWithValue('sequence', 0);

  // Take UID from recurrence pattern, to build the bond between them.
  vevent.updatePropertyWithValue('uid', recurrencePattern.originalId);

  // DateTime start of the selected event, set the Timezone ID properly.
  vevent.updatePropertyWithValue('dtstart', startDateTime);
  vevent.getFirstProperty('dtstart').setParameter('tzid', tzid);

  // Temp set the duration to all an hour, Will change in the future. (TO-DO)
  vevent.updatePropertyWithValue('duration', 'PT1H');

  // The other fields.
  vevent.updatePropertyWithValue('created', ICAL.Time.now());
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
  vevent.updatePropertyWithValue('priority', 0);

  // Currently, only updating the title. (TO-DO)
  // Update all the events based of the new event property.
  vevent.updatePropertyWithValue('summary', updatedObject.title);

  // Update the rule based off the recurrence pattern.
  const rrule = new ICAL.Recur(buildRruleObject(recurrencePattern));
  recurrencePattern.iCALString = rrule.toString();
  vevent.updatePropertyWithValue('rrule', rrule);

  // The other fields.
  vevent.updatePropertyWithValue('status', 'CONFIRMED');
  vevent.updatePropertyWithValue('transp', 'OPAQUE');
  vevent.updatePropertyWithValue('class', 'PUBLIC');

  // // Based off the ExDates in the recurrence pattern, set the new event ExDates accordingly.
  // recurrencePattern.exDates.split(',').forEach((date) => {
  //   const datetime = new ICAL.Time().fromJSDate(new Date(date));
  //   const timezone = new ICAL.Time().fromData(
  //     {
  //       year: datetime.year,
  //       month: datetime.month,
  //       day: datetime.day,
  //       hour: datetime.hour,
  //       minute: datetime.minute,
  //       second: datetime.second
  //     },
  //     new ICAL.Timezone({ tzid: 'America/Los_Angeles' })
  //   );
  //   vevent.addPropertyWithValue('exdate', timezone);
  // });
  // vevent.getAllProperties('exdate').forEach((e) => e.setParameter('tzid', 'America/Los_Angeles'));

  // const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Based off the ExDates, set the new event accordingly.
  recurrencePattern.exDates.split(',').forEach((date) => {
    const exDatetime = moment.tz(date * 1000, tzid);
    const timezone = new ICAL.Time().fromData(
      {
        year: exDatetime.year(),
        month: exDatetime.month() + 1,
        day: exDatetime.date(),
        hour: exDatetime.hour(),
        minute: exDatetime.minute(),
        second: exDatetime.second()
      },
      new ICAL.Timezone({ tzid })
    );
    vevent.addPropertyWithValue('exdate', timezone);
  });
  // Ensure the proper Timezone ID.
  vevent.getAllProperties('exdate').forEach((e) => e.setParameter('tzid', tzid));
  // #endregion

  // Remove the recurring maaster, add the new master,
  // edited events still within range and the timezone after that.
  vcalendar.removeSubcomponent(recurringMaster);
  vcalendar.addSubcomponent(vevent);
  recurringChildren.forEach((e) => vcalendar.addSubcomponent(e));
  vcalendar.addSubcomponent(timezoneMetadata);
  // debugger;
  return vcalendar.toString();
};

export const buildICALStringCreateRecurEvent = (eventObject, rpObject) => {
  debugger;
  const builder = icalTookKit.createIcsFileBuilder();
  const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
  builder.calname = eventObject.summary;

  // THIS IS IMPORTANT, PLZ READ
  // In order to respect the user created location, we need to get their local tzid
  // This WILL affect recurrence pattern expansion in ways its hard to explain
  builder.tzid = tzid;
  const icsCalendarContent = builder.toString();

  const vcalendar = new ICAL.Component(ICAL.parse(icsCalendarContent));

  // Create new event structure, and parse it into a component.
  const jcalData = ICAL.parse(new ICAL.Event().toString());
  const vevent = new ICAL.Component(jcalData);

  // The order might matter, did not test it yet, but sequence is usually at the top.
  vevent.updatePropertyWithValue('sequence', 0);

  // Take UID from previous object, so that it will replace it.
  vevent.updatePropertyWithValue('uid', eventObject.originalId);

  // Updating Single Recurring event, so update the recurrence-id based off the start time.
  const startDateTime = ICAL.Time.fromJSDate(new Date(eventObject.start.dateTime.toDate()), false);
  const endDateTime = ICAL.Time.fromJSDate(new Date(eventObject.end.dateTime.toDate()), false);
  const duration = endDateTime.subtractDate(startDateTime);

  // DateTime start of the selected event, set the Timezone ID properly.
  vevent.updatePropertyWithValue('dtstart', startDateTime);
  vevent.getFirstProperty('dtstart').setParameter('tzid', tzid);

  // Temp set the duration to all an hour, Will change in the future. (TO-DO)
  vevent.updatePropertyWithValue('duration', duration.toString());

  // The other fields.
  vevent.updatePropertyWithValue('created', ICAL.Time.now());
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
  vevent.updatePropertyWithValue('priority', 0);

  // Currently, only updating the title. (TO-DO)
  // Update all the events based of the new event property.
  vevent.updatePropertyWithValue('summary', eventObject.summary);
  vevent.updatePropertyWithValue('description', eventObject.description);

  // The other fields.
  vevent.updatePropertyWithValue('status', 'CONFIRMED');
  vevent.updatePropertyWithValue('transp', 'OPAQUE');
  vevent.updatePropertyWithValue('class', 'PUBLIC');

  const recurrData = {};
  Object.assign(recurrData, {
    freq: rpObject.freq,
    interval: rpObject.interval,
    // wkst: rpObject.wkst,
    until: rpObject.until,
    count: rpObject.numberOfRepeat
    // bysecond: ,
    // byminute: ,
    // byhour: ,
  });

  if (rpObject.byWeekDay !== '') {
    Object.assign(recurrData, {
      byday: rpObject.byWeekDay
    });
  }

  if (rpObject.byWeekNo !== '') {
    Object.assign(recurrData, {
      byweekno: rpObject.byWeekNo
    });
  }

  if (rpObject.byMonth !== '') {
    Object.assign(recurrData, {
      bymonth: rpObject.byMonth
    });
  }

  if (rpObject.byMonthDay !== '') {
    Object.assign(recurrData, {
      bymonthday: rpObject.byMonthDay
    });
  }

  if (rpObject.byYearDay !== '') {
    Object.assign(recurrData, {
      byyearday: rpObject.byYearDay
    });
  }

  const rrule = new ICAL.Recur(recurrData);
  vevent.updatePropertyWithValue('rrule', rrule);

  debugger;
  vcalendar.addSubcomponent(vevent);
  debugger;
  return vcalendar.toString();
};

export const buildICALStringCreateEvent = (eventObject) => {
  debugger;
  const builder = icalTookKit.createIcsFileBuilder();
  const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
  builder.calname = eventObject.summary;

  // THIS IS IMPORTANT, PLZ READ
  // In order to respect the user created location, we need to get their local tzid
  // This WILL affect recurrence pattern expansion in ways its hard to explain
  builder.tzid = tzid;

  // builder.additionalTags = {
  //   'X-APPLE-TRAVEL-ADVISORY-BEHAVIOR': 'AUTOMATIC'
  // };

  // // Here, we assumed dateTime is a moment object with localized date time.
  // const startDate = eventObject.start.dateTime.toDate();
  // const endDate = eventObject.end.dateTime.toDate();

  // // Add events
  // builder.events.push({
  //   // Event start time, Required: type Date()
  //   start: startDate,

  //   // Event end time, Required: type Date()
  //   end: endDate,

  //   // transp. Will add TRANSP:OPAQUE to block calendar.
  //   transp: 'OPAQUE',

  //   // Event summary, Required: type String
  //   summary: eventObject.summary,

  //   // // Optional: If you need to add some of your own tags
  //   // additionalTags: {
  //   //   'SOMETAG': 'SOME VALUE'
  //   // },

  //   // Event identifier, Optional, default auto generated
  //   uid: eventObject.originalId,

  //   // Optional, The sequence number in update, Default: 0
  //   sequence: 0,

  //   // // Optional if repeating event
  //   // repeating: {
  //   //   freq: 'DAILY',
  //   //   count: 10,
  //   //   interval: 10,
  //   //   until: new Date()
  //   // },

  //   // // Optional if all day event
  //   // allDay: true,

  //   // // Creation timestamp, Optional.
  //   // stamp: new Date(),

  //   // // Optional, floating time.
  //   // floating: false,

  //   // // Location of event, optional.
  //   // location: 'Home',

  //   // Optional description of event.
  //   description: eventObject.description,

  //   // // Optional Organizer info
  //   // organizer: {
  //   //   name: 'Kushal Likhi',
  //   //   email: 'test@mail',
  //   //   // OPTIONAL email address of the person who is acting on behalf of organizer.
  //   //   sentBy: 'person_acting_on_behalf_of_organizer@email.com'
  //   // },

  //   // // Optional attendees info
  //   // attendees: [
  //   //   {
  //   //     name: 'A1', // Required
  //   //     email: 'a1@email.com', // Required
  //   //     status: 'TENTATIVE', // Optional
  //   //     role: 'REQ-PARTICIPANT', // Optional
  //   //     rsvp: true // Optional, adds 'RSVP=TRUE' , tells the application that organiser needs a RSVP response.
  //   //   },
  //   //   {
  //   //     name: 'A2',
  //   //     email: 'a2@email.com'
  //   //   }
  //   // ],

  //   // // What to do on addition
  //   // method: 'PUBLISH',

  //   // Status of event
  //   status: 'CONFIRMED'

  //   // // Url for event on core application, Optional.
  //   // url: 'http://google.com'
  // });

  // Try to build
  const icsCalendarContent = builder.toString();
  debugger;

  // // Try to build
  // const icsFileContent = builder.toString();
  // console.log(icsFileContent);
  // debugger;

  // // Build the Dav Calendar Object from the iCalString.
  // const calendarData = ICAL.parse(
  //   'BEGIN:VCALENDAR\nVERSION:2.0\nCALSCALE:GREGORIAN\nPRODID:-//CyrusIMAP.org/Cyrus 3.1.6-808-g930a1a1-fmstable-20190805v2//EN\nEND:VCALENDAR\n'
  // );

  // const timezoneData = ICAL.parse(
  //   'BEGIN:VTIMEZONE\nTZID:America/Los_Angeles\nLAST-MODIFIED:20190205T122727Z\nX-LIC-LOCATION:America/Los_Angeles\nTZUNTIL:20190803T170000Z\nEND:VTIMEZONE\n'
  // );
  // const vtimezone = new ICAL.Component(timezoneData);
  // const daylightData = ICAL.parse(
  //   'BEGIN:DAYLIGHT\nTZNAME:PDT\nTZOFFSETFROM:-0800\nTZOFFSETTO:-0700\nDTSTART:20070311T020000\nRRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3\nEND:DAYLIGHT\n'
  // );
  // const vdaylight = new ICAL.Property(daylightData);
  // const standardData = ICAL.parse(
  //   'BEGIN:STANDARD\nTZNAME:PST\nTZOFFSETFROM:-0700\nTZOFFSETTO:-0800\nDTSTART:20071104T020000\nRRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11\nEND:STANDARD\n'
  // );
  // const vstandard = new ICAL.Property(standardData);
  // debugger;
  // vtimezone.addSubcomponent(vdaylight);
  // vtimezone.addSubcomponent(vstandard);

  const vcalendar = new ICAL.Component(ICAL.parse(icsCalendarContent));

  // Create new event structure, and parse it into a component.
  const jcalData = ICAL.parse(new ICAL.Event().toString());
  const vevent = new ICAL.Component(jcalData);

  // The order might matter, did not test it yet, but sequence is usually at the top.
  vevent.updatePropertyWithValue('sequence', 0);

  // Take UID from previous object, so that it will replace it.
  vevent.updatePropertyWithValue('uid', eventObject.originalId);

  // Updating Single Recurring event, so update the recurrence-id based off the start time.
  const startDateTime = ICAL.Time.fromJSDate(new Date(eventObject.start.dateTime.toDate()), false);
  const endDateTime = ICAL.Time.fromJSDate(new Date(eventObject.end.dateTime.toDate()), false);
  const duration = endDateTime.subtractDate(startDateTime);

  // DateTime start of the selected event, set the Timezone ID properly.
  vevent.updatePropertyWithValue('dtstart', startDateTime);
  vevent.getFirstProperty('dtstart').setParameter('tzid', tzid);

  // Temp set the duration to all an hour, Will change in the future. (TO-DO)
  vevent.updatePropertyWithValue('duration', duration.toString());

  // The other fields.
  vevent.updatePropertyWithValue('created', ICAL.Time.now());
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
  vevent.updatePropertyWithValue('priority', 0);

  // Currently, only updating the title. (TO-DO)
  // Update all the events based of the new event property.
  vevent.updatePropertyWithValue('summary', eventObject.summary);
  vevent.updatePropertyWithValue('description', eventObject.description);

  // The other fields.
  vevent.updatePropertyWithValue('status', 'CONFIRMED');
  vevent.updatePropertyWithValue('transp', 'OPAQUE');
  vevent.updatePropertyWithValue('class', 'PUBLIC');
  // debugger;
  vcalendar.addSubcomponent(vevent);
  // vcalendar.addSubcomponent(vtimezone);
  debugger;
  return vcalendar.toString();
};