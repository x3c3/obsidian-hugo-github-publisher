import { NoteTracker as NoteTrackerClass } from './tracker';

export const getTracker = function () {
  return Promise.resolve({ NoteTracker: NoteTrackerClass });
};
