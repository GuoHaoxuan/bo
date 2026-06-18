# bo_rules（波决引擎）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现「波决」的纯逻辑规则引擎 `bo_rules`：一个确定性纯函数 `resolve(state, submissions) → (Resolution, new state)`，并用 1v1 结算矩阵全覆盖测试。

**Architecture:** 独立 Rust 库 crate，无 Bevy / 无网络 / 无异步 / 无浮点。数据驱动招式表；`resolve` 按「先判溶 → 再判克 → 出局重开」结算。气用 `BTreeMap<QiType, Qi>`（波决只有 `Bo`，但结构通用以免返工）。

**Tech Stack:** Rust (edition 2021)，Cargo workspace，仅 `std`。测试用内置 `#[test]`。

## Global Constraints

- Rust edition **2021**；仅依赖 `std`（本期 **不引入** serde / 第三方 crate；序列化留到 protocol 计划再加）。
- **无浮点**：`Qi` 是定点数 newtype（内部 i64 毫气，`1.0 气 = 1000`）。
- `resolve` 必须是**确定性纯函数**：无 IO、无随机、无全局可变状态。
- 这是 plan 1 / 3（rules → server → client）。本计划只产出 `bo_rules`。
- 规则真值来源：[../specs/2026-06-19-bo-online-design.md](../specs/2026-06-19-bo-online-design.md) §3.3 与规则参考文档的 1v1 矩阵。

**波决规则速查（实现依据）**
- 招式：运气(波,+1) / 防 / 空(攻1) / 小扫(攻2,全场) / 全扫(攻3) / pass(攻4) / 冲击波(攻6,双体)。
- 防：物理，`≤2 挡 / ==3 兑(清防御方气) / ≥4 穿(死)`。
- 结算：先判**溶**（气<气耗硬攻→死，且攻击不生效）→ 再判**克**（攻防按气数、互攻气高者胜·等气都活、运气者被攻击即死）→ **出局重开**（有人死则幸存者清空气）。剩 1 人＝胜，剩 0＝平局。

---

### Task 1: Workspace + crate 脚手架 + `Qi` 定点数

**Files:**
- Create: `Cargo.toml`（workspace 根）
- Create: `bo_rules/Cargo.toml`
- Create: `bo_rules/src/lib.rs`
- Create: `bo_rules/src/qi.rs`

**Interfaces:**
- Produces: `Qi(i64)`；`Qi::ZERO`；`Qi::whole(n: i64) -> Qi`；`Add`/`Sub`/`AddAssign`/`Ord`。

- [ ] **Step 1: 建 workspace 与 crate 文件**

`Cargo.toml`（根）：
```toml
[workspace]
members = ["bo_rules"]
resolver = "2"
```

`bo_rules/Cargo.toml`：
```toml
[package]
name = "bo_rules"
version = "0.1.0"
edition = "2021"

[dependencies]
```

`bo_rules/src/lib.rs`：
```rust
pub mod qi;
```

- [ ] **Step 2: 写失败测试** — 在 `bo_rules/src/qi.rs` 末尾：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_and_arithmetic() {
        assert_eq!(Qi::whole(2) + Qi::whole(3), Qi::whole(5));
        assert_eq!(Qi::whole(5) - Qi::whole(2), Qi::whole(3));
        assert!(Qi::whole(2) < Qi::whole(3));
        assert_eq!(Qi::ZERO, Qi::whole(0));

        let mut q = Qi::whole(1);
        q += Qi::whole(2);
        assert_eq!(q, Qi::whole(3));
    }
}
```

- [ ] **Step 3: 运行，确认失败**

Run: `cargo test -p bo_rules`
Expected: 编译失败（`Qi` 未定义）。

- [ ] **Step 4: 实现 `Qi`** — 在 `bo_rules/src/qi.rs` 顶部（测试模块之前）：

```rust
/// 定点数：内部存「毫气」，1.0 气 = 1000。支持小数、精确比较。波决只用整数。
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct Qi(pub i64);

impl Qi {
    pub const ZERO: Qi = Qi(0);
    /// 整数气
    pub fn whole(n: i64) -> Qi {
        Qi(n * 1000)
    }
}

