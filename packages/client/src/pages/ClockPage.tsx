import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../api/client';
import { useClockState, usePlayerEliminated, useSeatsAssigned, useTournamentProgressReset } from '../api/socket';
import TournamentClock from '../views/clock/TournamentClock';
import PayoutPanel from '../views/clock/PayoutPanel';
import SeatingChart from '../views/clock/SeatingChart';
import AssassinFeed from '../views/clock/AssassinFeed';
import PointsFeed from '../views/clock/PointsFeed';
import type { PayoutResult } from '../views/clock/PayoutPanel';
import type { BountyEntry } from '../views/clock/AssassinFeed';
import type { LivePointAward } from '../views/clock/PointsFeed';
import type { SeatChartEntry } from '../views/clock/SeatingChart';

interface Tournament { id: number; name: string; status: string; player_count?: number; }
interface Player { id: number; name: string; nickname: string | null; }
interface EliminationEvent {
  victimId: number; victimName: string | null;
  awards: LivePointAward[];
  leaderboard: BountyEntry[];
}

export default function ClockPage() {
  const clock = useClockState();
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
      const [tournaments, players] = await Promise.all([
        api.getAllTournaments() as Promise<Tournament[]>,
        api.getAllPlayers() as Promise<Player[]>,
      ]);

      const active =
        tournaments.find((t) => t.status === 'pending' && (t.player_count ?? 0) > 0) ??
        tournaments.find((t) => t.status === 'pending') ??
        tournaments.find((t) => t.status !== 'finished' && t.status !== 'finalized') ??
        tournaments[0];

      if (!active) {
        activeTournamentIdRef.current = null;
        setLeaderboard([]); setSeating([]); setPayouts(null); setPointAwards([]);
        return;
      }

      if (activeTournamentIdRef.current !== active.id) setPointAwards([]);
      activeTournamentIdRef.current = active.id;

      displayNameByRealRef.current = Object.fromEntries(
        players.map((p) => [p.name, p.nickname?.trim() ? p.nickname : p.name])
      );

      const [assignments, payout, bountyLeaders] = await Promise.all([
        api.getTableAssignments(active.id) as Promise<Array<{ player_name: string | null; table_name: string; seat_number: number | null }>>,
        api.calculatePayouts(active.id) as Promise<PayoutResult>,
        api.getBountyLeaderboard(active.id) as Promise<BountyEntry[]>,
      ]);

      setSeating(
        assignments
          .filter((r) => r.player_name)
          .map((r) => ({
            player_name: displayName(r.player_name),
            table_name: r.table_name,
            seat_number: r.seat_number ?? 0,
          }))
      );
      setPayouts(payout);
      setLeaderboard(bountyLeaders.map((e) => ({ ...e, name: displayName(e.name) })));
    } catch {
      // ignore transient errors during startup
    }
  }, []);

  useEffect(() => { void loadSidebarData(); }, [loadSidebarData]);

  usePlayerEliminated(useCallback((payload: unknown) => {
    const ev = payload as EliminationEvent;
    setLeaderboard(ev.leaderboard.map((e) => ({ ...e, name: displayName(e.name) })));

    if (ev.awards?.length > 0) {
      const stamped = Date.now();
      setPointAwards((prev) =>
        [...ev.awards.map((a, i) => ({
          ...a,
          playerName: displayName(a.playerName),
          id: `${stamped}-${ev.victimId}-${i}`,
        })), ...prev].slice(0, 16)
      );
    }

    if (ev.victimName) {
      const victimDisplay = displayName(ev.victimName);
      setSeating((prev) => prev.filter((s) => s.player_name !== victimDisplay));
    }

    const tid = activeTournamentIdRef.current;
    if (tid !== null) {
      void (api.calculatePayouts(tid) as Promise<PayoutResult>).then(setPayouts).catch(() => {});
    }
  }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  useSeatsAssigned(useCallback(() => { void loadSidebarData(); }, [loadSidebarData]));
  useTournamentProgressReset(useCallback(() => { setPointAwards([]); void loadSidebarData(); }, [loadSidebarData]));

  if (!clock) {
    return (
      <div className="h-screen bg-felt-900 flex items-center justify-center">
        <p className="text-gray-500 text-2xl font-mono tracking-widest">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-felt-900 text-white flex overflow-hidden">
      {/* Left sidebar: payouts + seating chart */}
      <aside className="w-72 border-r border-green-900/40 flex flex-col px-4 py-4 overflow-hidden h-screen">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => { setRefreshing(true); void loadSidebarData().finally(() => setRefreshing(false)); }}
            disabled={refreshing}
            className="rounded-md border border-gray-700 bg-gray-900/70 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:border-orange-500 hover:text-orange-300 disabled:opacity-40"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <PayoutPanel payouts={payouts} />
        <SeatingChart entries={seating} showSeatNumbers={!clock.running} />
      </aside>

      {/* Center: main clock */}
      <div className="flex-1 flex items-center justify-center">
        <TournamentClock clock={clock} />
      </div>

      {/* Right sidebar: live points feed + bounty leaderboard */}
      <aside className="w-72 border-l border-green-900/40 flex flex-col px-4 py-4 overflow-hidden h-screen">
        <PointsFeed entries={pointAwards} />
        <AssassinFeed entries={leaderboard} />
      </aside>
    </div>
  );
}
