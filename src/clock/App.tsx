import { useState, useEffect } from 'react';
import TournamentClock from './components/TournamentClock';
import AssassinFeed from './components/AssassinFeed';
import SeatingChart from './components/SeatingChart';
import PayoutPanel from './components/PayoutPanel';
import type { ClockState, BountyEntry, EliminationEvent, SeatChartEntry, PayoutResult } from '@shared/types';

const INITIAL_CLOCK: ClockState = {
  level: 1,
  smallBlind: 25,
  bigBlind: 50,
  ante: 0,
  remainingSeconds: 900,
  running: false,
  nextSmallBlind: 50,
  nextBigBlind: 100,
  nextAnte: null,
};

export default function App() {
  const [clock, setClock] = useState<ClockState>(INITIAL_CLOCK);
  const [leaderboard, setLeaderboard] = useState<BountyEntry[]>([]);
  const [seating, setSeating] = useState<SeatChartEntry[]>([]);
  const [payouts, setPayouts] = useState<PayoutResult | null>(null);

  useEffect(() => {
    let activeTournamentId: number | null = null;

    const loadSidebarData = async () => {
      try {
        const tournaments = await window.api.getAllTournaments();
        const activeTournament =
          tournaments.find((t) => t.status === 'pending' && (t.player_count ?? 0) > 0) ??
          tournaments.find((t) => t.status === 'pending') ??
          tournaments.find((t) => t.status !== 'finished') ??
          tournaments[0];

        if (!activeTournament) {
          setLeaderboard([]);
          setSeating([]);
          setPayouts(null);
          return;
        }

        activeTournamentId = activeTournament.id;

        const [rows, payout, bountyLeaders] = await Promise.all([
          window.api.getTableAssignments(activeTournament.id),
          window.api.calculatePayouts(activeTournament.id),
          window.api.getBountyLeaderboard(activeTournament.id),
        ]);

        const chart = rows
          .filter((r) => r.player_name)
          .map((r) => ({ player_name: r.player_name!, table_name: r.table_name, seat_number: r.seat_number }));

        setSeating(chart as SeatChartEntry[]);
        setPayouts(payout);
        setLeaderboard(bountyLeaders);
      } catch {
        // Ignore transient IPC errors while windows or DB are initializing.
      }
    };

    void loadSidebarData();

    const unsubTick = window.api.onClockTick((payload) => {
      setClock((prev) => ({ ...prev, ...(payload as Partial<ClockState>) }));
    });

    const unsubElim = window.api.onPlayerEliminated((payload) => {
      const ev = payload as EliminationEvent;
      setLeaderboard(ev.leaderboard);
      if (ev.victimName) {
        setSeating((prev) => prev.filter((s) => s.player_name !== ev.victimName));
      }

      if (activeTournamentId !== null) {
        window.api
          .calculatePayouts(activeTournamentId)
          .then(setPayouts)
          .catch(() => {
            /* ignore */
          });
      }
    });

    const unsubSeats = window.api.onSeatsAssigned((payload) => {
      const ev = payload as { chart: SeatChartEntry[] };
      setSeating(ev.chart);

      if (activeTournamentId !== null) {
        Promise.all([
          window.api.getBountyLeaderboard(activeTournamentId),
          window.api.calculatePayouts(activeTournamentId),
        ])
          .then(([bountyLeaders, payout]) => {
            setLeaderboard(bountyLeaders);
            setPayouts(payout);
          })
          .catch(() => {
            /* ignore */
          });
      }
    });

    return () => {
      unsubTick();
      unsubElim();
      unsubSeats();
    };
  }, []);

  return (
    <div className="h-screen bg-felt-900 text-white flex overflow-hidden">
      {/* Main clock — 75% of screen */}
      <div className="flex-1 flex items-center justify-center">
        <TournamentClock clock={clock} />
      </div>

      {/* Sidebar — 25% */}
      <aside className="w-72 border-l border-green-900/40 flex flex-col px-4 py-4 overflow-hidden h-screen">
        <AssassinFeed entries={leaderboard} />
        <PayoutPanel payouts={payouts} />
        <SeatingChart entries={seating} />
      </aside>
    </div>
  );
}
