import { Server } from 'socket.io';
import { TournamentEngine } from '../engine/TournamentEngine';
import pool from '../db/pool';

const engine = new TournamentEngine();
let io: Server | null = null;
let clockTournamentId: number | null = null;

export function initClockService(socketServer: Server): void {
  io = socketServer;
}

export function getEngine(): TournamentEngine {
  return engine;
}

export function getClockState() {
  return engine.getState();
}

export async function clockPlay(tournamentId?: number): Promise<{ running: boolean }> {
  if (tournamentId && tournamentId !== clockTournamentId) {
    clockTournamentId = tournamentId;
    const levels = await loadLevelsForTournament(tournamentId);
    engine.configureBlindStructure(levels);
  }

  engine.play((payload) => {
    io?.emit('clock:tick', payload);
  });

  return { running: true };
}

export function clockPause(): { running: boolean } {
  engine.pause();
  return { running: false };
}

export function clockReset() {
  engine.reset();
  const state = engine.getState();
  io?.emit('clock:tick', state);
  return state;
}

export function clockNextLevel() {
  engine.nextLevel();
  const state = engine.getState();
  io?.emit('clock:tick', state);
  return state;
}

async function loadLevelsForTournament(tournamentId: number) {
  const { rows: tRows } = await pool.query(
    'SELECT blind_structure_id FROM tournaments WHERE id = $1',
    [tournamentId]
  );
  let structureId: number | null = tRows[0]?.blind_structure_id ?? null;

  if (!structureId) {
    const { rows: fallback } = await pool.query(
      "SELECT id FROM blind_structures WHERE name = 'OPT Default' ORDER BY id LIMIT 1"
    );
    structureId = fallback[0]?.id ?? null;
  }

  if (!structureId) return [];

  const { rows } = await pool.query(
    `SELECT level, small_blind, big_blind, ante, duration_seconds, is_break, break_label
     FROM blind_structure_levels
     WHERE blind_structure_id = $1
     ORDER BY level ASC`,
    [structureId]
  );

  return rows.map((r) => ({
    level: r.level,
    smallBlind: r.small_blind,
    bigBlind: r.big_blind,
    ante: r.ante ?? 0,
    durationSeconds: r.duration_seconds,
    isBreak: r.is_break === true,
    breakLabel: r.break_label,
  }));
}
