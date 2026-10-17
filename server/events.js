/**
 * events.js —— 基于 Server-Sent Events 的实时推送中枢。
 *
 * 为什么选 SSE 而不是 WebSocket：
 *   门店场景只需要「服务器 → 收银台/后厨」的单向通知（新订单、支付、库存预警），
 *   SSE 走原生 HTTP、自动重连、无需额外依赖与握手协议，运维成本更低。
 */
export function createEventHub() {
  const clients = new Set();

  const heartbeat = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': ping\n\n');
      } catch {
        clients.delete(res);
      }
    }
  }, 25_000);
  heartbeat.unref?.();

  return {
    add(res) {
      clients.add(res);
      res.write('retry: 3000\n\n');
      res.on('close', () => clients.delete(res));
    },
    broadcast(type, payload) {
      const chunk = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
      for (const res of clients) {
        try {
          res.write(chunk);
        } catch {
          clients.delete(res);
        }
      }
    },
    get size() {
      return clients.size;
    },
    close() {
      clearInterval(heartbeat);
      for (const res of clients) res.end();
      clients.clear();
    },
  };
}
