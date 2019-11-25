import React, { Children, Component } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import Modal from 'react-modal';
import RRule from 'rrule';
import ICAL from 'ical.js';
import fileSystem from 'fs';

import {
  ExchangeService,
  Uri,
  ExchangeCredentials,
  WellKnownFolderName,
  FolderView,
  Appointment,
  DateTime,
  FolderId,
  SendInvitationsMode,
  MessageBody,
  Item,
  CalendarView,
  ConflictResolutionMode,
  SendInvitationsOrCancellationsMode,
  DeleteMode
} from 'ews-javascript-api';
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
import {
  asyncCreateExchangeEvent,
  createNewEwsRecurrenceObj,
  editEwsRecurrenceObj,
  asyncGetRecurrAndSingleExchangeEvents,
  asyncDeleteExchangeEvent,
  asyncUpdateExchangeEvent
} from '../utils/client/exchange';
import { asyncGetAllExchangeEvents } from '../utils/client/exchangebasics';

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

    // dav.debug.enabled = true;
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

    moment(); // In case I need moment for debugging in this function
    // debugger;

    // #region Checking of Event Data against Recurrence Patterns
    // // This is for checking if your recurrence pattern has the proper exdates and recurrenceIds
    // rpData.forEach((rp) => {
    //   let json = rp.toJSON();
    //   console.log(json);
    //   let events = eventData.filter((event) => event.iCalUID === json.originalId);
    //   console.log(events);
    //   console.log(events[0].summary, json.exDates, json.recurrenceIds);
    // });
    // #endregion

    // #region UPLOADING LOCAL EVENTS TO EWS
    // // This does not work as ews has some end point limitation due to concurrent connection
    // // Therefore, I have forsaken this code to the depths of idgaf of it anymore.
    // // If you want to move caldav events to ews, export from apple calendar and move it via .ics file.
    // const uploading = [];

    // const tempMap = new Map();
    // eventData.forEach((e) => {
    //   const json = e.toJSON();

    //   if (json.isRecurring) {
    //     let listOfEvent;
    //     if (tempMap.get(json.iCalUID) === undefined) {
    //       listOfEvent = [];
    //     } else {
    //       listOfEvent = tempMap.get(json.iCalUID);
    //     }

    //     listOfEvent.push(json);
    //     tempMap.set(json.iCalUID, listOfEvent);
    //   }
    // });

    // const tempOutput = [];
    // tempMap.forEach((v, k) => {
    //   const rp = rpData.filter((tempRp) => tempRp.originalId === k)[0].toJSON();
    //   tempOutput.push({ events: v, rp });
    // });
    // const fileOutput = tempOutput.map((e) => ({
    //   fileName: this.buildTitleStringFromRP(e),
    //   events: e.events,
    //   rp: e.rp
    // }));

    // let countIgnoring = 0;
    // let countCreated = 0;

    // try {
    //   for (let i = 20; i < 30; i += 1) {
    //     // Firstly, lets ignore yearly events as too hard to test atm.
    //     if (fileOutput[i].rp.freq === 'YEARLY') {
    //       console.log('Got a yearly event, ignoring');
    //       countIgnoring += 1;
    //       continue;
    //     }

    //     if (fileOutput[i].rp.freq === 'MONTHLY') {
    //       console.log('Got a monthly event, ignoring');
    //       countIgnoring += 1;
    //       continue;
    //     }

    //     countCreated += 1;

    //     // if (fileOutput[i].fileName !== 'Monthly Event, Trice a month, Till Date, 1 Deleted') {
    //     //   continue;
    //     // }
    //     // debugger;
    //     // const obj = fileOutput[0];
    //     const obj = fileOutput[i];
    //     console.log('Working on ', fileOutput[i].fileName);

    //     // Find a non edited/deleted event
    //     const deletedEvents = [];
    //     const editedEvents = [];
    //     if (typeof obj.rp.exDates === 'number') {
    //       deletedEvents.push(obj.rp.exDates);
    //     } else if (obj.rp.exDates !== '') {
    //       deletedEvents.push(...obj.rp.exDates.split(','));
    //     }

    //     if (typeof obj.rp.recurrenceIds === 'number') {
    //       editedEvents.push(obj.rp.recurrenceIds);
    //     } else if (obj.rp.recurrenceIds !== '') {
    //       editedEvents.push(...obj.rp.recurrenceIds.split(','));
    //     }

    //     // Need to sort as we need to find the earliest item to expand to
    //     const nonEditedEvent = obj.events
    //       .filter((event) => ![...deletedEvents, ...editedEvents].includes(event.start.dateTime))
    //       .sort((event1, event2) => event1.start.dateTime > event2.start.dateTime)[0];

    //     const editedEventsData = obj.events.filter((event) =>
    //       [...editedEvents].includes(event.start.dateTime)
    //     );

    //     // First, I need to create the object with the recurrence pattern.
    //     // We ignore creation of single events as there is barely any code difference
    //     // eslint-disable-next-line no-loop-func
    //     const promise = new Promise(async (resolve, reject) => {
    //       // Create Exchange Service and set up credientials
    //       const exch = new ExchangeService();
    //       exch.Url = new Uri('https://outlook.office365.com/Ews/Exchange.asmx');
    //       exch.Credentials = new ExchangeCredentials('e0176993@u.nus.edu', 'Ggrfw4406@nus6');

    //       // Posting event so create new appointment
    //       const newEvent = new Appointment(exch);

    //       const startDate = new DateTime(
    //         moment.tz(nonEditedEvent.start.dateTime * 1000, nonEditedEvent.start.timezone)
    //       );
    //       console.log(startDate);
    //       const endDate = new DateTime(
    //         moment.tz(nonEditedEvent.end.dateTime * 1000, nonEditedEvent.end.timezone)
    //       );

    //       // Map variables from local to server object
    //       newEvent.Subject = `(Exchange) ${fileOutput[i].fileName}`;
    //       newEvent.Body = new MessageBody(nonEditedEvent.description);
    //       newEvent.Start = startDate;
    //       newEvent.End = endDate;

    //       if (nonEditedEvent.isRecurring) {
    //         const newRecurrencePattern = {};
    //         const updatedId = uuidv1();
    //         const updatedUid = uuidv1();
    //         // debugger;

    //         const until = ICAL.Time.now();
    //         until.fromUnixTime(obj.rp.until);

    //         // eslint-disable-next-line no-underscore-dangle
    //         const ewsReucrr = createNewEwsRecurrenceObj(
    //           obj.rp.freq,
    //           [0, obj.rp.weeklyPattern.split(','), 0, 0],
    //           obj.rp.interval,
    //           startDate,
    //           until,
    //           obj.rp.numberOfRepeats,
    //           obj.rp.byMonth,
    //           obj.rp.byMonthDay,
    //           obj.rp.byWeekDay.slice(1, -1),
    //           obj.rp.byWeekNo.slice(1, -1)
    //           // jsonRecurr.BYMONTH,
    //           // jsonRecurr.BYMONTHDAY,
    //           // jsonRecurr.BYDAY,
    //           // jsonRecurr.BYSETPOS
    //         );
    //         newEvent.Recurrence = ewsReucrr;
    //         console.log(ewsReucrr);
    //       }

    //       await exch
    //         .FindFolders(WellKnownFolderName.Calendar, new FolderView(10))
    //         .then(async (result) => {
    //           const uploadingId = result.folders.filter(
    //             (folder) => folder.DisplayName === 'Uploading Calendar'
    //           )[0];

    //           // Save to create a new event
    //           await newEvent.Save(uploadingId.Id, SendInvitationsMode.SendToAllAndSaveCopy).then(
    //             // On success
    //             async () => {
    //               // Re-get the new item with new variables set by EWS
    //               // Needed for editing/deleting of single event somehow.
    //               const item = await Appointment.Bind(exch, newEvent.Id);
    //               console.log(item.Subject, item.Start.ToString());
    //               debugger;

    //               if (item.AppointmentType === 'Single') {
    //                 // Don't need to do anything as single item is assumed as always okay.
    //               } else if (item.AppointmentType === 'RecurringMaster') {
    //                 // First, we deal with the deleted events
    //                 // Deleted events are easier to deal with as there is no change of information
    //                 // and we can just nuke the event away from existance basically.
    //                 // However, as shown in the delete function, you need to know the appt
    //                 // In order to know the appt of the expanded recurrence series,
    //                 // you need to get the expanded series from ews itself first.

    //                 // Get all appointments
    //                 const allAppt = await asyncGetAllExchangeEvents(exch);

    //                 // Filter allAppt down by iCalUID as that is the only link between them.
    //                 const newExpandedEvents = allAppt.filter(
    //                   (newAppt) => newAppt.ICalUid === item.ICalUid
    //                 );

    //                 // Now, we need to handle edited events.
    //                 // Edited events are abit more tricky as we need to update the param
    //                 // and then call the update function before we can use it.
    //                 // The idea here is pretty simple, for every edited event that was defined in caldav
    //                 // We find the corresponding event from the server and
    //                 // edit it according to the local object
    //                 const editedPromise = editedEventsData.map((dbEditedEvent) => {
    //                   // Find the right event by time
    //                   // This should be a single appointment
    //                   const editingAppts = newExpandedEvents.filter(
    //                     (singleAppt) =>
    //                       singleAppt.Start.getMomentDate().unix() === dbEditedEvent.start.dateTime
    //                   );

    //                   if (editingAppts.length !== 1) {
    //                     console.log('What is going on? ', editingAppts.length);
    //                   }

    //                   const foundEditedAppointment = editingAppts[0];
    //                   // Since for now, we are assuming only the title is being changed,
    //                   // I will do that again
    //                   const newSummary = dbEditedEvent.summary.replace('ICloud', 'Exchange');
    //                   foundEditedAppointment.Subject = newSummary;
    //                   // TO-DO, ADD MORE FIELDS HERE LATER

    //                   // Return the promise and let outter promise,.all handle.
    //                   return foundEditedAppointment
    //                     .Update(
    //                       ConflictResolutionMode.AlwaysOverwrite,
    //                       SendInvitationsOrCancellationsMode.SendToNone
    //                     )
    //                     .then(
    //                       (success) => {
    //                         console.log(success);
    //                       },
    //                       (error) => {
    //                         console.log(error);
    //                       }
    //                     );
    //                 });
    //                 await Promise.all(editedPromise);
    //                 debugger;
    //                 // Now for each appointment that has been expanded,
    //                 // we need to find the right one to delete
    //                 // As its an async call to delete, we map and promise await inside.
    //                 const deletePromise = deletedEvents.map((deletedEpochTime) => {
    //                   // Find the right event by time
    //                   const deletingAppts = newExpandedEvents.filter(
    //                     (singleAppt) => singleAppt.Start.getMomentDate().unix() === deletedEpochTime
    //                   );
    //                   return deletingAppts.map((deletingAppt) =>
    //                     deletingAppt.Delete(DeleteMode.MoveToDeletedItems).then(
    //                       (success) => {
    //                         console.log(success);
    //                       },
    //                       (error) => {
    //                         console.log(error);
    //                       }
    //                     )
    //                   );
    //                 });
    //                 await Promise.all(deletePromise);
    //                 debugger;
    //               }
    //               console.log('Done!!');
    //               resolve('Done'); // Return null as all okay
    //             },
    //             // On error
    //             async (error) => {
    //               console.log(error);
    //               debugger;
    //             }
    //           );
    //         });
    //     });
    //   }
    // } catch (e) {
    //   console.log(e);
    //   debugger;
    // }
    // #endregion

    // #region CREATING TEST CASE DATASET RESULTS
    // // This creates the map for outputing of the test cases for caldav.
    // // First you need the sample map in the database.
    // // If not, there is no data accordingly.
    // // You need to have the testcases folder available. Just make it.
    // const tempMap = new Map();
    // eventData.forEach((e) => {
    //   const json = e.toJSON();

    //   if (json.isRecurring) {
    //     let listOfEvent;
    //     if (tempMap.get(json.iCalUID) === undefined) {
    //       listOfEvent = [];
    //     } else {
    //       listOfEvent = tempMap.get(json.iCalUID);
    //     }

    //     listOfEvent.push(json);
    //     tempMap.set(json.iCalUID, listOfEvent);
    //   }
    // });

    // const tempOutput = [];
    // tempMap.forEach((v, k) => {
    //   const rp = rpData.filter((tempRp) => tempRp.originalId === k)[0].toJSON();
    //   tempOutput.push({ events: v, rp });
    // });
    // const fileOutput = tempOutput.map((e) => ({
    //   fileName: this.buildTitleStringFromRP(e),
    //   events: e.events,
    //   rp: e.rp
    // }));

    // for (let i = 0; i < fileOutput.length; i += 1) {
    //   const obj = fileOutput[i];
    //   fileSystem.writeFileSync(
    //     `testoutput/${obj.fileName}.json`,
    //     JSON.stringify(obj, null, '\t'),
    //     (err) => console.log(err)
    //   );
    // }
    // #endregion CREATING TEST CASE DATASET RESULTS

    // #region UPLOADING LOCAL EVENTS TO CALDAV
    // // THIS UPLOADS ALL RECURRING ICLOUD EVENTS TO YAHOO MAIL
    // // ONLY UNCOMMENT IF YOU WANT TO DO THAT,
    // // ELSE YOU GONNA GET A INSANE AMOUNT OF EVENTS IN YOUR CALENDAR
    // debugger;
    // const uniqueEventiCalStrings = rpData
    //   .map((rp) => rp.iCalUID)
    //   .map((iCalUID) => eventData.filter((event) => event.iCalUID === iCalUID)[0])
    //   .filter((event) => event !== undefined)
    //   .map((event) => event.toJSON().iCALString);

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
    // const uploadRequest = uniqueEventiCalStrings
    //   .map((string) => {
    //     const vcalendar = new ICAL.Component(ICAL.parse(string.replace(/ICloud/g, 'Yahoo')));
    //     const newics = uuidv1();
    //     vcalendar.getAllSubcomponents('vevent').forEach((vevent) => {
    //       vevent.updatePropertyWithValue('uid', newics);
    //     });
    //     return vcalendar.toString();
    //   })
    //   .map((iCalString) => {
    //     const newETag = uuidv1();
    //     const addCalendarObject = {
    //       data: iCalString,
    //       filename: `${newETag}.ics`,
    //       xhr: xhrObject
    //     };
    //     const addResult = dav.createCalendarObject(calendar, addCalendarObject);
    //     return addResult;
    //   });
    // const results = await Promise.all(uploadRequest);
    // #endregion

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

  buildTitleStringFromRP = (e) => {
    const { rp, events } = e;
    const str = events[0].summary
      .replace(/\(.*?\)/, '')
      .trim()
      .replace(/\//g, ',');
    return str;
  };

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
    console.log(event);
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
    this.authorizeCaldavCodeRequest(ICLOUD_USERNAME, ICLOUD_PASSWORD, 'ICLOUD');
    // this.authorizeCaldavCodeRequest(YAHOO_USERNAME, YAHOO_PASSWORD, 'YAHOO');
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
        hello world
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
