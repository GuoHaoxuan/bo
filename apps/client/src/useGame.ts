import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, PublicState, ServerMessage } from '@bo/protocol';
import type { Action, Resolution } from '@bo/rules';
import { beatTick } from './audio';

export interface Reveal {
  beat: number;
  actions: Array<{ id: number; action: Action }>;
  resolution: Resolution;
}

export type Status = 'menu' | 'connecting' | 'lobby' | 'playing' | 'gameOver' | 'error';

export interface GameView {
  status: Status;
  you: number;
  state: PublicState | null;
  beat: number;
  deadlineMs: number;
  submittedThisBeat: boolean;
  reveal: Reveal | null;
  winner: number | null;
}

const WS_URL = `ws://${location.hostname}:8080`;
const INITIAL: GameView = {
  status: 'menu',
  you: -1,
  state: null,
  beat: 0,
  deadlineMs: 0,
  submittedThisBeat: false,
  reveal: null,
  winner: null,
};

export function useGame(): {
  view: GameView;
  join: (room: string, name: string) => void;
  playVsAi: (name: string) => void;
  submit: (a: Action) => void;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const [view, setView] = useState<GameView>(INITIAL);

  const connect = useCallback((messages: ClientMessage[]) => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setView((v) => ({ ...v, status: 'connecting' }));
    ws.onopen = () => {
      for (const m of messages) ws.send(JSON.stringify(m));
    };
    ws.onerror = () => setView((v) => ({ ...v, status: 'error' }));
    ws.onclose = () => setView((v) => (v.status === 'gameOver' ? v : { ...v, status: 'error' }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.type === 'beatStart') beatTick(msg.beat === 0);
      setView((v) => reduce(v, msg));
    };
  }, []);

  const join = useCallback((room: string, name: string) => connect([{ type: 'joinRoom', room, name }]), [connect]);

  const playVsAi = useCallback(
    (name: string) => {
      const room = 'solo-' + Math.random().toString(36).slice(2, 8);
      connect([{ type: 'joinRoom', room, name: name || '你' }, { type: 'addBot' }]);
    },
    [connect],
  );

  const submit = useCallback((action: Action) => {
    const ws = wsRef.current;
    setView((v) => {
      if (v.status !== 'playing' || !ws || v.submittedThisBeat) return v;
      ws.send(JSON.stringify({ type: 'submitAction', beat: v.beat, action } satisfies ClientMessage));
      return { ...v, submittedThisBeat: true };
    });
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);
  return { view, join, playVsAi, submit };
}

function reduce(v: GameView, msg: ServerMessage): GameView {
  if (msg.type === 'roomState') {
    const status: Status = msg.state.phase === 'playing' ? 'playing' : msg.state.phase === 'gameOver' ? 'gameOver' : 'lobby';
    return { ...v, you: msg.you, state: msg.state, status };
  }
  if (msg.type === 'beatStart') {
    return { ...v, status: 'playing', beat: msg.beat, deadlineMs: msg.deadlineMs, submittedThisBeat: false };
  }
  if (msg.type === 'resolution') {
    return { ...v, state: msg.state, reveal: { beat: msg.beat, actions: msg.actions, resolution: msg.resolution } };
  }
  if (msg.type === 'gameOver') {
    return { ...v, status: 'gameOver', state: msg.state, winner: msg.winner };
  }
  return v;
}
