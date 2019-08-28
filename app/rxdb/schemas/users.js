export default {
  title: 'Users schema',
  version: 0,
  description: 'Describes a Users object',
  type: 'object',
  properties: {
    personId: {
      type: 'string',
      primary: true
    },
    originalId: {
      type: 'string'
    },
    email: {
      type: 'string'
    },
    providerType: {
      type: 'string'
    },
    accessToken: {
      type: 'string'
    },
    accessTokenExpiry: {
      type: 'number'
    },
    password: {
      type: 'string'
    },
    url: {
      type: 'string'
    },
    caldavType: {
      type: 'string'
    }
  },
  required: ['personId', 'originalId']
};
