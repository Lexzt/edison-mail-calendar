import md5 from 'md5';
import * as ProviderTypes from '../constants';
import PARSER from '../parser';
import getDb from '../../db';

const dav = require('dav');

export const filterCaldavUser = (jsonObj, url) => ({
  personId: md5(jsonObj.username),
  originalId: jsonObj.username,
  email: jsonObj.username,
  providerType: ProviderTypes.CALDAV,
  password: jsonObj.password,
  url
});

export const asyncGetAllCalDavEvents = async (username, password, url) => {
  const resp = await dav.createAccount({
    server: url,
    xhr: new dav.transport.Basic(
      new dav.Credentials({
        username,
        password
      })
    ),
    loadObjects: true
  });

  const db = await getDb();
  // This breaks due to how our database works, with id being a uniqid.
  // so we need find it first then upsert. Yay, no checks again.
  try {
    const calendars = PARSER.parseCal(resp.calendars);
    const events = PARSER.parseCalEvents(resp.calendars);
    const flatEvents = events.reduce((acc, val) => acc.concat(val), []);
    const filteredEvents = flatEvents.filter((event) => event !== '');
    const flatFilteredEvents = filteredEvents.reduce((acc, val) => acc.concat(val), []);
    const eventPersons = PARSER.parseEventPersons(flatFilteredEvents);
    const recurrenceEvents = PARSER.parseRecurrenceEvents(flatFilteredEvents);

    const promises = [];
    // This is broke, upsert makes no sense atm.
    calendars.forEach((calendar) => {
      promises.push(db.calendars.upsert(calendar));
    });
    // Do not upsert here, let the get event success upsert. But handle the rest.
    // flatFilteredEvents.forEach((calEvent) => {
    //   promises.push(db.events.upsert(calEvent.eventData));
    // });

    // This has no use atm, upsert makes no sense atm.
    eventPersons.forEach((eventPerson) => {
      promises.push(db.eventpersons.upsert(eventPerson));
    });

    const prevRPs = await Promise.all(
      recurrenceEvents.map((recurrenceEvent) =>
        db.recurrencepatterns
          .findOne()
          .where('originalId')
          .eq(recurrenceEvent.originalId)
          .exec()
      )
    );

    let i = 0;
    prevRPs.forEach((prevRP) => {
      const newRP = recurrenceEvents[i];
      console.log(newRP, prevRP);
      debugger;
      if (prevRP === null) {
        promises.push(db.recurrencepatterns.upsert(newRP));
      } else {
        // console.log(prevRP, newRP);
        promises.push(
          db.recurrencepatterns
            .findOne()
            .where('originalId')
            .eq(prevRP.originalId)
            .update({
              $set: {
                id: prevRP.id,
                originalId: newRP.originalId,
                freq: newRP.freq,
                interval: newRP.interval,
                until: newRP.until,
                exDates: newRP.exDates,
                recurrenceIds: newRP.recurrenceIds,
                modifiedThenDeleted: newRP.modifiedThenDeleted,
                numberOfRepeats: newRP.numberOfRepeats,
                isCount: newRP.isCount,
                iCalUID: prevRP.iCalUID,
                wkSt: newRP.wkSt,
                byMonth: newRP.byMonth,
                byMonthDay: newRP.byMonthDay,
                byYearDay: newRP.byYearDay,
                byWeekNo: newRP.byWeekNo,
                byWeekDay: newRP.byWeekDay,
                weeklyPattern: newRP.weeklyPattern,
                bySetPos: newRP.bySetPos,
                byHour: newRP.byHour,
                byMinute: newRP.byMinute,
                bySecond: newRP.bySecond,
                byEaster: newRP.byEaster
              }
            })
        );
      }
      i += 1;
    });

    const results = await Promise.all(promises);
    const expanded = await PARSER.expandRecurEvents(
      flatFilteredEvents.map((calEvent) => calEvent.eventData)
    );
    console.log(
      expanded,
      flatFilteredEvents,
      flatFilteredEvents.map((calEvent) => calEvent.eventData)
    );
    const finalResult = [
      ...expanded.filter((e) => e.isRecurring === true),
      ...flatFilteredEvents
        .filter((e) => e.recurData === undefined || e.recurData === null)
        .map((e) => e.eventData)
    ];
    finalResult.forEach((e) => (e.owner = username));
    console.log(finalResult);
    return finalResult;
  } catch (e) {
    throw e;
  }
};