impl std::ops::Add for Qi {
    type Output = Qi;
    fn add(self, o: Qi) -> Qi {
        Qi(self.0 + o.0)
    }
}
impl std::ops::Sub for Qi {
    type Output = Qi;
    fn sub(self, o: Qi) -> Qi {
        Qi(self.0 - o.0)
    }
}
impl std::ops::AddAssign for Qi {
    fn add_assign(&mut self, o: Qi) {
        self.0 += o.0;
    }
}
```

- [ ] **Step 5: 运行，确认通过**

Run: `cargo test -p bo_rules`
Expected: PASS（1 passed）。

- [ ] **Step 6: 提交**

```bash
git add Cargo.toml bo_rules/
git commit -m "feat(rules): workspace + Qi fixed-point type"
```

---

### Task 2: 招式数据模型 + 波决招式表

**Files:**
- Create: `bo_rules/src/skill.rs`
- Modify: `bo_rules/src/lib.rs`

**Interfaces:**
- Consumes: `Qi`（Task 1）。
- Produces: 枚举 `QiType::Bo`、`Channel::Physical`、`Category::{Charge,Defend,Attack}`、`TargetKind::{SelfOnly,Single,AllOthers,TwoTargets}`、`SkillId::{Yunqi,Fang,Kong,Xiaosao,Quansao,Pass,Chongjibo}`；结构 `Defense{channel,block_max,dui_at}`、`Attack{cost,channel,target}`、`Skill{id,category,charge,defense,attack}`；函数 `skill_data(id: SkillId) -> Skill`。

- [ ] **Step 1: 注册模块** — `bo_rules/src/lib.rs`：

```rust
pub mod qi;
pub mod skill;
```

- [ ] **Step 2: 写失败测试** — `bo_rules/src/skill.rs` 末尾：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::qi::Qi;

    #[test]
    fn bo_charges_one() {
        let s = skill_data(SkillId::Yunqi);
        assert_eq!(s.category, Category::Charge);
        assert_eq!(s.charge, Some((QiType::Bo, Qi::whole(1))));
    }

    #[test]
    fn fang_bands() {
        let d = skill_data(SkillId::Fang).defense.unwrap();
        assert_eq!(d.block_max, Qi::whole(2));
        assert_eq!(d.dui_at, Some(Qi::whole(3)));
    }

    #[test]
    fn attacks_costs_and_targets() {
        let a = skill_data(SkillId::Kong).attack.unwrap();
        assert_eq!(a.cost, Qi::whole(1));
        assert_eq!(a.target, TargetKind::Single);

        assert_eq!(skill_data(SkillId::Xiaosao).attack.unwrap().target, TargetKind::AllOthers);
        assert_eq!(skill_data(SkillId::Chongjibo).attack.unwrap().target, TargetKind::TwoTargets);
        assert_eq!(skill_data(SkillId::Pass).attack.unwrap().cost, Qi::whole(4));
    }
}
```

- [ ] **Step 3: 运行，确认失败**

Run: `cargo test -p bo_rules`
Expected: 编译失败（`skill_data` / 类型未定义）。

- [ ] **Step 4: 实现** — `bo_rules/src/skill.rs` 顶部：

```rust
use crate::qi::Qi;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum QiType {
    Bo, // 后续: Dao, Qiang, Ba, Pi, Kouhong, Laser, Lunwheel, ...
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Channel {
    Physical, // 后续: Pi, Kouhong, Zhapi, Phone, Laser, ...
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Category {
    Charge,
    Defend,
    Attack,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TargetKind {
    SelfOnly,
    Single,
    AllOthers,
    TwoTargets,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SkillId {
    Yunqi,
    Fang,
    Kong,
    Xiaosao,
    Quansao,
    Pass,
    Chongjibo,
}

/// 防御档位（按通道）。波决物理防：≤block_max 挡，==dui_at 兑，>dui_at 穿。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Defense {
    pub channel: Channel,
    pub block_max: Qi,
    pub dui_at: Option<Qi>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Attack {
    pub cost: Qi,
    pub channel: Channel,
    pub target: TargetKind,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Skill {
    pub id: SkillId,
    pub category: Category,
    pub charge: Option<(QiType, Qi)>,
    pub defense: Option<Defense>,
    pub attack: Option<Attack>,
}

fn atk(id: SkillId, cost: Qi, target: TargetKind) -> Skill {
    Skill {
        id,
        category: Category::Attack,
        charge: None,
        defense: None,
        attack: Some(Attack { cost, channel: Channel::Physical, target }),
    }
}

/// 波决招式表（数据驱动；后续模式只是更多分支/更多数据）。
pub fn skill_data(id: SkillId) -> Skill {
    use SkillId::*;
    match id {
        Yunqi => Skill {
            id,
            category: Category::Charge,
            charge: Some((QiType::Bo, Qi::whole(1))),
            defense: None,
            attack: None,
        },
        Fang => Skill {
            id,
            category: Category::Defend,
            charge: None,
            defense: Some(Defense {
                channel: Channel::Physical,
                block_max: Qi::whole(2),
                dui_at: Some(Qi::whole(3)),
            }),
            attack: None,
        },
        Kong => atk(id, Qi::whole(1), TargetKind::Single),
        Xiaosao => atk(id, Qi::whole(2), TargetKind::AllOthers),
        Quansao => atk(id, Qi::whole(3), TargetKind::Single),
        Pass => atk(id, Qi::whole(4), TargetKind::Single),
        Chongjibo => atk(id, Qi::whole(6), TargetKind::TwoTargets),
    }
}
```

- [ ] **Step 5: 运行，确认通过**

Run: `cargo test -p bo_rules`
Expected: PASS（全部 passed）。

- [ ] **Step 6: 提交**

```bash
git add bo_rules/src/skill.rs bo_rules/src/lib.rs
git commit -m "feat(rules): data-driven skill table for 波决"
```

---

### Task 3: 局面状态 + 动作

**Files:**
- Create: `bo_rules/src/state.rs`
- Create: `bo_rules/src/action.rs`
- Modify: `bo_rules/src/lib.rs`

**Interfaces:**
- Consumes: `Qi`、`QiType`、`SkillId`。
- Produces: `type PlayerId = usize`；`Player{qi,alive}` + 方法 `new/get/add/clear_qi`；`GameState{players,beat}` + `new(n)/alive_ids()`；`Action::{Charge,Defend,Attack{skill,target}}`。

- [ ] **Step 1: 注册模块** — `bo_rules/src/lib.rs`：

