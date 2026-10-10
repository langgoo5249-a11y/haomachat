// =====================================================================
// /api/attribution 的 Node 侧外壳 (替代 Cloudflare Pages Function)
//
// 背景: 原站用 functions/api/attribution.js (Cloudflare Pages Function) 提供
// 归属地查询接口。迁移到阿里云后没有 Pages Runtime, 这里用 Node 原生 http
// 起一个同构服务, 复用完全相同的业务逻辑 (attribution.js 原样复制到同目录),
// 由 Nginx `location /api/` 反代到 127.0.0.1:3000。
//
// 依赖: Node >= 18 (需要全局 Request / Response / fetch)
// 启动: pm2 start ecosystem.config.cjs
// =====================================================================
import { createServer } from 'node:http';
import { onRequestGet } from './attribution.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1'; // 仅本机监听, 由 Nginx 反代, 不直接暴露公网

const server = createServer(async (req, res) => {
  try {
    // 用原始 URL 构造标准 Request (attribution.js 只读 searchParams, 不依赖 path)
    const url = `http://${req.headers.host || HOST}${req.url}`;
    const request = new Request(url, { method: req.method, headers: req.headers });

    const response = await onRequestGet({ request, env: process.env });

    // 透传状态码与响应头
    const headers = {};
    response.headers.forEach((v, k) => {
      headers[k] = v;
    });
    res.writeHead(response.status, headers);
    res.end(await response.text());
  } catch (err) {
    // 兜底: 任何异常都返回结构化 JSON, 避免前端拿到 HTML 错误页
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: '服务暂时不可用, 请稍后重试' }));
    console.error('[api] 未捕获异常:', err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[api] attribution 服务已启动: http://${HOST}:${PORT}`);
});

// 优雅退出, 便于 pm2 reload
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
