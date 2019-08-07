// import { map, switchMap, catchError } from 'rxjs/operators';
// import { ofType } from 'redux-observable';
// import { of, from } from 'rxjs';
// import ICAL from 'ical.js';
// import moment from 'moment';
// import * as CalDavActionCreators from '../actions/caldav';
// import * as CalDavDbActionCreators from '../actions/db/caldav';
// import getDb from '../db';
// import PARSER from '../utils/parser';
// import * as IcalStringBuilder from '../utils/icalStringBuilder';
// import * as Credentials from '../utils/Credentials';

// const uuidv1 = require('uuid/v1');

// const dav = require('dav');

// export const createAccountEpics = (action$) =>
//   action$.pipe(
//     ofType(CalDavActionCreators.BEGIN_CREATE_ACCOUNT),
//     switchMap((action) =>
//       from(dav.createAccount(action.payload)).pipe(
//         map((payload) => CalDavActionCreators.successCreateAcount(payload)),
//         catchError((error) => of(CalDavActionCreators.failCreateAccount(error)))
//       )
//     )
//   );

// export const triggerStoreCalDavEpics = (action$) =>
//   action$.pipe(
//     ofType(CalDavActionCreators.SUCCESS_CREATE_ACCOUNT),
//     map((action) => CalDavDbActionCreators.beginStoreCaldavObjects(action.payload))
//   );

// export const createCalendarObjectEpics = (action$) =>
//   action$.pipe(
//     ofType(CalDavActionCreators.BEGIN_CREATE_CALENDAR_OBJECT),
//     switchMap((action) => {
//       const calendar = new dav.Calendar();
//       calendar.url = action.payload.url;
//       const data = action.payload.eventObject;
//       const xhrObject = new dav.transport.Basic(
//         new dav.Credentials({
//           username: Credentials.ICLOUD_USERNAME,
//           password: Credentials.ICLOUD_PASSWORD
//         })
//       );
//       const calendarObject = {
//         data,
//         filename: `${uuidv1()}.ics`,
//         xhr: xhrObject
//       };
//       return from(dav.createCalendarObject(calendar, calendarObject)).pipe(
//         map((resp) => CalDavActionCreators.successCreateCalendarObject(resp)),
//         catchError((error) => of(CalDavActionCreators.failCreateCalendarObject(error)))
//       );
//     })
//   );

// export const updateCalendarObjectEpics = (action$) =>
//   action$.pipe(
//     ofType(CalDavActionCreators.BEGIN_UPDATE_CALENDAR_OBJECT),
//     switchMap((action) =>
//       from(updateEvent(action.payload)).pipe(
//         switchMap((updatedEvent) => {
//           const calendarData = updatedEvent.ICALString;
//           const { caldavUrl, etag } = updatedEvent;
//           const xhrObject = new dav.transport.Basic(
//             new dav.Credentials({
//               username: Credentials.ICLOUD_USERNAME,
//               password: Credentials.ICLOUD_PASSWORD
//             })
//           );
//           const option = {
//             xhr: xhrObject,
//             contentType: 'text/calendar; charset=utf-8'
//           };
//           const calendarObject = {
//             url: caldavUrl,
//             etag,
//             calendarData
//           };
//           return from(dav.updateCalendarObject(calendarObject, option)).pipe(
//             map((res) => CalDavActionCreators.successUpdateCalendarObject(res)),
//             catchError((error) => of(CalDavActionCreators.failUpdateCalendarObject(error)))
//           );
//         }),
//         catchError((error) => of(CalDavActionCreators.failUpdateCalendarObject(error)))
//       )
//     )
//   );

// export const deleteCalendarObjectEpics = (action$) =>
//   action$.pipe(
//     ofType(CalDavActionCreators.BEGIN_DELETE_CALENDAR_OBJECT),
//     switchMap((action) =>
//       from(removeEvent(action.payload)).pipe(
//         switchMap((resp) => {
//           const respJSON = resp[0].toJSON();
//           const calendarObject = {
//             etag: respJSON.etag,
//             url: respJSON.caldavUrl
//           };
//           const xhrObject = new dav.transport.Basic(
//             new dav.Credentials({
//               username: Credentials.ICLOUD_USERNAME,
//               password: Credentials.ICLOUD_PASSWORD
//             })
//           );
//           const option = {
//             xhr: xhrObject
//           };
//           return from(dav.deleteCalendarObject(calendarObject, option)).pipe(
//             map((res) => CalDavActionCreators.successDeleteCalendarObject(res)),
//             catchError((error) => of(CalDavActionCreators.failDeleteCalendarObject(error)))
//           );
//         }),
//         catchError((error) => of(CalDavActionCreators.failDeleteCalendarObject(error)))
//       )
//     )
//   );

// export const successDeleteCalendarObjectEpics = (action$) =>
//   action$.pipe(
//     ofType(CalDavActionCreators.SUCCESS_DELETE_CALENDAR_OBJECT),
//     map(() => ({
//       type: 'BEGIN_RETRIEVE_CALDAV_EVENTS'
//     }))
//   );

// export const failDeleteCalendarObjectEpics = (action$) =>
//   action$.pipe(
//     ofType(CalDavActionCreators.FAIL_DELETE_CALENDAR_OBJECT),
//     map((action) => console.log(`Failed to delete Event. Error: ${action.error}`))
//   );

// const removeEvent = async (payload) => {
//   const db = await getDb();
//   try {
//     const eventToRemove = await db.events
//       .find()
//       .where('iCalUID')
//       .eq(payload);
//     const removedEvent = await eventToRemove.remove();
//     return removedEvent;
//   } catch (e) {
//     return e;
//   }
// };

