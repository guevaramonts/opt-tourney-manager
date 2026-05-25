import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface Season {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'finished';
  start_date: string | null;
  end_date: string | null;
}

interface LeaderboardEntry {
  player_id: number;
  player_name: string;
  total_points: number;
  tournament_count: number;
  top_6_scores: number[];
}

interface SeasonTournament {
  tournament_id: number;
  tournament_number: number;
  tournament_name: string;
  tournament_status: string;
  player_count: number;
  synced_results_count: number;
}

const RANK_STYLE: Record<number, string> = {
  1: 'text-yellow-400 font-black text-lg',
  2: 'text-gray-300 font-black text-lg',
  3: 'text-amber-600 font-black text-lg',
};

function TournamentStatusBadge({ status, playerCount }: { status: string; playerCount: number }) {
  if (status === 'finalized')
    return <span className="text-[10px] font-semibold uppercase tracking-wider bg-green-900/50 text-green-300 px-2 py-0.5 rounded-full">Finalized</span>;
  if (status === 'finished')
    return <span className="text-[10px] font-semibold uppercase tracking-wider bg-yellow-900/50 text-yellow-300 px-2 py-0.5 rounded-full">Finished</span>;
  if (playerCount > 0)
    return <span className="text-[10px] font-semibold uppercase tracking-wider bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full">In Progress</span>;
  return <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">Upcoming</span>;
}

export default function HomePage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [tournaments, setTournaments] = useState<SeasonTournament[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (api.getAllSeasons() as Promise<Season[]>).then((rows) => {
      setSeasons(rows);
      const pick = rows.find((s) => s.status === 'active') ?? rows[0] ?? null;
      if (pick) setSelectedId(pick.id);
    });
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    setLoading(true);
    void Promise.all([
      api.getSeasonLeaderboard(selectedId) as Promise<LeaderboardEntry[]>,
      api.getSeasonTournaments(selectedId) as Promise<SeasonTournament[]>,
    ]).then(([lb, ts]) => {
      setLeaderboard(lb);
      setTournaments(ts);
    }).finally(() => setLoading(false));
  }, [selectedId]);

  const selectedSeason = seasons.find((s) => s.id === selectedId);

  return (
    <div className="min-h-screen bg-felt-900 text-white">
      {/* Header */}
      <header className="border-b border-green-900/40 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black tracking-tight text-white">♠ OPT</span>
          <span className="text-sm text-gray-500 hidden sm:block">Olalde Poker Tournament</span>
        </div>
        <nav className="flex gap-4 text-xs text-gray-500">
          <a href="/clock" className="hover:text-orange-400 transition-colors">Clock</a>
          <a href="/admin" className="hover:text-orange-400 transition-colors">Admin</a>
        </nav>
      </header>

      <div className="max-w-5xl mx-auto px-6">
        {/* Hero */}
        <section className="pt-10 pb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Season Standings</h1>
          <p className="text-gray-400 max-w-2xl text-sm leading-relaxed">
            Seven tournaments per season. Placement points scale with field size — the bigger the game, the bigger the reward.
            Collect bounties for 3 bonus points each. Your best 6 scores count toward your season total.
          </p>
        </section>

        {/* Season tabs */}
        {seasons.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            {seasons.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  s.id === selectedId
                    ? 'bg-green-800 border-green-600 text-white'
                    : 'bg-transparent border-green-900/40 text-gray-400 hover:border-green-700 hover:text-gray-200'
                }`}
              >
                {s.name}
                {s.status === 'active' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <p className="text-gray-500 text-sm py-12 text-center">Loading…</p>
        ) : selectedSeason ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

            {/* Leaderboard */}
            <div className="bg-black/25 border border-green-900/30 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-green-900/30 flex items-center justify-between">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-green-400 font-semibold">Standings</h2>
                {selectedSeason.start_date && (
                  <span className="text-[11px] text-gray-600">{selectedSeason.start_date}</span>
                )}
              </div>
              {leaderboard.length === 0 ? (
                <p className="text-gray-600 text-sm px-5 py-8 text-center">No results recorded yet.</p>
              ) : (
                <ul className="divide-y divide-green-900/20">
                  {leaderboard.map((entry, i) => {
                    const rank = i + 1;
                    return (
                      <li key={entry.player_id} className="px-5 py-3 flex items-center gap-3">
                        <span className={`w-7 text-center shrink-0 font-mono ${RANK_STYLE[rank] ?? 'text-gray-600 text-sm'}`}>
                          {rank}
                        </span>
                        <span className="flex-1 font-medium text-white truncate">{entry.player_name}</span>
                        <div className="hidden sm:flex gap-1 items-center">
                          {entry.top_6_scores.map((pts, j) => (
                            <span key={j} className="text-[10px] font-mono text-gray-600 bg-gray-900/60 px-1.5 py-0.5 rounded">
                              {pts.toFixed(1)}
                            </span>
                          ))}
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-orange-300 font-bold font-mono text-base">{entry.total_points.toFixed(2)}</p>
                          <p className="text-[10px] text-gray-600">{entry.tournament_count} played</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Schedule */}
            <div className="bg-black/25 border border-green-900/30 rounded-xl overflow-hidden self-start">
              <div className="px-5 py-3.5 border-b border-green-900/30">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-green-400 font-semibold">Schedule</h2>
              </div>
              {tournaments.length === 0 ? (
                <p className="text-gray-600 text-sm px-5 py-8 text-center">No tournaments yet.</p>
              ) : (
                <ul className="divide-y divide-green-900/20">
                  {tournaments.map((t) => (
                    <li key={t.tournament_id} className="px-5 py-3 flex items-center gap-3">
                      <span className="text-xs font-mono text-gray-600 w-5 shrink-0">T{t.tournament_number}</span>
                      <div className="flex-1 min-w-0">
                        <TournamentStatusBadge status={t.tournament_status} playerCount={t.player_count} />
                        {t.player_count > 0 && (
                          <p className="text-[11px] text-gray-500 mt-0.5">{t.player_count} players</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-600 text-sm py-12 text-center">No seasons found.</p>
        )}

        {/* Scoring explainer */}
        <div className="mt-8 mb-12 bg-black/25 border border-green-900/30 rounded-xl px-6 py-5">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-green-400 font-semibold mb-4">How Scoring Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm text-gray-400">
            <div>
              <p className="text-white font-semibold mb-1">Placement Points</p>
              <p>Points are awarded based on finishing position. Larger fields award more points — a 1st place finish in a 20-player game scores higher than in a 10-player game.</p>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">Bounty Points</p>
              <p>Each bounty you collect is worth <span className="text-orange-300 font-bold">3 bonus points</span>. Knock out more players and rack up extra points on top of your placement finish.</p>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">Season Total</p>
              <p>There are 7 tournaments per season. Your <span className="text-orange-300 font-bold">top 6 scores</span> count — you get one drop week. Consistency and big finishes win seasons.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
