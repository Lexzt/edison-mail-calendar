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
  beginDeleteEvent,
  clearAllEvents,
  beginPollingEvents,
  endPollingEvents,
  beginPendingActions,
  endPendingActions,
  beginDeleteRecurrenceSeries,
  beginDeleteFutureRecurrenceSeries
} from '../actions/events';
import { beginGetCaldavEvents } from '../actions/providers/caldav';
import { beginGetExchangeEvents } from '../actions/providers/exchange';
import { beginGetOutlookEvents } from '../actions/providers/outlook';
import getFilteredEvents from '../selectors/ui-selector';

const mapStateToProps = (state) => ({
  events: getFilteredEvents(state),
  initialSync: state.events.initialSync,
  isAuth: state.auth.isAuth,
  providers: state.auth.providers,
  expiredProviders: state.auth.expiredProviders
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
  retrieveStoreEvents: (user) => dispatch(retrieveStoreEvents(user)),

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
  beginPollingEvents: (users) => dispatch(beginPollingEvents(users)),
  endPollingEvents: () => dispatch(endPollingEvents()),

  // Start/End Pending actions for offline actions
  beginPendingActions: (providers) => dispatch(beginPendingActions(providers)),
  endPendingActions: () => dispatch(endPendingActions())
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(View));
