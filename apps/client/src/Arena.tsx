import { useEffect, useState } from 'react';
import type { Action } from '@bo/rules';
import type { GameView } from './useGame';
import { MOVES, actionLabel, actionAccent } from './skills';

const BEAT_FALLBACK = 3000;

export function Arena({ view, submit }: { view: GameView; submit: (a: Action) => void }) {
  const players = view.state?.players ?? [];
  const yourQi = players[view.you]?.qi ?? 0;
  const isOver = view.status === 'gameOver';

  // 节拍倒计时条
  const total = view.beatDurationMs || BEAT_FALLBACK;
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    if (view.status !== 'playing') {
      setRatio(1);
      return undefined;
    }
    let raf = 0;
    const tick = () => {
      setRatio(Math.max(0, Math.min(1, (view.deadlineMs - Date.now()) / total)));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [view.status, view.deadlineMs, total]);

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

  const result = !isOver
    ? null
    : view.winner === null
      ? { t: '平 局', c: 'var(--ink)' }
      : view.winner === view.you
        ? { t: '你 赢 了!', c: 'var(--red)' }
        : { t: '你 输 了', c: 'var(--ink)' };

  // 行序：对手在上、你在下
  const order: number[] = [];
  for (let i = 0; i < players.length; i++) if (i !== view.you) order.push(i);
  if (view.you >= 0 && view.you < players.length) order.push(view.you);

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

      <div className="duel">
        {order.map((pid) => {
          const p = players[pid];
          return (
            <div key={pid} className={`prow${pid === view.you ? ' prow--you' : ''}${p && p.alive ? '' : ' prow--dead'}`}>
              <div className="prow__id">
                <div className="prow__name">
                  {p?.name}
                  {pid === view.you ? ' (你)' : ''}
                </div>
                <div className="prow__qi">{p && p.alive ? renderQi(p.qi) : '💀'}</div>
              </div>
              <div className="prow__hist">
                {view.history.map((rev) => {
                  const a = rev.actions.find((x) => x.id === pid)?.action;
                  return (
                    <div key={rev.beat} className={`hcell ${a ? 'hcell--' + actionAccent(a) : 'hcell--empty'}`}>
                      {a ? actionLabel(a) : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!isOver && (
        <div className="actionwrap">
          <div className="actions">
            {MOVES.map((m) => {
              const afford = m.kind !== 'attack' || yourQi >= m.costWhole * 1000;
              const disabled = view.submittedThisBeat || !afford;
              return (
                <button key={m.key} className={`chip chip--${m.accent}`} disabled={disabled} onClick={() => submit(m.action)}>
                  {m.label}
                  {m.kind === 'attack' ? <small className="chip__cost">{m.costWhole}气</small> : null}
                </button>
              );
            })}
          </div>
          <p className="hint">{view.submittedThisBeat ? '已出招，等这一拍结算…' : '跟着节拍拍下你的招！'}</p>
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
