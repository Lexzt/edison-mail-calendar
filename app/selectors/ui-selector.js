import { createSelector } from 'reselect';
import moment from 'moment';

const getEvents = (state) => state.events.calEvents;

// process google events data for React Big calendar
const getFilteredEvents = createSelector(
  [getEvents],
  (normalizedData) => {
    const data = Object.values(normalizedData);
    const flatData = data.reduce((acc, val) => acc.concat(val), []);
    console.log(flatData);
    // debugger;
    const formatedEvents = flatData.map((eachEvent) => ({
      id: eachEvent.id,
      title: eachEvent.summary,
      // The format here is crucial, it converts the unix time, which is in gmt,
      // To the machine timezone, therefore, displaying it accordingly.
      end: new Date(moment.unix(eachEvent.end.dateTime).format()),
      start: new Date(moment.unix(eachEvent.start.dateTime).format()),
      originalId: eachEvent.originalId,
      iCalUID: eachEvent.iCalUID,
      isRecurring: eachEvent.isRecurring,
      providerType: eachEvent.providerType,
      caldavType: eachEvent.caldavType,
      calendarId: eachEvent.calendarId
    }));
    return formatedEvents;
  }
);

export default getFilteredEvents;
