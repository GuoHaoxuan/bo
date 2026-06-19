import { WebSocketServer, WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import type { ClientMessage, ServerMessage } from '@bo/protocol';
import type { PlayerId } from '@bo/rules';
import { Match } from './match';
import { botAction } from './bot';

interface Conn {
  ws: WebSocket;
  room?: string;
  id?: PlayerId;
}

interface Room {
  match: Match;
  conns: Map<PlayerId, WebSocket>;
  bots: Set<PlayerId>;
  timer: ReturnType<typeof setInterval> | null;
}

const BEAT_MS_DEFAULT = 1800;

/** WebSocket 传输层：管连接、房间、节拍定时器，把消息路由进 Match、把结果广播出去。 */
export class GameServer {
  private wss: WebSocketServer | null = null;
  private readonly rooms = new Map<string, Room>();
  private readonly beatMs: number;

  constructor(opts: { beatMs?: number } = {}) {
    this.beatMs = opts.beatMs ?? BEAT_MS_DEFAULT;
  }

  listen(port: number): Promise<number> {
    return new Promise((resolve) => {
      const wss = new WebSocketServer({ port }, () => {
        const addr = wss.address() as AddressInfo;
        resolve(addr.port);
      });
      wss.on('connection', (ws) => this.onConnection(ws));
      this.wss = wss;
    });
  }

  close(): Promise<void> {
    for (const r of this.rooms.values()) if (r.timer) clearTimeout(r.timer);
    this.rooms.clear();
    const wss = this.wss;
    return new Promise((resolve) => (wss ? wss.close(() => resolve()) : resolve()));
  }

  private onConnection(ws: WebSocket): void {
    const conn: Conn = { ws };
    ws.on('message', (data: WebSocket.RawData) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        return;
      }
      this.handle(conn, msg);
    });
    ws.on('close', () => this.onClose(conn));
  }

  private handle(conn: Conn, msg: ClientMessage): void {
    if (msg.type === 'joinRoom') {
      const room = this.getOrCreateRoom(msg.room);
      if (room.match.currentPhase !== 'lobby') return; // 已开局，忽略后来者
      const id = room.match.addPlayer(msg.name);
      conn.room = msg.room;
      conn.id = id;
      room.conns.set(id, conn.ws);
      this.sendRoomStateToAll(room);
    } else if (msg.type === 'submitAction') {
      if (conn.room === undefined || conn.id === undefined) return;
      const room = this.rooms.get(conn.room);
      if (!room) return;
      room.match.submit(conn.id, msg.beat, msg.action);
    } else if (msg.type === 'addBot') {
      if (conn.room === undefined) return;
      const room = this.rooms.get(conn.room);
      if (!room || room.match.currentPhase !== 'lobby') return;
      const id = room.match.addPlayer('🤖 电脑');
      room.bots.add(id);
      this.sendRoomStateToAll(room);
    } else if (msg.type === 'setConfig') {
      const room = conn.room !== undefined ? this.rooms.get(conn.room) : undefined;
      if (!room || conn.id !== room.match.host) return; // 仅房主
      room.match.setConfig(msg.config);
      this.sendRoomStateToAll(room);
    } else if (msg.type === 'startGame') {
      const room = conn.room !== undefined ? this.rooms.get(conn.room) : undefined;
      if (!room || conn.id !== room.match.host) return; // 仅房主
      if (room.match.currentPhase !== 'lobby' || room.match.playerCount < 2) return;
      this.startRoom(conn.room!, room);
    }
  }

  private startRoom(_code: string, room: Room): void {
    room.match.start();
    this.sendRoomStateToAll(room);
    this.beginBeat(room);
  }

  /** 开一拍：广播 beatStart（+ Bot 出招），等 beatMs 后结算。 */
  private beginBeat(room: Room): void {
    this.announceBeat(room);
    room.timer = setTimeout(() => this.endBeat(room), room.match.config.beatMs);
  }

  /** 结算一拍 → 广播揭示，停顿 revealMs 让玩家看清，再开下一拍 / 公布结果。 */
  private endBeat(room: Room): void {
    const beat = room.match.currentBeat;
    const resolution = room.match.tick();
    if (!resolution) return;
    const state = room.match.publicState();
    this.broadcast(room, { type: 'resolution', beat, resolution, actions: [...room.match.lastActions], state });
    if (room.match.currentPhase === 'gameOver') {
      this.broadcast(room, { type: 'gameOver', winner: state.winner, state });
      room.timer = null;
    } else {
      this.beginBeat(room); // 立即开下一拍，连续不卡
    }
  }

  private announceBeat(room: Room): void {
    this.broadcast(room, {
      type: 'beatStart',
      beat: room.match.currentBeat,
      deadlineMs: Date.now() + room.match.config.beatMs,
    });
    this.submitBots(room);
  }

  /** 每拍开始时，让房里的 Bot 各自出招（只用公开信息）。 */
  private submitBots(room: Room): void {
    if (room.bots.size === 0) return;
    const state = room.match.publicState();
    const beat = room.match.currentBeat;
    for (const id of room.bots) {
      if (state.players[id]?.alive) room.match.submit(id, beat, botAction(state, id));
    }
  }

  private onClose(conn: Conn): void {
    if (conn.room === undefined || conn.id === undefined) return;
    const room = this.rooms.get(conn.room);
    if (!room) return;
    room.conns.delete(conn.id);
    if (room.conns.size === 0) {
      // 没真人了（含只剩 Bot）→ 清理房间
      if (room.timer) clearTimeout(room.timer);
      this.rooms.delete(conn.room);
    }
  }

  private getOrCreateRoom(code: string): Room {
    let room = this.rooms.get(code);
    if (!room) {
      room = { match: new Match(), conns: new Map(), timer: null, bots: new Set() };
      room.match.setConfig({ mode: 'bojue', beatMs: this.beatMs, bannedSkills: [] });
      this.rooms.set(code, room);
    }
    return room;
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  private broadcast(room: Room, msg: ServerMessage): void {
    for (const ws of room.conns.values()) this.send(ws, msg);
  }

  private sendRoomStateToAll(room: Room): void {
    for (const [id, ws] of room.conns) {
      this.send(ws, { type: 'roomState', you: id, state: room.match.publicState() });
    }
  }
}
