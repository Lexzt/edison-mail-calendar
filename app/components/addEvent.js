import React, { Component } from 'react';
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import { FormControl } from 'react-bootstrap';
import moment from 'moment';
// import { Checkbox } from '@material-ui/core';
import { Checkbox } from 'antd';
import ICAL from 'ical.js';

import RRuleGenerator from './react-rrule-generator/src/lib';

import 'bootstrap/dist/css/bootstrap.css';
// import './react-rrule-generator/build/styles.css';
import './react-rrule-generator/build/styles.css';

const START_INDEX_OF_UTC_FORMAT = 17;
const START_INDEX_OF_HOUR = 11;
const END_INDEX_OF_HOUR = 13;
const TIME_OFFSET = 12;
const START_INDEX_OF_DATE = 0;
const END_INDEX_OF_DATE = 11;
const END_INDEX_OF_MINUTE = 16;

export default class AddEvent extends Component {
  constructor(props) {
    super(props);

    this.state = {
      title: '',
      desc: '',
      startParsed: '',
      endParsed: '',
      start: '',
      end: '',
      selectedProvider: '',
      rrule: 'RRULE:FREQ=MONTHLY;INTERVAL=1;BYSETPOS=1;BYDAY=MO',
      isRepeating: false,
      dailyRule: '',
      weeklyRule: '',
      monthlyRule: '',
      yearlyRule: ''
    };
  }

  componentWillMount() {
    const { props } = this;
    const { state } = this;
    console.log(props, state);

    const startDateParsed = moment(props.match.params.start);
    const endDateParsed = moment(props.match.params.end);

    const rruleDaily = ICAL.Recur.fromData({ freq: 'DAILY' });
    const rruleWeekly = ICAL.Recur.fromData({
      freq: 'WEEKLY',
      byday: [startDateParsed.format('dd').toUpperCase()],
      count: 5,
      interval: 1
    });
    const rruleMonthlyByMonthDay = ICAL.Recur.fromData({
      freq: 'MONTHLY',
      bymonthday: [startDateParsed.date()],
      count: 5,
      interval: 1
    });
    const rruleMonthlyByWeekNoAndDay = ICAL.Recur.fromData({
      freq: 'MONTHLY',
      byday: [startDateParsed.format('dd').toUpperCase()],
      bysetpos: [this.weekOfMonth(startDateParsed)],
      count: 5,
      interval: 1
    });
    // const rruleYearlyByWeekNoAndDay = ICAL.Recur.fromData({ freq: 'YEARLY', byday: [startDateParsed.format('dd').toUpperCase()], byweekno: [weekOfMonth(startDateParsed)] });

    // const rruleBasic = `DTSTART:${startDateParsed.format('YYYYMMDDTHHmmss[Z]')}\n `;
    // debugger;

    console.log(props.match.params.end);
    const startDateParsedInUTC = this.processStringForUTC(
      startDateParsed.format('YYYY-MM-DDThh:mm a')
    );
    const endDateParsedInUTC = this.processStringForUTC(endDateParsed.format('YYYY-MM-DDThh:mm a'));
    console.log(`${moment(startDateParsedInUTC).format()} ${endDateParsedInUTC}`);
    this.setState({
      startParsed: startDateParsedInUTC,
      endParsed: endDateParsedInUTC,
      start: props.match.params.start,
      end: props.match.params.end,
      dailyRule: `RRULE:${rruleDaily.toString()}`,
      weeklyRule: `RRULE:${rruleWeekly.toString()}`,
      monthlyRule: `RRULE:${rruleMonthlyByWeekNoAndDay.toString()}`,
      rrule: `RRULE:${rruleMonthlyByWeekNoAndDay.toString()}`
      // yearlyRule: ''
    });
  }

  processStringForUTC = (dateInString) => {
    let dateInStringInUTC;
    if (dateInString.substring(START_INDEX_OF_UTC_FORMAT) === 'pm') {
      const hourInString = parseInt(
        dateInString.substring(START_INDEX_OF_HOUR, END_INDEX_OF_HOUR),
        10
      );
      const hourInStringInUTC = hourInString + TIME_OFFSET;
      console.log(hourInStringInUTC.toString());
      dateInStringInUTC =
        dateInString.substring(START_INDEX_OF_DATE, END_INDEX_OF_DATE) +
        hourInStringInUTC.toString() +
        dateInString.substring(END_INDEX_OF_HOUR, END_INDEX_OF_MINUTE);
    } else {
      dateInStringInUTC = dateInString.substring(START_INDEX_OF_DATE, END_INDEX_OF_MINUTE);
    }
    return dateInStringInUTC;
  };

  weekOfMonth = (input) => {
    const firstDayOfMonth = input.clone().startOf('month');
    const firstDayOfWeek = firstDayOfMonth.clone().startOf('week');

    const offset = firstDayOfMonth.diff(firstDayOfWeek, 'days');

    return Math.ceil((input.date() + offset) / 7);
  };

  handleChange = (event) => {
    this.setState({ [event.target.name]: event.target.value });
  };

  handleRruleChange = (rrule) => {
    console.log(rrule);
    this.setState({ rrule });
  };

  toggleRecurr = (e) => {
    this.setState({ isRepeating: e.target.checked });
  };

  backToCalendar = (e) => {
    const { props } = this;
    props.history.push('/');
  };

