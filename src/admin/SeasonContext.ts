import { createContext, useContext } from 'react';
import type { Season } from '@shared/types';

interface SeasonContextValue {
  activeSeason: Season | null;
  setActiveSeason: (season: Season | null) => void;
}

export const SeasonContext = createContext<SeasonContextValue>({
  activeSeason: null,
  setActiveSeason: () => {},
});

export function useSeason() {
  return useContext(SeasonContext);
}
