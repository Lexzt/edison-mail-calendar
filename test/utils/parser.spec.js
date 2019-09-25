import sinon from 'sinon'; // test lib
import util from 'util'; // circular lib checking

import * as dav from 'dav'; // caldav library
// import { rewire } from 'rewire';

// import rewire from 'rewire';
import * as PARSER from '../../app/utils/parser';
import { mockEventData, mockRecurrData } from '../reducers/mockEventData';
import {
  mockRecurrExpandedResults,
  mockRecurrPatternData
} from '../reducers/mockRecurrExpandedData';

// const parser = _parser;
// const Parser = rewire('../../app/utils/parser');
describe('CalDav Utils Functions', () => {
  let sandbox = null;
  // let tempParser;
  // try {
  //   tempParser = rewire('../../app/utils/parser');
  // } catch (e) {
  //   console.log(e);
  // }
  // tempParser.__set__('parser', parser);

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Parse Recurrence Events', () => {
    it('Empty Array', () => {
      // Parser.__set__();
      // parser = new Parser();
      const result = PARSER.parseRecurrenceEvents([]);
      expect(result).toEqual([]);
    });

    it('Single Events only', () => {
      const input = [
        { eventData: mockEventData[0] },
        { eventData: mockEventData[1] },
        { eventData: mockEventData[2] }
      ];

      const result = PARSER.parseRecurrenceEvents(input);
      result.forEach((event) => delete event.id);
    });

    it('One Recurring Event only', () => {
      const input = [{ eventData: mockEventData[0], recurData: mockRecurrData[0] }];
      const expectedResult = [mockRecurrPatternData[0]];

      const result = PARSER.parseRecurrenceEvents(input);

      result.forEach((event) => delete event.id);
      expectedResult.forEach((event) => delete event.id);
      expect(result).toEqual(expectedResult);
    });

    it('Multiple Recurring Event only', () => {
      const input = [
        { eventData: mockEventData[0], recurData: mockRecurrData[0] },
        { eventData: mockEventData[1], recurData: mockRecurrData[1] }
      ];
      const expectedResult = [mockRecurrPatternData[0], mockRecurrPatternData[1]];

      const result = PARSER.parseRecurrenceEvents(input);

      result.forEach((event) => delete event.id);
      expectedResult.forEach((event) => delete event.id);
      expect(result).toEqual(expectedResult);
    });

    it('One Recurring Event and One Single Event', () => {
      const input = [
        { eventData: mockEventData[0], recurData: mockRecurrData[0] },
        { eventData: mockEventData[1] }
      ];
      const expectedResult = [mockRecurrPatternData[0]];

      const result = PARSER.parseRecurrenceEvents(input);

      result.forEach((event) => delete event.id);
      expectedResult.forEach((event) => delete event.id);
      expect(result).toEqual(expectedResult);
    });

    it('Multiple Recurring Event and One Single Event', () => {
      const input = [
        { eventData: mockEventData[0], recurData: mockRecurrData[0] },
        { eventData: mockEventData[1], recurData: mockRecurrData[1] },
        { eventData: mockEventData[2] }
      ];
      const expectedResult = [mockRecurrPatternData[0], mockRecurrPatternData[1]];

      const result = PARSER.parseRecurrenceEvents(input);

      result.forEach((event) => delete event.id);
      expectedResult.forEach((event) => delete event.id);
      expect(result).toEqual(expectedResult);
    });

    it('Multiple Recurring Event and Multiple Single Event', () => {
      const input = [
        { eventData: mockEventData[0], recurData: mockRecurrData[0] },
        { eventData: mockEventData[1], recurData: mockRecurrData[1] },
        { eventData: mockEventData[2] },
        { eventData: mockEventData[3] }
      ];
      const expectedResult = [mockRecurrPatternData[0], mockRecurrPatternData[1]];

      const result = PARSER.parseRecurrenceEvents(input);

      result.forEach((event) => delete event.id);
      expectedResult.forEach((event) => delete event.id);
      expect(result).toEqual(expectedResult);
    });

    it('RecurData null or undefined', () => {
      const input = [
        { eventData: mockEventData[0], recurData: null },
        { eventData: mockEventData[0], recurData: undefined },
        { eventData: mockEventData[3] }
      ];
      const expectedResult = [];

      const result = PARSER.parseRecurrenceEvents(input);

      result.forEach((event) => delete event.id);
      expectedResult.forEach((event) => delete event.id);
      expect(result).toEqual(expectedResult);
    });
  });

  // describe('Converting iCal Weekly Pattern', () => {
  //   it('')
  // });

  // describe('Parse Event Persons', () => {
  //   it('')
  // });

  // describe('Parse Calendars', () => {
  //   it('')
  // });

  describe('Parse Calendar Data', () => {
    it('Parse Single Event', () => {
      const { iCALString, etag, caldavUrl } = mockEventData[11];
      const result = PARSER.parseCalendarData(iCALString, etag, caldavUrl, '');

      console.log(result);
    });
  });
});
