import { type ReactNode } from 'react';
import type { RoomConfig } from '@bo/protocol';
import type { GameApi } from './useGame';

const BEAT_PRESETS = [
  { ms: 1200, label: '飞快' },
  { ms: 1500, label: '快' },
  { ms: 1800, label: '适中' },
  { ms: 2400, label: '慢' },
  { ms: 3000, label: '很慢' },
];

export function Lobby({ game }: { game: GameApi }) {
  const { view, setConfig, startGame, addBot } = game;
  const state = view.state;
  if (!state) return null;
  const cfg = state.config;
  const isHost = view.you === state.host;
  const canStart = state.players.length >= 2;

  const update = (patch: Partial<RoomConfig>): void => setConfig({ ...cfg, ...patch });

  return (
    <div className="screen">
      <div className="speedlines" />
      <div className="panel lobby pop-in">
        <div className="lobby__title pow">
          房间 <span className="lobby__code">{view.room}</span>
        </div>

        <div className="lobby__players">
          {state.players.map((p, i) => (
            <span key={i} className={`pchip${i === view.you ? ' pchip--you' : ''}`}>
              {i === state.host ? '👑 ' : ''}
              {p.name}
              {i === view.you ? ' (你)' : ''}
            </span>
          ))}
          {isHost && state.players.length < 6 && (
            <button className="pchip pchip--add" onClick={addBot}>
              ＋ 🤖 加入电脑
            </button>
          )}
        </div>

        <Setting label="每拍节奏">
          {BEAT_PRESETS.map((b) => (
            <button
              key={b.ms}
              disabled={!isHost}
              className={`chip${cfg.beatMs === b.ms ? ' chip--cyan chip--selected' : ''}`}
              onClick={() => update({ beatMs: b.ms })}
            >
              {b.label}
              <small className="chip__cost">{(b.ms / 1000).toFixed(1)}s</small>
            </button>
          ))}
        </Setting>

        <Setting label="超模特招">
          <button
            disabled={!isHost}
            className={`chip${cfg.allowSpecials ? ' chip--red chip--selected' : ''}`}
            onClick={() => update({ allowSpecials: !cfg.allowSpecials })}
          >
            {cfg.allowSpecials ? '已开放 ✓' : '关闭'}
          </button>
          <span style={{ fontSize: 12, opacity: 0.6, alignSelf: 'center' }}>
            点波 0.1气 · 推波克空 · 削波克小扫
          </span>
        </Setting>

        <Setting label="模式">
          <span className="chip chip--cyan chip--selected">波决</span>
        </Setting>

        {isHost ? (
          <button className="bigbtn" disabled={!canStart} onClick={startGame}>
            {canStart ? '开 始 对 战' : '加个电脑或等朋友…'}
          </button>
        ) : (
          <p className="hint">等房主开始…</p>
        )}
        {isHost && (
          <p className="hint">
            想单练就点「加入电脑」；想跟朋友玩，把暗号「{view.room}」发给他们进同一个房间。
          </p>
        )}
      </div>
    </div>
  );
}

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting__label">{label}</div>
      <div className="setting__opts">{children}</div>
    </div>
  );
}
