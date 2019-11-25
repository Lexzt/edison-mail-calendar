import md5 from 'md5';
import uuidv4 from 'uuid';
import * as dav from 'dav'; // caldav library
import * as ProviderTypes from '../constants';
import ServerUrls from '../serverUrls';
import * as PARSER from '../parser';
import * as dbRpActions from '../../sequelizeDB/operations/recurrencepatterns';
import * as caldavBasics from './caldavbasics';

const getCalDavTypeFromURL = (url) => {
  switch (url) {
    case ServerUrls.ICLOUD:
      return ProviderTypes.ICLOUD;
    case ServerUrls.FASTMAIL:
      return ProviderTypes.FASTMAIL;
    case ServerUrls.YAHOO:
      return ProviderTypes.YAHOO;
    default:
      return ProviderTypes.CALDAV;
  }
};

export const filterCaldavUser = (jsonObj, url) => ({
  personId: uuidv4(),
  originalId: md5(jsonObj.username),
  email: jsonObj.username,
  providerType: ProviderTypes.CALDAV,
  password: jsonObj.password,
  url,
  caldavType: getCalDavTypeFromURL(url)
});

export const asyncGetAllCalDavEvents = async (username, password, url, caldavType) => {
  const debug = false;
  const resp = await caldavBasics.getCaldavAccount(username, password, url, caldavType);

  // This breaks due to how our database works, with id being a uniqid.
  // so we need find it first then upsert. Yay, no checks again.
  try {
    const calendars = PARSER.parseCal(resp.calendars);
    const events = PARSER.parseCalEvents(resp.calendars);
    const flatEvents = events.reduce((acc, val) => acc.concat(val), []);
    const filteredEvents = flatEvents.filter((event) => event !== '');
    const flatFilteredEvents = filteredEvents.reduce((acc, val) => acc.concat(val), []);
    // const eventPersons = PARSER.parseEventPersons(flatFilteredEvents);
    const recurrencePattern = PARSER.parseRecurrenceEvents(flatFilteredEvents);

    // debugger;

    const promises = [];
    // This is broke, upsert makes no sense atm.
    // calendars.forEach((calendar) => {
    //   promises.push(db.calendars.upsert(calendar));
    // });
    // Do not upsert here, let the get event success upsert. But handle the rest.
    // flatFilteredEvents.forEach((calEvent) => {
    //   promises.push(db.events.upsert(calEvent.eventData));
    // });

    // // This has no use atm, upsert makes no sense atm.
    // eventPersons.forEach((eventPerson) => {
    //   promises.push(db.eventpersons.upsert(eventPerson));
    // });

    const prevRPs = await Promise.all(
      recurrencePattern.map((recurrenceEvent) =>
        dbRpActions.getOneRpByOId(recurrenceEvent.originalId)
      )
    );

    let i = 0;
    prevRPs.forEach((prevRP) => {
      const newRP = recurrencePattern[i];
      if (prevRP === null) {
        promises.push(dbRpActions.insertOrUpdateRp(newRP));
      } else {
        promises.push(
          dbRpActions.updateRpByOid(prevRP.originalId, {
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
          })
        );
      }
      i += 1;
    });

    const results = await Promise.all(promises);
    const expanded = await PARSER.expandRecurEvents(
      flatFilteredEvents.map((calEvent) => calEvent.eventData)
    );
    const finalResult = [
      ...expanded.filter((e) => e.isRecurring === true),
      ...flatFilteredEvents
        .filter((e) => e.recurData === undefined || e.recurData === null)
        .map((e) => e.eventData)
    ];
    finalResult.forEach((e) => {
      e.owner = username;
      e.caldavType = caldavType;
    });
    if (debug) {
      console.log(finalResult);
      debugger;
    }
    return finalResult;
  } catch (e) {
    throw e;
  }
};
