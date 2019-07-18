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
      type: 'number',
      default: 1
    },
    until: {
      type: 'string'
    },

    wkSt: {
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
    isCount: {
      type: 'boolean'
    },

    iCalUid: {
      type: 'string'
    },

    byWeekNo: {
      type: 'string',
      default: ''
    },
    byWeekDay: {
      type: 'string',
      default: ''
    },
    byMonth: {
      type: 'string',
      default: ''
    },
    byMonthDay: {
      type: 'string',
      default: ''
    },
    byYearDay: {
      type: 'string',
      default: ''
    },
    byHour: {
      type: 'string',
      default: ''
    },
    byMinute: {
      type: 'string',
      default: ''
    },
    bySecond: {
      type: 'string',
      default: ''
    },
    byEaster: {
      type: 'string',
      default: ''
    },
    bySetPos: {
      type: 'string',
      default: ''
    }
  }
};
