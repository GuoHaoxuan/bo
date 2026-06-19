import { describe, it, expect } from 'vitest';
import type { Action, SkillId } from '@bo/rules';
import { Match } from './match';

const charge: Action = { kind: 'charge' };
const atk = (skill: SkillId): Action => ({ kind: 'attack', skill, target: null });

describe('Match', () => {
  it('1v1: charge then kill → gameOver with winner', () => {
    const m = new Match();
    const a = m.addPlayer('A'); // 0
    const b = m.addPlayer('B'); // 1
    m.start();
    expect(m.currentPhase).toBe('playing');
    expect(m.currentBeat).toBe(0);

    // beat 0: both charge → +1 each, game continues
    m.submit(a, 0, charge);
    m.submit(b, 0, charge);
    let r = m.tick();
    expect(r?.outcome).toEqual({ kind: 'continue' });
    expect(m.currentBeat).toBe(1);
    expect(m.publicState().players[0]!.qi).toBe(1000); // whole(1)

    // beat 1: A attacks (has 1 bo), B charges → B dies, A wins
    m.submit(a, 1, atk('kong'));
    m.submit(b, 1, charge);
    r = m.tick();
    expect(r?.combatDeaths).toEqual([1]);
    expect(m.currentPhase).toBe('gameOver');
    expect(m.publicState().winner).toBe(0);
    expect(m.publicState().players[1]!.alive).toBe(false);
  });

  it('missing submission defaults to defend; stale-beat submit ignored', () => {
    const m = new Match();
    m.addPlayer('A');
    m.addPlayer('B');
    m.start();

    m.submit(0, 0, charge);
    m.submit(1, 5, atk('kong')); // wrong beat → ignored, so B defaults to defend (no 溶)
    const r = m.tick();
    expect(r?.rong).toEqual([]);
    expect(m.publicState().players[0]!.qi).toBe(1000); // A charged
    expect(m.publicState().players[1]!.alive).toBe(true);
  });

  it('rejects join after start and start with <2 players', () => {
    const m = new Match();
    m.addPlayer('solo');
    expect(() => m.start()).toThrow();
    m.addPlayer('second');
    m.start();
    expect(() => m.addPlayer('late')).toThrow();
  });

  it('tick on a finished/lobby match returns null', () => {
    const m = new Match();
    expect(m.tick()).toBeNull(); // lobby
    m.addPlayer('A');
    m.addPlayer('B');
    m.start();
    // drive to game over: both charge to 1, then A kills charging B
    m.submit(0, 0, charge);
    m.submit(1, 0, charge);
    m.tick();
    m.submit(0, 1, atk('kong'));
    m.submit(1, 1, charge);
    m.tick();
    expect(m.currentPhase).toBe('gameOver');
    expect(m.tick()).toBeNull(); // gameOver
  });

  it('超模特招默认禁用 → 提交被忽略 → 默认防', () => {
    const m = new Match();
    m.addPlayer('A');
    m.addPlayer('B');
    m.start();
    m.submit(0, 0, atk('tuibo')); // 未开放 → 忽略
    m.submit(1, 0, charge);
    const r = m.tick();
    expect(r?.rong).toEqual([]); // 没真的出招，不会溶
    expect(m.publicState().players[0]!.alive).toBe(true);
  });

  it('开放超模特招后可用，推波克空打穿', () => {
    const m = new Match();
    m.setConfig({ mode: 'bojue', beatMs: 1800, allowSpecials: true });
    m.addPlayer('A');
    m.addPlayer('B');
    m.start();
    m.submit(0, 0, charge); // 各攒到 1 气
    m.submit(1, 0, charge);
    m.tick();
    m.submit(0, 1, atk('tuibo')); // 推波(0.5) 克 空
    m.submit(1, 1, atk('kong'));
    const r = m.tick();
    expect(r?.combatDeaths).toEqual([1]);
    expect(m.publicState().winner).toBe(0);
  });
});
