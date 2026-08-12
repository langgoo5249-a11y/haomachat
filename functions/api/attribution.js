// 号码归属地查询 API 代理 (Cloudflare Pages Function)
// 路由: /api/attribution?phone=13800138000
//
// 数据源(优先级):
//   1. 360手机号码归属地接口 (免费,无需Key,返回省份/城市/运营商)
//   2. 本地号段数据库 (离线降级,返回基础运营商判断)
//
// 若配置了 LOOKUP_API_KEY (聚合数据),则使用聚合数据API获取更丰富信息

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
    return json({ ok: false, error: '请输入手机号码' }, 400, corsHeaders);
  }

  // 清理号码: 去除+86等前缀,只保留数字
  let cleaned = phone.replace(/[^\d]/g, '');
  if (cleaned.startsWith('86') && cleaned.length > 11) {
    cleaned = cleaned.slice(2);
  }

  // 号段前7位用于归属地判断
  const prefix7 = cleaned.slice(0, 7);

  // 手机号校验
  const isMobile = /^1[3-9]\d{9}$/.test(cleaned);
  // 固话校验(区号+号码)
  const isLandline = cleaned.length >= 7 && !isMobile;

  if (cleaned.length < 7) {
    return json({ ok: false, error: '号码格式不正确,请输入11位手机号或带区号的固话' }, 400, corsHeaders);
  }

  // ---- 优先: 如果配置了聚合数据API Key,使用聚合数据(数据更全) ----
  if (env.LOOKUP_API_KEY) {
    try {
      const apiUrl = `https://apis.juhe.cn/mobile/get?key=${encodeURIComponent(env.LOOKUP_API_KEY)}&phone=${encodeURIComponent(prefix7)}&dtype=json`;
      const resp = await fetch(apiUrl, {
        headers: { 'User-Agent': 'haomachat/1.0 (+https://zangxixitech.cn)' },
      });
      const data = await resp.json();

      if (data.error_code === 0 && data.result) {
        return json({
          ok: true,
          source: 'juhe',
          phone: cleaned,
          province: data.result.province || '',
          city: data.result.city || '',
          areacode: data.result.areacode || '',
          zip: data.result.zip || '',
          company: data.result.company || '',
          card: data.result.card || '',
        }, 200, corsHeaders);
      }
      // 聚合数据失败,继续尝试360接口
    } catch (e) {
      // 继续降级
    }
  }

  // ---- 主流程: 360免费归属地接口(无需Key) ----
  if (isMobile) {
    try {
      const resp360 = await fetch(
        `https://cx.shouji.360.cn/phonearea.php?number=${encodeURIComponent(cleaned)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; haomachat/1.0)',
            'Referer': 'https://cx.shouji.360.cn/',
          },
        }
      );
      const data360 = await resp360.json();

      if (data360.code === 0 && data360.data) {
        const d = data360.data;
        // 直辖市: province有值,city为空
        const city = d.city || d.province || '';
        return json({
          ok: true,
          source: '360',
          phone: cleaned,
          province: d.province || '',
          city: city,
          company: d.sp || '',
          areacode: '',
          zip: '',
          card: '',
        }, 200, corsHeaders);
      }
    } catch (e) {
      // 360接口失败,降级到本地
    }
  }

  // ---- 降级: 本地号段判断(无需网络请求) ----
  const localResult = localLookup(cleaned, isMobile);
  return json({
    ok: true,
    source: 'local',
    phone: cleaned,
    province: localResult.province,
    city: localResult.city,
    company: localResult.company,
    areacode: localResult.areacode,
    note: localResult.note,
  }, 200, corsHeaders);
}

// 本地号段判断(基于公开号段分配表)
function localLookup(phone, isMobile) {
  if (!isMobile) {
    // 固话: 通过区号判断省份
    return landlineLookup(phone);
  }

  const prefix3 = phone.slice(0, 3);
  const carrier = getCarrierByPrefix(prefix3);
  return {
    province: '',
    city: '',
    company: carrier,
    areacode: '',
    note: '当前在线接口暂不可用,仅返回运营商信息(基于号段分配表)。请稍后重试获取完整归属地信息。',
  };
}

// 根据手机号前3位判断运营商
function getCarrierByPrefix(prefix) {
  const mobile = ['134', '135', '136', '137', '138', '139', '147', '148', '150', '151', '152', '157', '158', '159', '172', '178', '182', '183', '184', '187', '188', '195', '197', '198'];
  const unicom = ['130', '131', '132', '145', '146', '155', '156', '166', '167', '171', '175', '176', '185', '186', '196'];
  const telecom = ['133', '149', '153', '173', '174', '177', '180', '181', '189', '190', '191', '193', '199'];
  const virtual = ['162', '165', '170', '171'];

  if (mobile.includes(prefix)) return '中国移动';
  if (unicom.includes(prefix)) return '中国联通';
  if (telecom.includes(prefix)) return '中国电信';
  if (virtual.includes(prefix)) return '虚拟运营商';
  return '未知';
}

// 固话区号→省份映射(主要城市)
function landlineLookup(phone) {
  const areaCodeMap = {
    '010': { province: '北京', city: '北京', areacode: '010' },
    '021': { province: '上海', city: '上海', areacode: '021' },
    '022': { province: '天津', city: '天津', areacode: '022' },
    '023': { province: '重庆', city: '重庆', areacode: '023' },
    '020': { province: '广东', city: '广州', areacode: '020' },
    '024': { province: '辽宁', city: '沈阳', areacode: '024' },
    '025': { province: '江苏', city: '南京', areacode: '025' },
    '027': { province: '湖北', city: '武汉', areacode: '027' },
    '028': { province: '四川', city: '成都', areacode: '028' },
    '029': { province: '陕西', city: '西安', areacode: '029' },
    '0755': { province: '广东', city: '深圳', areacode: '0755' },
    '0756': { province: '广东', city: '珠海', areacode: '0756' },
    '0757': { province: '广东', city: '佛山', areacode: '0757' },
    '0760': { province: '广东', city: '中山', areacode: '0760' },
    '0769': { province: '广东', city: '东莞', areacode: '0769' },
    '0571': { province: '浙江', city: '杭州', areacode: '0571' },
    '0574': { province: '浙江', city: '宁波', areacode: '0574' },
    '0510': { province: '江苏', city: '无锡', areacode: '0510' },
    '0512': { province: '江苏', city: '苏州', areacode: '0512' },
    '0531': { province: '山东', city: '济南', areacode: '0531' },
    '0532': { province: '山东', city: '青岛', areacode: '0532' },
    '0577': { province: '浙江', city: '温州', areacode: '0577' },
    '0591': { province: '福建', city: '福州', areacode: '0591' },
    '0592': { province: '福建', city: '厦门', areacode: '0592' },
    '0371': { province: '河南', city: '郑州', areacode: '0371' },
    '0311': { province: '河北', city: '石家庄', areacode: '0311' },
    '0351': { province: '山西', city: '太原', areacode: '0351' },
    '0431': { province: '吉林', city: '长春', areacode: '0431' },
    '0451': { province: '黑龙江', city: '哈尔滨', areacode: '0451' },
    '0471': { province: '内蒙古', city: '呼和浩特', areacode: '0471' },
    '0472': { province: '内蒙古', city: '包头', areacode: '0472' },
    '0731': { province: '湖南', city: '长沙', areacode: '0731' },
    '0791': { province: '江西', city: '南昌', areacode: '0791' },
    '0771': { province: '广西', city: '南宁', areacode: '0771' },
    '0898': { province: '海南', city: '海口', areacode: '0898' },
    '028': { province: '四川', city: '成都', areacode: '028' },
    '023': { province: '重庆', city: '重庆', areacode: '023' },
    '0851': { province: '贵州', city: '贵阳', areacode: '0851' },
    '0871': { province: '云南', city: '昆明', areacode: '0871' },
    '0931': { province: '甘肃', city: '兰州', areacode: '0931' },
    '0951': { province: '宁夏', city: '银川', areacode: '0951' },
    '0971': { province: '青海', city: '西宁', areacode: '0971' },
    '0901': { province: '新疆', city: '乌鲁木齐', areacode: '0901' },
    '0891': { province: '西藏', city: '拉萨', areacode: '0891' },
  };

  // 尝试匹配3位或4位区号
  for (const len of [4, 3]) {
    const code = phone.slice(0, len);
    if (areaCodeMap[code]) {
      return {
        ...areaCodeMap[code],
        company: '电信/联通/铁通',
        note: '固话归属地(基于区号匹配)',
      };
    }
  }

  return {
    province: '',
    city: '',
    company: '',
    areacode: '',
    note: '固话区号未识别,请确认号码是否正确。',
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers });
}
