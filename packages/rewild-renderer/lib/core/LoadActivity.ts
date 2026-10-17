import { Dispatcher } from 'rewild-common';

/** Dispatches the URL of each file the renderer starts downloading. */
export const loadActivity = new Dispatcher<string>();
