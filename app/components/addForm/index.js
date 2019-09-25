import React, { Component } from 'react';
import TextField from '@material-ui/core/TextField';
import { FormControl } from 'react-bootstrap';
import moment from 'moment';
import ICAL from 'ical.js';
import RRuleGenerator from 'react-rrule-generator';

import DescBox from './descBox';
import EndTime from './endTime';
import StartTime from './startTime';
import SummaryBox from './summaryBox';

const START_INDEX_OF_UTC_FORMAT = 17;
const START_INDEX_OF_HOUR = 11;
const END_INDEX_OF_HOUR = 13;
const TIME_OFFSET = 12;
const START_INDEX_OF_DATE = 0;
const END_INDEX_OF_DATE = 11;
const END_INDEX_OF_MINUTE = 16;

export default class AddEvent extends Component {
  handleSubmit = async (e) => {
    // need to write validation method
    e.preventDefault();
    const { props } = this;
    // debugger;
    props.beginCreateCalendarObject({
      summary: 'New Event',
      description: 'Event Description',
      dtstart: ICAL.Time.fromDateTimeString('2019-07-30T10:00:00').toICALString(),
      dtend: ICAL.Time.fromDateTimeString('2019-07-30T13:00:00').toICALString(),
      rrule: {
        freq: 'MONTHLY',
        interval: 1,
        count: 10
      },
      attendees: ['mailto:sham@edison.tech', 'mailto:shamsheer619@gmail.com']
    });
    props.history.push('/');
  };

  render() {
    const start = ICAL.Time.fromDateTimeString('2019-07-30T10:00:00').toICALString();
    const end = ICAL.Time.fromDateTimeString('2019-07-30T13:00:00').toICALString();
    return (
      <div className="form-event-container">
        <form className="container" onSubmit={this.handleSubmit} noValidate>
          <SummaryBox summary="Component Event" />
          <StartTime start={this.start} />
          <EndTime end={this.end} />
          <DescBox description="Event Description" />

          <RRuleGenerator
            onChange={(rrule) => console.log(`RRule changed, now it's ${rrule}`)}
            config={{
              repeat: ['Monthly', 'Weekly'],
              yearly: 'on the',
              monthly: 'on',
              end: ['Never', 'On date'],
              weekStartsOnSunday: true,
              hideError: true
            }}
          />

          <input type="submit" value="Submit" />
        </form>
      </div>
    );
  }
}
