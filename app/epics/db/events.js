import {
  map,
  mergeMap,
  // switchMap,
  catchError
} from 'rxjs/operators';
import { ofType } from 'redux-observable';
import { from } from 'rxjs';
import {
  RETRIEVE_STORED_EVENTS,
  BEGIN_STORE_EVENTS,
  duplicateAction,
  updateStoredEvents,
  successStoringEvents,
  failStoringEvents,
  beginStoringEvents,
  retrieveStoreEvents
} from '../../actions/db/events';
import {
  POST_EVENT_SUCCESS,
  GET_EVENTS_SUCCESS,
  DELETE_EVENT_BEGIN,
  deleteEventSuccess,
  DELETE_EVENT_SUCCESS
} from '../../actions/events';
import { deleteGoogleEvent, loadClient } from '../../utils/client/google';
import { asyncDeleteSingleEventById } from '../../utils/client/exchange';
import getDb from '../../db';
import * as Providers from '../../utils/constants';

export const retrieveEventsEpic = action$ =>
  action$.pipe(
    ofType(RETRIEVE_STORED_EVENTS),
    mergeMap(action =>
      from(getDb()).pipe(
        mergeMap(db =>
          from(db.events.find().exec()).pipe(
            map(events =>
              events.filter(
                singleEvent => singleEvent.providerType === action.payload
              )
            ),
            map(events =>
              events.map(singleEvent => ({
                id: singleEvent.id,
                end: singleEvent.end,
                start: singleEvent.start,
                summary: singleEvent.summary,
                organizer: singleEvent.organizer,
                recurrence: singleEvent.recurrence,
                iCalUID: singleEvent.iCalUID,
                attendees: singleEvent.attendees,
                originalId: singleEvent.originalId
              }))
            ),
            map(results => updateStoredEvents(results))
          )
        )
      )
    )
  );

export const storeEventsEpic = action$ =>
  action$.pipe(
    ofType(BEGIN_STORE_EVENTS),
    mergeMap(action =>
      from(storeEvents(action.payload)).pipe(
        map(results => successStoringEvents(results)),
        catchError(error => failStoringEvents(error))
      )
    )
  );

export const beginStoreEventsEpic = action$ =>
  action$.pipe(
    ofType(POST_EVENT_SUCCESS, GET_EVENTS_SUCCESS),
    map(action => beginStoringEvents(action.payload))
  );

export const deleteEventEpics = action$ =>
  action$.pipe(
    ofType(DELETE_EVENT_BEGIN),
    mergeMap(action =>
      from(deleteEvent(action.payload)).pipe(
        // map(results => deleteEventSuccess(results)),
        // catchError(error => failStoringEvents(error))
        map(resp => retrieveStoreEvents(resp))
      )
    )
  );

const updateStoreEvents = payload => {
  console.log(payload);
};

const storeEvents = async payload => {
  const db = await getDb();
  const addedEvents = [];
  const dbUpsertPromises = [];
  const { data } = payload;
  // console.log(payload);
  for (const dbEvent of data) {
    // #TO-DO, we need to figure out how to handle recurrence, for now, we ignore
    if (
      dbEvent.recurringEventId !== undefined &&
      dbEvent.recurringEventId !== null
    ) {
      continue;
    }

    const filteredEvent = Providers.filterIntoSchema(
      dbEvent,
      payload.providerType,
      payload.owner
    );
    filteredEvent.providerType = payload.providerType;
    try {
      dbUpsertPromises.push(db.events.upsert(filteredEvent));
    } catch (e) {
      return e;
    }

    // Adding filtered event coz if I added dbEvent, it will result it non compatability with outlook objects.
    addedEvents.push(filteredEvent);
  }
  await Promise.all(dbUpsertPromises);
  return addedEvents;
};

const deleteEvent = async id => {
  const db = await getDb();
  const query = db.events
    .find()
    .where('id')
    .eq(id);
  const datas = await query.exec();
  if (datas.length !== 1) {
    console.error('Omg, actually a collision?');
  }
  const users = await db.persons
    .find()
    .where('providerType')
    .eq(datas[0].providerType)
    .where('email')
    .eq(datas[0].owner)
    .exec();

  if (users.length !== 1) {
    console.error('Omg, actually a collision?');
  }

  const data = datas[0];
  const user = users[0];

  switch (data.providerType) {
    case Providers.GOOGLE:
      await loadClient();
      const responseFromAPI = await deleteGoogleEvent(data.get('originalId'));
      await query.remove();
      break;
    case Providers.OUTLOOK:
      console.log('Outlook, To-Do delete feature');
      break;
    case Providers.EXCHANGE:
      await asyncDeleteSingleEventById(
        user.email,
        user.password,
        'https://outlook.office365.com/Ews/Exchange.asmx',
        data.get('originalId')
      );
      await query.remove();
      break;
    default:
      console.log(`Delete feature for ${data.providerType} not handled`);
      break;
  }

  return data.providerType;
};