import type { Action, SkillId } from '@bo/rules';
import type { PublicState } from '@bo/protocol';

interface AtkOpt {
  skill: SkillId;
  cost: number; // 整数气
}

const ATTACKS: AtkOpt[] = [
  { skill: 'kong', cost: 1 },
  { skill: 'xiaosao', cost: 2 },
  { skill: 'quansao', cost: 3 },
  { skill: 'pass', cost: 4 },
  { skill: 'chongjibo', cost: 6 },
];

/**
 * 中性偏稳的波决 Bot —— 只看公开信息（自己的气）。
 * 绝不溶（只放得起的招）；没气就攒 / 偶尔防；有气按概率出手，气越多越敢放大招；带随机不呆板。
 */
export function botAction(state: PublicState, botId: number): Action {
  const me = state.players[botId];
  const q = me ? Math.round(me.qi / 1000) : 0;
  const r = Math.random();

  if (q <= 0) {
    // 没气：只能运气或防。多数攒气，少数防（兼做诱饵）
    return r < 0.78 ? { kind: 'charge' } : { kind: 'defend' };
  }

  if (r < 0.2) return { kind: 'defend' };

  const attackBias = Math.min(0.35 + q * 0.12, 0.8); // 气越多越倾向出手
  if (r < 1 - attackBias) return { kind: 'charge' };

  const pick = chooseAttack(ATTACKS.filter((a) => a.cost <= q));
  return { kind: 'attack', skill: pick.skill, target: null };
}

/** 在放得起的招里：70% 取最大的，30% 随机一个。affordable 在 q≥1 时非空（空招 1 气）。 */
function chooseAttack(affordable: AtkOpt[]): AtkOpt {
  const biggest = affordable.reduce((a, b) => (b.cost > a.cost ? b : a));
  if (Math.random() < 0.7) return biggest;
  return affordable[Math.floor(Math.random() * affordable.length)]!;
}
