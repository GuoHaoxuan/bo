// 超模特招（点波/推波/削波）与「克」机制 —— 克 > 互攻，无视气耗。
import { describe, it, expect } from 'vitest';
import { tenths, whole } from './qi';
import { newGame, addQi, type GameState } from './state';
import type { SkillId } from './skill';
import type { Action } from './action';
import { resolve, type Resolution, type Outcome } from './resolve';

// 直接按毫气布置（超模招是 0.1/0.5 气，避免 whole(0.x) 浮点误差）
const game = (qa: number, qb: number): GameState => {
  const g = newGame(2);
  addQi(g.players[0]!, 'bo', qa);
  addQi(g.players[1]!, 'bo', qb);
  return g;
};
const run = (g: GameState, a: Action, b: Action): Resolution =>
  resolve(g, new Map([[0, a], [1, b]])).resolution;
const atk = (skill: SkillId): Action => ({ kind: 'attack', skill, target: null });
const charge: Action = { kind: 'charge' };
const defend: Action = { kind: 'defend' };
const isWinner = (o: Outcome, id: number): boolean => o.kind === 'winner' && o.id === id;

describe('超模特招 + 克', () => {
  it('推波克空：空被克死，推波者无视气耗存活', () => {
    const res = run(game(tenths(5), whole(1)), atk('tuibo'), atk('kong'));
    expect(res.combatDeaths).toEqual([1]);
    expect(isWinner(res.outcome, 0)).toBe(true);
    // 反向对称
    const res2 = run(game(whole(1), tenths(5)), atk('kong'), atk('tuibo'));
    expect(res2.combatDeaths).toEqual([0]);
    expect(isWinner(res2.outcome, 1)).toBe(true);
  });

  it('削波克小扫：小扫被克死、其全场扫作废', () => {
    const res = run(game(tenths(5), whole(2)), atk('xuebo'), atk('xiaosao'));
    expect(res.combatDeaths).toEqual([1]);
    expect(isWinner(res.outcome, 0)).toBe(true);
  });

  it('克只对指定招：推波打小扫 / 削波打空 → 便宜招互攻输', () => {
    expect(run(game(tenths(5), whole(2)), atk('tuibo'), atk('xiaosao')).combatDeaths).toEqual([0]);
    expect(run(game(tenths(5), whole(1)), atk('xuebo'), atk('kong')).combatDeaths).toEqual([0]);
  });

  it('点波 0.1 气：杀裸奔运气者', () => {
    const res = run(game(tenths(1), 0), atk('dianbo'), charge);
    expect(res.combatDeaths).toEqual([1]);
    expect(isWinner(res.outcome, 0)).toBe(true);
  });

  it('点波被防挡下（0.1 ≤ 2）', () => {
    const res = run(game(tenths(1), 0), atk('dianbo'), defend);
    expect(res.combatDeaths).toEqual([]);
    expect(res.dui).toEqual([]);
  });

  it('点波气不足（<0.1）照样判溶', () => {
    const res = run(game(0, 0), atk('dianbo'), defend);
    expect(res.rong).toEqual([0]);
    expect(isWinner(res.outcome, 1)).toBe(true);
  });
});
