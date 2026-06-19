import { ZERO, type Qi } from './qi';
import type { QiType } from './skill';

export type PlayerId = number; // 数组下标

/** 气按类型分桶（波决只有 'bo'，但结构通用以免返工）。 */
export interface Player {
  qi: Map<QiType, Qi>;
  alive: boolean;
}

export const newPlayer = (): Player => ({ qi: new Map(), alive: true });
export const getQi = (p: Player, t: QiType): Qi => p.qi.get(t) ?? ZERO;
export const addQi = (p: Player, t: QiType, amt: Qi): void => {
  p.qi.set(t, getQi(p, t) + amt);
};
export const clearQi = (p: Player): void => {
  p.qi.clear();
};

export interface GameState {
  players: Player[];
  beat: number;
}

export const newGame = (n: number): GameState => ({
  players: Array.from({ length: n }, newPlayer),
  beat: 0,
});

/** 深拷贝，保证 resolve 是纯函数（不改入参）。 */
export const cloneGame = (g: GameState): GameState => ({
  beat: g.beat,
  players: g.players.map((p) => ({ alive: p.alive, qi: new Map(p.qi) })),
});

/** 存活玩家 id，升序（确定性）。 */
export const aliveIds = (g: GameState): PlayerId[] =>
  g.players.flatMap((p, i) => (p.alive ? [i] : []));
