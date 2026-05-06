import { createContext, useContext } from 'react';
import type { Tournament } from '@shared/types';

interface TournamentContextValue {
  activeTournament: Tournament | null;
  setActiveTournament: (t: Tournament | null) => void;
}

export const TournamentContext = createContext<TournamentContextValue>({
  activeTournament: null,
  setActiveTournament: () => {},
});

export function useTournament() {
  return useContext(TournamentContext);
}
