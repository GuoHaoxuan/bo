import type { SkillId } from './skill';
import type { PlayerId } from './state';

export type Action =
  | { kind: 'charge' }
  | { kind: 'defend' }
  // target 为后续手动选目标预留；波决按优先级自动锁定，target 可为 null。
  | { kind: 'attack'; skill: SkillId; target: PlayerId | null };
