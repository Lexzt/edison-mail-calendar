export default {
  title: 'Recurrence Schema',
  version: 0,
  description: 'Describes a recurrence pattern of a recurring event',
  type: 'object',
  properties: {
    // unique id for each recurrence pattern object
    id: {
      type: 'string',
      primary: true
    },
    recurringTypeId: {
      type: 'string'
    },
    originalId: {
      type: 'string'
    },
    freq: {
      type: 'string'
    },
    interval: {
      type: 'number'
    },
    until: {
      type: 'string'
    },
    exDates: {
      type: 'array'
    },
    recurrenceIds: {
      type: 'array'
    },
    modifiedThenDeleted: {
      type: 'boolean'
    },
    weeklyPattern: {
      type: 'array'
    },
    numberOfRepeats: {
      type: 'number',
      default: 0
    },
    iCalUid: {
      type: 'string'
    },
    byWeekNo: {
      type: 'string'
    },
    byWeekDay: {
      type: 'string'
    },
    byMonth: {
      type: 'string'
    },
    byMonthDay: {
      type: 'string'
    }
  }
};
