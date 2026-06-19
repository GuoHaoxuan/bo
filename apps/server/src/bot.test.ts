import { describe, it, expect } from 'vitest';
import { skillData, type Action } from '@bo/rules';
import type { PublicState } from '@bo/protocol';
import { botAction } from './bot';

function state(botQiWhole: number, oppQiWhole = botQiWhole): PublicState {
  return {
    phase: 'playing',
    beat: 0,
    players: [
      { name: '你', alive: true, qi: oppQiWhole * 1000, isBot: false }, // 0 = 对手
      { name: '🤖', alive: true, qi: botQiWhole * 1000, isBot: true }, // 1 = Bot
    ],
    winner: null,
    config: { mode: 'bojue', beatMs: 1800, allowSpecials: false },
    host: 0,
  };
}

const key = (a: Action): string => (a.kind === 'attack' ? `attack:${a.skill}` : a.kind);

describe('botAction', () => {
  it('never 溶: any attack it picks is affordable', () => {
    for (let q = 0; q <= 7; q++) {
      for (let i = 0; i < 120; i++) {
        const a = botAction(state(q), 1);
        if (a.kind === 'attack') {
          const cost = skillData(a.skill).attack!.cost; // 毫气
          expect(q * 1000).toBeGreaterThanOrEqual(cost);
        }
      }
    }
  });

  it('with 0 qi it never attacks (only charge/defend)', () => {
    for (let i = 0; i < 120; i++) {
      expect(botAction(state(0), 1).kind === 'attack').toBe(false);
    }
  });

  it('混合策略：同一局面不只出一种招（不可被针对）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(key(botAction(state(1), 1)));
    expect(seen.size).toBeGreaterThanOrEqual(2); // 1气 的石头剪刀布局面必然混合
  });
});
