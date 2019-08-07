import 'rxjs/Rx';
import { combineEpics } from 'redux-observable';
// import * as caldavEpics from './caldav';
import * as eventsEpics from './events';
import providersEpics from './providers';
import dbEpics from './db';

export default combineEpics(
  // ...Object.values(caldavEpics),
  ...Object.values(eventsEpics),
  ...Object.values(providersEpics),
  ...Object.values(dbEpics)
);
