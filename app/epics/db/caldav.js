import { map, switchMap, catchError } from 'rxjs/operators';
import { ofType } from 'redux-observable';
import { of, from, merge } from 'rxjs';
import { RRule, RRuleSet, rrulestr } from 'rrule';
import moment from 'moment';
import * as CalDavDbActionCreators from '../../actions/db/caldav';
import { BEGIN_RETRIEVE_CALDAV_EVENTS } from '../../actions/caldav';
import getDb from '../../db';
import { updateStoredEvents } from '../../actions/db/events';
import PARSER from '../../utils/parser';

const dav = require('dav');
const ICAL = require('ical.js');

export const retrieveCaldavEventsEpic = (action$) =>
  action$.pipe(
    ofType(BEGIN_RETRIEVE_CALDAV_EVENTS),
    switchMap(() =>
      from(retrieveEvents()).pipe(
        switchMap((allEvents) =>
          from(retrieveRecurEvents(allEvents)).pipe(
            map((recurEvents) =>
              // debugger;
              updateStoredEvents(recurEvents)
            )
          )
        )
      )
    )
  );

const retrieveRecurEvents = async (events) => {
  const recurEvents = await PARSER.expandRecurEvents(events);
  return recurEvents;
};

const retrieveEvents = async () => {
  const db = await getDb();
  const events = await db.events.find().exec();
  console.log(events.map((e) => e.toJSON()));
  return events.map((event) => ({
    id: event.id,
    end: event.end,
    start: event.start,
    summary: event.summary,
    organizer: event.organizer,
    recurrence: event.recurrence,
    iCalUID: event.iCalUID,
    attendees: event.attendee,
    originalId: event.originalId,
    creator: event.creator,
    isRecurring: event.isRecurring,
    isModifiedThenDeleted: event.isModifiedThenDeleted,
    hide: event.hide,
    providerType: event.providerType,
    calendarId: event.calendarId,
    isMaster: event.isMaster
  }));
};

export const storeAccountEpics = (action$) =>
  action$.pipe(
    ofType(CalDavDbActionCreators.BEGIN_STORE_CALDAV_OBJECTS),
    switchMap((action) =>
      from(storeCaldav(action.payload)).pipe(
        map((payload) => CalDavDbActionCreators.successStoreCaldavObjects(payload)),
        catchError((error) => of(CalDavDbActionCreators.failStoreCaldavObjects(error)))
      )
    )
  );

const storeCaldav = async (payload) => {
  const db = await getDb();
  try {
    const calendars = PARSER.parseCal(payload.calendars);
    const events = PARSER.parseCalEvents(payload.calendars);
    const flatEvents = events.reduce((acc, val) => acc.concat(val), []);
    const filteredEvents = flatEvents.filter((event) => event !== '');
    const flatFilteredEvents = filteredEvents.reduce((acc, val) => acc.concat(val), []);

    const eventPersons = PARSER.parseEventPersons(flatFilteredEvents);
    const recurrenceEvents = PARSER.parseRecurrenceEvents(flatFilteredEvents);

    const promises = [];
    calendars.forEach((calendar) => {
      promises.push(db.calendars.upsert(calendar));
    });
    flatFilteredEvents.forEach((calEvent) => {
      promises.push(db.events.upsert(calEvent.eventData));
    });
    eventPersons.forEach((eventPerson) => {
      promises.push(db.eventpersons.upsert(eventPerson));
    });
    recurrenceEvents.forEach((recurrenceEvent) => {
      promises.push(db.recurrencepatterns.upsert(recurrenceEvent));
    });
    console.log(promises);
    const results = await Promise.all(promises);
    return results;
  } catch (e) {
    throw e;
  }
};
