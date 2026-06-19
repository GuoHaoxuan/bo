import { GameServer } from './server';

const port = Number(process.env['PORT'] ?? 8080);
const server = new GameServer();
void server.listen(port).then((p) => {
  // eslint-disable-next-line no-console
  console.log(`bo server listening on ws://localhost:${p}`);
});
