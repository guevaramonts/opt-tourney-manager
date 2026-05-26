import { auth } from '../auth/firebase';

const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

async function getAuthHeaders(method: string, path: string): Promise<Record<string, string>> {
  const needsAuth = method !== 'GET' || path.startsWith('/player');
  if (!needsAuth) return {};
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const authHeaders = await getAuthHeaders(method, path);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
const put = <T>(path: string, body?: unknown) => request<T>('PUT', path, body);
const del = <T>(path: string) => request<T>('DELETE', path);

export const api = {
  // Health
  health: () => get<{ status: string }>('/health'),

  // Clock
  clockPlay: (tournamentId?: number) => post<{ running: boolean }>('/clock/play', { tournamentId }),
  clockPause: () => post<{ running: boolean }>('/clock/pause'),
  clockReset: () => post('/clock/reset'),
  clockNextLevel: () => post('/clock/next-level'),
  clockState: () => get('/clock/state'),

  // Tournaments
  getAllTournaments: () => get<unknown[]>('/tournaments'),
  getTournament: (id: number) => get<unknown>(`/tournaments/${id}`),
  createTournament: (data: unknown) => post<unknown>('/tournaments', data),
  updateTournament: (id: number, data: unknown) => put<unknown>(`/tournaments/${id}`, data),
  finishTournament: (id: number) => post<{ ok: boolean }>(`/tournaments/${id}/finish`),
  finalizeTournament: (id: number) => post<unknown>(`/tournaments/${id}/finalize`),
  deleteTournament: (id: number) => del<unknown>(`/tournaments/${id}`),
  resetTournamentProgress: (id: number) => post<unknown>(`/tournaments/${id}/reset`),

  // Players
  getAllPlayers: () => get<unknown[]>('/players'),
  createPlayer: (data: unknown) => post<unknown>('/players', data),
  updatePlayer: (id: number, data: unknown) => put<unknown>(`/players/${id}`, data),
  deletePlayer: (id: number) => del<unknown>(`/players/${id}`),
  registerPlayer: (data: unknown) => post<unknown>('/players/register', data),
  unregisterPlayer: (data: unknown) => post<unknown>('/players/unregister', data),
  getActivePlayers: (tournamentId: number) => get<unknown[]>(`/players/active/${tournamentId}`),

  // Tables
  getTables: () => get<unknown[]>('/tables'),
  getTableAssignments: (tournamentId: number) => get<unknown[]>(`/tables/assignments/${tournamentId}`),
  getTablePositionState: (tournamentId: number) => get<unknown[]>(`/tables/position-state/${tournamentId}`),
  getConsolidationPlan: (tournamentId: number) => get<unknown>(`/tables/consolidation-plan/${tournamentId}`),
  executeConsolidationWave: (tournamentId: number) => post<unknown>(`/tables/consolidate/${tournamentId}`),
  randomAssignSeats: (tournamentId: number) => post<unknown>(`/tables/random-assign/${tournamentId}`),
  resetSeating: (tournamentId: number) => post<unknown>(`/tables/reset-seating/${tournamentId}`),
  movePlayerForRebalance: (data: unknown) => post<unknown>('/tables/move-player', data),

  // Bounty
  recordElimination: (data: unknown) => post<unknown>('/bounty/eliminate', data),
  recordEliminations: (data: unknown) => post<unknown>('/bounty/eliminate-batch', data),
  getBountyLeaderboard: (tournamentId: number) => get<unknown[]>(`/bounty/leaderboard/${tournamentId}`),

  // Blind Structures
  getBlindStructures: () => get<unknown[]>('/blind-structures'),
  getBlindStructureLevels: (id: number) => get<unknown[]>(`/blind-structures/${id}/levels`),
  createBlindStructure: (data: unknown) => post<unknown>('/blind-structures', data),
  updateBlindStructure: (id: number, data: unknown) => put<unknown>(`/blind-structures/${id}`, data),
  deleteBlindStructure: (id: number) => del<unknown>(`/blind-structures/${id}`),

  // Seasons
  getAllSeasons: () => get<unknown[]>('/seasons'),
  createSeason: (name: string) => post<unknown>('/seasons', { name }),
  startSeason: (id: number) => post<unknown>(`/seasons/${id}/start`),
  finishSeason: (id: number) => post<unknown>(`/seasons/${id}/finish`),
  getSeasonDeleteImpact: (id: number) => get<unknown>(`/seasons/${id}/delete-impact`),
  deleteSeason: (id: number) => del<unknown>(`/seasons/${id}`),
  getSeasonLeaderboard: (id: number) => get<unknown[]>(`/seasons/${id}/leaderboard`),
  getSeasonTournaments: (id: number) => get<unknown[]>(`/seasons/${id}/tournaments`),
  addTournamentToSeason: (seasonId: number, data: unknown) => post<unknown>(`/seasons/${seasonId}/add-tournament`, data),
  syncSeasonTournamentResults: (seasonId: number, tournamentId: number) => post<unknown>(`/seasons/${seasonId}/sync/${tournamentId}`),
  getScoringMatrix: () => get<unknown[]>('/seasons/scoring-matrix'),

  // Payouts
  calculatePayouts: (tournamentId: number) => get<unknown>(`/payouts/${tournamentId}`),

  // Data
  resetAllDataKeepPlayers: () => post<unknown>('/data/reset-keep-players'),

  // Invitations (admin)
  sendInvitations: (tournamentId: number, emails: string[]) =>
    post<{ results: Array<{ email: string; status: string; reason?: string }> }>('/invitations', { tournamentId, emails }),
  getInvitations: (tournamentId: number) =>
    get<Array<{ id: number; email: string; status: string; created_at: string }>>(`/invitations?tournamentId=${tournamentId}`),
  revokeInvitation: (id: number) => del<{ ok: boolean }>(`/invitations/${id}`),
  validateInvitationToken: (token: string) =>
    get<{ valid: boolean; email?: string; tournament_id?: number; tournament_name?: string; error?: string }>(`/invitations/${token}`),

  // Player self-service
  playerLink: (data: { name?: string; nickname?: string; phone?: string }) =>
    post<unknown>('/player/link', data),
  playerMe: () => get<unknown>('/player/me'),
  playerAcceptInvitation: (token: string) =>
    post<{ ok: boolean; tournament_id: number; tournament_name: string }>('/player/accept-invitation', { token }),
};
