import { useEffect, useRef, useState } from 'react';
import type { Action } from '@bo/rules';
import type { GameView, Reveal } from './useGame';
import { MOVES, actionLabel, actionPow } from './skills';

const BEAT_TOTAL_MS = 3000;

export function Arena({ view, submit }: { view: GameView; submit: (a: Action) => void }) {
  const players = view.state?.players ?? [];
  const yourQi = players[view.you]?.qi ?? 0;

  // 节拍倒计时条
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    if (view.status !== 'playing') {
      setRatio(1);
      return;
    }
    let raf = 0;
    const tick = () => {
      const left = view.deadlineMs - Date.now();
      setRatio(Math.max(0, Math.min(1, left / BEAT_TOTAL_MS)));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [view.status, view.deadlineMs]);

  // 揭示 SLAM（每拍结算后闪现 ~0.85s）
  const [slam, setSlam] = useState<Reveal | null>(null);
  const lastBeat = useRef(-1);
  useEffect(() => {
    const r = view.reveal;
    if (r && r.beat !== lastBeat.current) {
      lastBeat.current = r.beat;
      setSlam(r);
      const t = setTimeout(() => setSlam(null), 850);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [view.reveal]);

  if (view.status === 'lobby') {
    return (
      <div className="screen">
        <div className="speedlines" />
        <div className="panel pop-in" style={{ padding: 28, textAlign: 'center', maxWidth: 420 }}>
          <div className="pow" style={{ fontSize: 40, color: 'var(--cyan)' }}>等 对 手…</div>
          <p style={{ marginTop: 14 }}>已进房，另一个人输入同一个暗号就开打。</p>
          <p className="hint" style={{ marginTop: 8 }}>当前 {players.length} 人</p>
        </div>
      </div>
    );
  }

  const isOver = view.status === 'gameOver';
  const result = !isOver
    ? null
    : view.winner === null
      ? { t: '平 局', c: 'var(--ink)' }
      : view.winner === view.you
        ? { t: '你 赢 了!', c: 'var(--red)' }
        : { t: '你 输 了', c: 'var(--ink)' };

  return (
    <div className="arena">
      <div className="speedlines" />

      <div className="beatbar">
        <span className="pow" style={{ fontSize: 22 }}>第 {view.beat} 拍</span>
        <div className="meter">
          <div
            className="meter__fill"
            style={{ width: `${ratio * 100}%`, background: ratio < 0.34 ? 'var(--red)' : 'var(--cyan)' }}
          />
        </div>
      </div>

      <div className="fighters">
        {players.map((p, i) => (
          <div
            key={i}
            className={`fighter${i === view.you ? ' fighter--you' : ''}${p.alive ? '' : ' fighter--dead'}`}
          >
            <div className="fighter__name">
              {p.name}
              {i === view.you ? ' (你)' : ''}
            </div>
            <div className="fighter__qi">{p.alive ? renderQi(p.qi) : '💀'}</div>
          </div>
        ))}
      </div>

      {!isOver && (
        <div className="actionwrap">
          <div className="actions">
            {MOVES.map((m) => {
              const afford = m.kind !== 'attack' || yourQi >= m.costWhole * 1000;
              const disabled = view.submittedThisBeat || slam !== null || !afford;
              return (
                <button key={m.key} className={`chip chip--${m.accent}`} disabled={disabled} onClick={() => submit(m.action)}>
                  {m.label}
                  {m.kind === 'attack' ? <small className="chip__cost">{m.costWhole}气</small> : null}
                </button>
              );
            })}
          </div>
          <p className="hint">{view.submittedThisBeat ? '已出招，等翻牌…' : '趁节拍拍下你的招！'}</p>
        </div>
      )}

      {slam && (
        <div className="slam">
          <div className="slam__panels">
            {slam.actions.map(({ id, action }) => (
              <div key={id} className="slam__cell pop-in">
                <div className="slam__who">{players[id]?.name ?? `P${id}`}</div>
                <div
                  className="pow slam__pow"
                  style={{ color: action.kind === 'attack' ? 'var(--red)' : 'var(--cyan)' }}
                >
                  {actionPow(action)}
                </div>
                <div className="slam__lbl">{actionLabel(action)}</div>
              </div>
            ))}
          </div>
          {slam.resolution.combatDeaths.length + slam.resolution.rong.length > 0 && (
            <div className="slam__ko pow pop-in">K.O.</div>
          )}
        </div>
      )}

      {isOver && result && (
        <div className="screen overlay">
          <div className="panel pop-in" style={{ padding: 36, textAlign: 'center' }}>
            <div className="pow" style={{ fontSize: 64, color: result.c }}>{result.t}</div>
            <button className="bigbtn" style={{ marginTop: 20 }} onClick={() => location.reload()}>
              再 来 一 局
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderQi(milli: number): string {
  const whole = Math.round(milli / 1000);
  if (whole <= 0) return '·';
  if (whole > 8) return '⚡'.repeat(8) + '+';
  return '⚡'.repeat(whole);
}
