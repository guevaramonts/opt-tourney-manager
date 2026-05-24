import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface Tournament {
  id: number;
  name: string;
  buy_in: number;
  bounty_amount: number;
  blind_structure_id?: number | null;
  blind_structure_name?: string | null;
  status: 'pending' | 'finished' | 'finalized';
  player_count?: number;
}

interface TournamentContextValue {
  activeTournament: Tournament | null;
  setActiveTournament: (t: Tournament | null) => void;
}

const TournamentContext = createContext<TournamentContextValue>({
  activeTournament: null,
  setActiveTournament: () => {},
});

export function TournamentProvider({ children }: { children: ReactNode }) {
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  return (
    <TournamentContext.Provider value={{ activeTournament, setActiveTournament }}>
      {children}
    </TournamentContext.Provider>
  );
}

export function useTournament() {
  return useContext(TournamentContext);
}
