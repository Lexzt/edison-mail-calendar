import { Op } from 'sequelize';
import UserBlock from '../schemas/users';

export const insertUserIntoDatabase = async (user) => {
  const debug = false;
  const dbUser = await UserBlock.findAll({
    where: {
      email: user.email,
      providerType: user.providerType,
      caldavType: user.caldavType === undefined ? null : user.caldavType,
      url: user.url === undefined ? null : user.url
    }
  });

  if (dbUser.length === 0) {
    if (debug) {
      console.log('(Log) No User of ', user, ', Upserting');
    }

    await UserBlock.upsert(user);
  } else if (dbUser.length > 1) {
    console.log('(Error) Duplicate user in the database');
  } else {
    if (debug) {
      console.log('(Log) Found User of ', user, ', Updating');
    }

    await UserBlock.update(
      {
        originalId: user.originalId,
        email: user.email,
        providerType: user.providerType,
        accessToken: user.accessToken,
        accessTokenExpiry: user.accessTokenExpiry,
        password: user.password,
        url: user.url === undefined ? null : user.url,
        caldavType: user.caldavType === undefined ? null : user.caldavType
      },
      {
        where: {
          personId: {
            [Op.eq]: dbUser.personId
          }
        }
      }
    );
  }
};

export const findUser = async (providerType, owner) =>
  UserBlock.findOne({
    where: {
      providerType: {
        [Op.eq]: providerType
      },
      email: { [Op.eq]: owner }
    }
  });

export const getAllUsers = async () => {
  const events = await UserBlock.findAll();
  return events;
};
