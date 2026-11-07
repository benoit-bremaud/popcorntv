import { createContext } from 'react';

/** Ids of the titles the active profile has watched; read by every poster (spec watched-marks R4). */
export const WatchedContext = createContext<ReadonlySet<string>>(new Set());
