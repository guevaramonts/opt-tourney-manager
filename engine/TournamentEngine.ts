import type { ClockState, TickPayload } from '../src/shared/types';

/** Default blind schedule (mirrors migrations.ts seed data). */
type BlindLevelEntry = { level: number; smallBlind: number; bigBlind: number; ante: number };
const DEFAULT_LEVELS: BlindLevelEntry[] = [
  { level: 1, smallBlind: 25, bigBlind: 50, ante: 0 },
  { level: 2, smallBlind: 50, bigBlind: 100, ante: 0 },
  { level: 3, smallBlind: 75, bigBlind: 150, ante: 25 },
  { level: 4, smallBlind: 100, bigBlind: 200, ante: 25 },
  { level: 5, smallBlind: 150, bigBlind: 300, ante: 50 },
  { level: 6, smallBlind: 200, bigBlind: 400, ante: 75 },
  { level: 7, smallBlind: 300, bigBlind: 600, ante: 100 },
  { level: 8, smallBlind: 400, bigBlind: 800, ante: 150 },
  { level: 9, smallBlind: 500, bigBlind: 1000, ante: 200 },
  { level: 10, smallBlind: 600, bigBlind: 1200, ante: 250 },
];

const LEVEL_DURATION_SECONDS = 15 * 60; // 15 minutes per level

type TickCallback = (payload: TickPayload) => void;

/**
 * TournamentEngine
 *
 * Manages the tournament clock: levels, blind progression, and bounty arithmetic.
 * Runs entirely in the main process; state is pushed to the clock renderer via IPC.
 */
export class TournamentEngine {
  private currentLevelIndex = 0;
  private remainingSeconds = LEVEL_DURATION_SECONDS;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  // ── Playback ───────────────────────────────────────────────────────────────

  play(onTick: TickCallback): void {
    if (this.running) return;
    this.running = true;

    this.timer = setInterval(() => {
      if (this.remainingSeconds > 0) {
        this.remainingSeconds -= 1;
      } else {
        // Auto-advance to next level when time expires
        this.advanceLevel();
      }

      onTick(this.buildTickPayload());
    }, 1000);
  }

  pause(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  reset(): void {
    this.pause();
    this.currentLevelIndex = 0;
    this.remainingSeconds = LEVEL_DURATION_SECONDS;
  }

  nextLevel(): void {
    this.advanceLevel();
  }

  // ── State ──────────────────────────────────────────────────────────────────

  getState(): ClockState {
    const lvl = this.currentLevel();
    const nextIdx = this.currentLevelIndex + 1;
    const next = nextIdx < DEFAULT_LEVELS.length ? DEFAULT_LEVELS[nextIdx] : null;
    return {
      ...lvl,
      remainingSeconds: this.remainingSeconds,
      running: this.running,
      nextSmallBlind: next?.smallBlind ?? null,
      nextBigBlind: next?.bigBlind ?? null,
      nextAnte: next?.ante ?? null,
    };
  }

  // ── Bounty Arithmetic ──────────────────────────────────────────────────────

  /**
   * Calculates a single player's bounty earnings for display purposes.
   * The real write happens in the IPC handler via SQLite.
   */
  static calculateBountyEarnings(
    bountiesCollected: number,
    bountyAmountPerHead: number
  ): number {
    return bountiesCollected * bountyAmountPerHead;
  }

  /**
   * Distributes the prize pool (gross minus bounties) across the final standings.
   * @param prizePool - Net prize pool (after bounty deduction)
   * @param structure - Array of percentage splits, e.g. [0.5, 0.3, 0.2]
   */
  static distributePrizePool(
    prizePool: number,
    structure: number[] = [0.5, 0.3, 0.2]
  ): Array<{ place: number; amount: number }> {
    return structure.map((pct, i) => ({
      place: i + 1,
      amount: Math.floor(prizePool * pct),
    }));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private currentLevel() {
    const idx = Math.min(this.currentLevelIndex, DEFAULT_LEVELS.length - 1);
    return DEFAULT_LEVELS[idx];
  }

  private advanceLevel(): void {
    if (this.currentLevelIndex < DEFAULT_LEVELS.length - 1) {
      this.currentLevelIndex += 1;
    }
    this.remainingSeconds = LEVEL_DURATION_SECONDS;
  }

  private buildTickPayload(): TickPayload {
    return {
      remainingSeconds: this.remainingSeconds,
      running: this.running,
      level: this.currentLevel().level,
    };
  }
}
