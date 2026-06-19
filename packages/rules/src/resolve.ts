import { whole, type Qi } from './qi';
import { skillData, type SkillId, type TargetKind } from './skill';
import {
  aliveIds,
  clearQi,
  cloneGame,
  getQi,
  type GameState,
  type PlayerId,
} from './state';
import type { Action } from './action';

const BO = 'bo' as const;

export type Outcome =
  | { kind: 'continue' }
  | { kind: 'winner'; id: PlayerId }
  | { kind: 'draw' };

export interface Resolution {
  rong: PlayerId[];
  combatDeaths: PlayerId[];
  dui: PlayerId[];
  outcome: Outcome;
}

/**
 * 确定性纯函数：先判溶 → 再判克（战斗）→ 出局/重开。
 * 同样的 state + submissions → 唯一结果。不改入参（深拷贝）。
 */
export function resolve(
  state: GameState,
  submissions: Map<PlayerId, Action>,
): { resolution: Resolution; next: GameState } {
  const next = cloneGame(state);
  next.beat += 1;

  // 没提交 → 默认防
  const actions = new Map<PlayerId, Action>();
  for (const id of aliveIds(state)) {
    actions.set(id, submissions.get(id) ?? { kind: 'defend' });
  }

  // 1. 判溶：攻击但气不足
  const rong: PlayerId[] = [];
  for (const [id, act] of actions) {
    if (act.kind === 'attack') {
      // invariant: an 'attack' action always wraps an attack-class skill → .attack non-null
      const a = skillData(act.skill).attack!;
      if (getQi(next.players[id]!, BO) < a.cost) rong.push(id);
    }
  }
  for (const id of rong) next.players[id]!.alive = false;

  // 2. 扣有效攻击者的气（放招只扣 cost，不清零）
  for (const [id, act] of actions) {
    if (rong.includes(id)) continue;
    if (act.kind === 'attack') {
      const cost = skillData(act.skill).attack!.cost;
      const p = next.players[id]!;
      p.qi.set(BO, getQi(p, BO) - cost);
    }
  }

  // 3. 战斗（克）
  const { deaths, dui } = resolveCombat(next, actions, rong);
  for (const id of dui) clearQi(next.players[id]!);
  for (const id of deaths) next.players[id]!.alive = false;

  // 4. 运气者加气（存活者）
  for (const [id, act] of actions) {
    if (next.players[id]!.alive && act.kind === 'charge') {
      const p = next.players[id]!;
      p.qi.set(BO, getQi(p, BO) + whole(1));
    }
  }

  // 5. 出局/重开：本拍有人死 → 幸存者清空气
  const anyDeath = rong.length > 0 || deaths.length > 0;
  if (anyDeath) {
    for (const p of next.players) if (p.alive) clearQi(p);
  }

  return {
    resolution: { rong, combatDeaths: deaths, dui, outcome: outcomeOf(next) },
    next,
  };
}

function outcomeOf(state: GameState): Outcome {
  const alive = aliveIds(state);
  if (alive.length === 1) return { kind: 'winner', id: alive[0]! };
  if (alive.length === 0) return { kind: 'draw' };
  return { kind: 'continue' };
}

interface Attacker {
  id: PlayerId;
  skill: SkillId;
  cost: Qi;
  target: TargetKind;
  counters: readonly SkillId[];
}

/** 基于「动作快照」同步结算（先克、后互攻，攻击同时落地）。返回 { deaths, dui }。 */
function resolveCombat(
  state: GameState,
  actions: Map<PlayerId, Action>,
  rong: PlayerId[],
): { deaths: PlayerId[]; dui: PlayerId[] } {
  // 有效攻击者：攻击 且 未溶 且 存活
  const attackers: Attacker[] = [];
  for (const [id, act] of actions) {
    if (rong.includes(id) || !state.players[id]!.alive) continue;
    if (act.kind === 'attack') {
      const a = skillData(act.skill).attack!;
      attackers.push({ id, skill: act.skill, cost: a.cost, target: a.target, counters: a.counters });
    }
  }

  // 克：A 的招克 B 的招 → B 被克死、其招作废（克 > 互攻，无视气耗）。
  const ke = new Set<PlayerId>();
  for (const a of attackers) {
    if (a.counters.length === 0) continue;
    for (const b of attackers) {
      if (a.id !== b.id && a.counters.includes(b.skill)) ke.add(b.id);
    }
  }
  const dead = new Set<PlayerId>([...rong, ...ke]); // 不可作目标、其招作废
  const live = attackers.filter((a) => !ke.has(a.id));
  const costOf = (pid: PlayerId): Qi | undefined =>
    live.find((a) => a.id === pid)?.cost;

  // 每个目标收到的攻击气耗列表（仅未被克的攻击者落招）
  const incoming = new Map<PlayerId, Qi[]>();
  for (const atkr of live) {
    for (const t of targetsOf(atkr.id, atkr.target, state, actions, dead)) {
      const arr = incoming.get(t) ?? [];
      arr.push(atkr.cost);
      incoming.set(t, arr);
    }
  }

  const fang = skillData('fang').defense!;
  const deaths: PlayerId[] = [...ke]; // 被克死的先计入
  const dui: PlayerId[] = [];
  for (const pid of [...incoming.keys()].sort((a, b) => a - b)) {
    const costs = incoming.get(pid)!;
    const act = actions.get(pid)!;
    let died = false;
    let gotDui = false;
    for (const c of costs) {
      if (act.kind === 'charge') {
        died = true; // 运气者裸奔，被命中即死
      } else if (act.kind === 'defend') {
        if (c <= fang.blockMax) {
          // 挡，无事
        } else if (fang.duiAt !== null && c === fang.duiAt) {
          gotDui = true;
        } else {
          died = true; // 穿
        }
      } else {
        // attack: 互攻，来招更高 → 死
        const mine = costOf(pid)!;
        if (c > mine) died = true;
      }
    }
    if (died) deaths.push(pid);
    else if (gotDui) dui.push(pid);
  }
  deaths.sort((a, b) => a - b);
  dui.sort((a, b) => a - b);
  return { deaths, dui };
}

/** 小扫=全场；单/双体按优先级自动锁定。波决：攻击者优先于非攻击者，平手取较小 id。 */
function targetsOf(
  attacker: PlayerId,
  target: TargetKind,
  state: GameState,
  actions: Map<PlayerId, Action>,
  dead: ReadonlySet<PlayerId>,
): PlayerId[] {
  const opps: PlayerId[] = [];
  for (let id = 0; id < state.players.length; id++) {
    if (id !== attacker && state.players[id]!.alive && !dead.has(id)) opps.push(id);
  }
  if (target === 'selfOnly') return [];
  if (target === 'allOthers') return opps;
  // single | twoTargets: 优先级降序，平手较小 id 在前，取前 n
  opps.sort((a, b) => priorityRank(b, actions) - priorityRank(a, actions) || a - b);
  const n = target === 'twoTargets' ? 2 : 1;
  return opps.slice(0, n);
}

/** 攻击者(1) > 非攻击者(0)。（rong 者已在 targetsOf 过滤掉，这里无需再判。） */
function priorityRank(pid: PlayerId, actions: Map<PlayerId, Action>): number {
  return actions.get(pid)?.kind === 'attack' ? 1 : 0;
}
