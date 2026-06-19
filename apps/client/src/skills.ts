import type { Action } from '@bo/rules';

export interface UiMove {
  key: string;
  label: string;
  costMilli: number; // 气（毫气；运气/防为 0）
  kind: 'charge' | 'defend' | 'attack';
  action: Action;
  accent: 'red' | 'cyan' | 'yellow';
  special?: boolean; // 超模特招（点/推/削波）：默认隐藏，房主开放才出现
}

export const MOVES: UiMove[] = [
  { key: 'yunqi', label: '波', costMilli: 0, kind: 'charge', action: { kind: 'charge' }, accent: 'cyan' },
  { key: 'fang', label: '防', costMilli: 0, kind: 'defend', action: { kind: 'defend' }, accent: 'cyan' },
  { key: 'kong', label: '空', costMilli: 1000, kind: 'attack', action: { kind: 'attack', skill: 'kong', target: null }, accent: 'red' },
  { key: 'xiaosao', label: '小扫', costMilli: 2000, kind: 'attack', action: { kind: 'attack', skill: 'xiaosao', target: null }, accent: 'red' },
  { key: 'quansao', label: '全扫', costMilli: 3000, kind: 'attack', action: { kind: 'attack', skill: 'quansao', target: null }, accent: 'red' },
  { key: 'pass', label: 'pass', costMilli: 4000, kind: 'attack', action: { kind: 'attack', skill: 'pass', target: null }, accent: 'yellow' },
  { key: 'chongjibo', label: '冲击波', costMilli: 6000, kind: 'attack', action: { kind: 'attack', skill: 'chongjibo', target: null }, accent: 'yellow' },
  { key: 'dianbo', label: '点波', costMilli: 100, kind: 'attack', action: { kind: 'attack', skill: 'dianbo', target: null }, accent: 'yellow', special: true },
  { key: 'tuibo', label: '推波', costMilli: 500, kind: 'attack', action: { kind: 'attack', skill: 'tuibo', target: null }, accent: 'yellow', special: true },
  { key: 'xuebo', label: '削波', costMilli: 500, kind: 'attack', action: { kind: 'attack', skill: 'xuebo', target: null }, accent: 'yellow', special: true },
];

export function actionLabel(a: Action): string {
  if (a.kind === 'charge') return '波';
  if (a.kind === 'defend') return '防';
  return MOVES.find((m) => m.action.kind === 'attack' && m.action.skill === a.skill)?.label ?? a.skill;
}

export function actionAccent(a: Action): 'red' | 'cyan' | 'yellow' {
  if (a.kind === 'charge' || a.kind === 'defend') return 'cyan';
  return MOVES.find((m) => m.action.kind === 'attack' && m.action.skill === a.skill)?.accent ?? 'red';
}
