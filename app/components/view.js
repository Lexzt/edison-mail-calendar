import React, { Children, Component } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import Modal from 'react-modal';
import RRule from 'rrule';

import * as ProviderTypes from '../utils/constants';
import SignupSyncLink from './SignupSyncLink';
import serverUrls from '../utils/serverUrls';
import {
  FASTMAIL_USERNAME,
  FASTMAIL_PASSWORD,
  ICLOUD_USERNAME,
  ICLOUD_PASSWORD,
  YAHOO_USERNAME,
  YAHOO_PASSWORD
} from '../utils/Credentials';
import * as ServerColors from '../utils/colors';

import UserBlock from '../sequelizeDB/schemas/users';
import EventBlock from '../sequelizeDB/schemas/events';
import RpBlock from '../sequelizeDB/schemas/recurrencePatterns';
import * as dbRpOperations from '../sequelizeDB/operations/recurrencepatterns';

const dav = require('dav');
const uuidv1 = require('uuid/v1');

const localizer = momentLocalizer(moment);
const DragAndDropCalendar = withDragAndDrop(Calendar);

const customStyles = {
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)'
  }
};

const CURRENT_DATE = moment().toDate();
const dateClassStyleWrapper = ({ children, value }) =>
  React.cloneElement(Children.only(children), {
    style: {
      ...children.style,
      backgroundColor: value < CURRENT_DATE ? 'lightgreen' : 'lightblue'
    }
  });

