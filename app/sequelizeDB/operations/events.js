import { Op } from 'sequelize';
import EventsBlock from '../schemas/events';

// #region Get Events
export const getAllEvents = async () => {
  const events = await EventsBlock.findAll();
  return events;
};

export const getOneEventById = async (id) => {
  const event = await EventsBlock.findOne({
    where: {
      id: {
        [Op.eq]: id
      }
    }
  });
  return event;
};

export const getOneEventByOriginalId = async (originalId) => {
  const event = await EventsBlock.findOne({
    where: {
      originalId: {
        [Op.eq]: originalId
      }
    }
  });
  return event;
};

export const getOneEventByiCalUID = async (iCalUid) => {
  const event = await EventsBlock.findOne({
    where: {
      iCalUid: {
        [Op.eq]: iCalUid
      }
    }
  });
  return event;
};

export const getAllEventByOriginalId = async (originalId) => {
  const events = await EventsBlock.findAll({
    where: {
      originalId: {
        [Op.eq]: originalId
      }
    }
  });
  return events;
};

export const getAllEventsByRecurringEventId = async (recurringEventId) => {
  const event = await EventsBlock.findAll({
    where: {
      recurringEventId: {
        [Op.eq]: recurringEventId
      }
    }
  });
  return event;
};

// export const getOneEventByiCalUIDandStartDateTime = async (iCalUid, startDateTime) => {
//   const event = EventsBlock.findOne({
//     where: {
//       iCalUid: {
//         [Op.eq]: iCalUid
//       },
//       'start.dateTime': {
//         [Op.eq]: startDateTime
//       }
//     }
//   });
// };
// #endregion

// #region Inserting Events
export const insertEventsIntoDatabase = async (event) => {
  const debug = false;
  // debugger;

  if (debug) {
    console.log(event);
  }
  // As we are inserting a new user into the database, and personId being the priamry key
  // that is uuidv4 generated, meaning unique each time, we need to check based off the
  // user information before we decide to upsert or update accrordingly.
  const dbEvent = await EventsBlock.findAll({
    where: {
      iCalUID: {
        [Op.eq]: event.iCalUID
      },
      'start.dateTime': {
        [Op.eq]: event.start.dateTime
      }
    }
  });

  if (dbEvent.length === 0) {
    if (debug) {
      console.log('(Log) No Event found, Upserting');
    }

    await EventsBlock.upsert(event);
  } else if (dbEvent.length === 1) {
    // debugger;
    if (debug) {
      console.log('(Log) Found Event of ', dbEvent, ', Updating');
    }

    event.id = dbEvent[0].id;
    await EventsBlock.update(event, {
      where: {
        id: {
          [Op.eq]: dbEvent[0].id
        }
      }
    });
  } else {
    console.log('(Error) Duplicate Event in the database');
  }
  return event;
};
// #endregion

// #region Delete Event
export const deleteEventById = async (id) => {
  const debug = true;

  const test = await EventsBlock.destroy({
    where: {
      id: {
        [Op.eq]: id
      }
    }
  });

  debugger;
};

export const deleteEventByOriginalId = async (originalId) => {
  const debug = true;

  await EventsBlock.destroy({
    where: {
      originalId: {
        [Op.eq]: originalId
      }
    }
  });
};

export const deleteEventByOriginaliCalUID = async (iCalUID) => {
  const debug = true;

  await EventsBlock.destroy({
    where: {
      iCalUID: {
        [Op.eq]: iCalUID
      }
    }
  });
};

export const deleteEventByiCalUIDandStartDateTime = async (iCalUid, startDateTime) => {
  const debug = true;

  await EventsBlock.destroy({
    where: {
      iCalUid: {
        [Op.eq]: iCalUid
      },
      'start.dateTime': {
        [Op.eq]: startDateTime
      }
    }
  });
};

export const deleteAllEventByRecurringEventId = async (recurringEventId) => {
  const debug = true;

  await EventsBlock.destroy({
    where: {
      recurringEventId: {
        [Op.eq]: recurringEventId
      }
    }
  });
};

// #endreigon

// #region Update Event
export const updateEventById = async (id, data) => {
  const debug = true;

  await EventsBlock.update(data, {
    where: {
      id: {
        [Op.eq]: id
      }
    }
  });
};

export const updateEventByOriginalId = async (originalId, event) => {
  const debug = true;

  await EventsBlock.update(event, {
    where: {
      originalId: {
        [Op.eq]: originalId
      }
    }
  });
};

export const updateEventByiCalUIDandStartDateTime = async (iCalUid, startDateTime, event) => {
  const debug = true;

  await EventsBlock.update(event, {
    where: {
      iCalUid: {
        [Op.eq]: iCalUid
      },
      'start.dateTime': {
        [Op.eq]: startDateTime
      }
    }
  });
};

export const updateEventiCalString = async (iCalUid, iCALString) => {
  const debug = true;

  await EventsBlock.update(
    {
      iCALString
    },
    {
      where: {
        iCalUid: {
          [Op.eq]: iCalUid
        }
      }
    }
  );
};

export const updateEventRecurringEventId = async (recurringEventId, data) => {
  const debug = true;

  await EventsBlock.update(data, {
    where: {
      recurringEventId: {
        [Op.eq]: recurringEventId
      }
    }
  });
};
// #endregion
