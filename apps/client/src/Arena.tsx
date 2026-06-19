import { useEffect, useState } from 'react';
import type { Action } from '@bo/rules';
import type { GameView } from './useGame';
import { MOVES, actionLabel, actionDesc } from './skills';

export function Arena({ view, submit }: { view: GameView; submit: (a: Action) => void }) {
  const players = view.state?.players ?? [];
  const yourQi = players[view.you]?.qi ?? 0;
  const reveal = view.reveal;
  const isOver = view.status === 'gameOver';
  const revealing = reveal !== null && view.status === 'playing';

  // 节拍倒计时条（只在输入窗口走；翻牌时清零）
  const total = view.beatDurationMs || 3000;
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    if (view.status !== 'playing' || revealing) {
      setRatio(revealing ? 0 : 1);
      return undefined;
    }
    let raf = 0;
    const tick = () => {
      const left = view.deadlineMs - Date.now();
      setRatio(Math.max(0, Math.min(1, left / total)));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [view.status, view.deadlineMs, revealing, total]);

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
              const disabled = view.submittedThisBeat || revealing || !afford;
              return (
                <button key={m.key} className={`chip chip--${m.accent}`} disabled={disabled} onClick={() => submit(m.action)}>
                  {m.label}
                  {m.kind === 'attack' ? <small className="chip__cost">{m.costWhole}气</small> : null}
                </button>
              );
            })}
          </div>
          <p className="hint">
            {revealing ? '翻牌中…' : view.submittedThisBeat ? '已出招，等翻牌…' : '趁节拍拍下你的招！'}
          </p>
        </div>
      )}

      {revealing && reveal && (
        <div className="slam">
          <div className="slam__head pow">翻 牌!</div>
          <div className="slam__panels">
            {reveal.actions.map(({ id, action }) => (
              <div key={id} className="slam__cell pop-in">
                <div className="slam__who">{players[id]?.name ?? `P${id}`}</div>
                <div
                  className="slam__move"
                  style={{ color: action.kind === 'attack' ? 'var(--red)' : 'var(--cyan)' }}
                >
                  {actionLabel(action)}
                </div>
                <div className="slam__desc">{actionDesc(action)}</div>
              </div>
            ))}
          </div>
          <div className="slam__outcome pop-in">{outcomeText(reveal, players)}</div>
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

function outcomeText(reveal: NonNullable<GameView['reveal']>, players: ReadonlyArray<{ name: string }>): string {
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
