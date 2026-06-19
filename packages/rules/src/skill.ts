import { whole, type Qi } from './qi';

export type QiType = 'bo'; // 后续: 'dao' | 'qiang' | 'ba' | 'pi' | 'laser' | ...
export type Channel = 'physical'; // 后续: 'pi' | 'kouhong' | 'zhapi' | 'phone' | 'laser' | ...
export type Category = 'charge' | 'defend' | 'attack';
export type TargetKind = 'selfOnly' | 'single' | 'allOthers' | 'twoTargets';
export type SkillId = 'yunqi' | 'fang' | 'kong' | 'xiaosao' | 'quansao' | 'pass' | 'chongjibo';

/** 防御档位（按通道）。波决物理防：≤blockMax 挡，==duiAt 兑，>duiAt 穿。 */
export interface Defense {
  channel: Channel;
  blockMax: Qi;
  duiAt: Qi | null;
}

export interface Attack {
  cost: Qi;
  channel: Channel;
  target: TargetKind;
  // 后续扩展点：pierce/破防强度, clash/互攻强度
}

export interface Skill {
  id: SkillId;
  category: Category;
  charge: readonly [QiType, Qi] | null;
  defense: Defense | null;
  attack: Attack | null;
  // 后续扩展点：priority, counters(克/兑), immunities, statusEffect, tell …
}

const atk = (id: SkillId, cost: Qi, target: TargetKind): Skill => ({
  id,
  category: 'attack',
  charge: null,
  defense: null,
  attack: { cost, channel: 'physical', target },
});

/** 波决招式表（数据驱动；后续模式只是更多分支/更多数据）。 */
export function skillData(id: SkillId): Skill {
  switch (id) {
    case 'yunqi':
      return { id, category: 'charge', charge: ['bo', whole(1)], defense: null, attack: null };
    case 'fang':
      return {
        id,
        category: 'defend',
        charge: null,
        defense: { channel: 'physical', blockMax: whole(2), duiAt: whole(3) },
        attack: null,
      };
    case 'kong':
      return atk(id, whole(1), 'single');
    case 'xiaosao':
      return atk(id, whole(2), 'allOthers');
    case 'quansao':
      return atk(id, whole(3), 'single');
    case 'pass':
      return atk(id, whole(4), 'single');
    case 'chongjibo':
      return atk(id, whole(6), 'twoTargets');
  }
}
