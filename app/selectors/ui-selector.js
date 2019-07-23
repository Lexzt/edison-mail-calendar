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
    const formatedEvents = flatData.map((eachEvent) => ({
      id: eachEvent.id,
      title: eachEvent.summary,
      end: new Date(moment(eachEvent.end.dateTime).format()),
      start: new Date(moment(eachEvent.start.dateTime).format()),
      originalId: eachEvent.originalId,
      iCalUID: eachEvent.iCalUID,
      isRecurring: eachEvent.isRecurring,
      providerType: eachEvent.providerType,
      calendarId: eachEvent.calendarId
    }));
    return formatedEvents;
  }
);

export default getFilteredEvents;