export default class View extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      currentEvent: [{}],
      isShowEvent: false,
      currentEventStartDateTime: '',
      currentEventEndDateTime: '',
      exchangeEmail: 'e0176993@u.nus.edu',
      exchangePwd: 'Ggrfw4406@nus6'
    };
    let incrementalSync;

    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);

    dav.debug.enabled = true;
  }

  componentWillMount() {
    Modal.setAppElement('body');
  }

  async componentDidMount() {
    const { props } = this;

    // const qwe = await UserBlock.findAll();
    // console.log(qwe.map((e) => e.toJSON()));
    const eventData = await EventBlock.findAll();
    console.log(eventData.map((e) => e.toJSON()));
    const rpData = await RpBlock.findAll();
    console.log(rpData.map((e) => e.toJSON()));

    // // THIS UPLOADS ALL RECURRING ICLOUD EVENTS TO YAHOO MAIL
    // const uniqueEventiCalStrings = rpData
    //   .map((rp) => rp.iCalUID)
    //   .map((iCalUID) => eventData.filter((event) => event.iCalUID === iCalUID)[0])
    //   .filter((event) => event !== undefined)
    //   .map((event) => event.toJSON().iCALString);

    // debugger;
    // // Parse user information from account layer to dav object.
    // const xhrObject = new dav.transport.Basic(
    //   new dav.Credentials({
    //     username: YAHOO_USERNAME,
    //     password: YAHOO_PASSWORD
    //   })
    // );

    // const calendar = new dav.Calendar();
    // const caldavUrl =
    //   'https://caldav.calendar.yahoo.com/dav/oj242dvo2jivt6lfbyxqfherdqulvbiaprtaw5kv/Calendar/Fong%20Zhi%20Zhong/';
    // calendar.url = caldavUrl;

    // debugger;
    // uniqueEventiCalStrings
    //   .map((string) => string.replace(/ICloud/g, 'Yahoo'))
    //   .map((iCalString) => {
    //     debugger;
    //     const newETag = uuidv1();
    //     const addCalendarObject = {
    //       data: iCalString,
    //       filename: `${newETag}.ics`,
    //       xhr: xhrObject
    //     };
    //     const addResult = dav.createCalendarObject(calendar, addCalendarObject);
    //     return addResult;
    //   });
    // const results = await Promise.all(uniqueEventiCalStrings);
    // debugger;

    UserBlock.findAll().then((providerUserData) => {
      providerUserData.forEach((singleProviderUserData) => {
        if (singleProviderUserData.providerType === ProviderTypes.EXCHANGE) {
          props.onStartGetExchangeAuth(
            this.filterUserOnStart(singleProviderUserData, ProviderTypes.EXCHANGE)
          );
        } else if (singleProviderUserData.providerType === ProviderTypes.CALDAV) {
          props.onStartGetCaldavAuth(
            this.filterUserOnStart(singleProviderUserData, ProviderTypes.CALDAV)
          );
        } else {
          const now = new Date().getTime();
          const isExpired = now > parseInt(singleProviderUserData.accessTokenExpiry, 10);

          if (!isExpired) {
            switch (singleProviderUserData.providerType) {
              case ProviderTypes.GOOGLE:
                props.onStartGetGoogleAuth(
                  this.filterUserOnStart(singleProviderUserData, ProviderTypes.GOOGLE)
                );
                break;
              case ProviderTypes.OUTLOOK:
                props.onStartGetOutlookAuth(
                  this.filterUserOnStart(singleProviderUserData, ProviderTypes.OUTLOOK)
                );
                break;
              default:
                break;
            }
          } else {
            switch (singleProviderUserData.providerType) {
              case ProviderTypes.GOOGLE:
                props.onExpiredGoogle(
                  this.filterUserOnStart(singleProviderUserData, ProviderTypes.GOOGLE)
                );
                break;
              case ProviderTypes.OUTLOOK:
                props.onExpiredOutlook(
                  this.filterUserOnStart(singleProviderUserData, ProviderTypes.OUTLOOK)
                );
                break;
              default:
                break;
            }
          }
        }
      });
    });
  }

  componentWillUnmount() {
    clearInterval(this.incrementalSync);
    this.incrementalSync = null;
  }

  authorizeOutLookCodeRequest = () => {
    const { props } = this;
    props.beginOutlookAuth();
  };

  authorizeGoogleCodeRequest = () => {
    const { props } = this;
    props.beginGoogleAuth();
  };

  authorizeExchangeCodeRequest = (user, pwd) => {
    const { props } = this;
    props.beginExchangeAuth(user, pwd);
  };

  authorizeCaldavCodeRequest = (user, pwd, type) => {
    const { props } = this;
    let url = '';
    switch (type) {
      case 'ICLOUD':
        url = serverUrls.ICLOUD;
        break;
      case 'FASTMAIL':
        url = serverUrls.FASTMAIL;
        break;
      case 'YAHOO':
        url = serverUrls.YAHOO;
        break;
      case 'GOOGLE':
        url = serverUrls.GOOGLE;
        break;
      case 'GMX':
        url = serverUrls.GMX;
        break;
      default:
        break;
    }

    props.beginCaldavAuth({
      username: user,
      password: pwd,
      url
    });
  };

  // Calendar Event Functions
  moveEventList = ({ event, start, end }) => {
    const { events } = this.props;
    const { props } = this;

    const idx = events.indexOf(event);
    const updatedEvent = { ...event, start, end };

    const nextEvents = [...events];
    nextEvents.splice(idx, 1, updatedEvent);
    props.updateEvents(nextEvents);
  };

  resizeEvent = (resizeType, { event, start, end }) => {
    const { events } = this.props;
    const { props } = this;

    const nextEvents = events.map((existingEvent) =>
      existingEvent.id === event.id ? { ...existingEvent, start, end } : existingEvent
    );
    props.updateEvents(nextEvents);
  };

  addEvent = ({ start, end }) => {
    const { props } = this;
    props.history.push(`/${start}/${end}`);
  };

  editEvent = () => {
    const { props, state } = this;
    props.history.push(`/${state.currentEvent.id}`);
  };

  handleEventClick = (event) => {
    this.setState({
      isShowEvent: true,
      currentEvent: event,
      currentEventStartDateTime: moment(event.start).format('D, MMMM YYYY, h:mm a'),
      currentEventEndDateTime: moment(event.end).format('D, MMMM Do YYYY, h:mm a')
    });
  };

  handleChange = (event) => {
    this.setState({ [event.target.name]: event.target.value });
  };

  handleSubmit = async (e) => {
    e.preventDefault();
    const { state } = this;

    this.authorizeExchangeCodeRequest({
      username: state.exchangeEmail,
      password: state.exchangePwd
    });
    // this.authorizeCaldavCodeRequest(FASTMAIL_USERNAME, FASTMAIL_PASSWORD, 'FASTMAIL');
    // this.authorizeCaldavCodeRequest(ICLOUD_USERNAME, ICLOUD_PASSWORD, 'ICLOUD');
    this.authorizeCaldavCodeRequest(YAHOO_USERNAME, YAHOO_PASSWORD, 'YAHOO');
  };

  // This filter user is used when the outlook first creates the object.
  // It takes the outlook user object, and map it to the common schema defined in db/person.js
  filterUserOnStart = (rxDoc, providerType) => ({
    user: {
      caldavType: rxDoc.caldavType,
      personId: rxDoc.personId,
      originalId: rxDoc.originalId,
      email: rxDoc.email,
      providerType,
      accessToken: rxDoc.accessToken,
      accessTokenExpiry: rxDoc.accessTokenExpiry,
      password: rxDoc.password,
      url: rxDoc.url
    }
  });

  closeModal = () => {
    this.setState({
      isShowEvent: false
    });
  };

  deleteEvent = () => {
    const { props, state } = this;
    props.beginDeleteEvent(state.currentEvent.id);
    this.closeModal();
  };

  deleteAllRecurrenceEvent = () => {
    const { props, state } = this;
    props.beginDeleteRecurrenceSeries(state.currentEvent.id);
    this.closeModal();
  };

  deleteFutureRecurrenceEvent = () => {
    const { props, state } = this;
    props.beginDeleteFutureRecurrenceSeries(state.currentEvent.id);
    this.closeModal();
  };

  getVisibleEvents = () => {
    const { props } = this;
    const { events } = props;
    return events;
  };

  getColor = (event) => {
    switch (event.providerType) {
      case ProviderTypes.GOOGLE:
        return ServerColors.GOOGLE_EVENT;
      case ProviderTypes.OUTLOOK:
        return ServerColors.OUTLOOK_EVENT;
      case ProviderTypes.EXCHANGE:
        return ServerColors.EXCHANGE_EVENT;
      case ProviderTypes.CALDAV:
        switch (event.caldavType) {
          case ProviderTypes.ICLOUD:
            return ServerColors.ICLOUD_EVENT;
          case ProviderTypes.FASTMAIL:
            return ServerColors.FASTMAIL_EVENT;
          case ProviderTypes.YAHOO:
            return ServerColors.YAHOO_EVENT;
          default:
            return ServerColors.DEFAULT_EVENT;
        }
      default:
        return ServerColors.DEFAULT_EVENT;
    }
  };

  eventStyleGetter = (event, start, end, isSelected) => {
    const backgroundColor = this.getColor(event);
    const style = {
      backgroundColor
      // borderRadius: '0px',
      // opacity: 0.8,
      // color: 'black',
      // border: '0px',
      // display: 'block'
    };
    return {
      style
    };
  };

  /* Render functions */
  renderCalendar = (props) => {
    const visibleEvents = this.getVisibleEvents();
    return (
      <DragAndDropCalendar
        selectable
        localizer={localizer}
        events={visibleEvents}
        views={{
          month: true,
          day: true
        }}
        onEventDrop={this.moveEventList}
        onEventResize={this.resizeEvent}
        onSelectSlot={this.addEvent}
        onSelectEvent={(event) => this.handleEventClick(event)}
        popup
        resizable
        eventPropGetter={this.eventStyleGetter}
        components={{
          dateCellWrapper: dateClassStyleWrapper
        }}
      />
    );
  };

  renderEventPopup = (state) => (
    <Modal
      isOpen={state.isShowEvent}
      onAfterOpen={this.afterOpenModal}
      onRequestClose={this.closeModal}
      style={customStyles}
      contentLabel="Event Modal"
    >
      <h2 ref={(subtitle) => (this.subtitle = subtitle)}>{state.currentEvent.title}</h2>
      <h4>
        {state.currentEventStartDateTime} - {state.currentEventEndDateTime}
      </h4>
      <button type="button" onClick={this.closeModal}>
        Close
      </button>
      <button type="button" onClick={this.deleteEvent}>
        Delete
      </button>
      <button type="button" onClick={this.editEvent}>
        Edit
      </button>
      <button type="button" onClick={this.deleteAllRecurrenceEvent}>
        Delete Series
      </button>
      <button type="button" onClick={this.deleteFutureRecurrenceEvent}>
        Delete this and Future Events
      </button>
    </Modal>
  );

  renderSignupLinks = (props, state) => {
    const providers = [];
    for (const providerType of Object.keys(props.expiredProviders)) {
      let providerFunc;
      switch (providerType) {
        case ProviderTypes.GOOGLE:
          providerFunc = () => this.authorizeGoogleCodeRequest();
          break;
        case ProviderTypes.OUTLOOK:
          providerFunc = () => this.authorizeOutLookCodeRequest();
          break;
        case ProviderTypes.EXCHANGE:
          // Exchange provider does not expire, I think, so here is empty.
          // If it does expire, write some code here to handle it.
          break;
        case ProviderTypes.CALDAV:
          // Yet to test which caldav providers expire, based on their own login system.
          // For now, we assume its BASIC auth, and no expiry.
          break;
        default:
          console.log('Provider not accounted for!!');
          break;
      }

      providers.push(
        <SignupSyncLink
          key={providerType}
          providerType={providerType}
          providerInfo={props.expiredProviders[providerType]}
          providerFunc={() => providerFunc()}
        />
      );
    }

    return (
      <div>
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          onClick={() => props.beginPollingEvents()}
        >
          <i className="material-icons left">close</i>Begin Poll Events
        </a>{' '}
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          onClick={() => props.endPollingEvents()}
        >
          <i className="material-icons left">close</i>End Poll Events
        </a>{' '}
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          onClick={() => props.beginPendingActions(props.providers)}
        >
          <i className="material-icons left">close</i>Begin Pending Actions
        </a>{' '}
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          onClick={() => props.endPendingActions()}
        >
          <i className="material-icons left">close</i>End Pending Actions
        </a>{' '}
        <form onSubmit={this.handleSubmit}>
          <input
            type="text"
            name="exchangeEmail"
            value={state.exchangeEmail}
            onChange={this.handleChange}
            placeholder="Exchange Email"
          />
          <input
            type="text"
            name="exchangePwd"
            value={state.exchangePwd}
            onChange={this.handleChange}
            placeholder="Exchange Password"
          />

          <input type="submit" value="Submit" />
        </form>
        {/* this is for out of sync tokens. */}
        {providers}
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          onClick={() => this.authorizeGoogleCodeRequest()}
        >
          <i className="material-icons left">cloud</i>Sign in with Google
        </a>
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          onClick={() => this.authorizeOutLookCodeRequest()}
        >
          <i className="material-icons left">cloud</i>Sign in with Outlook
        </a>
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          // onClick={() => this.props.beginGetGoogleEvents()}>

          // This is suppose to allow us to sync multiple user per single provider in the future!!
          // Currently, due to no UI, I am hardcoding it to a single instance. But once we get the
          // UI up and running for choosing which user events you want to get, this will be amazing
          // Note: This is the same for the following button, which pulls outlook events.

          // Okay, debate later, coz idk how to deal with it when the user signs in, to update this state here.
          onClick={() => props.beginGetGoogleEvents(props.providers.GOOGLE[0])}
        >
          <i className="material-icons left">cloud_download</i>Get Google Events
        </a>
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          onClick={() => props.beginGetOutlookEvents(props.providers.OUTLOOK[0])}
        >
          <i className="material-icons left">cloud_download</i>Get Outlook Events
        </a>
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          onClick={() => props.beginGetExchangeEvents(props.providers.EXCHANGE)}
        >
          <i className="material-icons left">cloud_download</i>Get Exchange Events
        </a>
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          onClick={() => props.beginGetCaldavEvents(props.providers.CALDAV)}
        >
          <i className="material-icons left">cloud_download</i>Get Caldav Events
        </a>
        <a
          role="button"
          tabIndex="0"
          className="waves-effect waves-light btn"
          onClick={() => props.clearAllEvents()}
        >
          <i className="material-icons left">close</i>Clear all Events
        </a>
      </div>
    );
  };

  render() {
    const { props } = this;
    const { state } = this;
    if (props.isAuth !== undefined) {
      return (
        <div>
          {this.renderSignupLinks(props, state)}
          {this.renderEventPopup(state)}
          {this.renderCalendar(props)}
        </div>
      );
    }
    return <div>Logging in...</div>;
  }
}
