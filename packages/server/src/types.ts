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

export interface Player {
  id: number;
  name: string;
  nickname: string | null;
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

export interface BlindStructure {
  id: number;
  name: string;
  level_count?: number;
  created_at?: string;
}

export interface BlindStructureLevel {
  id: number;
  blind_structure_id: number;
  level: number;
  small_blind: number;
  big_blind: number;
  ante: number;
  duration_seconds: number;
  is_break: 0 | 1;
  break_label: string | null;
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
  tournament_scores: SeasonTournamentScore[];
  is_toc_eligible: boolean;
}

export interface SeasonTournamentScore {
  tournament_id: number;
  tournament_points: number;
  bounty_points: number;
  total_points: number;
}

export interface SeasonTournamentEntry {
  season_id: number;
  tournament_id: number;
  tournament_number: number;
  tournament_name: string;
  tournament_status: Tournament['status'];
  player_count: number;
  synced_results_count: number;
}

export interface SeasonDeleteImpact {
  seasonId: number;
  name: string;
  linkedTournamentCount: number;
  sharedTournamentCount: number;
  exclusiveTournamentCount: number;
  seasonResultCount: number;
  registrationCount: number;
  bountyLogCount: number;
  tableStateCount: number;
  blindLevelCount: number;
  hasData: boolean;
}

export interface SeasonDeleteResult {
  ok: boolean;
  seasonId: number;
  name: string;
  impact: SeasonDeleteImpact;
  deleted: {
    seasons: number;
    seasonTournaments: number;
    seasonResults: number;
    tournaments: number;
    registrations: number;
    bountyLog: number;
    tableState: number;
    blindLevels: number;
  };
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

export interface ClockState {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  isBreak: boolean;
  breakLabel: string | null;
  remainingSeconds: number;
  running: boolean;
  nextSmallBlind: number | null;
  nextBigBlind: number | null;
  nextAnte: number | null;
  nextIsBreak: boolean;
  nextBreakLabel: string | null;
}

export interface TickPayload {
  smallBlind: number;
  bigBlind: number;
  ante: number;
  isBreak: boolean;
  breakLabel: string | null;
  remainingSeconds: number;
  running: boolean;
  level: number;
  nextSmallBlind: number | null;
  nextBigBlind: number | null;
  nextAnte: number | null;
  nextIsBreak: boolean;
  nextBreakLabel: string | null;
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

export interface TablePositionState {
  tableId: number;
  tableName: string;
  buttonSeat: number;
}

export interface BountyEntry {
  name: string;
  bounties_collected: number;
}

export interface LivePointAward {
  playerId: number;
  playerName: string;
  kind: 'placement' | 'bounty';
  points: number;
  totalPoints: number;
  placement?: number;
  bountiesCollected?: number;
}

export interface EliminationEvent {
  tournamentId: number;
  killerId: number;
  killerName: string;
  victimId: number;
  victimName: string | null;
  placement: number;
  awards: LivePointAward[];
  leaderboard: BountyEntry[];
}

export interface TournamentProgressResetEvent {
  tournamentId: number;
}

export type ActivePlayer = Player & Registration & { table_name: string | null };

export interface PayoutResult {
  playerCount: number;
  buyInTotal: number;
  prizePool: number;
  bountyPool: number;
  paidOutBounties: number;
  payouts: Array<{ place: number; amount: number }>;
}

export interface TournamentFinalizeResult {
  ok: boolean;
  resultsCommitted: number;
  summary: Array<{
    player_id: number;
    player_name: string;
    placement: number;
    bounty_points: number;
    tournament_points: number;
    total_points: number;
  }>;
}

export interface TournamentResetResult {
  ok: boolean;
  clearedSeasonResults: number;
  restoredPlayers: number;
  clearedBountyEvents: number;
  rolledBackCareerEarnings: number;
}

export interface TournamentDeleteResult {
  ok: boolean;
  tournamentId: number;
  name: string;
  deleted: {
    deletedSeasonResults: number;
    deletedSeasonLinks: number;
    deletedTableState: number;
    deletedBlindLevels: number;
    deletedBounties: number;
    deletedRegistrations: number;
  };
}

export interface DataResetKeepPlayersResult {
  ok: boolean;
  deleted: {
    seasonResults: number;
    seasonTournaments: number;
    seasons: number;
    tableState: number;
    blindStructureLevels: number;
    bountyLog: number;
    registrations: number;
    tournaments: number;
  };
}

export interface MovePlayerForRebalanceResult {
  ok: boolean;
  seatNumber: number;
  tableName: string;
  rebalance: RebalanceSuggestion | null;
}
