import {
  resolve,
  newGame,
  SPECIAL_SKILLS,
  type Action,
  type GameState,
  type PlayerId,
  type Resolution,
} from '@bo/rules';
import type { Phase, PublicPlayer, PublicState, RoomConfig } from '@bo/protocol';

interface Seat {
  name: string;
}

const DEFAULT_CONFIG: RoomConfig = { mode: 'bojue', beatMs: 1800, allowSpecials: false };

/**
 * 一局对战的**纯逻辑核心**（无网络、无定时器）：管座位、阶段、当拍暗选，
 * 到点由外层（transport）调用 `tick()` 用 `resolve` 结算并推进一拍。
 */
export class Match {
  private seats: Seat[] = [];
  private state: GameState = newGame(0);
  private phase: Phase = 'lobby';
  private pending = new Map<PlayerId, Action>();
  private winner: PlayerId | null = null;
  private lastActionsArr: Array<{ id: PlayerId; action: Action }> = [];
  private cfg: RoomConfig = { ...DEFAULT_CONFIG };

  /** 上一拍各玩家的明牌动作（含缺席默认「防」），供揭示广播。 */
  get lastActions(): ReadonlyArray<{ id: PlayerId; action: Action }> {
    return this.lastActionsArr;
  }

  get config(): RoomConfig {
    return this.cfg;
  }
  /** 房主 = 第一个座位。 */
  get host(): PlayerId {
    return 0;
  }
  /** 仅大厅阶段可改设置。 */
  setConfig(c: RoomConfig): void {
    if (this.phase === 'lobby') this.cfg = c;
  }

  get currentBeat(): number {
    return this.state.beat;
  }
  get currentPhase(): Phase {
    return this.phase;
  }
  get playerCount(): number {
    return this.seats.length;
  }

  /** 大厅阶段加入，返回座位 id。 */
  addPlayer(name: string): PlayerId {
    if (this.phase !== 'lobby') throw new Error('cannot join: game already started');
    this.seats.push({ name });
    return this.seats.length - 1;
  }

  start(): void {
    if (this.phase !== 'lobby') throw new Error('already started');
    if (this.seats.length < 2) throw new Error('need at least 2 players');
    this.state = newGame(this.seats.length);
    this.phase = 'playing';
  }

  /** 记录某玩家本拍暗选；非进行中 / 非当前拍 / 非法 id / 已出局 → 忽略。 */
  submit(id: PlayerId, beat: number, action: Action): void {
    if (this.phase !== 'playing') return;
    if (beat !== this.state.beat) return;
    if (id < 0 || id >= this.seats.length) return;
    if (!this.state.players[id]!.alive) return;
    if (action.kind === 'attack' && !this.cfg.allowSpecials && SPECIAL_SKILLS.includes(action.skill))
      return; // 未开放的超模特招
    this.pending.set(id, action);
  }

  /** 结算当前拍（到点时调用）。返回本拍 `Resolution`；非进行中返回 null。 */
  tick(): Resolution | null {
    if (this.phase !== 'playing') return null;
    const subs = this.pending;
    this.pending = new Map();
    this.lastActionsArr = this.state.players.flatMap((p, id) =>
      p.alive ? [{ id, action: subs.get(id) ?? { kind: 'defend' } }] : [],
    );
    const { resolution, next } = resolve(this.state, subs);
    this.state = next;
    if (resolution.outcome.kind === 'winner') {
      this.phase = 'gameOver';
      this.winner = resolution.outcome.id;
    } else if (resolution.outcome.kind === 'draw') {
      this.phase = 'gameOver';
      this.winner = null;
    }
    return resolution;
  }

  publicState(): PublicState {
    const players: PublicPlayer[] = this.seats.map((s, i) => ({
      name: s.name,
      alive: this.state.players[i]?.alive ?? true,
      qi: this.state.players[i]?.qi.get('bo') ?? 0,
    }));
    return { phase: this.phase, beat: this.state.beat, players, winner: this.winner, config: this.cfg, host: this.host };
  }
}
