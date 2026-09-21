// 号码通查 - Service Worker 占位文件
// 历史用途: 旧版第三方 push SDK 已移除,保留空 SW 以防止边缘缓存继续返回旧脚本
// 当前行为: 安装后主动接管并清空所有缓存,随后自行注销,不拦截任何请求
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))),
  );
  event.waitUntil(self.clients.claim());
});
