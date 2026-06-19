import { describe, it, expect } from 'vitest';
import { ZERO, whole } from './qi';
import { newGame, addQi, getQi, type GameState } from './state';
import type { SkillId } from './skill';
import type { Action } from './action';
import { resolve } from './resolve';

const subs = (pairs: Array<[number, Action]>): Map<number, Action> => new Map(pairs);
const charge: Action = { kind: 'charge' };
const defend: Action = { kind: 'defend' };
const atk = (skill: SkillId): Action => ({ kind: 'attack', skill, target: null });

const withQi = (n: number, qis: number[]): GameState => {
  const g = newGame(n);
  qis.forEach((q, i) => addQi(g.players[i]!, 'bo', whole(q)));
  return g;
};

describe('resolve — charge & 溶', () => {
  it('both charge → each +1', () => {
    const { resolution: res, next: n } = resolve(newGame(2), subs([[0, charge], [1, charge]]));
    expect(getQi(n.players[0]!, 'bo')).toBe(whole(1));
    expect(getQi(n.players[1]!, 'bo')).toBe(whole(1));
    expect(res.rong).toEqual([]);
    expect(res.outcome).toEqual({ kind: 'continue' });
  });

  it('attack without qi → 溶 death, attacker out', () => {
    const { resolution: res, next: n } = resolve(newGame(2), subs([[0, atk('kong')], [1, charge]]));
    expect(res.rong).toEqual([0]);
    expect(n.players[0]!.alive).toBe(false);
    expect(n.players[1]!.alive).toBe(true);
    expect(res.outcome).toEqual({ kind: 'winner', id: 1 });
  });
});

describe('resolve — single-target combat', () => {
  it('charger is killed by an attack', () => {
    const { resolution: res, next: n } = resolve(withQi(2, [0, 1]), subs([[0, charge], [1, atk('kong')]]));
    expect(res.combatDeaths).toEqual([0]);
    expect(n.players[0]!.alive).toBe(false);
    expect(res.outcome).toEqual({ kind: 'winner', id: 1 });
  });

  it('defend: ≤2 挡 / ==3 兑(清气) / ≥4 穿', () => {
    // ≤2 挡
    let r = resolve(withQi(2, [0, 2]), subs([[0, defend], [1, atk('xiaosao')]]));
    expect(r.resolution.combatDeaths).toEqual([]);
    expect(r.resolution.dui).toEqual([]);
    expect(r.next.players[0]!.alive).toBe(true);

    // ==3 兑 → 防御方清气、人活
    r = resolve(withQi(2, [5, 3]), subs([[0, defend], [1, atk('quansao')]]));
    expect(r.resolution.dui).toEqual([0]);
    expect(r.next.players[0]!.alive).toBe(true);
    expect(getQi(r.next.players[0]!, 'bo')).toBe(ZERO);

    // ≥4 穿 → 死
    r = resolve(withQi(2, [0, 4]), subs([[0, defend], [1, atk('pass')]]));
    expect(r.resolution.combatDeaths).toEqual([0]);
    expect(r.resolution.outcome).toEqual({ kind: 'winner', id: 1 });
  });

  it('mutual attack: higher wins, equal both live', () => {
    let r = resolve(withQi(2, [3, 1]), subs([[0, atk('quansao')], [1, atk('kong')]]));
    expect(r.resolution.combatDeaths).toEqual([1]);

    r = resolve(withQi(2, [1, 1]), subs([[0, atk('kong')], [1, atk('kong')]]));
    expect(r.resolution.combatDeaths).toEqual([]);
    expect(r.next.players[0]!.alive).toBe(true);
    expect(r.next.players[1]!.alive).toBe(true);
  });
});

describe('resolve — elimination edges', () => {
  it('double 溶 → draw', () => {
    const { resolution: res, next: n } = resolve(newGame(2), subs([[0, atk('kong')], [1, atk('kong')]]));
    expect(res.rong).toEqual([0, 1]);
    expect(n.players[0]!.alive).toBe(false);
    expect(n.players[1]!.alive).toBe(false);
    expect(res.outcome).toEqual({ kind: 'draw' });
  });

  it('溶 attacker does not hit (its attack voided)', () => {
    const { resolution: res, next: n } = resolve(withQi(2, [0, 1]), subs([[0, charge], [1, atk('pass')]]));
    expect(res.rong).toEqual([1]);
    expect(res.combatDeaths).toEqual([]);
    expect(n.players[0]!.alive).toBe(true);
    expect(res.outcome).toEqual({ kind: 'winner', id: 0 });
  });

  it('survivors clear qi on any death (3p)', () => {
    const { resolution: res, next: n } = resolve(
      withQi(3, [4, 0, 5]),
      subs([[0, atk('pass')], [1, defend], [2, charge]]),
    );
    expect(res.combatDeaths).toEqual([1]); // pass 单体优先打较小 id 的非攻击者(1)，4≥4 穿死
    expect(n.players[1]!.alive).toBe(false);
    expect(getQi(n.players[0]!, 'bo')).toBe(ZERO); // 攻击者扣到 0 再被清
    expect(getQi(n.players[2]!, 'bo')).toBe(ZERO); // 幸存运气者也被清
    expect(res.outcome).toEqual({ kind: 'continue' });
  });

  it('missing submission defaults to defend', () => {
    const { resolution: res, next: n } = resolve(newGame(2), subs([[0, charge]]));
    expect(res.combatDeaths).toEqual([]);
    expect(res.rong).toEqual([]);
    expect(n.players[1]!.alive).toBe(true);
    expect(getQi(n.players[1]!, 'bo')).toBe(ZERO); // 防御不加气
    expect(getQi(n.players[0]!, 'bo')).toBe(whole(1));
    expect(res.outcome).toEqual({ kind: 'continue' });
  });
});

describe('resolve — N-player', () => {
  it('小扫 hits all others', () => {
    const { resolution: res } = resolve(withQi(3, [2, 0, 0]), subs([[0, atk('xiaosao')], [1, charge], [2, charge]]));
    expect(res.combatDeaths).toEqual([1, 2]);
    expect(res.outcome).toEqual({ kind: 'winner', id: 0 });
  });

  it('single-target priority: lethal choice picks the attacker-tier charger', () => {
    // 全扫(3) 单体；1 运气(被打死)、2 防御(会兑)。优先级取较小 id 的非攻击者 → 命中 1 → 死
    const { resolution: res } = resolve(withQi(3, [3, 0, 0]), subs([[0, atk('quansao')], [1, charge], [2, defend]]));
    expect(res.combatDeaths).toEqual([1]);
  });

  it('冲击波 hits two', () => {
    const { resolution: res } = resolve(withQi(3, [6, 0, 0]), subs([[0, atk('chongjibo')], [1, charge], [2, charge]]));
    expect(res.combatDeaths).toEqual([1, 2]);
    expect(res.outcome).toEqual({ kind: 'winner', id: 0 });
  });
});