  handleSubmit = async (e) => {
    // need to write validation method
    e.preventDefault();
    const { props, state } = this;

    // debugger;

    if (state.selectedProvider !== '') {
      const { providerType } = JSON.parse(state.selectedProvider);
      const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Here we add one day because for example
      // If I define an event that repeats from the 6th to the 9th,
      // Rrule will assume 12am on the 9th.
      // Therefore, I add one day and recompute the string.
      // eslint-disable-next-line no-underscore-dangle
      const rrule = ICAL.Recur._stringToData(state.rrule);
      if (rrule.until !== undefined && providerType === 'CALDAV') {
        rrule.until.adjust(1, 0, 0, 0, 0);
      }

      // As rrule is now an object, I need to map it to a string
      // Ignoring bysecond, minute, hour
      // As I do not want to initalize objects not created in rrule,
      // I need to if else, if not undefined gets added in too.
      const recurObj = {
        freq: rrule['rrule:freq'],
        interval: rrule.interval.toString(),
        until: rrule.until,
        count: rrule.count
      };
      if (rrule.byday) {
        Object.assign(recurObj, {
          byday: rrule.byday
        });
      }
      if (rrule.bymonthday) {
        Object.assign(recurObj, {
          bymonthday: rrule.bymonthday
        });
      }
      if (rrule.byyearday) {
        Object.assign(recurObj, {
          byyearday: rrule.byyearday
        });
      }
      if (rrule.byweekno) {
        Object.assign(recurObj, {
          byweekno: rrule.byweekno
        });
      }
      if (rrule.bymonth) {
        Object.assign(recurObj, {
          bymonth: rrule.bymonth
        });
      }
      if (rrule.bysetpos) {
        Object.assign(recurObj, {
          bysetpos: rrule.bysetpos
        });
      }
      const rruleStr = new ICAL.Recur(recurObj);

      debugger;

      props.postEventBegin(
        {
          summary: state.title,
          description: state.desc,
          start: {
            dateTime: moment.tz(state.startParsed, tzid),
            timezone: tzid
          },
          end: {
            dateTime: moment.tz(state.endParsed, tzid),
            timezone: tzid
          },
          isRecurring: state.isRepeating,
          rrule: rruleStr.toString()
        },
        JSON.parse(state.selectedProvider),
        providerType
      );
      props.history.push('/');
    } else {
      console.log('No provider selected! Disabled adding of events!!');
    }
  };

  render() {
    const providers = [];
    const { props, state } = this;
    for (const providerIndivAccount of Object.keys(props.providers)) {
      props.providers[providerIndivAccount].map((data) => providers.push(data));
    }

    const repeatingUI = [];
    if (state.isRepeating) {
      repeatingUI.push(
        // <RRuleGenerator
        //   // onChange={(rrule) => console.log(`RRule changed, now it's ${rrule}`)}
        //   key="rrulegenerator"
        //   onChange={this.handleRruleChange}
        //   name="rrule"
        //   config={{
        //     repeat: ['Daily', 'Weekly', 'Monthly', 'Yearly'],
        //     yearly: 'on the',
        //     monthly: 'on the',
        //     end: ['On date', 'After'],
        //     // end: ['Never', 'On date', 'After'],  // Atm, never has not been taken care of
        //     weekStartsOnSunday: true,
        //     hideError: true
        //   }}
        // />

        <RRuleGenerator
          // onChange={(rrule) => console.log(`RRule changed, now it's ${rrule}`)}
          key="rrulegenerator"
          onChange={this.handleRruleChange}
          name="rrule"
          value={state.rrule}
          config={{
            hideStart: true,
            end: ['On date', 'After']
          }}
        />
      );
    }

    return (
      <div>
        <form className="container" onSubmit={this.handleSubmit} noValidate>
          {/* Title Form */}
          <FormControl
            type="text"
            value={state.value}
            name="title"
            placeholder="Enter title of Event"
            onChange={this.handleChange}
          />

          {/* Text Area */}
          <FormControl
            componentclass="textarea"
            placeholder="Description"
            name="desc"
            onChange={this.handleChange}
          />

          {/* Start Time and Date */}
          <TextField
            id="datetime-local"
            label="Start"
            type="datetime-local"
            defaultValue={state.startParsed}
            className="textField"
            InputLabelProps={{
              shrink: true
            }}
            name="startParsed"
            onChange={this.handleChange}
          />

          {/* End Time and Date */}
          <TextField
            id="datetime-local"
            label="End"
            type="datetime-local"
            defaultValue={state.endParsed}
            className="textField"
            InputLabelProps={{
              shrink: true
            }}
            name="endParsed"
            onChange={this.handleChange}
          />

          <TextField
            id="standard-select-currency-native"
            select
            label="Select email"
            value={state.selectedProvider}
            onChange={this.handleChange}
            helperText="Please select which provider"
            margin="normal"
            name="selectedProvider"
          >
            {providers.map((option) => (
              // Currently an issue: https://github.com/mui-org/material-ui/issues/10845
              <MenuItem key={option.personId} value={JSON.stringify(option)}>
                {option.email}, ({option.providerType}/{option.caldavType})
              </MenuItem>
            ))}
          </TextField>

          <Checkbox style={{ marginLeft: 8 }} onChange={this.toggleRecurr}>
            Repeating
          </Checkbox>

          <div className="app" data-tid="container">
            {repeatingUI}
          </div>

          <input type="submit" value="Submit" />
          <input
            key="return"
            type="button"
            onClick={this.backToCalendar}
            name="return"
            value="Back to Calendar"
          />
        </form>
      </div>
    );
  }
}