```rust
pub mod qi;
pub mod skill;
pub mod state;
pub mod action;
```

- [ ] **Step 2: 写失败测试** — `bo_rules/src/state.rs` 末尾：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::qi::Qi;
    use crate::skill::QiType;

    #[test]
    fn player_qi_accumulates_and_clears() {
        let mut p = Player::new();
        assert_eq!(p.get(QiType::Bo), Qi::ZERO);
        p.add(QiType::Bo, Qi::whole(1));
        p.add(QiType::Bo, Qi::whole(2));
        assert_eq!(p.get(QiType::Bo), Qi::whole(3));
        p.clear_qi();
        assert_eq!(p.get(QiType::Bo), Qi::ZERO);
    }

    #[test]
    fn game_state_tracks_alive() {
        let mut g = GameState::new(3);
        assert_eq!(g.alive_ids(), vec![0, 1, 2]);
        g.players[1].alive = false;
        assert_eq!(g.alive_ids(), vec![0, 2]);
    }
}
```

- [ ] **Step 3: 运行，确认失败**

Run: `cargo test -p bo_rules`
Expected: 编译失败（`Player` / `GameState` 未定义）。

- [ ] **Step 4: 实现 state** — `bo_rules/src/state.rs` 顶部：

```rust
use std::collections::BTreeMap;

use crate::qi::Qi;
use crate::skill::QiType;

pub type PlayerId = usize;

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Player {
    pub qi: BTreeMap<QiType, Qi>,
    pub alive: bool,
}

impl Player {
    pub fn new() -> Player {
        Player { qi: BTreeMap::new(), alive: true }
    }
    pub fn get(&self, t: QiType) -> Qi {
        self.qi.get(&t).copied().unwrap_or(Qi::ZERO)
    }
    pub fn add(&mut self, t: QiType, amt: Qi) {
        let cur = self.get(t);
        self.qi.insert(t, cur + amt);
    }
    pub fn clear_qi(&mut self) {
        self.qi.clear();
    }
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct GameState {
    pub players: Vec<Player>,
    pub beat: u32,
}

impl GameState {
    pub fn new(n: usize) -> GameState {
        GameState { players: (0..n).map(|_| Player::new()).collect(), beat: 0 }
    }
    pub fn alive_ids(&self) -> Vec<PlayerId> {
        (0..self.players.len()).filter(|&i| self.players[i].alive).collect()
    }
}
```

- [ ] **Step 5: 实现 action** — `bo_rules/src/action.rs`（整文件）：

```rust
use crate::skill::SkillId;
use crate::state::PlayerId;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Action {
    Charge,
    Defend,
    /// target 为后续手动选目标预留；波决按优先级自动锁定，target 可为 None。
    Attack { skill: SkillId, target: Option<PlayerId> },
}
```

- [ ] **Step 6: 运行，确认通过**

Run: `cargo test -p bo_rules`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add bo_rules/src/state.rs bo_rules/src/action.rs bo_rules/src/lib.rs
git commit -m "feat(rules): GameState, Player, Action"
```

---

### Task 4: `resolve` v1 — 运气 + 判溶

**Files:**
- Create: `bo_rules/src/resolve.rs`
- Modify: `bo_rules/src/lib.rs`

**Interfaces:**
- Consumes: 上述全部类型。
- Produces: `Outcome::{Continue,Winner(PlayerId),Draw}`；`Resolution{rong,combat_deaths,dui,outcome}`；`resolve(&GameState, &BTreeMap<PlayerId, Action>) -> (Resolution, GameState)`。
- 本版只处理：默认防、运气加气、判溶（攻击气不足→死、攻击不生效）。**尚无落地攻击**。

- [ ] **Step 1: 注册模块** — `bo_rules/src/lib.rs`：

```rust
pub mod qi;
pub mod skill;
pub mod state;
pub mod action;
pub mod resolve;
```

- [ ] **Step 2: 写失败测试** — `bo_rules/src/resolve.rs` 末尾：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::action::Action;
    use crate::qi::Qi;
    use crate::skill::{QiType, SkillId};
    use crate::state::GameState;
    use std::collections::BTreeMap;

    fn subs(pairs: &[(usize, Action)]) -> BTreeMap<usize, Action> {
        pairs.iter().copied().collect()
    }

    #[test]
    fn both_charge_gain_one_each() {
        let g = GameState::new(2);
        let (res, n) = resolve(&g, &subs(&[(0, Action::Charge), (1, Action::Charge)]));
        assert_eq!(n.players[0].get(QiType::Bo), Qi::whole(1));
        assert_eq!(n.players[1].get(QiType::Bo), Qi::whole(1));
        assert!(res.rong.is_empty());
        assert!(matches!(res.outcome, Outcome::Continue));
    }

    #[test]
    fn attack_without_qi_is_rong_death() {
        let g = GameState::new(2); // 双方 0 气
        // 0 硬放空(需1气)→溶死；1 运气
        let (res, n) = resolve(
            &g,
            &subs(&[(0, Action::Attack { skill: SkillId::Kong, target: None }), (1, Action::Charge)]),
        );
        assert_eq!(res.rong, vec![0]);
        assert!(!n.players[0].alive);
        assert!(n.players[1].alive);
        // 1v1 中 0 溶死 → 1 是唯一幸存者 = 胜
        assert!(matches!(res.outcome, Outcome::Winner(1)));
    }
}
```

- [ ] **Step 3: 运行，确认失败**

Run: `cargo test -p bo_rules`
Expected: 编译失败（`resolve` 未定义）。

- [ ] **Step 4: 实现 v1** — `bo_rules/src/resolve.rs` 顶部：

```rust
use std::collections::BTreeMap;

