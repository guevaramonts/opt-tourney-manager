import type { ClockState, TickPayload } from '../src/shared/types';

/** Default blind schedule (mirrors migrations.ts seed data). */
type BlindLevelEntry = {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  durationSeconds: number;
  isBreak: boolean;
  breakLabel: string | null;
};
const DEFAULT_LEVELS: BlindLevelEntry[] = [
  { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationSeconds: 900, isBreak: false, breakLabel: null },
  { level: 2, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 900, isBreak: false, breakLabel: null },
  { level: 3, smallBlind: 75, bigBlind: 150, ante: 25, durationSeconds: 900, isBreak: false, breakLabel: null },
  { level: 4, smallBlind: 100, bigBlind: 200, ante: 25, durationSeconds: 900, isBreak: false, breakLabel: null },
  { level: 5, smallBlind: 150, bigBlind: 300, ante: 50, durationSeconds: 1200, isBreak: false, breakLabel: null },
  { level: 6, smallBlind: 200, bigBlind: 400, ante: 75, durationSeconds: 1200, isBreak: false, breakLabel: null },
  { level: 7, smallBlind: 300, bigBlind: 600, ante: 100, durationSeconds: 1200, isBreak: false, breakLabel: null },
  { level: 8, smallBlind: 400, bigBlind: 800, ante: 150, durationSeconds: 1200, isBreak: false, breakLabel: null },
  { level: 9, smallBlind: 500, bigBlind: 1000, ante: 200, durationSeconds: 1200, isBreak: false, breakLabel: null },
  { level: 10, smallBlind: 600, bigBlind: 1200, ante: 250, durationSeconds: 1500, isBreak: false, breakLabel: null },
];

type TickCallback = (payload: TickPayload) => void;

/**
 * TournamentEngine
 *
 * Manages the tournament clock: levels, blind progression, and bounty arithmetic.
 * Runs entirely in the main process; state is pushed to the clock renderer via IPC.
 */
export class TournamentEngine {
  private levels: BlindLevelEntry[] = DEFAULT_LEVELS;
  private currentLevelIndex = 0;
  private remainingSeconds = DEFAULT_LEVELS[0].durationSeconds;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  configureBlindStructure(levels: BlindLevelEntry[]): void {
    if (levels.length === 0) {
      this.levels = DEFAULT_LEVELS;
    } else {
      this.levels = [...levels].sort((a, b) => a.level - b.level);
    }
    this.currentLevelIndex = 0;
    this.remainingSeconds = this.currentLevel().durationSeconds;
    this.pause();
  }

  isRunning(): boolean {
    return this.running;
  }

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
    this.remainingSeconds = this.currentLevel().durationSeconds;
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
      level: lvl.level,
      smallBlind: lvl.smallBlind,
      bigBlind: lvl.bigBlind,
      ante: lvl.ante,
      isBreak: lvl.isBreak,
      breakLabel: lvl.breakLabel,
      remainingSeconds: this.remainingSeconds,
      running: this.running,
      nextSmallBlind: next?.smallBlind ?? null,
      nextBigBlind: next?.bigBlind ?? null,
      nextAnte: next?.ante ?? null,
      nextIsBreak: next?.isBreak ?? false,
      nextBreakLabel: next?.breakLabel ?? null,
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
    const idx = Math.min(this.currentLevelIndex, this.levels.length - 1);
    return this.levels[idx];
  }

  private advanceLevel(): void {
    if (this.currentLevelIndex < this.levels.length - 1) {
      this.currentLevelIndex += 1;
    }
    this.remainingSeconds = this.currentLevel().durationSeconds;
  }

  private buildTickPayload(): TickPayload {
    const state = this.getState();
    return {
      level: state.level,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      ante: state.ante,
      isBreak: state.isBreak,
      breakLabel: state.breakLabel,
      remainingSeconds: state.remainingSeconds,
      running: state.running,
      nextSmallBlind: state.nextSmallBlind,
      nextBigBlind: state.nextBigBlind,
      nextAnte: state.nextAnte,
      nextIsBreak: state.nextIsBreak,
      nextBreakLabel: state.nextBreakLabel,
    };
  }
}
