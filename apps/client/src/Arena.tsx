import { useEffect, useState } from 'react';
import type { Action } from '@bo/rules';
import type { GameView, Reveal } from './useGame';
import { MOVES, actionLabel, actionAccent } from './skills';

const BEAT_FALLBACK = 1800;

export function Arena({ view, submit }: { view: GameView; submit: (a: Action) => void }) {
  const players = view.state?.players ?? [];
  const yourQi = players[view.you]?.qi ?? 0;
  const isOver = view.status === 'gameOver';
  const allowSpecials = view.state?.config.allowSpecials ?? false;

  const hist = view.history;
  const latest = hist.length > 0 ? hist[hist.length - 1] : undefined;
  const older = hist.slice(0, -1);

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

  const moveOf = (rev: Reveal, pid: number): Action | undefined => rev.actions.find((x) => x.id === pid)?.action;

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

      <div className="main">
        {/* 顶部小历史条（较早的几拍） */}
        <div className="ministrip">
          {order.map((pid) => (
            <div key={pid} className="mrow">
              {older.map((rev) => {
                const a = moveOf(rev, pid);
                return (
                  <div key={rev.beat} className={`mcell ${a ? 'mcell--' + actionAccent(a) : 'mcell--empty'}`}>
                    {a ? actionLabel(a) : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* 中央大舞台：最新一拍 */}
        <div className="stage">
          {order.map((pid) => {
            const p = players[pid];
            const a = latest ? moveOf(latest, pid) : undefined;
            return (
              <div key={pid} className={`bigcard${pid === view.you ? ' bigcard--you' : ''}${p && p.alive ? '' : ' bigcard--dead'}`}>
                <div className="bigcard__id">
                  {p?.name}
                  {pid === view.you ? ' (你)' : ''} · {p && p.alive ? renderQi(p.qi) : '💀'}
                </div>
                <div
                  key={latest?.beat ?? -1}
                  className="bigcard__move pop-in"
                  style={{ color: a ? (a.kind === 'attack' ? 'var(--red)' : 'var(--cyan)') : 'rgba(22,19,15,.35)' }}
                >
                  {a ? actionLabel(a) : '…'}
                </div>
              </div>
            );
          })}
          {latest && (
            <div key={latest.beat} className="stage__outcome pop-in">
              {outcomeText(latest, players)}
            </div>
          )}
        </div>
      </div>

      {!isOver && (
        <div className="actionwrap">
          <div className="actions">
            {MOVES.filter((m) => !m.special || allowSpecials).map((m) => {
              const afford = m.kind !== 'attack' || yourQi >= m.costMilli;
              const disabled = view.submittedThisBeat || !afford;
              return (
                <button key={m.key} className={`chip chip--${m.accent}`} disabled={disabled} onClick={() => submit(m.action)}>
                  {m.label}
                  {m.kind === 'attack' ? <small className="chip__cost">{m.costMilli / 1000}气</small> : null}
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

function outcomeText(reveal: Reveal, players: ReadonlyArray<{ name: string }>): string {
  const name = (id: number): string => players[id]?.name ?? `P${id}`;
  const out: string[] = [];
  for (const id of reveal.resolution.rong) out.push(`${name(id)} 溶了（出招失败）`);
  for (const id of reveal.resolution.combatDeaths) out.push(`${name(id)} 被打死!`);
  for (const id of reveal.resolution.dui) out.push(`${name(id)} 被兑（清空气）`);
  return out.length ? out.join('，') : '都安全，继续！';
}

function renderQi(milli: number): string {
  const whole = Math.round(milli / 1000);
  if (whole <= 0) return '·';
  if (whole > 8) return '⚡'.repeat(8) + '+';
  return '⚡'.repeat(whole);
}
