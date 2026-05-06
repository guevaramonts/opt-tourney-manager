// ─────────────────────────────────────────────────────────────────────────────
// Domain Models (mirrors the SQLite schema)
// ─────────────────────────────────────────────────────────────────────────────

export interface Tournament {
  id: number;
  name: string;
  buy_in: number;
  bounty_amount: number;
  status: 'pending' | 'finished';
  player_count?: number;
}

export interface Player {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  total_career_earnings: number;
  tournaments_played?: number;
}

export interface Registration {
  id: number;
  tournament_id: number;
  player_id: number;
  table_id: number | null;
  seat_number: number | null;
  chip_count: number;
  is_active: 0 | 1;
  bounties_collected: number;
}

export interface PokerTable {
  id: number;
  name: string;
}

export interface TableAssignment {
  table_id: number;
  table_name: string;
  id: number | null;
  player_name: string | null;
  chip_count: number | null;
  is_active: 0 | 1 | null;
  bounties_collected: number | null;
  seat_number: number | null;
}

export interface SeatChartEntry {
  player_name: string;
  table_name: string;
  seat_number: number;
}

export interface BountyLogEntry {
  id: number;
  tournament_id: number;
  killer_id: number;
  victim_id: number;
  timestamp: string;
}

export interface BlindLevel {
  id: number;
  tournament_id: number;
  level: number;
  small_blind: number;
  big_blind: number;
  ante: number;
  duration_seconds: number;
}

