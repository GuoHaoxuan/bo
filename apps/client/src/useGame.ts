import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, PublicState, RoomConfig, ServerMessage } from '@bo/protocol';
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
  room: string;
  you: number;
  state: PublicState | null;
  beat: number;
  deadlineMs: number;
  beatDurationMs: number;
  submittedThisBeat: boolean;
  history: Reveal[];
  winner: number | null;
}

const MAX_HISTORY = 8;
const WS_URL = `ws://${location.hostname}:8080`;
const INITIAL: GameView = {
  status: 'menu',
  room: '',
  you: -1,
  state: null,
  beat: 0,
  deadlineMs: 0,
  beatDurationMs: 0,
  submittedThisBeat: false,
  history: [],
  winner: null,
};

export interface GameApi {
  view: GameView;
  join: (room: string, name: string) => void;
  addBot: () => void;
  submit: (a: Action) => void;
  setConfig: (config: RoomConfig) => void;
  startGame: () => void;
}

export function useGame(): GameApi {
  const wsRef = useRef<WebSocket | null>(null);
  const [view, setView] = useState<GameView>(INITIAL);

  const connect = useCallback((room: string, messages: ClientMessage[]) => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setView((v) => ({ ...v, status: 'connecting', room }));
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

  const join = useCallback((room: string, name: string) => connect(room, [{ type: 'joinRoom', room, name }]), [connect]);

  const addBot = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'addBot' } satisfies ClientMessage));
  }, []);

  const submit = useCallback((action: Action) => {
    const ws = wsRef.current;
    setView((v) => {
      if (v.status !== 'playing' || !ws || v.submittedThisBeat) return v;
      ws.send(JSON.stringify({ type: 'submitAction', beat: v.beat, action } satisfies ClientMessage));
      return { ...v, submittedThisBeat: true };
    });
  }, []);

  const setConfig = useCallback((config: RoomConfig) => {
    wsRef.current?.send(JSON.stringify({ type: 'setConfig', config } satisfies ClientMessage));
  }, []);

  const startGame = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'startGame' } satisfies ClientMessage));
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);
  return { view, join, addBot, submit, setConfig, startGame };
}

function reduce(v: GameView, msg: ServerMessage): GameView {
  if (msg.type === 'roomState') {
    const status: Status = msg.state.phase === 'playing' ? 'playing' : msg.state.phase === 'gameOver' ? 'gameOver' : 'lobby';
    return { ...v, you: msg.you, state: msg.state, status };
  }
  if (msg.type === 'beatStart') {
    return {
      ...v,
      status: 'playing',
      beat: msg.beat,
      deadlineMs: msg.deadlineMs,
      beatDurationMs: Math.max(1, msg.deadlineMs - Date.now()),
      submittedThisBeat: false,
    };
  }
  if (msg.type === 'resolution') {
    const entry: Reveal = { beat: msg.beat, actions: msg.actions, resolution: msg.resolution };
    return { ...v, state: msg.state, history: [...v.history, entry].slice(-MAX_HISTORY) };
  }
  if (msg.type === 'gameOver') {
    return { ...v, status: 'gameOver', state: msg.state, winner: msg.winner };
  }
  return v;
}
