import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@bo/protocol';
import { GameServer } from './server';

/** 测试用客户端：缓冲收到的消息，`waitFor` 按类型消费最早的一条。 */
class Client {
  private buf: ServerMessage[] = [];
  private waiters: Array<{ type: ServerMessage['type']; resolve: (m: ServerMessage) => void }> = [];

  constructor(private readonly ws: WebSocket) {
    ws.on('message', (d: WebSocket.RawData) => {
      this.buf.push(JSON.parse(d.toString()) as ServerMessage);
      this.drain();
    });
  }

  private drain(): void {
    for (const w of [...this.waiters]) {
      const i = this.buf.findIndex((m) => m.type === w.type);
      if (i >= 0) {
        const [m] = this.buf.splice(i, 1);
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve(m!);
      }
    }
  }

  send(m: ClientMessage): void {
    this.ws.send(JSON.stringify(m));
  }

  waitFor(type: ServerMessage['type']): Promise<ServerMessage> {
    return new Promise((resolve) => {
      this.waiters.push({ type, resolve });
      this.drain();
    });
  }

  close(): void {
    this.ws.close();
  }
}

function connect(port: number): Promise<Client> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(new Client(ws)));
    ws.on('error', reject);
  });
}

describe('GameServer (integration)', () => {
  it('two clients play over the wire to game over', async () => {
    const server = new GameServer({ beatMs: 100 });
    const port = await server.listen(0);
    const a = await connect(port);
    const b = await connect(port);

    a.send({ type: 'joinRoom', room: 'r1', name: 'A' });
    b.send({ type: 'joinRoom', room: 'r1', name: 'B' });

    // A 是房主：等两人都到（收到 1人→2人 两条 roomState）后手动开始
    await a.waitFor('roomState');
    await a.waitFor('roomState');
    a.send({ type: 'startGame' });

    // 开局 → beat 0 的 beatStart
    await a.waitFor('beatStart');
    await b.waitFor('beatStart');

    // beat 0：双方运气
    a.send({ type: 'submitAction', beat: 0, action: { kind: 'charge' } });
    b.send({ type: 'submitAction', beat: 0, action: { kind: 'charge' } });

    // beat 1 的 beatStart（beat 0 结算之后）
    await a.waitFor('beatStart');

    // beat 1：A 放「空」(1气)，B 运气 → B 被打死
    a.send({ type: 'submitAction', beat: 1, action: { kind: 'attack', skill: 'kong', target: null } });
    b.send({ type: 'submitAction', beat: 1, action: { kind: 'charge' } });

    const over = await a.waitFor('gameOver');
    expect(over.type).toBe('gameOver');
    if (over.type === 'gameOver') expect(over.winner).toBe(0);

    a.close();
    b.close();
    await server.close();
  }, 8000);
});
