import type { Action } from '@bo/rules';

export interface UiMove {
  key: string;
  label: string;
  costWhole: number; // 气（整数；运气/防为 0）
  kind: 'charge' | 'defend' | 'attack';
  action: Action;
  accent: 'red' | 'cyan' | 'yellow';
}

export const MOVES: UiMove[] = [
  { key: 'yunqi', label: '运气', costWhole: 0, kind: 'charge', action: { kind: 'charge' }, accent: 'cyan' },
  { key: 'fang', label: '防', costWhole: 0, kind: 'defend', action: { kind: 'defend' }, accent: 'cyan' },
  { key: 'kong', label: '空', costWhole: 1, kind: 'attack', action: { kind: 'attack', skill: 'kong', target: null }, accent: 'red' },
  { key: 'xiaosao', label: '小扫', costWhole: 2, kind: 'attack', action: { kind: 'attack', skill: 'xiaosao', target: null }, accent: 'red' },
  { key: 'quansao', label: '全扫', costWhole: 3, kind: 'attack', action: { kind: 'attack', skill: 'quansao', target: null }, accent: 'red' },
  { key: 'pass', label: 'pass', costWhole: 4, kind: 'attack', action: { kind: 'attack', skill: 'pass', target: null }, accent: 'yellow' },
  { key: 'chongjibo', label: '冲击波', costWhole: 6, kind: 'attack', action: { kind: 'attack', skill: 'chongjibo', target: null }, accent: 'yellow' },
];

export function actionLabel(a: Action): string {
  if (a.kind === 'charge') return '运气';
  if (a.kind === 'defend') return '防';
  return MOVES.find((m) => m.action.kind === 'attack' && m.action.skill === a.skill)?.label ?? a.skill;
}

export function actionPow(a: Action): string {
  if (a.kind === 'charge') return '凝…';
  if (a.kind === 'defend') return '铛!';
  switch (a.skill) {
    case 'chongjibo':
      return '轰隆!!';
    case 'pass':
      return 'PASS!';
    case 'quansao':
      return '哗——!';
    case 'xiaosao':
      return '唰!';
    default:
      return '波!';
  }
}
