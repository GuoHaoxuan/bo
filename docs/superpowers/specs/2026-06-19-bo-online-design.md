# 「波」线上版 — 实现设计文档 (Design Spec)

- 日期：2026-06-19（2026-06-19 修订：技术栈由 Rust/Bevy 改为**全 TypeScript**）
- 规则来源：[bo-rules-reference.md](../../bo-rules-reference.md)（游戏圣经，活文档，与语言无关）
- 本文档范围：把「波决」做成可联机的实时网页游戏，跑在一个按全量规则（规则文档 §7）设计的**通用数据模型**上。
- 参考实现：Rust 分支 `feat/bo-rules-bojue` 保留了一份已验证的引擎与 1v1 矩阵，作为 TS 移植蓝本。

---

## 1. 目标与非目标

**目标**：复刻童年拍手游戏「波」的线上版——**有节拍、同步暗出、按固定优先级结算**的回合制博弈。先做最简模式「波决」端到端可联机，朋友点链接即玩。

**本期目标（MVP）**
- 通用数据驱动规则引擎骨架 + **波决**全套规则。
- 实时联机：房间、节拍循环、服务器权威结算、同步揭示。
- 先 1v1，再 N 人围圈。

**非目标（本期不做，但模型不堵死）**
- 升级链 / 100代 的全部技能机制（多通道、可能气态集合、封印状态、克网、光轮、代…）→ 作为**数据/扩展点**留到后续。
- 账号/持久化、排行、观战、移动端打磨。

**指导原则**：数据模型**通用设计**（避免返工）；实现**增量推进**（先做波决）。

---

## 2. 架构总览

**全 TypeScript monorepo**（npm / pnpm workspaces）。规则引擎是一个**两端共享的包**：

```
bo/                      monorepo 根（workspaces）
├── packages/rules       共享规则引擎（resolve + 类型 + 招式表）。纯 TS，无 DOM/Node 依赖。
│                        客户端与服务器都 import 它 ← 规则复用就在这一份
├── packages/protocol    客户端↔服务器消息类型（也可并入 rules）
├── apps/server          Node + WebSocket（ws）。节拍权威：房间/拍子，调 rules
└── apps/client          React（Vite）+ Canvas/Pixi（棋盘/动画）+ Web Audio（节拍）。import rules 做本地提示
```

- **同一份 `@bo/rules`** 被服务器与客户端 import → 规则零成本共享、单一实现。
- 网络简单（回合制、暗出翻牌）：WebSocket 请求-广播即可，**不需要 rollback/预测**。
- 隐藏信息天然安全：暗选只有权威服务器看得到，只广播公开结果。
- 服务器是 **I/O 密集型实时服务**（多 WebSocket 连接 + 节拍定时器），正是 Node 事件循环的主场；每拍计算量微乎其微。

---

## 3. 规则引擎 `packages/rules`（TS）

### 3.1 确定性纯函数

```ts
// 同样的 state + 同样的 submissions → 唯一结果。无 IO、无随机、无浮点误差。
function resolve(state: GameState, submissions: Map<PlayerId, Action>): { resolution: Resolution; next: GameState };
```

`resolution` 是给客户端放动画的事件（谁攻击谁、谁被挡/兑/死、气如何变）。

### 3.2 数据模型（波决子集，按通用 schema 设计）

```ts
// 气：整数「毫气」(1.0 气 = 1000)。JS number 在 2^53 内对整数精确 → 无浮点误差。
type Qi = number;                     // 单位毫气；whole(n) = n*1000；只做整数运算
const ZERO = 0; const whole = (n: number): Qi => n * 1000;

type QiType   = 'bo';                 // 后续: 'dao' | 'qiang' | 'pi' | 'laser' | ...
type Channel  = 'physical';           // 后续: 'pi' | 'kouhong' | 'zhapi' | ...
type TargetKind = 'selfOnly' | 'single' | 'allOthers' | 'twoTargets';
type Category = 'charge' | 'defend' | 'attack';
type SkillId  = 'yunqi' | 'fang' | 'kong' | 'xiaosao' | 'quansao' | 'pass' | 'chongjibo';

interface Defense { channel: Channel; blockMax: Qi; duiAt: Qi | null; }  // 波决物理防：≤blockMax 挡 / ==duiAt 兑 / 穿
interface Attack  { cost: Qi; channel: Channel; target: TargetKind; }    // 后续: pierce/破防强度, clash/互攻强度
interface Skill   { id: SkillId; category: Category; charge: [QiType, Qi] | null; defense: Defense | null; attack: Attack | null; }
function skillData(id: SkillId): Skill;   // 数据驱动招式表

type PlayerId = number;                                   // 数组下标
interface Player { qi: Map<QiType, Qi>; alive: boolean; } // 通用：按类型分桶（波决只有 'bo'，非裸标量 → 不返工）
interface GameState { players: Player[]; beat: number; }

type Action =
  | { kind: 'charge' }
  | { kind: 'defend' }
  | { kind: 'attack'; skill: SkillId; target: PlayerId | null }; // target 为后续手动选目标预留；波决按优先级自动锁定

type Outcome = { kind: 'continue' } | { kind: 'winner'; id: PlayerId } | { kind: 'draw' };
interface Resolution { rong: PlayerId[]; combatDeaths: PlayerId[]; dui: PlayerId[]; outcome: Outcome; }
```

**本期为通用性预留、只实现波决所需**：气是 `Map<QiType,Qi>`（非裸标量）；状态先是单一确定态（规则文档 §2 的「可能气态集合」用于氧气罐，后续泛化）；`Skill`/`Attack` 字段齐全但波决多数取默认；克网、封印状态、光轮、代 等作为新增数据 + 新增结算步骤后续接入。

