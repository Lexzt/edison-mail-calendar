export default {
  title: 'EventPerson Schema',
  version: 0,
  description: 'Describes a Event and a Person',
  type: 'object',
  properties: {
    eventPersonId: {
      type: 'string',
      primary: true
    },
    eventId: {
      type: 'string'
    },
    personId: {
      type: 'string'
    }
  },
  required: ['eventId', 'personId']
};
