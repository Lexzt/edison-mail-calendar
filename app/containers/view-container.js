import { withRouter } from 'react-router-dom';
import { connect } from 'react-redux';
import View from '../components/view';
import {
  beginGoogleAuth,
  successGoogleAuth,
  expiredGoogleAuth,
  beginOutlookAuth,
  successOutlookAuth,
  expiredOutlookAuth,
  beginExchangeAuth,
  successExchangeAuth,
  beginCaldavAuth,
  successCaldavAuth
} from '../actions/auth';
import { retrieveStoreEvents } from '../actions/db/events';
import {
  beginGetGoogleEvents,
  beginGetOutlookEvents,
  beginGetExchangeEvents,
  beginGetCaldavEvents,
  beginDeleteEvent,
  clearAllEvents,
  beginPollingEvents,
  endPollingEvents,
  beginPendingActions,
  endPendingActions,
  beginDeleteRecurrenceSeries,
  beginDeleteFutureRecurrenceSeries,
  editEventsBeginCaldav
} from '../actions/events';
import {
  beginRetrieveCaldavEvents,
  resetCaldavAccount,
  beginDeleteCalendarObject,
  beginUpdateCalendarObject,
  beginCreateCalendarObject
} from '../actions/caldav';
import getFilteredEvents from '../selectors/ui-selector';

const mapStateToProps = (state) => ({
  events: getFilteredEvents(state),
  initialSync: state.events.initialSync,
  isAuth: state.auth.isAuth,
  providers: state.auth.providers,
  expiredProviders: state.auth.expiredProviders,
  deletedEventId: state.events.deletedEventId
});

const mapDispatchToProps = (dispatch) => ({
  // Google
  beginGetGoogleEvents: (user) => dispatch(beginGetGoogleEvents(user)),
  beginGoogleAuth: () => dispatch(beginGoogleAuth()),

  // Outlook
  beginGetOutlookEvents: (resp) => dispatch(beginGetOutlookEvents(resp)),
  beginOutlookAuth: () => dispatch(beginOutlookAuth()),

  // Exchange
  beginGetExchangeEvents: (resp) => dispatch(beginGetExchangeEvents(resp)),
  beginExchangeAuth: (user) => dispatch(beginExchangeAuth(user)),

  // Caldav
  beginGetCaldavEvents: (resp) => dispatch(beginGetCaldavEvents(resp)),
  beginCaldavAuth: (user) => dispatch(beginCaldavAuth(user)),

  // Get from database List of Events
  retrieveStoreEvents: (providerType, user) => dispatch(retrieveStoreEvents(providerType, user)),

  // CRUD - Delete Operations
  beginDeleteEvent: (id) => dispatch(beginDeleteEvent(id)),
  beginDeleteRecurrenceSeries: (id) => dispatch(beginDeleteRecurrenceSeries(id)),
  beginDeleteFutureRecurrenceSeries: (id) => dispatch(beginDeleteFutureRecurrenceSeries(id)),

  // Removes all events from local database only.
  clearAllEvents: () => dispatch(clearAllEvents()),

  // On Start, automatic login users if not expired.
  onStartGetGoogleAuth: (user) => dispatch(successGoogleAuth(user)),
  onStartGetOutlookAuth: (user) => dispatch(successOutlookAuth(user)),
  onStartGetExchangeAuth: (user) => dispatch(successExchangeAuth(user)),
  onStartGetCaldavAuth: (user) => dispatch(successCaldavAuth(user)),

  // On Start, if user is expired for some reason.
  onExpiredOutlook: (user) => dispatch(expiredOutlookAuth(user)),
  onExpiredGoogle: (user) => dispatch(expiredGoogleAuth(user)),

  // Start/End Polling actions for sync
  beginPollingEvents: () => dispatch(beginPollingEvents()),
  endPollingEvents: () => dispatch(endPollingEvents()),

  // Start/End Pending actions for offline actions
  beginPendingActions: (providers) => dispatch(beginPendingActions(providers)),
  endPendingActions: () => dispatch(endPendingActions()),

  // CalDav Accounts
  beginRetrieveCalDavEvents: () => dispatch(beginRetrieveCaldavEvents()),
  resetCaldavAccount: () => dispatch(resetCaldavAccount()),

  // CalDav CRUD Operations
  beginDeleteCalendarObject: (eventId) => dispatch(beginDeleteCalendarObject(eventId)),
  beginUpdateCalendarObject: (event) => dispatch(beginUpdateCalendarObject(event)),
  editEventsBeginCaldav: (currentEvent) => dispatch(editEventsBeginCaldav(currentEvent)),
  beginCreateCalendarObject: (payload) => dispatch(beginCreateCalendarObject(payload))
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(View));
