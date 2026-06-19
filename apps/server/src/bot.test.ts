import { describe, it, expect } from 'vitest';
import { skillData } from '@bo/rules';
import type { PublicState } from '@bo/protocol';
import { botAction } from './bot';

function state(qiWhole: number): PublicState {
  return {
    phase: 'playing',
    beat: 0,
    players: [
      { name: '你', alive: true, qi: qiWhole * 1000 },
      { name: '🤖', alive: true, qi: qiWhole * 1000 },
    ],
    winner: null,
  };
}

describe('botAction', () => {
  it('never 溶: any attack it picks is affordable', () => {
    for (let q = 0; q <= 7; q++) {
      for (let i = 0; i < 300; i++) {
        const a = botAction(state(q), 1);
        if (a.kind === 'attack') {
          const cost = skillData(a.skill).attack!.cost; // 毫气
          expect(q * 1000).toBeGreaterThanOrEqual(cost);
        }
      }
    }
  });

  it('with 0 qi it never attacks (only charge/defend)', () => {
    for (let i = 0; i < 300; i++) {
      const a = botAction(state(0), 1);
      expect(a.kind === 'attack').toBe(false);
    }
  });
});
