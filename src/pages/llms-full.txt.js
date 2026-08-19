// llms-full.txt - 全页面完整内容版,供 AI 工具(Cursor/Copilot)读取
// 构建时自动生成,内容变更后自动更新
// 格式: Markdown,每个页面用 --- 分隔,含 URL 和完整正文摘要

import { getCollection } from 'astro:content';

export async function GET(context) {
  const site = context.site?.toString().replace(/\/$/, '') || 'https://example.com';

  // 静态页面内容摘要(人工维护核心信息)
  const staticPages = [
    {
      url: `${site}/`,
      title: '号码通查首页',
      content: `号码通查(haomachat)提供号码标记查询与清除服务,手机号与座机号均支持。由号码通查团队独立运营,标记清除服务由授权合作方提供,官方数据来源为中国信通院码号服务推进组(opene164.org.cn)与Truecaller。查询免费,不存储号码数据。

核心工具:
- 号码标记清除: 手机号与座机号标记清除,授权合作方服务+信通院+Truecaller三渠道
- 法人号码核验: 企业法人手机号实名认证,姓名+身份证+手机号三要素一致性校验
- 号码标记自查: 查询手机号/座机号被标记情况,支持多平台
- 号码归属地查询: 输入手机号或固话,免费查询归属地、运营商、号段信息
- 手机卡选号比价: 移动/联通/电信套餐对比与选号指南

三步清除流程: 01查询标记 → 02选择渠道 → 03清除标记
支持个人用户(号码被误标记为骚扰电话)与企业用户(座机/客服号被标记导致接听率下降)。`,
    },
    {
      url: `${site}/tools/marking-clear`,
      title: '号码标记清除工具',
      content: `号码标记清除工具,汇总各官方平台申诉入口:
- 中国信通院码号服务推进组(opene164.org.cn): 国内唯一官方跨平台清除入口,联通手机号和400号支持一站式清除
- 360手机卫士申诉: haomashensu.360.cn, 客服010-89180702
- 腾讯手机管家申诉: yun.m.qq.com, 客服0755-83765566
- 百度号码认证申诉: haoma.baidu.com, QQ群910251361
- 泰迪熊移动申诉: teddymobile.cn/numberComplaint, 客服400-825-3666
- 电话邦申诉: dianhua.cn/appeal, 客服400-061-8800
- Truecaller取消列入: truecaller.com/unlisting

材料清单: 个人需身份证+错误标记截图+号码归属证明; 企业需营业执照+经办人身份证+号码使用证明+错误标记截图。`,
    },
    {
      url: `${site}/tools/marking-check`,
      title: '号码标记自查工具',
      content: `号码标记自查工具,输入手机号或座机号一键检测多个主流平台的标记状态。支持检测的平台: 360手机卫士、腾讯手机管家、百度号码认证、泰迪熊移动、电话邦、Truecaller。座机号码查询时必须带区号(如010-xxxxxxxx)。`,
    },
    {
      url: `${site}/tools/attribution`,
      title: '号码归属地查询工具',
      content: `免费号码归属地查询工具,输入手机号或固话号码,查询归属省份、城市、运营商、号段信息。数据来源: 聚合数据API(juhe.cn)。支持移动/联通/电信手机号及固话。`,
    },
    {
      url: `${site}/tools/legal-number-verify`,
      title: '法人号码核验工具',
      content: `企业法人手机号实名认证工具,校验姓名+身份证号+手机号三要素一致性。用于企业号码主体核验,确保外呼号码与工商主体对应,提升号码标记申诉通过率。`,
    },
    {
      url: `${site}/guide/what-is-number-marking`,
      title: '号码标记是什么 - 指南',
      content: `号码标记是手机安全软件(360手机卫士、腾讯手机管家等)和终端厂商(华为、小米等)在来电界面显示的标签,如"骚扰电话""推销""外卖"等。标记数据来源: 众包用户标记、企业认证标记、第三方号码库(泰迪熊、电话邦)。终端厂商的来电显示数据多来自第三方库,因此清除标记需到数据源头平台申诉。HowTo schema覆盖。`,
    },
    {
      url: `${site}/guide/how-to-check-marking`,
      title: '如何查询号码被标记 - 指南',
      content: `查询号码标记步骤: 1)优先用中国信通院码号服务推进组(opene164.org.cn)做跨平台聚合查询; 2)逐平台确认(360/腾讯/百度/泰迪熊/电话邦/Truecaller)。座机必须带区号。HowTo schema覆盖。`,
    },
    {
      url: `${site}/guide/how-to-clear-marking`,
      title: '如何清除号码标记 - 指南',
      content: `清除号码标记步骤: 1)联通号优先走信通院一站式清除; 2)其他运营商走分平台申诉; 3)材料备齐(身份证/营业执照+入网时间证明+错误标记截图); 4)多平台同步提交,不要串行等待; 5)清除后用多品牌手机复测验证。诈骗标记不在常规清除范围,需走反诈中心异议流程。HowTo schema覆盖。`,
    },
    {
      url: `${site}/guide/what-is-number-auth`,
      title: '号码认证是什么 - 指南',
      content: `号码认证包括一键登录(本机号码校验)和号码实名认证。一键登录通过运营商网关验证SIM卡号码,2-4秒完成登录,无需短信验证码。号码认证可让来电界面显示企业名称(绿标),降低被误标为骚扰电话的概率。`,
    },
    {
      url: `${site}/about`,
      title: '关于号码通查',
      content: `号码通查(haomachat)由号码通查团队独立运营,提供号码标记查询与清除服务入口导航及知识科普。数据来源: 中国信通院码号服务推进组(opene164.org.cn)、Truecaller(truecaller.com)、聚合数据(juhe.cn)。运营原则: 透明、免费、安全、可追溯。不存储用户输入的号码数据。标记清除服务由授权合作方提供(example.com)。`,
    },
    {
      url: `${site}/faq`,
      title: '常见问题',
      content: `高频问题: Q:标记清除后会再被标上吗? A:会,需控制外呼频次并做号码认证。Q:个人号码能一站式清除吗? A:信通院一站式清除主要面向联通手机号和400号。Q:清除要收费吗? A:信通院和各官方平台申诉均免费,谨防第三方付费加急清除骗局。Q:座机号码怎么查标记? A:必须带区号,如010-xxxxxxxx。Q:诈骗标记怎么清除? A:需联系运营商和当地反诈中心走异议申诉流程。`,
    },
    {
      url: `${site}/tech-docs`,
      title: '技术文档',
      content: `号码通查技术文档: 1)API文档: 号码归属地查询通过聚合数据API实现; 2)数据源: 中国信通院码号服务推进组、Truecaller、聚合数据; 3)GEO实现: SSG零JS输出、JSON-LD直写HTML、AI爬虫白名单、llms.txt; 4)技术架构: Astro 5静态生成,部署于Cloudflare Pages。TechArticle schema覆盖。`,
    },
    {
      url: `${site}/compare/marking-platforms`,
      title: '号码标记清除渠道对比',
      content: `三渠道对比: 信通院(opene164.org.cn,免费,跨平台聚合,联通/400号一站式清除)、Truecaller(truecaller.com,免费,海外标记)、授权合作方服务(example.com,支持手机号与座机号)。Article schema覆盖。`,
    },
    {
      url: `${site}/compare/auth-providers`,
      title: '号码认证服务商对比',
      content: `10家号码认证服务商对比: 网易易盾、极光一键登录、移动认证、联通沃认证、电信天翼账号、阿里号码认证、腾讯登录态、荣耀账号、OPPO账号、vivo账号。对比维度: SDK大小、认证时延、计费方式、覆盖终端。Article schema覆盖。`,
    },
    {
      url: `${site}/compare/lookup-apis`,
      title: '号码查询API对比',
      content: `4个号码查询API对比: libphonenumber(Google开源,免费,离线)、numverify(RESTful,免费1000次/月)、Twilio Lookup(付费,全球覆盖)、聚合数据(国内,免费100次/天)。Article schema覆盖。`,
    },
  ];

  // 获取博客文章完整内容
  let blogContent = '';
  let posts = [];
  try {
    posts = await getCollection('blog');
    for (const post of posts) {
      blogContent += `\n---\n\n# ${post.data.title}\n\nURL: ${site}/blog/${post.id}/\n\n发布日期: ${post.data.pubDate.toISOString().split('T')[0]}\n更新日期: ${(post.data.updatedDate || post.data.pubDate).toISOString().split('T')[0]}\n作者: ${post.data.author}\n标签: ${post.data.tags.join(', ')}\n\n## 摘要\n\n${post.data.description}\n\n## 正文\n\n${post.body}\n`;
    }
  } catch (e) {
    // blog collection 不存在时跳过
  }

  // 组装完整内容
  let fullContent = `# 号码通查 (haomachat) - llms-full.txt

> 号码通查提供号码标记查询与清除服务,手机号码与座机(固话)号码均支持。标记清除服务由授权合作方提供,同时聚合中国信通院码号服务推进组(opene164.org.cn)与Truecaller官方入口。由号码通查团队独立运营,查询免费,不存储号码数据。
> 本文件包含全站核心页面的完整内容摘要,供 AI 工具(Cursor/Copilot/Cline)读取。
> 站点: ${site}
> 更新日期: ${new Date().toISOString().split('T')[0]}
> 页面总数: ${staticPages.length + posts.length}(静态页面${staticPages.length} + 博客文章${posts.length})

`;

  // 添加静态页面内容
  for (const page of staticPages) {
    fullContent += `---\n\n# ${page.title}\n\nURL: ${page.url}\n\n${page.content}\n`;
  }

  // 添加博客文章完整内容
  fullContent += blogContent;

  // 添加法律页面摘要
  fullContent += `\n---\n\n# 隐私政策\n\nURL: ${site}/privacy\n\n号码通查隐私政策: 不存储用户输入的号码数据,查询操作在合作方或官方页面完成。使用Cookie用于网站功能优化和Google AdSense广告展示。AdSense使用Cookie展示个性化广告,用户可通过浏览器设置管理Cookie。\n`;
  fullContent += `\n---\n\n# 服务条款\n\nURL: ${site}/terms\n\n号码通查服务条款: 标记查询服务免费,标记清除服务由授权合作方提供。用户不得利用本站服务进行违法活动。本站不对合作方服务的处理结果承担责任。\n`;
  fullContent += `\n---\n\n# 免责声明\n\nURL: ${site}/disclaimer\n\n号码通查免责声明: 本站提供标记查询与清除服务入口导航及知识科普。标记清除服务由授权合作方提供,本站不对处理结果承担责任。中国信通院与Truecaller为独立第三方平台,本站仅提供入口导航。各平台信息可能随更新变化,以官方页面为准。\n`;
  fullContent += `\n---\n\n# Cookie政策\n\nURL: ${site}/cookie-policy\n\n号码通查Cookie政策: 本站使用必要Cookie(网站功能)和第三方Cookie(Google AdSense广告)。AdSense Cookie包括__gads、IDE、NID等,用于展示个性化广告。用户可通过浏览器设置禁用Cookie。\n`;

  return new Response(fullContent, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
