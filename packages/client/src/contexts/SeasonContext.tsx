import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface Season {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'finished';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

interface SeasonContextValue {
  activeSeason: Season | null;
  setActiveSeason: (season: Season | null) => void;
}

const SeasonContext = createContext<SeasonContextValue>({
  activeSeason: null,
  setActiveSeason: () => {},
});

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  return (
    <SeasonContext.Provider value={{ activeSeason, setActiveSeason }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  return useContext(SeasonContext);
}
