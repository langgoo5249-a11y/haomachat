// 百度站长验证文件: 直接返回200,绕过 Cloudflare Pages clean URL 重定向(.html->无扩展名)
// 该 Function 优先于静态资源处理,确保 /baidu_verify_codeva-J2OVio818i.html 直接返回200
export function onRequest(context) {
  return new Response('a6296fbdfa7e298e664d88c3c7a759da', {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
}
