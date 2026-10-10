// pm2 进程配置 — /api/attribution Node 服务
// 用法: pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'haomachat-api',
      script: '/opt/haomachat/api/server.mjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // 可选: 聚合数据 API Key (配置后归属地数据更全, 不配则走 360 免费接口)
        // LOOKUP_API_KEY: '在服务器环境变量或这里填写',
      },
      error_file: '/var/log/haomachat/api-error.log',
      out_file: '/var/log/haomachat/api-out.log',
      time: true,
    },
  ],
};
