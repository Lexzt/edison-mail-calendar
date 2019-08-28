export default {
  title: 'Pending Action schema',
  version: 0,
  description: 'Describes a pending action object',
  type: 'object',
  properties: {
    uniqueId: {
      type: 'string',
      primary: true
    },
    eventId: {
      type: 'string'
    },
    status: {
      type: 'string'
    },
    type: {
      type: 'string'
    }
  },
  required: ['eventId', 'status', 'type']
};
