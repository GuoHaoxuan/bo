import type { Action, PlayerId, Resolution } from '@bo/rules';

export type Phase = 'lobby' | 'playing' | 'gameOver';

export type GameMode = 'bojue';

/** 房间设置（房主可在大厅调整）。 */
export interface RoomConfig {
  mode: GameMode;
  beatMs: number; // 每拍毫秒
  allowSpecials: boolean; // 开放超模特招（点波/推波/削波），默认 false
}

/** 公开玩家视图（每拍揭示后所有人可见；隐藏的只有「未揭示的当拍暗选」）。 */
export interface PublicPlayer {
  name: string;
  alive: boolean;
  qi: number; // 波决：bo 气（毫气）。后续多通道再扩成 Record<QiType, number>
}

export interface PublicState {
  phase: Phase;
  beat: number;
  players: PublicPlayer[];
  winner: PlayerId | null; // gameOver 时；null 表示平局
  config: RoomConfig;
  host: PlayerId; // 房主座位
}

/** 客户端 → 服务器 */
export type ClientMessage =
  | { type: 'joinRoom'; room: string; name: string }
  | { type: 'submitAction'; beat: number; action: Action }
  | { type: 'addBot' } // 请求给本房间加一个 AI 对手
  | { type: 'setConfig'; config: RoomConfig } // 房主改设置
  | { type: 'startGame' }; // 房主开始对战

/** 服务器 → 客户端 */
export type ServerMessage =
  | { type: 'roomState'; you: PlayerId; state: PublicState }
  | { type: 'beatStart'; beat: number; deadlineMs: number }
  | {
      type: 'resolution';
      beat: number;
      resolution: Resolution;
      actions: Array<{ id: PlayerId; action: Action }>; // 本拍各玩家的明牌动作（揭示用）
      state: PublicState;
    }
  | { type: 'gameOver'; winner: PlayerId | null; state: PublicState };
