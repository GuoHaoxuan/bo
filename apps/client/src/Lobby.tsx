import { type ReactNode } from 'react';
import type { RoomConfig } from '@bo/protocol';
import type { SkillId } from '@bo/rules';
import type { GameApi } from './useGame';
import { MOVES } from './skills';

const BEAT_PRESETS = [
  { ms: 1200, label: '飞快' },
  { ms: 1500, label: '快' },
  { ms: 1800, label: '适中' },
  { ms: 2400, label: '慢' },
  { ms: 3000, label: '很慢' },
];

const BANNABLE = MOVES.filter((m) => m.kind === 'attack'); // 空/小扫/全扫/pass/冲击波

export function Lobby({ game }: { game: GameApi }) {
  const { view, setConfig, startGame } = game;
  const state = view.state;
  if (!state) return null;
  const cfg = state.config;
  const isHost = view.you === state.host;
  const canStart = state.players.length >= 2;
  const isSolo = view.room.startsWith('solo-');

  const update = (patch: Partial<RoomConfig>): void => setConfig({ ...cfg, ...patch });
  const toggleBan = (skill: SkillId): void => {
    const has = cfg.bannedSkills.includes(skill);
    update({ bannedSkills: has ? cfg.bannedSkills.filter((s) => s !== skill) : [...cfg.bannedSkills, skill] });
  };

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

        <Setting label="禁招">
          {BANNABLE.map((m) => {
            if (m.action.kind !== 'attack') return null;
            const skill = m.action.skill;
            const banned = cfg.bannedSkills.includes(skill);
            return (
              <button
                key={m.key}
                disabled={!isHost}
                className={`chip${banned ? ' chip--red chip--selected' : ''}`}
                onClick={() => toggleBan(skill)}
              >
                {m.label}
                {banned ? ' 🚫' : ''}
              </button>
            );
          })}
        </Setting>

        <Setting label="模式">
          <span className="chip chip--cyan chip--selected">波决</span>
        </Setting>

        {isHost ? (
          <button className="bigbtn" disabled={!canStart} onClick={startGame}>
            {canStart ? '开 始 对 战' : '等人进来…'}
          </button>
        ) : (
          <p className="hint">等房主开始…</p>
        )}
        {isHost && !isSolo && (
          <p className="hint">
            把房间暗号「{view.room}」发给朋友，他们进同一个房间就能一起玩。
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
