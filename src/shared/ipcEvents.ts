// ─────────────────────────────────────────────────────────────────────────────
// IPC channel name constants
// Use these everywhere instead of bare strings to avoid typos.
// ─────────────────────────────────────────────────────────────────────────────

export const IPC = {
  TOURNAMENT_CREATE: 'tournament:create',
  TOURNAMENT_GET: 'tournament:get',

  PLAYER_REGISTER: 'player:register',
  PLAYER_GET_ACTIVE: 'player:getActive',
  PLAYER_ELIMINATED: 'player:eliminated',

  CLOCK_PLAY: 'clock:play',
  CLOCK_PAUSE: 'clock:pause',
  CLOCK_RESET: 'clock:reset',
  CLOCK_NEXT_LEVEL: 'clock:nextLevel',
  CLOCK_TICK: 'clock:tick',

  BOUNTY_RECORD_ELIMINATION: 'bounty:recordElimination',
  BOUNTY_GET_LEADERBOARD: 'bounty:getLeaderboard',

  PAYOUT_CALCULATE: 'payout:calculate',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
