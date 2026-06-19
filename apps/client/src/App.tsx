import { useState } from 'react';
import { useGame, type Status } from './useGame';
import { Arena } from './Arena';

export function App() {
  const { view, join, submit } = useGame();
  if (view.status === 'menu' || view.status === 'connecting' || view.status === 'error') {
    return <Menu onJoin={join} status={view.status} />;
  }
  return <Arena view={view} submit={submit} />;
}

function Menu({ onJoin, status }: { onJoin: (room: string, name: string) => void; status: Status }) {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const ready = name.trim().length > 0 && room.trim().length > 0;
  return (
    <div className="screen">
      <div className="speedlines" />
      <div>
        <div className="logo">
          <div className="logo__bo">波</div>
          <br />
          <div className="logo__sub">拍 手 对 决</div>
        </div>
        <div className="panel menu pop-in">
          <div className="menu__row">
            <label className="menu__label">你的名号</label>
            <input
              className="field"
              value={name}
              maxLength={12}
              placeholder="例如：小霸王"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="menu__row">
            <label className="menu__label">房间暗号</label>
            <input
              className="field"
              value={room}
              maxLength={16}
              placeholder="跟朋友约定一个口令"
              onChange={(e) => setRoom(e.target.value)}
            />
          </div>
          <button
            className="bigbtn"
            disabled={!ready || status === 'connecting'}
            onClick={() => onJoin(room.trim(), name.trim())}
          >
            {status === 'connecting' ? '连接中…' : status === 'error' ? '重 试' : '进 房 间'}
          </button>
          {status === 'error' && (
            <p className="hint" style={{ color: 'var(--red)' }}>
              连不上服务器，确认服务器在跑（端口 8080）。
            </p>
          )}
          <p className="hint">两个人输入同一个暗号，就能对上开打。</p>
        </div>
      </div>
    </div>
  );
}
