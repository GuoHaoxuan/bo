# 「波」线上版 — 实现设计文档 (Design Spec)

- 日期：2026-06-19
- 规则来源：[bo-rules-reference.md](../../bo-rules-reference.md)（游戏圣经，活文档）
- 本文档范围：**第一个可玩里程碑的实现设计** —— 把「波决」做成可联机的实时游戏，
  但跑在一个**按全量规则（见规则文档 §7）设计的通用数据模型**上。

---

## 1. 目标与非目标

**目标**：复刻童年拍手游戏「波」的线上版。核心是**有节拍、同步暗出、按固定优先级结算**的回合制博弈。
先做最简模式「波决」端到端可联机，朋友点链接就能一起玩。

**本期目标（MVP）**
- 通用数据驱动规则引擎的**骨架** + **波决**全套规则跑通。
- 实时联机：房间、节拍循环、服务器权威结算、同步揭示。
- 先 1v1，再 N 人围圈。

**非目标（本期不做，但模型不能堵死）**
- 升级链 / 100代 的全部技能与机制（多通道、可能气态集合、封印状态、克网、光轮、代/prestige…）。
  → 这些**作为数据/扩展点**留到后续里程碑；本期只保证数据模型与结算管线**为它们留好接口**。
- 账号/持久化、排行、观战、移动端适配打磨。

**指导原则**：**数据模型设计成通用**（避免返工）；**实现增量推进**（先做波决需要的那部分）。

---

## 2. 架构总览

四个 crate 的 Cargo workspace，方案 1（轻量纯 Rust 服务器 + Bevy 客户端）：

```
bo/
├── bo_rules/      纯逻辑库：无 Bevy/网络/异步。游戏规则 + 数据驱动招式表。确定性纯函数。
├── bo_protocol/   客户端↔服务器消息类型（serde）。两端共用。
├── bo_server/     节拍权威：tokio + WebSocket。房间/拍子。依赖 rules + protocol。
└── bo_client/     Bevy 应用（原生开发 / WASM 发布）。仅表现。依赖 rules + protocol。
```

- **Bevy 只在 `bo_client`**，纯表现层。
- **`bo_rules` 是核心且最先写**，可脱离一切独立测试。
- 网络很简单（回合制、暗出翻牌）：**不需要 rollback/预测**，WebSocket 请求-广播即可。
- 隐藏信息天然安全：暗选只有权威服务器看得到，只广播公开结果。

---

## 3. 规则引擎 `bo_rules`

### 3.1 确定性纯函数

```rust
// 同样的状态 + 同样的暗选 → 唯一结果。无 IO、无随机、无浮点。
fn resolve(state: &GameState, submissions: &Submissions) -> (Resolution, GameState);
```

`Resolution` 是给客户端放动画的**事件流**（谁攻击谁、谁被挡/兑/死、气如何变…）。

### 3.2 数据模型（波决子集，按通用 schema 设计）

```rust
// 定点数 newtype：支持小数、精确比较、底层可换。波决只用整数，但类型已为 0.1/0.5 等留好。
struct Qi(i64);                 // 内部毫气：1.0 = 1000

enum QiType { Bo /* 后续: Dao, Qiang, Ba, Pi, Kouhong, Laser, Lunwheel, ... */ }
enum Channel { Physical /* 后续: Pi, Kouhong, Zhapi, Phone, Laser, ... */ }
enum TargetKind { SelfOnly, Single, AllOthers, TwoTargets }
enum Category { Charge, Defend, Attack }

struct Skill {                  // 数据，不是代码
    id: SkillId,
    category: Category,
    charge:  Vec<(QiType, Qi)>, // 运气加多少（波 = [(Bo,1)]）
    defense: Defense,           // 防 = Physical {2防3兑4破}
    attack:  Option<Attack>,
    // 后续扩展点（本期留空/默认）：priority, counters(克/兑), immunities, status_effect, tell …
}
struct Attack { cost: Vec<(QiType, Qi)>, channel: Channel, target: TargetKind /*, 破防强度, 互攻强度 …后续*/ }
enum Defense { None, PerChannel(Map<Channel, Bands>), All(Bands) }   // Bands = 防/兑/破阈值，可无兑档/可∞

struct PlayerState { qi: Map<QiType, Qi>, alive: bool /*, gen, statuses …后续*/ }
struct GameState   { players: Vec<PlayerState>, mode: ModeConfig, beat: u32 }
enum  Action       { Charge(SkillId), Defend(SkillId), Attack { skill: SkillId, target: Option<PlayerId> } }
```

**本期为通用性预留、但只实现波决所需的点**：
- 气用 `Map<QiType,Qi>`（波决只有 `Bo` 一种），**而非裸标量** → 以后加刀/枪/屁不返工。
- 状态先是**单一确定态**；规则文档 §2 的「可能气态集合 `S`」（氧气罐用）作为 `GameState` 的后续泛化点，本期不实现。
- `Skill`/`Attack` 字段齐全但多数招用默认；克网、封印状态、光轮、代 等作为**新增数据 + 新增结算步骤**后续接入。

