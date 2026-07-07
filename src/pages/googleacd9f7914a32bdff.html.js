// Google Search Console 域名验证文件
// 使用端点方式输出,绕过 Cloudflare Pages 的 .html 自动重定向
export async function GET() {
  return new Response('google-site-verification: googleacd9f7914a32bdff.html', {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
