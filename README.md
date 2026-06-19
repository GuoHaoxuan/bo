# 波 · 拍手对决

童年拍手游戏「波」的线上复刻 —— 节拍驱动、**同时亮招**的回合制对战。漫画风、可联机、带 AI。

## 玩法

每一拍双方同时暗选一招，到点一起亮：

- **波**（运气）：攒 1 气。
- **防**：挡攻击。
- **攻击**：花气出招。

结算顺序：**先判溶**（气不足硬出招 → 自爆）→ **再判克**（克招让被克招作废、无视气耗）→ **后互攻**（气高者胜，防挡小攻击、等气兑、被大攻击穿，裸着运气被命中即死）。

本质是石头剪刀布：运气 ↘ 被攻击克 ↘ 被防挡 ↘ 运气抢节奏，没有单一最优解。

招式：空(1) / 小扫(2) / 全扫(3) / pass(4) / 冲击波(6)。超模特招（房主可在大厅开放）：点波(0.1) 便宜单体、推波(0.5) **克空**、削波(0.5) **克小扫**。

## 房间 & AI

- 进房间（暗号留空就自己开一桌），大厅里调每拍节奏、开超模招、加 / 删电脑，房主点开始。
- 跟朋友玩：输入同一个暗号进同一个房间。
- **AI 不是随机**：用真实规则引擎算出每个〔我招 × 你招〕的收益矩阵，再解这局零和矩阵的**极小化极大混合策略**（虚拟博弈逼近纳什均衡）按概率出招 —— 强，且无法被摸清套路针对。

## 跑起来

需要 Node 20+ 和 [pnpm](https://pnpm.io/)。

```bash
pnpm install
pnpm dev
```

然后打开 <http://localhost:5173>（`pnpm dev` 会同时起客户端 `:5173` 和 WebSocket 服务器 `:8080`）。

跑测试：

```bash
pnpm -r test
```

## 结构

TypeScript pnpm monorepo：

| 包 | 职责 |
|----|------|
| `packages/rules` | 纯函数规则引擎：确定性 `resolve(state, submissions)`，定点「毫气」无浮点，全测试覆盖 |
| `packages/protocol` | 客户端 / 服务器共享的消息与公开状态类型 |
| `apps/server` | `ws` WebSocket，权威节拍循环，服务端 AI |
| `apps/client` | React + Vite，漫画风 UI |

完整规则见 [`docs/bo-rules-reference.md`](docs/bo-rules-reference.md)（语言无关，含各模式 / 招式 / 引擎要求）。

## 许可证

[MIT](LICENSE) © 2026 GuoHaoxuan

字体 [Bangers](https://fonts.google.com/specimen/Bangers) 与 [ZCOOL KuaiLe](https://fonts.google.com/specimen/ZCOOL+KuaiLe) 经 Google Fonts 引用（SIL OFL），未随仓库分发。
