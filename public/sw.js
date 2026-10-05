// 号码通查 - Service Worker 清理文件
// 历史: 2026-09-19 曾误部署第三方 push SDK(5gvci.com) 到站点根目录并配置全站 scope,
//       2026-09-21 移除。本文件用于覆盖 Cloudflare 边缘缓存的旧第三方脚本:
//       已注册旧 SW 的浏览器下次检查更新时会拿到本文件, 清空全部缓存后**自行注销**。
// 当前行为: 不注册任何 fetch 监听, 不拦截、不缓存、不注入任何请求; 激活后立即自我注销。
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 清空全部缓存(含旧第三方 SW 留下的缓存)
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      // 自我注销: 让浏览器彻底回到无 Service Worker 状态
      await self.registration.unregister();
    })(),
  );
});
