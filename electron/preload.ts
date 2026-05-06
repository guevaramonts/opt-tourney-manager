import { contextBridge, ipcRenderer } from 'electron';
import type { IpcBridge } from '../src/shared/types';

// Expose a typed, limited IPC bridge to all renderer windows.
// Nothing from Node or Electron is exposed beyond these explicit methods.
const bridge: IpcBridge = {
  // ── Tournament ──────────────────────────────────────────────────────────────
  createTournament: (data) => ipcRenderer.invoke('tournament:create', data),
  updateTournament: (data) => ipcRenderer.invoke('tournament:update', data),
  getTournament: (id) => ipcRenderer.invoke('tournament:get', id),
  getAllTournaments: () => ipcRenderer.invoke('tournament:getAll'),
  finishTournament: (id) => ipcRenderer.invoke('tournament:finish', id),
  resetTournamentProgress: (id) => ipcRenderer.invoke('tournament:resetProgress', id),

  // ── Players ──────────────────────────────────────────────────────────────────
  registerPlayer: (data) => ipcRenderer.invoke('player:register', data),
  getActivePlayers: (tournamentId) =>
    ipcRenderer.invoke('player:getActive', tournamentId),
  getAllPlayers: () => ipcRenderer.invoke('player:getAll'),
  createPlayer: (data) => ipcRenderer.invoke('player:create', data),
  updatePlayer: (data) => ipcRenderer.invoke('player:update', data),
  deletePlayer: (playerId) => ipcRenderer.invoke('player:delete', playerId),

  // ── Clock / Engine ────────────────────────────────────────────────────────────
  clockPlay: (tournamentId) => ipcRenderer.invoke('clock:play', tournamentId),
  clockPause: () => ipcRenderer.invoke('clock:pause'),
  clockReset: () => ipcRenderer.invoke('clock:reset'),
  clockNextLevel: () => ipcRenderer.invoke('clock:nextLevel'),

  // ── Bounty ────────────────────────────────────────────────────────────────────
  recordElimination: (data) => ipcRenderer.invoke('bounty:recordElimination', data),
  recordEliminations: (data) => ipcRenderer.invoke('bounty:recordEliminations', data),
  movePlayerForRebalance: (data) => ipcRenderer.invoke('rebalance:movePlayer', data),
  getBountyLeaderboard: (tournamentId) =>
    ipcRenderer.invoke('bounty:getLeaderboard', tournamentId),

  // ── Tables ────────────────────────────────────────────────────────────────────
  getTables: () => ipcRenderer.invoke('table:getAll'),
  getTablePositionState: (tournamentId) =>
    ipcRenderer.invoke('table:getPositionState', tournamentId),
  getConsolidationPlan: (tournamentId) =>
    ipcRenderer.invoke('table:getConsolidationPlan', tournamentId),
  executeConsolidationWave: (tournamentId) =>
    ipcRenderer.invoke('table:executeConsolidationWave', tournamentId),
  getTableAssignments: (tournamentId) =>
    ipcRenderer.invoke('table:getAssignments', tournamentId),
  randomAssignSeats: (tournamentId) =>
    ipcRenderer.invoke('seats:randomAssign', tournamentId),

  // ── Seasons ────────────────────────────────────────────────────────────────
  createSeason: (name) => ipcRenderer.invoke('season:create', name),
  getAllSeasons: () => ipcRenderer.invoke('season:getAll'),
  getSeasonLeaderboard: (seasonId) =>
    ipcRenderer.invoke('season:getLeaderboard', seasonId),
  addTournamentToSeason: (seasonId, tournamentId, tournamentNumber) =>
    ipcRenderer.invoke('season:addTournament', { seasonId, tournamentId, tournamentNumber }),
  recordSeasonResult: (data) => ipcRenderer.invoke('season:recordResult', data),
  getScoringMatrix: () => ipcRenderer.invoke('season:getScoringMatrix'),

  // ── Payouts ───────────────────────────────────────────────────────────────────
  calculatePayouts: (tournamentId) =>
    ipcRenderer.invoke('payout:calculate', tournamentId),

  // ── Push events from main → renderer ─────────────────────────────────────────
  onClockTick: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      callback(payload);
    ipcRenderer.on('clock:tick', handler);
    return () => ipcRenderer.removeListener('clock:tick', handler);
  },
  onPlayerEliminated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      callback(payload);
    ipcRenderer.on('player:eliminated', handler);
    return () => ipcRenderer.removeListener('player:eliminated', handler);
  },
  onSeatsAssigned: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      callback(payload);
    ipcRenderer.on('seats:assigned', handler);
    return () => ipcRenderer.removeListener('seats:assigned', handler);
  },
};

contextBridge.exposeInMainWorld('api', bridge);
