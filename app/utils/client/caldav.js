import md5 from 'md5';
import * as ProviderTypes from '../constants';

export const filterCaldavUser = (jsonObj, url) => ({
  personId: md5(jsonObj.username),
  originalId: jsonObj.username,
  email: jsonObj.username,
  providerType: ProviderTypes.CALDAV,
  password: jsonObj.password,
  url
});

export const remove = () => ({});
