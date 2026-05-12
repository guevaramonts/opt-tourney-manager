import { useState, useEffect, useRef, useCallback } from 'react';
import TournamentClock from './components/TournamentClock';
import AssassinFeed from './components/AssassinFeed';
import SeatingChart from './components/SeatingChart';
import PayoutPanel from './components/PayoutPanel';
import PointsFeed from './components/PointsFeed';
import type {
  ClockState,
  BountyEntry,
  EliminationEvent,
  LivePointAward,
  SeatChartEntry,
  PayoutResult,
} from '@shared/types';

const INITIAL_CLOCK: ClockState = {
  level: 1,
  smallBlind: 25,
  bigBlind: 50,
  ante: 0,
  isBreak: false,
  breakLabel: null,
  remainingSeconds: 900,
  running: false,
  nextSmallBlind: 50,
  nextBigBlind: 100,
  nextAnte: null,
  nextIsBreak: false,
  nextBreakLabel: null,
};

export default function App() {
  const [clock, setClock] = useState<ClockState>(INITIAL_CLOCK);
  const [leaderboard, setLeaderboard] = useState<BountyEntry[]>([]);
  const [seating, setSeating] = useState<SeatChartEntry[]>([]);
  const [payouts, setPayouts] = useState<PayoutResult | null>(null);
  const [pointAwards, setPointAwards] = useState<Array<LivePointAward & { id: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const activeTournamentIdRef = useRef<number | null>(null);
  const displayNameByRealRef = useRef<Record<string, string>>({});

  function displayName(realName: string | null | undefined): string {
    if (!realName) return '';
    return displayNameByRealRef.current[realName] ?? realName;
  }

  const loadSidebarData = useCallback(async () => {
    try {
      const tournaments = await window.api.getAllTournaments();
      const activeTournament =
        tournaments.find((t) => t.status === 'pending' && (t.player_count ?? 0) > 0) ??
        tournaments.find((t) => t.status === 'pending') ??
        tournaments.find((t) => t.status !== 'finished') ??
        tournaments[0];

      if (!activeTournament) {
        activeTournamentIdRef.current = null;
        setLeaderboard([]);
        setSeating([]);
        setPayouts(null);
        setPointAwards([]);
        return;
      }

      if (activeTournamentIdRef.current !== activeTournament.id) {
        setPointAwards([]);
      }
      activeTournamentIdRef.current = activeTournament.id;

      const [rows, payout, bountyLeaders, players] = await Promise.all([
        window.api.getTableAssignments(activeTournament.id),
        window.api.calculatePayouts(activeTournament.id),
        window.api.getBountyLeaderboard(activeTournament.id),
        window.api.getAllPlayers(),
      ]);

      displayNameByRealRef.current = Object.fromEntries(
        players.map((p) => [p.name, p.nickname?.trim() ? p.nickname : p.name])
      );

      const chart = rows
        .filter((r) => r.player_name)
        .map((r) => ({ player_name: displayName(r.player_name), table_name: r.table_name, seat_number: r.seat_number }));

      setSeating(chart as SeatChartEntry[]);
      setPayouts(payout);
      setLeaderboard(bountyLeaders.map((entry) => ({ ...entry, name: displayName(entry.name) })));
    } catch {
      // Ignore transient IPC errors while windows or DB are initializing.
    }
  }, []);

  async function handleManualRefresh() {
    setRefreshing(true);
    try {
      await loadSidebarData();
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadSidebarData();

    const unsubTick = window.api.onClockTick((payload) => {
      setClock((prev) => ({ ...prev, ...(payload as Partial<ClockState>) }));
    });

    const unsubElim = window.api.onPlayerEliminated((payload) => {
      const ev = payload as EliminationEvent;
      setLeaderboard(ev.leaderboard.map((entry) => ({ ...entry, name: displayName(entry.name) })));

      if (ev.awards && ev.awards.length > 0) {
        const stamped = Date.now();
        const nextAwards = ev.awards.map((award, index) => ({
          ...award,
          playerName: displayName(award.playerName),
          id: `${stamped}-${ev.victimId}-${index}`,
        }));
        setPointAwards((prev) => [...nextAwards, ...prev].slice(0, 16));
      }

      if (ev.victimName) {
        const victimDisplay = displayName(ev.victimName);
        setSeating((prev) => prev.filter((s) => s.player_name !== victimDisplay));
      }

      const activeTournamentId = activeTournamentIdRef.current;
      if (activeTournamentId !== null) {
        window.api
          .calculatePayouts(activeTournamentId)
          .then(setPayouts)
          .catch(() => {
            /* ignore */
          });
      }
    });

    const unsubSeats = window.api.onSeatsAssigned(() => {
      void loadSidebarData();
    });

    const unsubReset = window.api.onTournamentProgressReset(() => {
      setPointAwards([]);
      void loadSidebarData();
    });

    return () => {
      unsubTick();
      unsubElim();
      unsubSeats();
      unsubReset();
    };
  }, [loadSidebarData]);

  return (
    <div className="h-screen bg-felt-900 text-white flex overflow-hidden">
      {/* Left sidebar: payouts + player roster */}
      <aside className="w-72 border-r border-green-900/40 flex flex-col px-4 py-4 overflow-hidden h-screen">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="rounded-md border border-gray-700 bg-gray-900/70 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:border-orange-500 hover:text-orange-300 disabled:opacity-40"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <PayoutPanel payouts={payouts} />
        <SeatingChart entries={seating} showSeatNumbers={!clock.running} />
      </aside>

      {/* Main clock */}
      <div className="flex-1 flex items-center justify-center">
        <TournamentClock clock={clock} />
      </div>

      {/* Right sidebar: live point + bounty widgets */}
      <aside className="w-72 border-l border-green-900/40 flex flex-col px-4 py-4 overflow-hidden h-screen">
        <PointsFeed entries={pointAwards} />
        <AssassinFeed entries={leaderboard} />
      </aside>
    </div>
  );
}
