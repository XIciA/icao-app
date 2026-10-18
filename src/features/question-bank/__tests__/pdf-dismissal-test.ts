import { isPrintDismissal } from '../export/pdf-errors';
it('recognizes iOS print-sheet dismissal without hiding printing failures', () => {
  expect(isPrintDismissal({code:'ERR_PRINT_INCOMPLETE'})).toBe(true);
  expect(isPrintDismissal({code:'ERR_PICKER_CANCELED'})).toBe(true);
  expect(isPrintDismissal({code:'ERR_PRINTING_JOB_FAILED',message:'Printing failed'})).toBe(false);
  expect(isPrintDismissal({code:'ERR_FILE_OPENING'})).toBe(false);
  expect(isPrintDismissal(new Error('unavailable'))).toBe(false);
});
