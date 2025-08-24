import { NoteTracker as NoteTrackerClass } from './tracker';

export const getTracker = function (): Promise<{ NoteTracker: typeof NoteTrackerClass }> {
  return Promise.resolve({ NoteTracker: NoteTrackerClass });
};