### 3.3 波决结算（本期实现）

顺序（铁律）：**先判溶 → 再判克 → 出局/重开**。
- **溶**：气不够硬放招 / 放不存在或不允许的招 → 判死，且其攻击不生效。
- **克（波决内即攻防与互攻）**：
  - 攻击 vs 防：按气耗判 `≤2 挡 / ==3 兑(清防御方气) / ≥4 穿(死)`。
  - 攻击 vs 攻击：气耗高者胜、低者死、等气两边都活。
  - 攻击 vs 运气者：运气者被打死（裸奔）。
  - 小扫 = 全场 AOE；单/双体目标按优先级（波决里＝攻击者优先于防御者）自动锁定。
- **出局/重开**：被判死即出局；幸存者**清空气**继续；剩 1 人＝胜；剩 0 人＝平局。

**验收基准 = 1v1 结算矩阵**（规则文档已给）：运气/防御/合法攻击/溶 两两组合，每格一条单元测试。

---

## 4. 联机 `bo_protocol` + `bo_server`

### 4.1 节拍循环（每一拍）

1. 服务器广播 `BeatStart { beat, deadline, legal_actions }`。
2. 各客户端在截止前**秘密提交** `SubmitAction`（含隐藏选择：目标等）。未提交 → **默认「防」**。
3. 截止 → 服务器调 `rules::resolve` → 新状态 + 结算事件。
4. 服务器广播 `Resolution { events, public_state }`。
5. 客户端**同步**播放揭示动画，进入下一拍。

- 节拍**匀速**、时长可配置（「越来越快」作为后续手感旋钮，本期不做）。
- 服务器是节拍与状态的**唯一权威**。

### 4.2 协议消息（`bo_protocol`，serde 可序列化）

- C→S：`JoinRoom { room, name }`、`SubmitAction { beat, action }`。
- S→C：`RoomState`、`BeatStart`、`Resolution`、`GameOver { winner }`。

### 4.3 传输与房间

- 传输：**WebSocket**（原生 + WASM 通用）。
- 房间：MVP **无账号**，建房得房间码/链接，凭码加入，填昵称。
- 房间状态：`Lobby → Playing → GameOver(再来一局)`。

---

## 5. 客户端 `bo_client`（Bevy）

- App 状态机：`主菜单 → 房间 → 对局 → 结算`。
- 对局画面：**节拍器**（视＋听）、合法动作按钮（按气量/状态置灰）、对手状态（存活/攒气明牌/被封印…后续）、每拍**同步揭示动画**。
- 也依赖 `bo_rules` 做**本地合法性高亮**（非权威，纯 UX）。
- **原生先行**（迭代快），WASM 发布。

---

## 6. 开发顺序（测试驱动）

1. **`bo_rules` 波决**：类型 + `resolve()`；先把 **1v1 矩阵写成测试**，再扩 N 人。纯逻辑、零 Bevy/网络。← 最先、价值最大。
2. **`bo_protocol`**：消息类型。
3. **`bo_server`**：房间 + 节拍循环 + 调 rules。无头可测。
4. **`bo_client`**：Bevy——菜单/房间/对局/结算、节拍 UX、揭示动画、WebSocket。原生先行。
5. **打磨**：动画、节拍音效；出 WASM 构建。

---

## 7. 测试策略

- **`bo_rules`**：每条规则一个单元测试（溶/兑/夹死/等气/AOE/出局重开）；1v1 矩阵全覆盖；N 人关键场景。纯函数 → 易测。
- **`bo_server`**：节拍循环、超时默认防、多客户端提交收齐、断线处理（无头集成测试）。
- **端到端**：脚本化两个客户端跑完一局。

---

## 8. 错误处理

- **非法提交**：服务器权威校验；越权动作按规则判**溶**（或客户端预先禁用，二选一，倾向「客户端禁用 + 服务器兜底」）。
- **超时/未提交**：自动「防」。
- **断线**：每拍自动防；可重连续上；人数不足则暂停/中止该局。
- **`resolve` 决定性**：相同输入恒等输出；任何不确定性（未来随机）必须显式入状态。

---

## 9. 后续 / 开放问题

- 规则文档 §6 的 **24 条开放问题**（多为后续模式细节，不阻塞波决）。
- 通用引擎重机械（可能气态集合 `S` / 封印持续状态 / 多通道 / 克网 / 光轮 / 代-prestige）随对应模式分批接入。
- 节拍加速、移动端、账号/持久化、观战。
- 大霸是否再平衡（规则 §6 第 19 条）等「还原 vs 改良」取舍，做到对应模式时再定。

---

## 10. 模块边界自检

- `bo_rules`：**做什么** = 给定状态与暗选算出结果；**怎么用** = `resolve()` 纯函数；**依赖** = 无（仅 std + serde）。可独立理解与测试。
- `bo_protocol`：纯数据类型，两端唯一事实来源。
- `bo_server`：编排节拍与房间，不含游戏规则（委托 `bo_rules`）。
- `bo_client`：仅表现与输入，不含权威逻辑。