export interface Season {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'finished';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface SeasonResult {
  id: number;
  season_id: number;
  player_id: number;
  tournament_id: number;
  placement: number;
  bounties: number;
  points: number;
  is_opt_player: 0 | 1;
}

export interface SeasonLeaderboardEntry {
  player_id: number;
  player_name: string;
  total_points: number;
  tournament_count: number;
  top_6_scores: number[];
  is_toc_eligible: boolean;
}

export interface ScoringMatrixRow {
  placement: number;
  players_10: number | null;
  players_15: number | null;
  players_20: number | null;
  players_25: number | null;
  players_30: number | null;
  players_35: number | null;
  players_40: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clock / Engine State
// ─────────────────────────────────────────────────────────────────────────────

export interface ClockState {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  remainingSeconds: number;
  running: boolean;
  nextSmallBlind: number | null;
  nextBigBlind: number | null;
  nextAnte: number | null;
}

export interface TickPayload {
  remainingSeconds: number;
  running: boolean;
  level: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC Payloads (request / response shapes)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTournamentData {
  name: string;
  buyIn: number;
  bountyAmount: number;
}

export interface UpdateTournamentData {
  id: number;
  name: string;
  buyIn: number;
  bountyAmount: number;
}

export interface CreatePlayerData {
  name: string;
  email?: string;
  phone?: string;
}

export interface UpdatePlayerData {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
}

export interface RegisterPlayerData {
  name: string;
  tournamentId: number;
  chipCount?: number;
}

export interface EliminationData {
  killerId: number;
  victimId: number;
  tournamentId: number;
}

export interface BatchEliminationData {
  tournamentId: number;
  eliminations: Array<{
    killerId: number;
    victimId: number;
  }>;
}

export interface RebalanceCandidate {
  playerId: number;
  name: string;
  tableId: number;
  tableName: string;
  seatNumber: number | null;
  chipCount: number;
}

export interface RebalanceSuggestion {
  sourceTableId: number;
  sourceTableName: string;
  sourceCount: number;
  targetTableId: number;
  targetTableName: string;
  targetCount: number;
  candidates: RebalanceCandidate[];
}

export interface EliminationResult {
  ok: boolean;
  rebalance: RebalanceSuggestion | null;
}

export interface MovePlayerForRebalanceData {
  tournamentId: number;
  playerId: number;
  toTableId: number;
}

export interface MovePlayerForRebalanceResult {
  ok: boolean;
  seatNumber: number;
  tableName: string;
  rebalance: RebalanceSuggestion | null;
}

export interface TablePositionState {
  tableId: number;
  tableName: string;
  buttonSeat: number;
}

export interface ConsolidationTableInfo {
  tableId: number;
  tableName: string;
  playerCount: number;
  openSeats?: number;
}

export interface ConsolidationPreviewMove {
  playerId: number;
  playerName: string;
  fromTableId: number;
  fromTableName: string;
  toTableId: number;
  toTableName: string;
}

export interface ConsolidationPlan {
  eligible: boolean;
  reason: string;
  sourceTables: ConsolidationTableInfo[];
  destinationTables: ConsolidationTableInfo[];
  totalPlayersToMove: number;
  totalOpenSeats: number;
  previewMoves: ConsolidationPreviewMove[];
}

export interface ConsolidationExecutionResult {
  ok: boolean;
  movedCount: number;
  closedTables: string[];
  rebalance: RebalanceSuggestion | null;
}

export interface TournamentResetResult {
  ok: boolean;
  restoredPlayers: number;
  clearedBountyEvents: number;
}

export type ActivePlayer = Player & Registration & { table_name: string | null };

export interface PayoutResult {
  prizePool: number;
  bountyPool: number;
  paidOutBounties: number;
  payouts: Array<{ place: number; amount: number }>;
}

export interface BountyEntry {
  name: string;
  bounties_collected: number;
}

export interface EliminationEvent {
  victimId: number;
  victimName: string | null;
  leaderboard: BountyEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC Bridge (exposed to renderers via contextBridge)
// ─────────────────────────────────────────────────────────────────────────────

export interface IpcBridge {
  createTournament(data: CreateTournamentData): Promise<Tournament>;
  updateTournament(data: UpdateTournamentData): Promise<Tournament>;
  getTournament(id: number): Promise<Tournament | undefined>;
  getAllTournaments(): Promise<Tournament[]>;
  finishTournament(tournamentId: number): Promise<{ ok: boolean }>;
  resetTournamentProgress(tournamentId: number): Promise<TournamentResetResult>;
  registerPlayer(data: RegisterPlayerData): Promise<Registration>;
  getActivePlayers(
    tournamentId: number
  ): Promise<ActivePlayer[]>;
  getAllPlayers(): Promise<Player[]>;
  createPlayer(data: CreatePlayerData): Promise<Player>;
  updatePlayer(data: UpdatePlayerData): Promise<{ ok: boolean }>;
  deletePlayer(playerId: number): Promise<{ ok: boolean }>;
  clockPlay(tournamentId?: number): Promise<{ running: boolean }>;
  clockPause(): Promise<{ running: boolean }>;
  clockReset(): Promise<ClockState>;
  clockNextLevel(): Promise<ClockState>;
  recordElimination(data: EliminationData): Promise<EliminationResult>;
  recordEliminations(data: BatchEliminationData): Promise<EliminationResult>;
  movePlayerForRebalance(
    data: MovePlayerForRebalanceData
  ): Promise<MovePlayerForRebalanceResult>;
  getConsolidationPlan(tournamentId: number): Promise<ConsolidationPlan>;
  executeConsolidationWave(tournamentId: number): Promise<ConsolidationExecutionResult>;
  getTablePositionState(tournamentId: number): Promise<TablePositionState[]>;
  getBountyLeaderboard(tournamentId: number): Promise<BountyEntry[]>;
  calculatePayouts(tournamentId: number): Promise<PayoutResult>;
  getTables(): Promise<PokerTable[]>;
  getTableAssignments(tournamentId: number): Promise<TableAssignment[]>;
  randomAssignSeats(tournamentId: number): Promise<{ ok: boolean; count: number }>;
  
  // ── Seasons ────────────────────────────────────────────────────────────────
  createSeason(name: string): Promise<Season>;
  getAllSeasons(): Promise<Season[]>;
  getSeasonLeaderboard(seasonId: number): Promise<SeasonLeaderboardEntry[]>;
  addTournamentToSeason(seasonId: number, tournamentId: number, tournamentNumber: number): Promise<{ ok: boolean }>;
  recordSeasonResult(data: SeasonResult): Promise<{ ok: boolean }>;
  getScoringMatrix(): Promise<ScoringMatrixRow[]>;

  onClockTick(callback: (payload: unknown) => void): () => void;
  onPlayerEliminated(callback: (payload: unknown) => void): () => void;
  onSeatsAssigned(callback: (payload: unknown) => void): () => void;
}

// Augment the global window type so renderers get full type safety
declare global {
  interface Window {
    api: IpcBridge;
  }
}
