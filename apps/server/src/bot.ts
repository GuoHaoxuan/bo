import {
  resolve,
  skillData,
  getQi,
  newGame,
  addQi,
  SPECIAL_SKILLS,
  type Action,
  type GameState,
  type PlayerId,
  type SkillId,
} from '@bo/rules';
import type { PublicState } from '@bo/protocol';

const BASE_ATTACKS: readonly SkillId[] = ['kong', 'xiaosao', 'quansao', 'pass', 'chongjibo'];

// 从 Bot 视角的结果分。胜负 ±100 远大于局面气差（每 1 气 = 1），所以「先保命再争优势」。
const WIN = 100;
const LOSE = -100;
const DRAW = 0; // 同归于尽：不算输也不算赢
const FP_ITERS = 600; // 虚拟博弈迭代数（小矩阵足够收敛）

/**
 * 波决 AI —— 不写死、不可被针对。
 *
 * 思路：波决本质是「运气↘被攻击克↘被防挡↘运气抢节奏」的石头剪刀布，没有单一最优招。
 * 1) 用真正的规则引擎 `resolve` 把每个〔我的招 × 你的招〕组合跑一遍，得到精确收益矩阵
 *    （自动涵盖 克/超模招/气差，规则改了也不用改 AI）。
 * 2) 解这局零和矩阵的**极小化极大混合策略**（虚拟博弈逼近纳什均衡）：得到一组概率，按概率抽招。
 * 极小化极大的性质 = 就算你知道这组概率也无法稳定占便宜，且每拍真正出什么是随机的 → 强且无法被针对。
 */
export function botAction(state: PublicState, botId: PlayerId): Action {
  const me = state.players[botId];
  if (!me || !me.alive) return { kind: 'defend' };
  const allow = state.config.allowSpecials;

  const aliveIds = state.players.flatMap((p, i) => (p.alive ? [i] : []));
  // 仅 1v1（恰好两名存活）求强解；多人局退化为稳健随机
  if (aliveIds.length !== 2) return fallback(me.qi, allow);
  const oppId = aliveIds[0] === botId ? aliveIds[1]! : aliveIds[0]!;

  const myMoves = candidateMoves(me.qi, allow);
  const oppMoves = candidateMoves(state.players[oppId]!.qi, allow);
  const g = reconstruct(state);

  // 收益矩阵：matrix[i][j] = 我出 myMoves[i]、你出 oppMoves[j] 时，从我视角的分
  const matrix = myMoves.map((mine) => oppMoves.map((yours) => payoff(g, botId, oppId, mine, yours)));
  const strat = solveMaximin(matrix);
  return myMoves[sample(strat)]!;
}

/** 合法候选招：运气、防、放得起的攻击（开放时含超模招）。绝不溶（气不足的攻击不入选）。 */
function candidateMoves(qiMilli: number, allowSpecials: boolean): Action[] {
  const moves: Action[] = [{ kind: 'charge' }, { kind: 'defend' }];
  const pool = allowSpecials ? [...BASE_ATTACKS, ...SPECIAL_SKILLS] : BASE_ATTACKS;
  for (const skill of pool) {
    if (qiMilli >= skillData(skill).attack!.cost) moves.push({ kind: 'attack', skill, target: null });
  }
  return moves;
}

/** 由公开视图重建一份 GameState（波决状态 = 各人的气 + 存活），喂给 resolve 模拟。 */
function reconstruct(state: PublicState): GameState {
  const g = newGame(state.players.length);
  g.beat = state.beat;
  state.players.forEach((p, i) => {
    g.players[i]!.alive = p.alive;
    addQi(g.players[i]!, 'bo', p.qi);
  });
  return g;
}

/** 跑一拍真实结算，给出从 Bot 视角的收益分。 */
function payoff(g: GameState, botId: PlayerId, oppId: PlayerId, mine: Action, yours: Action): number {
  const subs = new Map<PlayerId, Action>([
    [botId, mine],
    [oppId, yours],
  ]);
  const { next } = resolve(g, subs);
  const me = next.players[botId]!;
  const opp = next.players[oppId]!;
  if (me.alive && !opp.alive) return WIN;
  if (!me.alive && opp.alive) return LOSE;
  if (!me.alive && !opp.alive) return DRAW;
  return (getQi(me, 'bo') - getQi(opp, 'bo')) / 1000; // 都活：气差为局面分
}

/**
 * 极小化极大混合策略：虚拟博弈（fictitious play）。
 * 行=Bot(最大化)、列=对手(最小化)；各自对「对方历史经验分布」最佳响应，
 * 平均策略收敛到零和纳什均衡（Robinson 定理）。返回 Bot 各招的概率。
 */
function solveMaximin(matrix: number[][]): number[] {
  const m = matrix.length;
  const n = matrix[0]!.length;
  const rowPlays = new Array<number>(m).fill(0);
  const colPlays = new Array<number>(n).fill(0);
  rowPlays[0] = 1; // 各播一手种子，避免空历史
  colPlays[0] = 1;

  for (let t = 0; t < FP_ITERS; t++) {
    // 行(最大化) 对 列历史 的最佳响应
    let bestRow = 0;
    let bestV = -Infinity;
    for (let i = 0; i < m; i++) {
      let v = 0;
      for (let j = 0; j < n; j++) v += matrix[i]![j]! * colPlays[j]!;
      if (v > bestV) {
        bestV = v;
        bestRow = i;
      }
    }
    rowPlays[bestRow]!++;
    // 列(最小化) 对 行历史 的最佳响应
    let bestCol = 0;
    let worstV = Infinity;
    for (let j = 0; j < n; j++) {
      let v = 0;
      for (let i = 0; i < m; i++) v += matrix[i]![j]! * rowPlays[i]!;
      if (v < worstV) {
        worstV = v;
        bestCol = j;
      }
    }
    colPlays[bestCol]!++;
  }
  const total = rowPlays.reduce((a, b) => a + b, 0);
  return rowPlays.map((c) => c / total);
}

/** 按概率分布抽一个下标。 */
function sample(probs: number[]): number {
  let r = Math.random();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i]!;
    if (r <= 0) return i;
  }
  return probs.length - 1;
}

/** 多人局的兜底：放得起就在候选里随机（仍绝不溶），偏向运气/防。 */
function fallback(qiMilli: number, allowSpecials: boolean): Action {
  const moves = candidateMoves(qiMilli, allowSpecials);
  return moves[Math.floor(Math.random() * moves.length)]!;
}