// const updateEvent = async (payload) => {
//   const db = await getDb();
//   try {
//     const rxEvent = await db.events
//       .findOne()
//       .where('originalId')
//       .eq(payload.eventObject.originalId)
//       .exec();
//     switch (payload.options.type) {
//       case 'UPDATE_SERIES_RECUR':
//       case 'UPDATE_SINGLE':
//         return updateSingleEvent(rxEvent, payload);
//       case 'DELETE_SINGLE_RECUR':
//         return deleteSingleRecurEvent(rxEvent, payload, db);
//       case 'UPDATE_SINGLE_RECUR':
//         return updateSingleRecurEvent(rxEvent, payload, db);
//       case 'UPDATE_FUTURE_RECUR':
//         return updateFutureRecurEvent(rxEvent, payload, db);
//       default:
//         return payload;
//     }
//   } catch (e) {
//     return e;
//   }
// };

// const updateSingleEvent = async (oldEvent, payload) => {
//   await oldEvent[0].update({
//     $set: payload.eventObject
//   });
//   await oldEvent[0].update({
//     $set: {
//       ICALString: IcalStringBuilder.buildICALStringUpdateAll(oldEvent[0])
//     }
//   });
//   return oldEvent[0].toJSON();
// };

// const deleteSingleRecurEvent = async (oldEvent, payload, db) => {
//   const recurPattern = await db.recurrencepatterns
//     .find()
//     .where('originalId')
//     .eq(payload.eventObject.iCalUID)
//     .exec();
//   await recurPattern[0].update({
//     $set: {
//       exDates: [...recurPattern[0].exDates, payload.eventObject.exdate]
//     }
//   });
//   const string = IcalStringBuilder.buildICALStringDeleteRecurEvent(
//     recurPattern,
//     payload.eventObject.exdate,
//     oldEvent[0]
//   );
//   await oldEvent[0].update({
//     $set: {
//       ICALString: string
//     }
//   });
//   return oldEvent[0].toJSON();
// };

// const updateSingleRecurEvent = async (oldEvent, payload, db) => {
//   const eventObj = payload.eventObject;
//   const recurPattern = await db.recurrencepatterns
//     .find()
//     .where('originalId')
//     .eq(payload.eventObject.iCalUID)
//     .exec();
//   await recurPattern[0].update({
//     $set: {
//       recurrenceIds: [...recurPattern[0].recurrenceIds, payload.eventObject.start.dateTime]
//     }
//   });
//   await oldEvent[0].update({
//     $set: {
//       ICALString: IcalStringBuilder.buildICALStringUpdateOnly(payload.eventObject, oldEvent[0])
//     }
//   });
//   return oldEvent[0];
// };

// const updateFutureRecurEvent = async (oldEvent, payload, db) => {
//   const { eventObject } = payload;
//   const recurPattern = await db.recurrencepatterns
//     .findOne()
//     .where('originalId')
//     .eq(payload.eventObject.originalId)
//     .exec();
//   const seriesEndDateTime = recurPattern.until;
//   const updatedUntil = moment(eventObject.start)
//     .subtract(1, 'days')
//     .format('YYYY-MM-DDTHH:mm:ss');
//   await recurPattern.update({
//     $set: {
//       until: updatedUntil
//     }
//   });
//   const updatedId = uuidv1();
//   const updatedUid = uuidv1();
//   const newRecurPattern = await db.recurrencepatterns.upsert({
//     id: updatedId,
//     originalId: updatedUid,
//     freq: payload.options.rrule.freq,
//     interval: payload.options.rrule.interval,
//     exDates: recurPattern.exDates,
//     recurrenceIds: recurPattern.recurrenceIds,
//     until: seriesEndDateTime
//   });
//   Object.assign(eventObject, {
//     id: updatedId,
//     iCalUID: updatedUid,
//     start: {
//       dateTime: eventObject.start,
//       timezone: 'US/Pacific'
//     },
//     end: {
//       dateTime: eventObject.end,
//       timezone: 'US/Pacific'
//     }
//   });
//   const newEvent = await db.events.upsert(eventObject);
//   Object.assign(eventObject, {
//     id: updatedId,
//     uid: updatedUid,
//     dtstart: eventObject.start.dateTime,
//     dtend: eventObject.start.dateTime
//   });
//   const newRrule = {
//     freq: payload.options.rrule.freq,
//     interval: payload.options.rrule.interval,
//     until: seriesEndDateTime
//   };
//   const newIcalString = IcalStringBuilder.toICALString(eventObject, {
//     isRecurring: true,
//     rrule: {
//       freq: newRecurPattern.freq,
//       interval: 1,
//       until: newRecurPattern.until
//     },
//     hasAttendees: false,
//     hasAlarm: false
//   });
//   const updatedIcalString = IcalStringBuilder.updateICALStringRrule(oldEvent, {
//     freq: recurPattern.freq,
//     interval: 1,
//     until: recurPattern.until
//   });
//   await oldEvent.update({
//     $set: {
//       ICALString: updatedIcalString
//     }
//   });
//   await newEvent.update({
//     $set: {
//       ICALString: newIcalString,
//       etag: oldEvent.etag
//     }
//   });
//   const calendar = new dav.Calendar();
//   calendar.url = eventObject.url;
//   const data = updatedIcalString;
//   const xhrObject = new dav.transport.Basic(
//     new dav.Credentials({
//       username: Credentials.ICLOUD_USERNAME,
//       password: Credentials.ICLOUD_PASSWORD
//     })
//   );
//   const calendarObject = {
//     data,
//     filename: `${uuidv1()}.ics`,
//     xhr: xhrObject
//   };
//   const resp = await dav.createCalendarObject(calendar, calendarObject);
//   // debugger;
//   return oldEvent;
// };
