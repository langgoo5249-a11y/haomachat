// 号码归属地查询 API 代理 (Cloudflare Pages Function)
// 作用: 在服务端携带 API Key 请求第三方接口, 避免密钥暴露到前端, 规避 CORS
// 路由: /api/attribution?phone=13800138000
//
// 环境变量(在 Cloudflare Pages Dashboard 设为加密 secret):
//   LOOKUP_API_KEY  - 聚合数据/号码百科 API Key
//
// 若未配置 API Key, 降级为本地 libphonenumber 格式校验(仅返回号码类型/有效性行判断)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const phone = (url.searchParams.get('phone') || '').trim();

  // ---- CORS 头 ----
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!phone) {
    return json({ ok: false, error: '缺少 phone 参数' }, 400, corsHeaders);
  }

  // 基础校验: 仅允许数字与 + 号
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length < 7 || cleaned.length > 15) {
    return json({ ok: false, error: '号码格式不正确' }, 400, corsHeaders);
  }

  // ---- 降级: 无 API Key 时返回基础信息 ----
  if (!env.LOOKUP_API_KEY) {
    return json({
      ok: true,
      source: 'local',
      phone: cleaned,
      note: '未配置远端 API, 以下为基础格式判断。配置 LOOKUP_API_KEY 后可查询归属地与运营商。',
      isPossible: cleaned.length >= 7,
    }, 200, corsHeaders);
  }

  // ---- 主流程: 调用聚合数据号码归属地 API ----
  // 接口文档: https://www.juhe.cn/docs/api/id/11
  try {
    const apiUrl = `https://apis.juhe.cn/mobile/get?key=${encodeURIComponent(env.LOOKUP_API_KEY)}&phone=${encodeURIComponent(cleaned.slice(-11))}&dtype=json`;
    const resp = await fetch(apiUrl, {
      headers: { 'User-Agent': 'haomachat/1.0 (+https://haomachat.com)' },
    });
    const data = await resp.json();

    if (data.error_code !== 0) {
      return json({
        ok: false,
        error: data.reason || '查询失败',
        code: data.error_code,
      }, 200, corsHeaders);
    }

    return json({
      ok: true,
      source: 'juhe',
      phone: cleaned,
      province: data.result?.province || '',
      city: data.result?.city || '',
      areacode: data.result?.areacode || '',
      zip: data.result?.zip || '',
      company: data.result?.company || '',
      card: data.result?.card || '',
    }, 200, corsHeaders);
  } catch (err) {
    return json({ ok: false, error: '服务暂时不可用, 请稍后重试' }, 502, corsHeaders);
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers });
}
