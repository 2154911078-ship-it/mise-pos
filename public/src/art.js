/**
 * art.js —— 商品线描插图。
 *
 * 一套统一的「器皿 + 特征线」符号语言：全部 48×48 视框、单色描边、
 * 跟随 currentColor，所以主题切换和 hover 变色都不用额外处理。
 *
 * 为什么不用照片或彩色插画：整站是象牙纸 + 墨 + 朱砂红的印刷版面，
 * 彩色食物图会把调性冲掉。菜单配线描图本来就是老菜单和报纸广告的做法。
 *
 * 每个图形只用两三类元素：器皿轮廓（杯 / 碗 / 盘 / 块）、
 * 内容特征线（分层、珍珠、柠檬片、麦穗）、以及少量实心点（芝麻、盐粒）。
 */

const wrap = (body) =>
  `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/* 实心点：芝麻、盐粒、珍珠、可可粉。r 别小于 1.2，
   48 视框缩到 32px 显示时 1.2 半径才剩不到 1px，再小就看不见了 */
const dot = (x, y, r = 1.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

const ART = {
  /* ---------------------------------------------------------- 咖啡 */
  // 直身马克杯 + 把手 + 热气
  americano: wrap(`
    <path d="M13 18h20v13a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6V18z"/>
    <ellipse cx="23" cy="18" rx="10" ry="2.6"/>
    <path d="M33 21h2.4a4.4 4.4 0 0 1 0 8.8H33"/>
    <path d="M19 11.4c0-1.8 1.6-1.8 1.6-3.6M26 11.4c0-1.8 1.6-1.8 1.6-3.6"/>`),

  // 高玻璃杯 + 奶泡层与咖啡层
  latte: wrap(`
    <path d="M16 12h16l-1.8 24a3 3 0 0 1-3 2.8h-6.4a3 3 0 0 1-3-2.8L16 12z"/>
    <ellipse cx="24" cy="12" rx="8" ry="2.2"/>
    <path d="M17.2 19h13.6M18.4 27h11.2"/>`),

  // 宽口杯 + 奶泡 + 杯碟
  cappuccino: wrap(`
    <path d="M11 21h22v8a7 7 0 0 1-7 7h-8a7 7 0 0 1-7-7v-8z"/>
    <ellipse cx="22" cy="21" rx="11" ry="2.8"/>
    <path d="M16.4 21a5.6 1.8 0 0 0 11.2 0"/>
    <path d="M33 23h2a4 4 0 0 1 0 8h-2"/>
    <path d="M8 39.4h28"/>`),

  // 高杯 + 麦穗
  oatLatte: wrap(`
    <path d="M15 13h16l-1.6 23a3 3 0 0 1-3 2.8h-6.8a3 3 0 0 1-3-2.8L15 13z"/>
    <ellipse cx="23" cy="13" rx="8" ry="2.2"/>
    <path d="M37 13v13"/>
    <path d="M37 16.4l-3-2.6M37 16.4l3-2.6M37 21.4l-3-2.6M37 21.4l3-2.6M37 26l-3-2.6M37 26l3-2.6"/>`),

  // 高球杯 + 冰块 + 吸管
  coldBrew: wrap(`
    <path d="M16 9h16l-1.6 27a3 3 0 0 1-3 2.8h-6.8a3 3 0 0 1-3-2.8L16 9z"/>
    <ellipse cx="24" cy="9" rx="8" ry="2.2"/>
    <rect x="19" y="16" width="6" height="6" rx="1"/>
    <rect x="25" y="25" width="6" height="6" rx="1"/>
    <path d="M31.4 5.4l-3.8 16"/>`),

  // 杯 + 可可粉 + 杯碟
  mocha: wrap(`
    <path d="M12 19h20v10a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6V19z"/>
    <ellipse cx="22" cy="19" rx="10" ry="2.6"/>
    <path d="M32 22h2.2a4.2 4.2 0 0 1 0 8.4H32"/>
    <path d="M9 39.4h26"/>
    ${dot(17.4, 20.6)}${dot(22, 21.2)}${dot(26.6, 20.6)}`),

  /* ---------------------------------------------------------- 茶饮 */
  // 杯 + 柠檬片 + 吸管
  lemonTea: wrap(`
    <path d="M15 13h18l-1.6 23a3 3 0 0 1-3 2.8h-8.8a3 3 0 0 1-3-2.8L15 13z"/>
    <ellipse cx="24" cy="13" rx="9" ry="2.4"/>
    <circle cx="21" cy="26" r="5"/>
    <path d="M21 21v10M16 26h10"/>
    <path d="M30.4 6.4l-3.2 14"/>`),

  // 茶壶：壶嘴用两条收拢的线，不要用闭合三角（会读成鸭嘴）
  jasmineTea: wrap(`
    <path d="M12 26h20v4.6a6.4 6.4 0 0 1-6.4 6.4h-7.2A6.4 6.4 0 0 1 12 30.6V26z"/>
    <path d="M11 26h22"/>
    <path d="M18.6 26a5.4 3.6 0 0 1 10.8 0"/>
    <path d="M24 22.4v-2.4"/>
    <path d="M32 27l7-2.4M32 30.4l7 2.4"/>
    <path d="M12 27.6c-2.8 0-4.8 1.4-4.8 3.4s2 3.4 4.8 3.4"/>`),

  // 茶碗 + 茶筅
  matchaLatte: wrap(`
    <path d="M11 23h26l-2.6 9.6A6 6 0 0 1 28.6 37h-9.2a6 6 0 0 1-5.8-4.4L11 23z"/>
    <ellipse cx="24" cy="23" rx="13" ry="3"/>
    <ellipse cx="24" cy="23" rx="7" ry="1.6"/>
    <path d="M38.4 13.4l-4 8.2"/>
    <path d="M34.4 21.6l-2.6 1.4M34.4 21.6l-.8 2.8"/>`),

  // 珍珠奶茶杯 + 珍珠
  oolongMilkTea: wrap(`
    <path d="M15 12h18l-2.2 24a3 3 0 0 1-3 2.8h-7.6a3 3 0 0 1-3-2.8L15 12z"/>
    <path d="M14 12h20"/>
    <path d="M18.6 8h10.8v4H18.6z"/>
    <path d="M29 4.6l-2.4 7.4"/>
    ${dot(20, 33, 1.6)}${dot(24, 34.4, 1.6)}${dot(28, 33, 1.6)}${dot(22, 30.4, 1.6)}${dot(26, 30.4, 1.6)}`),

  /* ---------------------------------------------------------- 简餐 */
  // 弯月 + 层次线。两端尖角要向上翘，否则只是个圆顶
  butterCroissant: wrap(`
    <path d="M6 30c-1.4-3-1-6.4 1.2-8.6C10 18.6 16 16 24 16s14 2.6 16.8 5.4c2.2 2.2 2.6 5.6 1.2 8.6"/>
    <path d="M6 30c4.6-3.6 10.4-5.4 18-5.4s13.4 1.8 18 5.4"/>
    <path d="M14.4 20.4c-2.4 2.4-3.6 5.4-3.6 9.2M24 17.4v12M33.6 20.4c2.4 2.4 3.6 5.4 3.6 9.2"/>`),

  // 三角三明治 + 夹层
  sandwich: wrap(`
    <path d="M7 33L24 10l17 23z"/>
    <path d="M13.4 26h21.2M17.2 21.4h13.6"/>
    <path d="M19 26v3.4M24 26v4.6M29 26v3.4"/>`),

  // 沙拉碗 + 菜叶 + 面包丁
  caesarSalad: wrap(`
    <path d="M10 24h28l-2.8 9.6A7 7 0 0 1 28.4 38h-8.8a7 7 0 0 1-6.8-4.4L10 24z"/>
    <ellipse cx="24" cy="24" rx="14" ry="3.2"/>
    <path d="M17 22c1.4-4.6 5.6-7 8.4-5.6 2 1 1.6 4-.6 5.6"/>
    <path d="M26 21.4c.4-3.4 3.6-5.2 5.4-3.8 1.4 1 1 3.2-.8 4.4"/>
    <path d="M18.6 29.4h2.4v2.4h-2.4zM27 30h2.4v2.4H27z"/>`),

  // 盘 + 面卷 + 叉
  pasta: wrap(`
    <ellipse cx="21" cy="30" rx="13" ry="4.4"/>
    <path d="M8 30a13 4.4 0 0 0 26 0"/>
    <circle cx="21" cy="24.6" r="6.6"/>
    <path d="M21 24.6a3.4 3.4 0 0 1 3.4 3.4 5.6 5.6 0 0 1-5.6 5.6"/>
    <path d="M40 12.4v20M37.6 12.4v5M42.4 12.4v5"/>`),

  // 汉堡：顶包 + 芝麻 + 两层夹心 + 底包
  burger: wrap(`
    <path d="M9 23a15 8 0 0 1 30 0z"/>
    <path d="M11 27h26M11 32h26"/>
    <path d="M10 36h28v1.6a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V36z"/>
    ${dot(18, 18)}${dot(24, 16.6)}${dot(30, 18)}`),

  /* ---------------------------------------------------------- 甜点 */
  // 方切块 + 分层 + 可可粉
  tiramisu: wrap(`
    <path d="M12 18h24v18H12z"/>
    <path d="M12 24h24M12 30h24"/>
    ${dot(17, 15.2)}${dot(22, 13.8)}${dot(28, 15.2)}`),

  // 整只圆形蛋糕 + 焦面：侧视圆柱比楔形更容易认出来
  basque: wrap(`
    <ellipse cx="24" cy="22" rx="14" ry="5.4"/>
    <path d="M10 22v9a14 5.4 0 0 0 28 0v-9"/>
    <path d="M14.6 20.6c3.2-1.6 6.8-2.4 9.4-2.4"/>`),

  // 椭圆卷 + 内层弧
  frenchCroissant: wrap(`
    <ellipse cx="24" cy="26" rx="15" ry="9"/>
    <path d="M13 22c3 4 8 6 11 6s8-2 11-6"/>
    <path d="M15 30c2.6-2 5.6-3 9-3s6.4 1 9 3"/>`),

  // 外圆 + 螺旋
  cinnamonRoll: wrap(`
    <circle cx="24" cy="26" r="13"/>
    <path d="M24 26a2 2 0 0 1 2 2 4 4 0 0 1-4 4 6 6 0 0 1-6-6 8 8 0 0 1 8-8 10 10 0 0 1 10 10"/>`),

  /* ---------------------------------------------------------- 小食 */
  // 薯条盒 + 竖条 + 盐粒
  fries: wrap(`
    <path d="M14 25h20l-2.2 13H16.2L14 25z"/>
    <path d="M18.6 25V14.4M22.6 25V11.6M26.6 25V13.6M30.4 25V16.6"/>
    ${dot(21, 19, 1)}${dot(27, 18, 1)}`),

  // 带骨的鸡翅：一端肉、一端骨，单侧骨节才不会读成哑铃
  wings: wrap(`
    <ellipse cx="28" cy="19" rx="10" ry="8" transform="rotate(-38 28 19)"/>
    <path d="M20.6 26.4l-6 6"/>
    <circle cx="12.6" cy="34.4" r="2.8"/>`),

  // 小碟 + 三种坚果
  nuts: wrap(`
    <path d="M9 30h30a15 15 0 0 1-30 0z"/>
    <ellipse cx="24" cy="30" rx="15" ry="3.2"/>
    <ellipse cx="18.6" cy="24" rx="3.6" ry="2.4" transform="rotate(-20 18.6 24)"/>
    <circle cx="28.4" cy="23.2" r="3"/>
    <ellipse cx="24" cy="18.4" rx="3.2" ry="2.2" transform="rotate(10 24 18.4)"/>`),
};

/* 兜底：认不出名字时按分类给一个通用器皿，避免出现空白 */
const FALLBACK = {
  咖啡: wrap(`
    <path d="M14 18h18v12a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6V18z"/>
    <ellipse cx="23" cy="18" rx="9" ry="2.4"/>
    <path d="M32 21h2a4 4 0 0 1 0 8h-2"/>`),
  茶饮: wrap(`
    <path d="M15 14h18l-2 22a3 3 0 0 1-3 2.8h-8a3 3 0 0 1-3-2.8L15 14z"/>
    <ellipse cx="24" cy="14" rx="9" ry="2.4"/>
    <path d="M29.4 6.4l-3 13"/>`),
  简餐: wrap(`
    <ellipse cx="24" cy="28" rx="14" ry="4.6"/>
    <path d="M10 28a14 4.6 0 0 0 28 0"/>
    <path d="M17 22V12M31 22V12"/>`),
  甜点: wrap(`
    <path d="M12 20h24v16H12z"/>
    <path d="M12 26h24"/>
    ${dot(18, 16.6)}${dot(24, 15.4)}${dot(30, 16.6)}`),
  小食: wrap(`
    <path d="M10 28h28a14 14 0 0 1-28 0z"/>
    <ellipse cx="24" cy="28" rx="14" ry="3"/>`),
};

const GENERIC = wrap(`
  <circle cx="24" cy="24" r="12"/>
  <path d="M24 17v14M17 24h14"/>`);

/**
 * 按名字匹配插图。
 * 顺序敏感：「燕麦拿铁」「抹茶拿铁」必须先于「拿铁」，
 * 「法式可颂」必须先于「可颂」，「肉桂卷」必须先于「卷」。
 */
const RULES = [
  [/美式/, 'americano'],
  [/燕麦/, 'oatLatte'],
  [/抹茶/, 'matchaLatte'],
  [/冷萃|冰滴|冷泡/, 'coldBrew'],
  [/卡布/, 'cappuccino'],
  [/摩卡/, 'mocha'],
  [/拿铁/, 'latte'],
  [/柠檬/, 'lemonTea'],
  [/茉莉|绿茶|红茶|乌龙(?!奶茶)/, 'jasmineTea'],
  [/奶茶|珍珠/, 'oolongMilkTea'],
  [/法式|可颂/, 'frenchCroissant'],
  [/牛角|羊角/, 'butterCroissant'],
  [/三明治|吐司|帕尼尼/, 'sandwich'],
  [/沙拉|沙律/, 'caesarSalad'],
  [/意面|意粉|面/, 'pasta'],
  [/汉堡|堡/, 'burger'],
  [/提拉米苏/, 'tiramisu'],
  [/巴斯克|芝士|乳酪/, 'basque'],
  [/肉桂/, 'cinnamonRoll'],
  [/薯条|薯角/, 'fries'],
  [/鸡翅|鸡腿|烤鸡/, 'wings'],
  [/坚果|果仁|拼盘/, 'nuts'],
];

/**
 * 取某个商品的插图 SVG。
 * @param {string} name 商品名
 * @param {string} [categoryName] 分类名，名字认不出时用来兜底
 * @returns {string} 内联 SVG 字符串
 */
export function productArt(name, categoryName = '') {
  const text = String(name ?? '');
  for (const [re, key] of RULES) {
    if (re.test(text)) return ART[key];
  }
  return FALLBACK[categoryName] ?? GENERIC;
}

/** 只要分类时的兜底插图 */
export function categoryArt(categoryName = '') {
  return FALLBACK[categoryName] ?? GENERIC;
}

export const ART_KEYS = Object.keys(ART);
