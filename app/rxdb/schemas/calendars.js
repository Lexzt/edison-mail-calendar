export default {
  title: 'Calendar schema',
  version: 0,
  description: 'Describes a Calendar object',
  type: 'object',
  properties: {
    calendarId: {
      type: 'string',
      primary: true
    },
    ownerId: {
      type: 'string'
    },
    name: {
      type: 'string'
    },
    description: {
      type: 'string'
    },
    location: {
      type: 'string'
    },
    timezone: {
      type: 'string'
    },
    url: {
      type: 'string'
    }
  },
  required: ['calendarId']
};
