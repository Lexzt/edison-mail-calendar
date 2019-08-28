import { TestScheduler } from 'rxjs/testing';
import { clearAllEventsEpics } from '../../app/epics/events';

import { createDb, clearDb } from '../../app/rxdb';

const testScheduler = new TestScheduler((actual, expected) => {
  console.log('here?!');
  expect(actual).toEqual(expected);
});

describe('Events Epics', () => {
  // it('Should handle Clearing all events', () => {
  //   testScheduler.run(({ hot, cold, expectObservable }) => {
  //     const action$ = hot('-a', {
  //       a: { type: 'CLEAR_ALL_EVENTS' }
  //     });
  //     const state$ = null;
  //     const dependencies = {};

  //     const output$ = clearAllEventsEpics(action$, state$, dependencies);

  //     expectObservable(output$).toBe('-a', {
  //       a: {
  //         type: 'CLEAR_ALL_EVENTS_SUCCESS'
  //       }
  //     });
  //   });
  // });

  it('Testing', async () => {
    await testScheduler.run(async ({ hot, cold, expectObservable }) => {
      const action$ = hot('-a', {
        a: { type: 'CLEAR_ALL_EVENTS' }
      });
      const state$ = null;
      const dependencies = {};

      const db = await createDb();
      const results = await db.events.find().exec();
      console.log('prev', results.map((e) => e.toJSON()));

      await clearDb();

      const newdb = await createDb();
      const newresults = await newdb.events.find().exec();
      console.log('new', newresults.map((e) => e.toJSON()));

      const output$ = clearAllEventsEpics(action$, state$, dependencies);

      expectObservable(output$).toBe('-a', {
        a: {
          type: 'CLEAR_ALL_EVENTS_SUCCESS'
        }
      });
    });
  });
});
