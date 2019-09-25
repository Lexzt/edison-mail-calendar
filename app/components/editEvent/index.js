/* global google */
import React from 'react';
import moment from 'moment';

import {
  ConflictResolutionMode,
  SendInvitationsOrCancellationsMode,
  DateTime,
  SendInvitationsMode,
  Appointment,
  ExchangeService,
  Uri,
  ExchangeCredentials,
  DayOfTheWeek,
  Recurrence,
  WellKnownFolderName,
  Item,
  DailyPattern,
  DayOfTheWeekCollection
} from 'ews-javascript-api';
import uuidv4 from 'uuid';
import Select from 'react-select';
import DateTimePicker from 'react-datetime-picker/dist/entry.nostyle';

import Location from './location';
import Attendees from './attendees';
// import Date from './date';
// import Time from './time';
import Conference from './conference';
import Checkbox from './checkbox';
import { loadClient, editGoogleEvent } from '../../utils/client/google';
import {
  asyncUpdateExchangeEvent,
  asyncUpdateRecurrExchangeSeries,
  asyncDeleteExchangeEvent,
  asyncGetRecurrAndSingleExchangeEvents
} from '../../utils/client/exchange';
import './index.css';
/* global google */
import {
  dropDownTime,
  momentAdd,
  filterIntoSchema,
  OUTLOOK,
  EXCHANGE,
  GOOGLE,
  CALDAV
} from '../../utils/constants';

import '../../bootstrap.css';
import * as recurrenceOptions from '../../utils/recurrenceOptions';
import { beginStoringEvents } from '../../actions/db/events';

import * as dbEventActions from '../../sequelizeDB/operations/events';
import * as dbRpActions from '../../sequelizeDB/operations/recurrencepatterns';

