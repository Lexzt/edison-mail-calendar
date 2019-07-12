import { connect } from 'react-redux';
import { withRouter } from 'react-router-dom';
import { withStyles } from '@material-ui/core/styles';
import {
  editEventBegin,
  editEwsSingleEventBegin,
  editEwsFutureEventBegin,
  editEwsAllEventBegin
} from '../actions/events';
import { beginUpdateCalendarObject } from '../actions/caldav';
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
  providers: state.auth.providers,
  updateEventObject: state.events.updateEventObject
});

const mapDispatchToProps = (dispatch) => ({
  editEventBegin: (id, eventObject, providerType) =>
    dispatch(editEventBegin(id, eventObject, providerType)), // This handles google only, parse it into generic.
  beginUpdateCalendarObject: (event, options) =>
    dispatch(beginUpdateCalendarObject(event, options)),

  editEwsSingleEventBegin: (event) => dispatch(editEwsSingleEventBegin(event)),
  editEwsAllEventBegin: (event) => dispatch(editEwsAllEventBegin(event)),
  editEwsFutureEventBegin: (event) => dispatch(editEwsFutureEventBegin(event))
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(withStyles(styles)(EditEvent)));
