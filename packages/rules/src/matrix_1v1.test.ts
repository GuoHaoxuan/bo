// 1v1 结算矩阵 —— 规则的源头真值，验收基准。
import { describe, it, expect } from 'vitest';
import { ZERO, whole } from './qi';
import { newGame, addQi, getQi, type GameState } from './state';
import type { SkillId } from './skill';
import type { Action } from './action';
import { resolve, type Resolution, type Outcome } from './resolve';

const game = (qa: number, qb: number): GameState => {
  const g = newGame(2);
  addQi(g.players[0]!, 'bo', whole(qa));
  addQi(g.players[1]!, 'bo', whole(qb));
  return g;
};
const run = (g: GameState, a: Action, b: Action): { res: Resolution; n: GameState } => {
  const out = resolve(g, new Map([[0, a], [1, b]]));
  return { res: out.resolution, n: out.next };
};
const charge: Action = { kind: 'charge' };
const defend: Action = { kind: 'defend' };
const atk = (skill: SkillId): Action => ({ kind: 'attack', skill, target: null });
const isWinner = (o: Outcome, id: number): boolean => o.kind === 'winner' && o.id === id;

describe('1v1 matrix', () => {
  it('charge × charge', () => {
    const { res, n } = run(game(0, 0), charge, charge);
    expect(res.rong).toEqual([]);
    expect(res.combatDeaths).toEqual([]);
    expect(getQi(n.players[0]!, 'bo')).toBe(whole(1));
    expect(getQi(n.players[1]!, 'bo')).toBe(whole(1));
  });

  it('charge × defend', () => {
    const { res, n } = run(game(0, 0), charge, defend);
    expect(res.combatDeaths).toEqual([]);
    expect(getQi(n.players[0]!, 'bo')).toBe(whole(1));
    expect(n.players[1]!.alive).toBe(true);
    expect(getQi(n.players[1]!, 'bo')).toBe(whole(0)); // 防御不加气
  });

  it('charge × legal attack → charger dies', () => {
    const { res } = run(game(0, 1), charge, atk('kong'));
    expect(res.combatDeaths).toEqual([0]);
    expect(isWinner(res.outcome, 1)).toBe(true);
  });

  it('charge × 溶 attack → attacker dies', () => {
    const { res } = run(game(0, 0), charge, atk('kong'));
    expect(res.rong).toEqual([1]);
    expect(isWinner(res.outcome, 0)).toBe(true);
  });

  it('defend × attack: block / 兑 / break', () => {
    // ≤2 挡：防御者毫发无伤、气不变
    let { res, n } = run(game(0, 2), defend, atk('xiaosao'));
    expect(res.combatDeaths).toEqual([]);
    expect(res.dui).toEqual([]);
    expect(n.players[0]!.alive).toBe(true);
    expect(getQi(n.players[0]!, 'bo')).toBe(ZERO);
    // ==3 兑
    ({ res, n } = run(game(0, 3), defend, atk('quansao')));
    expect(res.dui).toEqual([0]);
    expect(getQi(n.players[0]!, 'bo')).toBe(ZERO);
    // ≥4 穿
    ({ res, n } = run(game(0, 4), defend, atk('pass')));
    expect(res.combatDeaths).toEqual([0]);
  });

  it('attack × attack: higher wins / equal both live', () => {
    let { res } = run(game(3, 1), atk('quansao'), atk('kong'));
    expect(res.combatDeaths).toEqual([1]);
    expect(isWinner(res.outcome, 0)).toBe(true);

    let n: GameState;
    ({ res, n } = run(game(1, 1), atk('kong'), atk('kong')));
    expect(res.combatDeaths).toEqual([]);
    expect(n.players[0]!.alive).toBe(true);
    expect(n.players[1]!.alive).toBe(true);
  });

  it('double 溶 → draw', () => {
    const { res } = run(game(0, 0), atk('kong'), atk('kong'));
    expect(res.rong).toEqual([0, 1]);
    expect(res.outcome).toEqual({ kind: 'draw' });
  });
});
