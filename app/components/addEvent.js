import React, { Component } from 'react';
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import { FormControl } from 'react-bootstrap';
import moment from 'moment';
import RRuleGenerator from 'react-rrule-generator';
// import { Checkbox } from '@material-ui/core';
import { Checkbox } from 'antd';

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
      rrule: '',
      isRepeating: false
    };
  }

  componentWillMount() {
    const { props } = this;

    const startDateParsed = moment(props.match.params.start).format('YYYY-MM-DDThh:mm a');
    const endDateParsed = moment(props.match.params.end).format('YYYY-MM-DDThh:mm a');
    console.log(props.match.params.end);
    const startDateParsedInUTC = this.processStringForUTC(startDateParsed);
    const endDateParsedInUTC = this.processStringForUTC(endDateParsed);
    console.log(`${moment(startDateParsedInUTC).format()} ${endDateParsedInUTC}`);
    this.setState({
      startParsed: startDateParsedInUTC,
      endParsed: endDateParsedInUTC,
      start: props.match.params.start,
      end: props.match.params.end
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

  handleChange = (event) => {
    debugger;
    this.setState({ [event.target.name]: event.target.value });
  };

  handleRruleChange = (rrule) => {
    this.setState({ rrule });
  };

  toggleRecurr = (e) => {
    this.setState({ isRepeating: e.target.checked });
  };

  handleSubmit = async (e) => {
    // need to write validation method
    e.preventDefault();
    const { props, state } = this;

    debugger;

    if (state.selectedProvider !== '') {
      const { providerType } = JSON.parse(state.selectedProvider);
      const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;

      debugger;

      props.postEventBegin(
        {
          summary: state.title,
          description: state.desc,
          start: {
            dateTime: moment.tz(state.startParsed, tzid),
            timezone: 'America/Los_Angeles'
          },
          end: {
            dateTime: moment.tz(state.endParsed, tzid),
            timezone: 'America/Los_Angeles'
          },
          rrule: state.rrule
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
        <RRuleGenerator
          // onChange={(rrule) => console.log(`RRule changed, now it's ${rrule}`)}
          key="rrulegenerator"
          onChange={this.handleRruleChange}
          name="rrule"
          config={{
            repeat: ['Daily', 'Weekly', 'Monthly', 'Yearly'],
            yearly: 'on the',
            monthly: 'on',
            end: ['On date', 'After'],
            // end: ['Never', 'On date', 'After'],  // Atm, never has not been taken care of
            weekStartsOnSunday: true,
            hideError: true
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
        </form>
      </div>
    );
  }
}
