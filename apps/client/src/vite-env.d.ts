/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 完整 WebSocket 地址（如 wss://bo-server.onrender.com）。优先级最高。 */
  readonly VITE_WS_URL?: string;
  /** 仅服务器主机名（如 bo-server.onrender.com）；客户端自动拼成 wss://。 */
  readonly VITE_WS_HOST?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