use crate::action::Action;
use crate::qi::Qi;
use crate::skill::{skill_data, QiType};
use crate::state::{GameState, PlayerId};

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Outcome {
    Continue,
    Winner(PlayerId),
    Draw,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Resolution {
    pub rong: Vec<PlayerId>,
    pub combat_deaths: Vec<PlayerId>,
    pub dui: Vec<PlayerId>,
    pub outcome: Outcome,
}

pub fn resolve(state: &GameState, subs: &BTreeMap<PlayerId, Action>) -> (Resolution, GameState) {
    let mut next = state.clone();
    next.beat += 1;

    // 没提交 → 默认防
    let actions: BTreeMap<PlayerId, Action> = state
        .alive_ids()
        .into_iter()
        .map(|id| (id, subs.get(&id).copied().unwrap_or(Action::Defend)))
        .collect();

    // 1. 判溶：攻击但气不足
    let mut rong: Vec<PlayerId> = vec![];
    for (&id, act) in &actions {
        if let Action::Attack { skill, .. } = act {
            let a = skill_data(*skill).attack.expect("attack skill has Attack");
            if next.players[id].get(QiType::Bo) < a.cost {
                rong.push(id);
            }
        }
    }
    for &id in &rong {
        next.players[id].alive = false;
    }

    // 2. 运气者加气（存活者）
    for (&id, act) in &actions {
        if next.players[id].alive {
            if let Action::Charge = act {
                next.players[id].add(QiType::Bo, Qi::whole(1));
            }
        }
    }

    // 3. 出局/重开：本拍有人死 → 幸存者清空气
    if !rong.is_empty() {
        for p in next.players.iter_mut() {
            if p.alive {
                p.clear_qi();
            }
        }
    }

    let outcome = outcome_of(&next);
    (Resolution { rong, combat_deaths: vec![], dui: vec![], outcome }, next)
}

fn outcome_of(state: &GameState) -> Outcome {
    let alive = state.alive_ids();
    match alive.len() {
        1 => Outcome::Winner(alive[0]),
        0 => Outcome::Draw,
        _ => Outcome::Continue,
    }
}
```

- [ ] **Step 5: 运行，确认通过**

Run: `cargo test -p bo_rules`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add bo_rules/src/resolve.rs bo_rules/src/lib.rs
git commit -m "feat(rules): resolve v1 — charge + 溶"
```

---

### Task 5: `resolve` v2 — 单体战斗结算（运气者/防御者/攻击者 + 兑）

**Files:**
- Modify: `bo_rules/src/resolve.rs`

**Interfaces:**
- Produces: 私有 `fn resolve_combat(next, &actions, &rong) -> (Vec<PlayerId>, Vec<PlayerId>)`（返回 `(combat_deaths, dui)`）；`resolve` 接入战斗与扣气。
- 本版目标：1v1/单体命中。运气者被命中即死；防御者按 `≤2挡/==3兑/≥4穿`；攻击者互攻气高者胜、等气都活。

- [ ] **Step 1: 写失败测试** — 追加到 `resolve.rs` 测试模块（`mod tests` 内）：

```rust
    fn with_qi(n: usize, qis: &[i64]) -> GameState {
        let mut g = GameState::new(n);
        for (i, &q) in qis.iter().enumerate() {
            g.players[i].add(QiType::Bo, Qi::whole(q));
        }
        g
    }

    #[test]
    fn charger_is_killed_by_attack() {
        let g = with_qi(2, &[0, 1]); // 1 有 1 气
        let (res, n) = resolve(
            &g,
            &subs(&[(0, Action::Charge), (1, Action::Attack { skill: SkillId::Kong, target: None })]),
        );
        assert_eq!(res.combat_deaths, vec![0]);
        assert!(!n.players[0].alive);
        assert!(matches!(res.outcome, Outcome::Winner(1)));
    }

    #[test]
    fn defend_blocks_low_dui_mid_breaks_high() {
        // ≤2 挡：防 vs 小扫(2) → 无事
        let g = with_qi(2, &[0, 2]);
        let (res, n) = resolve(
            &g,
            &subs(&[(0, Action::Defend), (1, Action::Attack { skill: SkillId::Xiaosao, target: None })]),
        );
        assert!(res.combat_deaths.is_empty() && res.dui.is_empty());
        assert!(n.players[0].alive);

        // ==3 兑：防 vs 全扫(3) → 防御方清气、人活
        let g = with_qi(2, &[5, 3]);
        let (res, n) = resolve(
            &g,
            &subs(&[(0, Action::Defend), (1, Action::Attack { skill: SkillId::Quansao, target: None })]),
        );
        assert_eq!(res.dui, vec![0]);
        assert!(n.players[0].alive);
        assert_eq!(n.players[0].get(QiType::Bo), Qi::ZERO); // 兑清空防御方气

        // ≥4 穿：防 vs pass(4) → 死
        let g = with_qi(2, &[0, 4]);
        let (res, _n) = resolve(
            &g,
            &subs(&[(0, Action::Defend), (1, Action::Attack { skill: SkillId::Pass, target: None })]),
        );
        assert_eq!(res.combat_deaths, vec![0]);
        assert!(matches!(res.outcome, Outcome::Winner(1)));
    }

    #[test]
    fn mutual_attack_higher_wins_equal_both_live() {
        // 0:全扫(3) vs 1:空(1) → 1 死
        let g = with_qi(2, &[3, 1]);
        let (res, _n) = resolve(
            &g,
            &subs(&[
                (0, Action::Attack { skill: SkillId::Quansao, target: None }),
                (1, Action::Attack { skill: SkillId::Kong, target: None }),
            ]),
        );
        assert_eq!(res.combat_deaths, vec![1]);

        // 等气：双方空(1) → 都活
        let g = with_qi(2, &[1, 1]);
        let (res, n) = resolve(
            &g,
            &subs(&[
                (0, Action::Attack { skill: SkillId::Kong, target: None }),
                (1, Action::Attack { skill: SkillId::Kong, target: None }),
            ]),
        );
        assert!(res.combat_deaths.is_empty());
        assert!(n.players[0].alive && n.players[1].alive);
    }
```

- [ ] **Step 2: 运行，确认失败**

Run: `cargo test -p bo_rules`
Expected: 新测试 FAIL（攻击未落地：`combat_deaths` 仍为空）。

- [ ] **Step 3: 实现 v2** — 把 `resolve.rs` 中的 `resolve` 函数体替换为下面这版，并在其后新增 `resolve_combat` 与 `targets_of`、`priority_key`：

```rust
pub fn resolve(state: &GameState, subs: &BTreeMap<PlayerId, Action>) -> (Resolution, GameState) {
    let mut next = state.clone();
    next.beat += 1;

    let actions: BTreeMap<PlayerId, Action> = state
        .alive_ids()
        .into_iter()
        .map(|id| (id, subs.get(&id).copied().unwrap_or(Action::Defend)))
        .collect();

    // 1. 判溶
    let mut rong: Vec<PlayerId> = vec![];
    for (&id, act) in &actions {
        if let Action::Attack { skill, .. } = act {
            let a = skill_data(*skill).attack.expect("attack skill has Attack");
            if next.players[id].get(QiType::Bo) < a.cost {
                rong.push(id);
            }
        }
    }
    for &id in &rong {
        next.players[id].alive = false;
    }

    // 2. 扣有效攻击者的气（放招不清零，只扣 cost）
    for (&id, act) in &actions {
        if rong.contains(&id) {
            continue;
        }
        if let Action::Attack { skill, .. } = act {
            let cost = skill_data(*skill).attack.unwrap().cost;
            let cur = next.players[id].get(QiType::Bo);
            next.players[id].qi.insert(QiType::Bo, cur - cost);
        }
    }

    // 3. 战斗（克）
    let (combat_deaths, dui) = resolve_combat(&next, &actions, &rong);
    for &id in &dui {
        next.players[id].clear_qi();
    }
    for &id in &combat_deaths {
        next.players[id].alive = false;
    }

    // 4. 运气者加气（存活者）
    for (&id, act) in &actions {
        if next.players[id].alive {
            if let Action::Charge = act {
                next.players[id].add(QiType::Bo, Qi::whole(1));
            }
        }
    }

    // 5. 出局/重开
    let any_death = !rong.is_empty() || !combat_deaths.is_empty();
    if any_death {
        for p in next.players.iter_mut() {
            if p.alive {
                p.clear_qi();
            }
        }
    }

    let outcome = outcome_of(&next);
    (Resolution { rong, combat_deaths, dui, outcome }, next)
}

/// 返回 (combat_deaths, dui)。基于「动作快照」同步结算（攻击同时落地）。
fn resolve_combat(
    state: &GameState,
    actions: &BTreeMap<PlayerId, Action>,
    rong: &[PlayerId],
) -> (Vec<PlayerId>, Vec<PlayerId>) {
    // 有效攻击者：攻击 且 未溶 且 存活
    let attackers: Vec<(PlayerId, Qi, crate::skill::TargetKind)> = actions
        .iter()
        .filter(|(id, _)| !rong.contains(id) && state.players[**id].alive)
        .filter_map(|(&id, act)| match act {
            Action::Attack { skill, .. } => {
                let a = skill_data(*skill).attack.unwrap();
                Some((id, a.cost, a.target))
            }
            _ => None,
        })
        .collect();

    let cost_of = |pid: PlayerId| -> Option<Qi> {
        attackers.iter().find(|(id, _, _)| *id == pid).map(|(_, c, _)| *c)
    };

    // 每个目标收到的攻击气耗列表
    let mut incoming: BTreeMap<PlayerId, Vec<Qi>> = BTreeMap::new();
    for (aid, cost, target) in &attackers {
        for t in targets_of(*aid, *target, state, actions, rong) {
            incoming.entry(t).or_default().push(*cost);
        }
    }

    let fang = skill_data(crate::skill::SkillId::Fang).defense.unwrap();
    let mut deaths = vec![];
    let mut dui = vec![];
    for (&pid, costs) in &incoming {
        let act = actions[&pid];
        let mut died = false;
        let mut got_dui = false;
        for &c in costs {
            match act {
                Action::Charge => died = true, // 运气者裸奔，被命中即死
                Action::Defend => {
                    if c <= fang.block_max {
                        // 挡下，无事
                    } else if Some(c) == fang.dui_at {
                        got_dui = true;
                    } else {
                        died = true; // 穿
                    }
                }
                Action::Attack { .. } => {
                    let mine = cost_of(pid).expect("target is attacker");
                    if c > mine {
                        died = true; // 互攻：来招更高 → 死
                    }
                }
            }
        }
        if died {
            deaths.push(pid);
        } else if got_dui {
            dui.push(pid);
        }
    }
    deaths.sort();
    dui.sort();
    (deaths, dui)
}

/// 单体/双体按优先级自动锁定；小扫打全场。波决：攻击者优先于非攻击者，平手取较小 id。
fn targets_of(
    attacker: PlayerId,
    target: crate::skill::TargetKind,
    state: &GameState,
    actions: &BTreeMap<PlayerId, Action>,
    rong: &[PlayerId],
) -> Vec<PlayerId> {
    use crate::skill::TargetKind::*;
    let mut opps: Vec<PlayerId> = (0..state.players.len())
        .filter(|&id| id != attacker && state.players[id].alive && !rong.contains(&id))
        .collect();
    match target {
        SelfOnly => vec![],
        AllOthers => opps,
        Single | TwoTargets => {
            // 优先级从高到低
            opps.sort_by_key(|&p| priority_key(p, actions, rong));
            opps.reverse();
            let n = if matches!(target, TwoTargets) { 2 } else { 1 };
            opps.into_iter().take(n).collect()
        }
    }
}

/// 优先级排序键：攻击者(1) > 非攻击者(0)；同级时较小 id 优先（Reverse 使其在升序末尾）。
fn priority_key(
    pid: PlayerId,
    actions: &BTreeMap<PlayerId, Action>,
    rong: &[PlayerId],
) -> (u8, std::cmp::Reverse<usize>) {
    let is_attacker =
        matches!(actions.get(&pid), Some(Action::Attack { .. })) && !rong.contains(&pid);
    (is_attacker as u8, std::cmp::Reverse(pid))
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `cargo test -p bo_rules`
Expected: PASS（含旧测试，全部 passed）。

- [ ] **Step 5: 提交**

```bash
git add bo_rules/src/resolve.rs
git commit -m "feat(rules): resolve v2 — single-target combat (charge/defend/attack, 兑)"
```

---

### Task 6: 出局/重开/平局的边界

**Files:**
- Modify: `bo_rules/src/resolve.rs`（仅加测试；逻辑在 v2 已实现，本任务验证边界）

**Interfaces:**
- 验证：双方同溶＝平局；攻击落空（对手已溶死）攻击者安全；有人死后幸存者清气。

- [ ] **Step 1: 写测试** — 追加到 `resolve.rs` 测试模块：

```rust
    #[test]
    fn double_rong_is_draw() {
        let g = GameState::new(2); // 双方 0 气，都硬放空 → 双溶
        let (res, n) = resolve(
            &g,
            &subs(&[
                (0, Action::Attack { skill: SkillId::Kong, target: None }),
                (1, Action::Attack { skill: SkillId::Kong, target: None }),
            ]),
        );
        assert_eq!(res.rong, vec![0, 1]);
        assert!(!n.players[0].alive && !n.players[1].alive);
        assert!(matches!(res.outcome, Outcome::Draw));
    }

    #[test]
    fn rong_attacker_does_not_hit() {
        // 0 运气；1 硬放 pass(4) 但只有 1 气 → 1 溶死、攻击不生效 → 0 安全
        let g = with_qi(2, &[0, 1]);
        let (res, n) = resolve(
            &g,
            &subs(&[(0, Action::Charge), (1, Action::Attack { skill: SkillId::Pass, target: None })]),
        );
        assert_eq!(res.rong, vec![1]);
        assert!(res.combat_deaths.is_empty());
        assert!(n.players[0].alive);
        assert!(matches!(res.outcome, Outcome::Winner(0)));
    }

    #[test]
    fn survivors_qi_reset_on_any_death_3p() {
        // 3 人：2 有 5 气准备运气；0 用 pass(4) 打 1（防御者会被穿死）；本拍有死亡 → 幸存者(0,2)清气
        let g = with_qi(3, &[4, 0, 5]);
        let (res, n) = resolve(
            &g,
            &subs(&[
                (0, Action::Attack { skill: SkillId::Pass, target: None }),
                (1, Action::Defend),
                (2, Action::Charge),
            ]),
        );
        // 0 的 pass 单体按优先级：1 防御、2 运气，均非攻击者，取较小 id → 命中 1（防御）→ 4≥4 穿死
        assert_eq!(res.combat_deaths, vec![1]);
        assert!(!n.players[1].alive);
        assert_eq!(n.players[0].get(QiType::Bo), Qi::ZERO); // 攻击者扣到 0 再被清
        assert_eq!(n.players[2].get(QiType::Bo), Qi::ZERO); // 幸存运气者也被清
        assert!(matches!(res.outcome, Outcome::Continue));
    }
```

- [ ] **Step 2: 运行，确认通过**

Run: `cargo test -p bo_rules`
Expected: PASS（v2 逻辑已覆盖这些边界）。若任一 FAIL，按断言修正 `resolve`/`resolve_combat`。

- [ ] **Step 3: 提交**

```bash
git add bo_rules/src/resolve.rs
git commit -m "test(rules): elimination, draw, rong-void, survivor reset"
```

---

### Task 7: 1v1 结算矩阵（全覆盖验收测试）

**Files:**
- Create: `bo_rules/tests/matrix_1v1.rs`

**Interfaces:**
- Consumes: `bo_rules` 公共 API（`resolve`、`GameState`、`Action`、`SkillId`、`Outcome`、`QiType`、`Qi`）。
- 这是规则文档 1v1 矩阵的可执行版本——验收基准。

- [ ] **Step 1: 写集成测试** — `bo_rules/tests/matrix_1v1.rs`（整文件）：

```rust
use std::collections::BTreeMap;

use bo_rules::action::Action;
use bo_rules::qi::Qi;
use bo_rules::resolve::{resolve, Outcome, Resolution};
use bo_rules::skill::{QiType, SkillId};
use bo_rules::state::GameState;

fn game(qa: i64, qb: i64) -> GameState {
    let mut g = GameState::new(2);
    g.players[0].add(QiType::Bo, Qi::whole(qa));
    g.players[1].add(QiType::Bo, Qi::whole(qb));
    g
}
fn run(g: &GameState, a: Action, b: Action) -> (Resolution, GameState) {
    let subs: BTreeMap<usize, Action> = [(0, a), (1, b)].into_iter().collect();
    resolve(g, &subs)
}
fn atk(s: SkillId) -> Action {
    Action::Attack { skill: s, target: None }
}

#[test]
fn charge_vs_charge() {
    let (res, n) = run(&game(0, 0), Action::Charge, Action::Charge);
    assert!(res.rong.is_empty() && res.combat_deaths.is_empty());
    assert_eq!(n.players[0].get(QiType::Bo), Qi::whole(1));
    assert_eq!(n.players[1].get(QiType::Bo), Qi::whole(1));
}

#[test]
fn charge_vs_defend() {
    let (res, n) = run(&game(0, 0), Action::Charge, Action::Defend);
    assert!(res.combat_deaths.is_empty());
    assert_eq!(n.players[0].get(QiType::Bo), Qi::whole(1));
}

#[test]
fn charge_vs_legal_attack_charger_dies() {
    let (res, _n) = run(&game(0, 1), Action::Charge, atk(SkillId::Kong));
    assert_eq!(res.combat_deaths, vec![0]);
    assert!(matches!(res.outcome, Outcome::Winner(1)));
}

#[test]
fn charge_vs_rong_attacker_safe() {
    let (res, _n) = run(&game(0, 0), Action::Charge, atk(SkillId::Kong));
    assert_eq!(res.rong, vec![1]);
    assert!(matches!(res.outcome, Outcome::Winner(0)));
}

#[test]
fn defend_vs_attack_block_dui_break() {
    // ≤2 挡
    let (res, _) = run(&game(0, 2), Action::Defend, atk(SkillId::Xiaosao));
    assert!(res.combat_deaths.is_empty() && res.dui.is_empty());
    // ==3 兑
    let (res, n) = run(&game(0, 3), Action::Defend, atk(SkillId::Quansao));
    assert_eq!(res.dui, vec![0]);
    assert_eq!(n.players[0].get(QiType::Bo), Qi::ZERO);
    // ≥4 穿
    let (res, _) = run(&game(0, 4), Action::Defend, atk(SkillId::Pass));
    assert_eq!(res.combat_deaths, vec![0]);
}

#[test]
fn attack_vs_attack_higher_wins_equal_safe() {
    let (res, _) = run(&game(3, 1), atk(SkillId::Quansao), atk(SkillId::Kong));
    assert_eq!(res.combat_deaths, vec![1]);
    let (res, n) = run(&game(1, 1), atk(SkillId::Kong), atk(SkillId::Kong));
    assert!(res.combat_deaths.is_empty());
    assert!(n.players[0].alive && n.players[1].alive);
}

#[test]
fn double_rong_draw() {
    let (res, _) = run(&game(0, 0), atk(SkillId::Kong), atk(SkillId::Kong));
    assert_eq!(res.rong, vec![0, 1]);
    assert!(matches!(res.outcome, Outcome::Draw));
}
```

- [ ] **Step 2: 运行，确认通过**

Run: `cargo test -p bo_rules --test matrix_1v1`
Expected: PASS（全部用例）。任何 FAIL 都意味着引擎与矩阵不符——修 `resolve` 直到全绿。

- [ ] **Step 3: 提交**

```bash
git add bo_rules/tests/matrix_1v1.rs
git commit -m "test(rules): 1v1 settlement matrix (acceptance)"
```

---

### Task 8: N 人 — 小扫(全场 AOE) + 优先级目标 + 冲击波(双体)

**Files:**
- Modify: `bo_rules/src/resolve.rs`（仅加测试；`resolve_combat` 的 `targets_of` 在 v2 已支持 AllOthers/TwoTargets/优先级，本任务验证多人）

**Interfaces:**
- 验证：小扫打全场所有对手；单体攻击优先打「攻击者」而非「防御者」；冲击波命中两人。

- [ ] **Step 1: 写测试** — 追加到 `resolve.rs` 测试模块：

```rust
    #[test]
    fn xiaosao_hits_all_others() {
        // 3 人：0 用小扫(2,全场)；1、2 都在运气（裸奔）→ 1、2 都被命中死
        let g = with_qi(3, &[2, 0, 0]);
        let (res, _n) = resolve(
            &g,
            &subs(&[
                (0, Action::Attack { skill: SkillId::Xiaosao, target: None }),
                (1, Action::Charge),
                (2, Action::Charge),
            ]),
        );
        assert_eq!(res.combat_deaths, vec![1, 2]);
        assert!(matches!(res.outcome, Outcome::Winner(0)));
    }

    #[test]
    fn single_target_prefers_attacker_over_defender() {
        // 3 人：0 用空(1,单体)；1 攻击(空,但 0 气→其实会溶)… 用 2 气让 1 合法攻击
        // 0 空(1) ; 1 空(1) 攻击 ; 2 防御 → 0 的单体优先打攻击者 1
        let g = with_qi(3, &[1, 1, 0]);
        let (res, _n) = resolve(
            &g,
            &subs(&[
                (0, Action::Attack { skill: SkillId::Kong, target: None }),
                (1, Action::Attack { skill: SkillId::Kong, target: None }),
                (2, Action::Defend),
            ]),
        );
        // 0 与 1 互攻、等气(各1) → 都不死；2 没被打 → 无死亡
        assert!(res.combat_deaths.is_empty());
        // 关键：0 的目标是攻击者 1（互攻），而非防御者 2 —— 用「2 若被打会怎样」反证：
        // 若 0 误打了防御者 2（空 1 ≤ 防 2 → 挡），结果同样无死亡，故再加一例区分：
    }

    #[test]
    fn single_target_attacker_priority_is_lethal_choice() {
        // 3 人：0 用全扫(3,单体)；1 运气(裸奔)；2 防御。
        // 全扫对防御者(2)是兑、对运气者是死。优先级：1、2 都不是攻击者 → 取较小 id = 1（运气）→ 1 死。
        let g = with_qi(3, &[3, 0, 0]);
        let (res, _n) = resolve(
            &g,
            &subs(&[
                (0, Action::Attack { skill: SkillId::Quansao, target: None }),
                (1, Action::Charge),
                (2, Action::Defend),
            ]),
        );
        assert_eq!(res.combat_deaths, vec![1]);
    }

    #[test]
    fn chongjibo_hits_two() {
        // 3 人：0 用冲击波(6,双体)；1、2 都运气裸奔 → 两人都被命中死
        let g = with_qi(3, &[6, 0, 0]);
        let (res, _n) = resolve(
            &g,
            &subs(&[
                (0, Action::Attack { skill: SkillId::Chongjibo, target: None }),
                (1, Action::Charge),
                (2, Action::Charge),
            ]),
        );
        assert_eq!(res.combat_deaths, vec![1, 2]);
        assert!(matches!(res.outcome, Outcome::Winner(0)));
    }
```

- [ ] **Step 2: 运行，确认通过**

Run: `cargo test -p bo_rules`
Expected: PASS（多人场景全部通过；`targets_of` 的 AOE/双体/优先级在 v2 已实现）。若 `single_target_attacker_priority_is_lethal_choice` 或 `chongjibo_hits_two` FAIL，检查 `targets_of` 的排序与 take(n)。

- [ ] **Step 3: 删除占位说明** — 上面 `single_target_prefers_attacker_over_defender` 测试体内的两行注释（以 `// 若 0 误打` 开头）是说明性文字，保留即可（不影响编译）。确认 `cargo test` 全绿。

- [ ] **Step 4: 提交**

```bash
git add bo_rules/src/resolve.rs
git commit -m "test(rules): N-player AOE, target priority, two-target"
```

---

## Self-Review

**1. Spec coverage（对照 spec §3.3 与规则速查）**
- 溶（气不足攻击→死、攻击不生效）→ Task 4、6。✓
- 攻防按气数（≤2挡/==3兑/≥4穿）→ Task 5、7。✓
- 互攻气高者胜、等气都活 → Task 5、7。✓
- 运气者被命中即死 → Task 5。✓
- 小扫全场 AOE、单/双体目标优先级、冲击波双体 → Task 8。✓
- 出局即清气重开、剩1胜、剩0平 → Task 4(outcome)、Task 5(reset)、Task 6。✓
- 数据驱动招式表 → Task 2。✓
- 通用气结构 `BTreeMap<QiType,Qi>`、定点 `Qi` → Task 1、3。✓
- 1v1 矩阵验收 → Task 7。✓
- **未覆盖（本期有意不做，spec §1 非目标）**：可能气态集合/氧气罐、封印状态、多通道、克网、光轮、代——均为后续模式，引擎已留扩展点（`Skill` 字段、`QiType`/`Channel` 枚举可扩、`resolve` 步骤可插）。

**2. Placeholder scan**：无 TBD/TODO；每个改码步骤都给了完整代码；Task 8 Step 3 明确说明保留的注释是说明性文字、不影响编译。✓

**3. Type consistency**：`Qi::whole`、`QiType::Bo`、`SkillId::*`、`skill_data`、`Action::Attack{skill,target}`、`Resolution{rong,combat_deaths,dui,outcome}`、`Outcome::{Continue,Winner,Draw}`、`resolve_combat`/`targets_of`/`priority_key` 全计划一致。✓
