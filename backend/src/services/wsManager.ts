import { WebSocket } from 'ws';

class WsManager {
  private connections = new Map<string, WebSocket>();

  register(sessionId: string, ws: WebSocket): void {
    this.connections.set(sessionId, ws);
  }

  // When `ws` is given, only unregister if it is still the active socket — a
  // replaced connection closing must not drop its successor.
  unregister(sessionId: string, ws?: WebSocket): void {
    if (ws && this.connections.get(sessionId) !== ws) return;
    this.connections.delete(sessionId);
  }

  // Server-initiated close (e.g. interview terminated); the client sees code + reason.
  close(sessionId: string, code: number, reason: string): void {
    const ws = this.connections.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(code, reason);
  }

  get(sessionId: string): WebSocket | undefined {
    return this.connections.get(sessionId);
  }

  emit(sessionId: string, payload: Record<string, unknown>): void {
    const ws = this.get(sessionId);
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
      } catch {
        // Client disconnected mid-send — silently drop
      }
    }
  }

  streamText(sessionId: string, text: string): Promise<void> {
    return new Promise((resolve) => {
      const ws = this.get(sessionId);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        resolve();
        return;
      }

      const words = text.split(' ');
      let i = 0;

      const next = () => {
        if (i >= words.length) {
          this.emit(sessionId, { type: 'text_end' });
          resolve();
          return;
        }
        const chunk = (i === 0 ? '' : ' ') + words[i++];
        this.emit(sessionId, { type: 'text_chunk', chunk });
        setTimeout(next, 40); // ~25 words/sec
      };

      next();
    });
  }
}

export const wsManager = new WsManager();