**TS 注意**：用**整数毫气**保证确定性（不碰浮点）；遍历玩家按**数组下标**、输出数组**排序**，保证结算确定（不依赖 `Map` 插入序）；`switch` 配 `never` 兜底保证穷尽。

### 3.3 波决结算（本期实现）

**先判溶 → 再判克 → 出局/重开**（铁律）。
- **溶**：气不够硬放招 → 判死，且其攻击不生效。
- **克**：攻 vs 防按气耗 `≤2 挡 / ==3 兑(清防御方气) / ≥4 穿(死)`；攻 vs 攻 互攻气高者胜、低者死、等气都活；攻 vs 运气者→死；小扫=全场 AOE；单/双体按优先级（攻击者优先于防御者，平手取较小 id）自动锁定。
- **出局/重开**：被判死即出局；幸存者**清空气**继续；剩 1 人＝胜，剩 0＝平局。

**验收基准 = 1v1 结算矩阵**（规则文档 + Rust 参考分支已给）：运气/防御/合法攻击/溶 两两组合，每格一条测试。

---

## 4. 联机 `packages/protocol` + `apps/server`（Node）

### 4.1 节拍循环（每一拍）

1. 服务器广播 `BeatStart { beat, deadlineMs, legalActions }`。
2. 各客户端在截止前**秘密提交** `SubmitAction`（含隐藏选择：目标等）。未提交 → **默认「防」**。
3. 截止 → 服务器调 `resolve(state, submissions)` → 新状态 + 结算事件。
4. 服务器广播 `Resolution { events, publicState }`。
5. 客户端**同步**播放揭示动画，进入下一拍。

- 节拍**匀速**、时长可配置（「越来越快」作为后续手感旋钮）。服务器是节拍与状态的唯一权威。

### 4.2 协议消息（`packages/protocol`，JSON）

- C→S：`JoinRoom { room, name }`、`SubmitAction { beat, action }`。
- S→C：`RoomState`、`BeatStart`、`Resolution`、`GameOver { winner }`。
- 用**可辨识联合**（`type` 字段）+ 运行时校验（如 zod，可选）。

### 4.3 传输与房间

- 传输：**WebSocket**（Node 端 `ws`；浏览器原生 `WebSocket`）。
- 房间：MVP **无账号**，建房得房间码/链接，凭码加入，填昵称。
- 房间状态：`Lobby → Playing → GameOver(再来一局)`。
- 服务器对每个房间维护一个 `GameState` + 节拍定时器，收齐/超时即 `resolve` 并广播。

---

## 5. 客户端 `apps/client`（React + Vite）

- App 状态：`主菜单 → 房间 → 对局 → 结算`（React 组件 + 状态）。
- **分层**：React 管**界面外壳**（菜单/房间/HUD/按钮/状态）；**Canvas/Pixi 层**管棋盘与**出招动画**（自有渲染循环，不经 React 的 60fps）；**Web Audio** 打节拍；CSS/GSAP 做简单 DOM 特效。
- 也 import `@bo/rules` 做**本地合法性高亮**（非权威，纯 UX）。
- 部署：客户端是静态产物（Vite build），服务器是 Node 进程。

---

## 6. 开发顺序（测试驱动，Vitest）

1. **`packages/rules`**：从 Rust 参考分支**移植** `resolve()` + 类型 + 招式表；**1v1 矩阵**与单元测试照搬翻成 Vitest。纯逻辑、零 DOM/Node。← 最先、价值最大。
2. **`packages/protocol`**：消息类型（+ 可选 zod 校验）。
3. **`apps/server`**：Node + `ws`，房间 + 节拍循环 + 调 rules。可无头测试。
4. **`apps/client`**：React/Vite——菜单/房间/对局/结算、节拍 UX、Pixi 揭示动画、WebSocket。
5. **打磨**：动画、节拍音效、部署。

---

## 7. 测试策略

- **`packages/rules`**：Vitest 单测，每条规则一例（溶/兑/夹死/等气/AOE/出局重开）；1v1 矩阵全覆盖；N 人关键场景。纯函数 → 易测。
- **`apps/server`**：节拍循环、超时默认防、多客户端收齐、断线处理（用内存 WebSocket 或 mock 做集成测试）。
- **端到端**：脚本化两个客户端跑完一局。

---

## 8. 错误处理

- **非法提交**：服务器权威校验；越权动作按规则判**溶**（或客户端预先禁用）。倾向「客户端禁用 + 服务器兜底」。
- **超时/未提交**：自动「防」。
- **断线**：每拍自动防；可重连续上；人数不足则暂停/中止该局。
- **`resolve` 决定性**：相同输入恒等输出；任何不确定性（未来随机）显式入状态。

---

## 9. 后续 / 开放问题

- 规则文档 §6 的 24 条开放问题（多为后续模式细节，不阻塞波决）。
- 通用引擎重机械（可能气态集合 / 封印持续状态 / 多通道 / 克网 / 光轮 / 代-prestige）随对应模式分批接入。
- 节拍加速、移动端、账号/持久化、观战。
- 大霸再平衡等「还原 vs 改良」取舍，做到对应模式时再定。

---

## 10. 模块边界自检

- `packages/rules`：**做什么** = 给定状态与暗选算结果；**怎么用** = `resolve()` 纯函数；**依赖** = 无（纯 TS，无 DOM/Node）。两端共享。
- `packages/protocol`：纯类型，两端唯一事实来源。
- `apps/server`：编排节拍与房间，不含游戏规则（委托 `@bo/rules`）。
- `apps/client`：仅表现与输入，不含权威逻辑。