export default class EditEvent extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      place: {},
      id: '',
      title: '',
      description: '',
      start: {},
      end: {},
      colorId: '',
      visibility: '',
      attendees: [],
      allDay: false,
      conference: '',
      hangoutLink: '',
      startDay: '',
      endDay: '',
      // startTime: '',
      // endTime: '',
      originalId: '',

      isRecurring: false,
      recurringEventId: '',
      thirdOptionAfter: 5,
      recurrInterval: 1, // for repeated interval
      firstSelectedOption: 1, // for selecting day, week, monthly, year, default = week
      selectedSecondRecurrOption: recurrenceOptions.selectedSecondRecurrOption, // for storing what has been selected, only indexes 1,2 are used as 1 = week, 2 = month.
      secondRecurrOptions: recurrenceOptions.weekRecurrOptions,
      thirdRecurrOptions: 'n',
      recurringMasterId: '',
      recurrStartDate: '',
      recurrEndDate: '',
      recurrPatternId: '',

      recurrByMonth: '',
      recurrByMonthDay: '',
      recurrByWeekDay: '',
      recurrByWeekNo: ''
    };
  }

  componentDidMount() {
    const { props, state } = this;
    this.retrieveEvent(props.match.params.id);
    // console.log(this.props, this.state);
  }

  // find a way to handle all different inputs
  handleStartChange = (start) => {
    this.setState({ start: start.getTime() / 1000 });
  };

  // find a way to handle all different inputs
  handleEndChange = (end) => {
    this.setState({ end: end.getTime() / 1000 });
  };

  // find a way to handle all different inputs
  handleChange = (event) => {
    debugger;
    // console.log(event.name);
    if (event.target !== undefined) {
      // console.log(event.target.name);
      // console.log(event.target.value);
      this.setState({
        [event.target.name]: event.target.value
      });
      // if(event.target.checked !== undefined) {
      //   this.setState({ allDay: event.target.checked })
      // } else {
      //   const target = event.target;
      //   const value = target.value;
      //   const name = target.name;
      //   this.setState({
      //     [name]: value
      //   });
      // }
    } else {
      // console.log(event.name);
      this.setState({
        [event.name]: event.value
      });
    }
  };

  handleInputChange = (event) => {
    const { target } = event;
    const { value } = target;
    const { name } = target;
    this.setState({
      [name]: value
    });
  };

  handleReactSelect = (event) => {
    this.setState({
      [event.name]: event.value
    });
  };

  handleCheckboxChange = (event) => {
    this.setState({ allDay: event.target.checked });
  };

  createDbRecurrenceObj = () => {
    const { state } = this;
    return {
      id: uuidv4(),
      originalId: state.recurringMasterId,
      freq: recurrenceOptions.parseFreqByNumber(state.firstSelectedOption),
      interval: parseInt(state.recurrInterval, 10),
      recurringTypeId: state.recurrStartDate,
      until: state.thirdRecurrOptions === 'n' ? '' : state.recurrEndDate,
      numberOfRepeats: state.thirdRecurrOptions === 'a' ? state.thirdOptionAfter : 0,
      weeklyPattern: state.firstSelectedOption === 1 ? state.selectedSecondRecurrOption[1] : [],
      // TO-DO, populate if needed!!
      exDates: [],
      recurrenceIds: [],
      modifiedThenDeleted: false
    };
  };

  handleSubmit = async (e) => {
    e.preventDefault();
    const { props, state } = this;

    console.log(e.target.name, state);
    console.log(this.createDbRecurrenceObj());

    // debugger;

    if (e.target.name === 'return') {
      props.history.push('/');
    }

    const user = props.providers[state.providerType].filter(
      (object) => object.email === state.owner
    )[0]; // this validates which user the event belongs to, by email.

    debugger;
    switch (e.target.name) {
      case 'updateOne': {
        const oneEventObject = {
          id: state.id,
          title: state.title,
          user,
          location: state.place,
          originalId: state.originalId,
          props
        };
        switch (state.providerType) {
          case GOOGLE:
            // // READ THIS, GOOGLE DOES NOT WORK.
            // await loadClient();
            // // Error Handling
            // const startDateTime = momentAdd(state.startDay, state.startTime);
            // const endDateTime = momentAdd(state.endDay, state.endTime);
            // const attendeeForAPI = state.attendees.map((attendee) => ({
            //   email: attendee.value
            // }));
            // const eventPatch = {
            //   summary: state.title,
            //   start: {
            //     dateTime: startDateTime
            //   },
            //   end: {
            //     dateTime: endDateTime
            //   },
            //   location: state.place.name,
            //   attendees: attendeeForAPI
            // };
            // if (state.conference.label === 'Hangouts') {
            //   eventPatch.conferenceData = {
            //     createRequest: { requestId: '7qxalsvy0e' }
            //   };
            // }
            // const editResp = await editGoogleEvent(state.id, eventPatch);
            // return editResp;
            break;
          case EXCHANGE:
            props.editEwsSingleEventBegin(oneEventObject);
            break;
          case CALDAV:
            props.editCalDavSingleEventBegin(oneEventObject);
            break;
          default:
            break;
        }
        break;
      }
      case 'updateAll': {
        const allEventObj = {
          id: state.id,
          title: state.title,
          user,
          location: state.place,
          originalId: state.originalId,
          recurringEventId: state.recurringEventId,
          props,
          firstOption: state.firstSelectedOption,
          secondOption: state.selectedSecondRecurrOption,
          recurrInterval: state.recurrInterval,
          recurrPatternId: state.recurrPatternId,
          untilType: state.thirdRecurrOptions,
          untilDate: state.recurrEndDate,
          untilAfter: state.thirdOptionAfter,
          iCalUID: state.iCalUID,
          byMonth: state.recurrByMonth,
          byMonthDay: state.recurrByMonthDay,
          byWeekDay: state.recurrByWeekDay,
          byWeekNo: state.recurrByWeekNo
        };
        switch (state.providerType) {
          case EXCHANGE:
            props.editEwsAllEventBegin(allEventObj);
            break;
          case CALDAV:
            props.editCalDavAllEventBegin(allEventObj);
            break;
          default:
            console.log(`Have not handled ${state.providerType} updating of all recurring events.`);
            break;
        }
        break;
      }
      case 'updateFuture': {
        const futureEventObj = {
          id: state.id,
          title: state.title,
          user,
          location: state.place,
          originalId: state.originalId,
          recurringEventId: state.recurringEventId,
          props,
          firstOption: state.firstSelectedOption,
          secondOption: state.selectedSecondRecurrOption,
          recurrInterval: state.recurrInterval,
          recurrPatternId: state.recurrPatternId,
          untilType: state.thirdRecurrOptions,
          untilDate: state.recurrEndDate,
          untilAfter: state.thirdOptionAfter,
          iCalUID: state.iCalUID,
          byMonth: state.recurrByMonth,
          byMonthDay: state.recurrByMonthDay,
          byWeekDay: state.recurrByWeekDay,
          byWeekNo: state.recurrByWeekNo
        };
        switch (state.providerType) {
          case EXCHANGE:
            props.editEwsFutureEventBegin(futureEventObj);
            break;
          case CALDAV:
            props.editCalDavFutureEventBegin(futureEventObj);
            break;
          default:
            break;
        }
        break;
      }
      default:
        break;
    }
  };

  // // So the plan here is,
  // /*
  //   In order to edit a generic event, we have to choose for each individual event.

  //   Google - Retrive ID from our local DB and post with the ID, Google handles everything else
  //   Outlook - Same as google
  //   Exchange - This one requires more thought.
  //     Exchange updates the data different. Not a post request. A function call in the ews-javascript-api call.
  //     Have to think how to call the function when I might not have the object. This means that perhaps I should store the object in the main object.
  //     In order to retrive the event, I need to make a query from the script to get the javascript ews object. However, once I have it, I can update it easily.
  // */
  retrieveEvent = async (id) => {
    console.log(id);
    // const db = await getDb();
    // const dbEvent = await db.events
    //   .find()
    //   .where('id')
    //   .eq(id)
    //   .exec();

    const dbEvent = await dbEventActions.getOneEventById(id);
    // const dbEventJSON = dbEvent[0].toJSON();
    const dbEventJSON = dbEvent.toJSON();
    console.log(dbEventJSON);

    const text = recurrenceOptions.parseString(
      Math.ceil(moment(dbEventJSON.start.dateTime).date() / 7)
    );
    debugger;
    const secondRecurrOptions = recurrenceOptions.secondRecurrOptions(dbEventJSON.start, text);

    if (dbEventJSON.isRecurring) {
      // const dbEventRecurrence = await db.recurrencepatterns
      //   .findOne()
      //   .where('originalId')
      //   .eq(dbEventJSON.recurringEventId)
      //   .exec();
      const dbEventRecurrence = await dbRpActions.getOneRpByOId(dbEventJSON.recurringEventId);

      console.log(dbEventJSON.recurringEventId);
      console.log(dbEventRecurrence.toJSON());

      const thirdRecurrChoice = recurrenceOptions.parseThirdRecurrOption(
        dbEventRecurrence.until,
        dbEventRecurrence.numberOfRepeats
      );

      const firstSelected = recurrenceOptions.parseFreq(dbEventRecurrence.freq);
      const secondSelected = recurrenceOptions.parseFreqNumber(firstSelected);

      // console.log(
      //   secondRecurrOptions,
      //   secondSelected,
      //   firstSelected,
      //   secondRecurrOptions[secondSelected]
      // );
      let monthlySelected = 0;
      let yearlySelected = 0;
      if (secondSelected === 'month') {
        if (dbEventRecurrence.byMonthDay === '()') {
          monthlySelected = 1;
        } else {
          monthlySelected = 0;
        }
      } else if (secondSelected === 'year') {
        // yet to do, figure out later!!
        if (dbEventRecurrence.byMonthDay === '()') {
          yearlySelected = 1;
        } else {
          yearlySelected = 0;
        }
      }

      const selectedSecondRecurrOptions = [];
      if (firstSelected === 1) {
        this.setState({
          selectedSecondRecurrOption: [
            0,
            dbEventRecurrence.weeklyPattern
              .split(',')
              .filter((e) => e !== '')
              .map((e) => parseInt(e, 10)),
            0,
            0
          ]
        });
        // console.log([0, dbEventRecurrence.weeklyPattern, 0, 0])
      } else if (firstSelected === 2) {
        this.setState({
          selectedSecondRecurrOption: [
            0,
            dbEventRecurrence.weeklyPattern
              .split(',')
              .filter((e) => e !== '')
              .map((e) => parseInt(e, 10)),
            monthlySelected,
            0
          ]
        });
        // console.log([0, dbEventRecurrence.weeklyPattern, monthlySelected, 0])
      } else if (firstSelected === 3) {
        this.setState({
          selectedSecondRecurrOption: [
            0,
            dbEventRecurrence.weeklyPattern
              .split(',')
              .filter((e) => e !== '')
              .map((e) => parseInt(e, 10)),
            0,
            yearlySelected
          ]
        });
        // console.log([0, dbEventRecurrence.weeklyPattern, 0, yearlySelected]);
      }

      console.log(dbEventRecurrence);

      this.setState({
        isRecurring: true,
        recurringEventId: dbEventJSON.recurringEventId,
        recurrInterval: dbEventRecurrence.interval,
        firstSelectedOption: firstSelected,
        secondRecurrOptions: secondRecurrOptions[secondSelected],
        thirdRecurrOptions: thirdRecurrChoice,
        recurrStartDate: moment(dbEventRecurrence.recurringTypeId).format('YYYY-MM-DDTHH:mm:ssZ'),
        recurrEndDate: moment(dbEventRecurrence.until).format('YYYY-MM-DDTHH:mm:ssZ'),
        recurringMasterId: dbEventRecurrence.originalId,
        recurrPatternId: dbEventRecurrence.id,
        thirdOptionAfter: dbEventRecurrence.numberOfRepeats,

        recurrByMonth: dbEventRecurrence.byMonth,
        recurrByMonthDay:
          dbEventRecurrence.byMonthDay !== '()'
            ? dbEventRecurrence.byMonthDay
            : `(${moment(dbEventJSON.start).date()})`,
        // recurrByWeekDay:
        //   dbEventRecurrence.byWeekDay !== '()'
        //     ? dbEventRecurrence.byWeekDay
        //     : `(${moment(dbEventJSON.start).day()})`,
        recurrByWeekDay: dbEventRecurrence.byWeekDay,
        recurrByWeekNo: dbEventRecurrence.byWeekNo
      });
    }

    debugger;
    this.setState({
      id: dbEventJSON.id,
      title: dbEventJSON.summary,
      description: dbEventJSON.description,
      start: dbEventJSON.start,
      end: dbEventJSON.end,
      attendees: dbEventJSON.attendees,
      hangoutLink: dbEventJSON.hangoutLink,
      providerType: dbEventJSON.providerType,
      owner: dbEventJSON.owner,
      originalId: dbEventJSON.originalId,
      iCalUID: dbEventJSON.iCalUID
    });
  };

  handleOptionChange = (changeEvent) => {
    this.setState({
      recurrEnd: changeEvent.target.value
    });
  };

  handleIntervalChange = (event) => {
    this.setState({
      recurrInterval: event.target.value
    });
  };

  handleFirstRecurrOptions = (event) => {
    const { state } = this;
    const text = recurrenceOptions.parseString(Math.ceil(moment(state.start.dateTime).date() / 7));
    const secondRecurrOptions = recurrenceOptions.secondRecurrOptions(state.start, text);

    const newVal = state.selectedSecondRecurrOption[event.index];
    const newArr = state.selectedSecondRecurrOption;
    newArr[event.index] = newVal;
    // console.log(newVal, newArr, event.index, state);

    this.setState({
      firstSelectedOption: event.index,
      secondRecurrOptions: secondRecurrOptions[event.value],
      selectedSecondRecurrOption: newArr
    });
  };

  handleSecondRecurrOptions = (event) => {
    const { state } = this;

    const newVal = state.selectedSecondRecurrOption[state.firstSelectedOption];
    const newArr = state.selectedSecondRecurrOption;
    newArr[state.firstSelectedOption] = event.index;
    console.log(newVal, newArr, state);

    this.setState({
      selectedSecondRecurrOption: newArr
    });
  };

  handleThirdRecurrOptions = (event) => {
    this.setState({
      thirdRecurrOptions: event.value
    });
  };

  handleWeekChangeRecurr = (event) => {
    const { state } = this;

    // 1 coz, day week, month, year, week = index 1.
    const newVal = state.selectedSecondRecurrOption[1];

    const intParsed = parseInt(event.target.name, 10);
    // console.log(state, newVal, intParsed, newVal[intParsed]);
    // This alternates it between 1/0.
    newVal[intParsed] = newVal[intParsed] === 1 ? 0 : 1;
    const newArr = state.selectedSecondRecurrOption;
    newArr[1] = newVal;
    // console.log(state, newVal, newArr, event.target.name);

    this.setState({
      selectedSecondRecurrOption: newArr
    });
  };

  render() {
    // // All Day option will help out here.
    // let parseStart = '';
    // let parseEnd = '';

    const { props, state } = this;
    // console.log(state);

    // ----------------------------------- HACKING OUT RECURRENCE UI FIRST ----------------------------------- //
    // const text = recurrenceOptions.parseString(Math.ceil(moment(state.start.dateTime).date() / 7));
    // const secondRecurrOptions = recurrenceOptions.secondRecurrOptions(state.start, text);
    debugger;
    // if (state.start.dateTime !== undefined) {
    //   parseStart = state.start.dateTime.substring(0, 16);
    //   parseEnd = state.end.dateTime.substring(0, 16);
    // } else {
    //   parseStart = state.start.date;
    //   parseEnd = state.end.date;
    // }

    const recurrence = [];
    recurrence.push(
      <div key="">
        <h3>Recurrence</h3>
        Repeat every
        <input
          name="recurrInterval"
          type="number"
          onChange={(e) => {
            this.handleIntervalChange(e);
          }}
          value={state.recurrInterval}
        />
        <Select
          name="recurrFreq"
          isClearable
          onChange={this.handleFirstRecurrOptions} // On change, this function handle swapping second.
          options={recurrenceOptions.firstRecurrOptions} // set options
          value={recurrenceOptions.firstRecurrOptions[state.firstSelectedOption]}
        />
      </div>
    );

    // Ensures week or month only.
    if (state.secondRecurrOptions.length === 2) {
      // console.log(state.selectedSecondRecurrOption, state.firstSelectedOption);
      recurrence.push(
        <div key={state.thirdRecurrOptions}>
          Repeat on
          <Select
            closeMenuOnSelect
            name="recurrType"
            onChange={this.handleSecondRecurrOptions}
            options={state.secondRecurrOptions}
            value={
              state.secondRecurrOptions[state.selectedSecondRecurrOption[state.firstSelectedOption]]
            }
          />
        </div>
      );
    } else if (state.secondRecurrOptions.length === 7) {
      if (state.selectedSecondRecurrOption[1] !== []) {
        recurrence.push(
          <div key={state.thirdRecurrOptions}>
            Repeat on
            <label>
              <Checkbox
                // checked={state.selectedSecondRecurrOption[1][0]}
                checked={state.selectedSecondRecurrOption[1][0]}
                name={0}
                onChange={this.handleWeekChangeRecurr}
              />
              <span style={{ marginLeft: 8 }}>Sun</span>
            </label>
            <label>
              <Checkbox
                checked={state.selectedSecondRecurrOption[1][1]}
                name={1}
                onChange={this.handleWeekChangeRecurr}
              />
              <span style={{ marginLeft: 8 }}>Mon</span>
            </label>
            <label>
              <Checkbox
                checked={state.selectedSecondRecurrOption[1][2]}
                name={2}
                onChange={this.handleWeekChangeRecurr}
              />
              <span style={{ marginLeft: 8 }}>Tue</span>
            </label>
            <label>
              <Checkbox
                checked={state.selectedSecondRecurrOption[1][3]}
                name={3}
                onChange={this.handleWeekChangeRecurr}
              />
              <span style={{ marginLeft: 8 }}>Wed</span>
            </label>
            <label>
              <Checkbox
                checked={state.selectedSecondRecurrOption[1][4]}
                name={4}
                onChange={this.handleWeekChangeRecurr}
              />
              <span style={{ marginLeft: 8 }}>Thu</span>
            </label>
            <label>
              <Checkbox
                checked={state.selectedSecondRecurrOption[1][5]}
                name={5}
                onChange={this.handleWeekChangeRecurr}
              />
              <span style={{ marginLeft: 8 }}>Fri</span>
            </label>
            <label>
              <Checkbox
                checked={state.selectedSecondRecurrOption[1][6]}
                name={6}
                onChange={this.handleWeekChangeRecurr}
              />
              <span style={{ marginLeft: 8 }}>Sat</span>
            </label>
          </div>
        );
      }
    }

    recurrence.push(
      <div key="recurrEnds">
        Ends
        <Select
          closeMenuOnSelect
          name="recurrEnds"
          onChange={this.handleThirdRecurrOptions}
          defaultValue={recurrenceOptions.thirdRecurrOptions[0]}
          value={
            recurrenceOptions.thirdRecurrOptions[
              recurrenceOptions.parseThirdRecurrLetter(state.thirdRecurrOptions)
            ]
          }
          options={recurrenceOptions.thirdRecurrOptions}
        />
      </div>
    );

    if (state.thirdRecurrOptions === 'o') {
      // recurrence.push(
      //   <Date
      //     key="recurrEndDate"
      //     dayProps={this.handleChange}
      //     name="recurrEndDate"
      //     startDate={state.recurrEndDate}
      //   />
      // );
      // recurrence.push(
      //   <Time
      //     timeProps={this.handleChange}
      //     currentTime={state.endTime}
      //     name="recurrEndTime"
      //     dropDownTime={dropDownTime(state.startTime)}
      //   />
      // );
    } else if (state.thirdRecurrOptions === 'a') {
      recurrence.push(
        <input
          name="thirdOptionAfter"
          type="number"
          value={state.thirdOptionAfter}
          onChange={this.handleChange}
        />
      ); // idk how or what value to populate here LOL
    }
    // ----------------------------------- HACKING OUT RECURRENCE UI FIRST ----------------------------------- //

    const endMenu = [];
    endMenu.push(
      <input
        key="uppdateOne"
        type="button"
        onClick={this.handleSubmit}
        name="updateOne"
        value="Update this event"
      />
    );

    endMenu.push(
      <input
        key="return"
        type="button"
        onClick={this.handleSubmit}
        name="return"
        value="Back to Calendar"
      />
    );

    if (state.isRecurring) {
      endMenu.push(
        <input
          key="updateAll"
          type="button"
          onClick={this.handleSubmit}
          name="updateAll"
          value="Update entire series"
        />
      );
      endMenu.push(
        <input
          key="updateFuture"
          type="button"
          onClick={this.handleSubmit}
          name="updateFuture"
          value="Update this and future events"
        />
      );
    }

    debugger;
    if (state.start.dateTime !== undefined && state.start.dateTime !== undefined) {
      return (
        <div className="edit-container">
          <form onSubmit={this.handleSubmit} onChange={this.handleChange}>
            <input name="title" type="text" defaultValue={state.title} />
            <input
              name="description"
              type="text"
              defaultValue={state.description}
              placeholder="Event Description"
            />
            <DateTimePicker
              onChange={this.handleStartChange}
              name="startTime"
              value={new Date(state.start.dateTime * 1000)}
            />
            <span>to</span>
            <DateTimePicker
              onChange={this.handleEndChange}
              name="endTime"
              value={new Date(state.end.dateTime * 1000)}
            />
            <div className="flex-container">
              <div style={{ fontFamily: 'system-ui' }}>
                <label>
                  <Checkbox checked={state.allDay} onChange={this.handleChange} />
                  <span style={{ marginLeft: 8 }}>All Day</span>
                </label>
              </div>
            </div>
            <Location
              onPlaceChanged={this.handleChange.bind(this)}
              place={state.place}
              name="place"
            />
            <Attendees
              onAttendeeChanged={this.handleChange.bind(this)}
              attendees={state.attendees}
              name="attendees"
            />
            <Conference
              onConferChanged={this.handleChange.bind(this)}
              name="conference"
              conference={state.conference}
            />

            <br />
            <br />

            {recurrence}
            {endMenu}
          </form>
        </div>
      );
    }
    return null;
  }
}

// <Date dayProps={this.handleChange} name="startDay" />
// <Time
//   timeProps={this.handleChange}
//   currentTime={state.start}
//   name="startTime"
//   // dropDownTime={dropDownTime('')}
// />
// <span>to</span>
// <Date dayProps={this.handleChange} name="endDay" startDate={state.startDay} />
// <Time
//   timeProps={this.handleChange}
//   currentTime={state.end}
//   name="endTime"
//   // dropDownTime={dropDownTime(state.end)}
// />
