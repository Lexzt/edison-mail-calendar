import { connect } from 'react-redux';
import { withRouter } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import {
  beginEditEvent,
  beginEditRecurrenceSeries,
  beginEditFutureRecurrenceSeries
} from '../actions/events';
import {
  editCalDavSingleEventBegin,
  editCalDavAllEventBegin,
  editCalDavFutureEventBegin
} from '../actions/providers/caldav';
import {
  editEwsSingleEventBegin,
  editEwsFutureEventBegin,
  editEwsAllEventBegin
} from '../actions/providers/exchange';
import EditEvent from '../components/editEvent';

const styles = (theme) => ({
  // container: {
  //   display: 'flex',
  //   flexWrap: 'wrap'
  // },
  // textField: {
  //   marginLeft: theme.spacing.unit,
  //   marginRight: theme.spacing.unit,
  //   width: 300
  // },
  // margin: {
  //   margin: theme.spacing.unit
  // },
  // cssFocused: {}
});

const mapStateToProps = (state) => ({
  providers: state.auth.providers
});

const mapDispatchToProps = (dispatch) => ({
  // editEventBegin: (id, eventObject, providerType) =>
  //   dispatch(editEventBegin(id, eventObject, providerType)), // This handles google only, parse it into generic.

  editEwsSingleEventBegin: (event) => dispatch(editEwsSingleEventBegin(event)),
  editEwsAllEventBegin: (event) => dispatch(editEwsAllEventBegin(event)),
  editEwsFutureEventBegin: (event) => dispatch(editEwsFutureEventBegin(event)),

  editCalDavSingleEventBegin: (event) => dispatch(editCalDavSingleEventBegin(event)),
  editCalDavAllEventBegin: (event) => dispatch(editCalDavAllEventBegin(event)),
  editCalDavFutureEventBegin: (event) => dispatch(editCalDavFutureEventBegin(event)),

  // CRUD - Delete Operations
  beginEditEvent: (payload) => dispatch(beginEditEvent(payload)),
  beginEditRecurrenceSeries: (payload) => dispatch(beginEditRecurrenceSeries(payload)),
  beginEditFutureRecurrenceSeries: (payload) => dispatch(beginEditFutureRecurrenceSeries(payload))
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withStyles(styles)(EditEvent)));
