/*
 * NexioWatch - 绘制与交互小工具
 * 为什么用 canvas：ACE-Lite 里每个 HML 节点都要几 KB，课表这种多行列表用
 * HML 会顶到堆上限（实测 7xN 网格要到 -hs 196608 才不 OOM）；canvas 只占一个节点，
 * 代价是点击要自己做命中测试——两个页面都用矩形命中，不用 measureText。
 */
import * as D from './date.js';
import { ALPHA } from './icon.js';

/*
 * 全局绘制偏移（等价于 ctx.translate，但本引擎没有 translate）。
 * 页面过渡动画要把整屏内容左右/上下平移，若逐个调用点加参数会牵动 50 多处，
 * 因此把偏移放进绘制原语内部：setOffset(x,y) 之后 roundRect / ltext / ctext / rect
 * 画出来的内容自动带上偏移。过渡结束务必 setOffset(0,0) 复位。
 */
var OX = 0;
var OY = 0;

function setOffset(x, y) {
  OX = x ? x : 0;
  OY = y ? y : 0;
}

function offsetX() { return OX; }
function offsetY() { return OY; }

/* 带偏移的 fillRect：裸 ctx.fillRect 不会自动带偏移，需要平移的实心块走这里 */
function rect(ctx, x, y, w, h) {
  ctx.fillRect(x + OX, y + OY, w, h);
}

/* #RRGGBB -> rgba(r,g,b,a)；解析失败返回 rgba(255,255,255,a) */
function hexA(hex, alpha) {
  var h = String(hex || '');
  if (h.charAt(0) === '#') h = h.substring(1);
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  if (h.length !== 6) return 'rgba(255,255,255,' + alpha + ')';
  var r = parseInt(h.substring(0, 2), 16);
  var g = parseInt(h.substring(2, 4), 16);
  var b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return 'rgba(255,255,255,' + alpha + ')';
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

/*
 * 圆角矩形。
 * 注意：本引擎的 canvas 只有 beginPath/closePath/moveTo/lineTo/arc/rect/fill/stroke
 * 等，没有 quadraticCurveTo / bezierCurveTo / arcTo / createLinearGradient /
 * drawImage —— 所以圆角用"两个矩形 + 四个 1/4 圆"拼出来（arc 可用）。
 */
function roundRect(ctx, x, y, w, h, r) {
  x = x + OX;
  y = y + OY;
  var rad = r;
  if (rad > w / 2) rad = w / 2;
  if (rad > h / 2) rad = h / 2;
  if (rad < 1) { ctx.fillRect(x, y, w, h); return; }
  /*
   * 本引擎的 arc()+fill() 画不出填充（圆角方块会渲染成十字），所以圆角用
   * "逐行 1px 横条逼近 1/4 圆"实现：每行内缩 inset = rad - sqrt(rad² - (rad-i)²)。
   * rad 一般 <= 18，四次角共约 4*rad 次 fillRect，代价可接受。
   */
  var i;
  for (i = 0; i < rad; i++) {
    var dy = rad - i;
    var inset = rad - Math.sqrt(rad * rad - dy * dy);
    ctx.fillRect(x + inset, y + i, w - inset * 2, 1);
    ctx.fillRect(x + inset, y + h - i - 1, w - inset * 2, 1);
  }
  ctx.fillRect(x, y + rad, w, h - rad * 2);
}

/* 文本宽度估算：只用于 ellipsize 与行内排版预算，不用于对齐（对齐已交给
   ctx.textAlign，由引擎按真实字形度量）。
   逐字号实测标定（模拟器逐字形量 advance，.dsh-tmp/shots-calE 的 8 档字号）：
     汉字 advance ≈ size + 2            8/11/13/16/20/26/34px → 10/13/15/18/22/28/36
     数字/拉丁 advance ≈ 0.6*size + 1   同上 → 6/8/9/11/13/16/21
   旧系数（CJK 0.95*size、拉丁 0.45*size）系统性低估：13px 的
   「周二线性代数 10:00 · 体育（篮球） 16:00」估算 211px、实际渲染 271px（低估 22%），
   导致周课表课名越过预算压到右侧日期列上（文字重叠）。
   measureText 在本引擎返回垃圾值（cjk→7.6e-313、拉丁→false），故仍用估算。 */
function tw(text, size) {
  var w = 0;
  var i;
  var code;
  var s = text === undefined || text === null ? '' : String(text);
  for (i = 0; i < s.length; i++) {
    code = s.charCodeAt(i);
    w = w + (code > 127 ? (size + 2) : (size * 0.6 + 1));
  }
  return w;
}

/* 居中：交给引擎的 textAlign='center'（canvas_component.cpp:1274 的 DrawLabel 用真实
   字形度量，实测墨迹中心 = fillText 的 x）。旧实现按 tw() 估算左移半个字宽，含拉丁
   字符时误差可达 30%，表现为“文字和背景不是对称关系”。 */
function ctext(ctx, text, cx, y, size) {
  ctx.textAlign = 'center';
  ctx.fillText(String(text === undefined || text === null ? '' : text), Math.round(cx) + OX, y + OY);
  ctx.textAlign = 'left';
}

function ltext(ctx, text, x, y) {
  /* 显式置左对齐：页面 rtext() 会把引擎的 textAlign 置为 right，
     本引擎实测该属性是持久的，下一次左对齐必须自己复位，否则文字会整体右移。 */
  ctx.textAlign = 'left';
  ctx.fillText(String(text === undefined || text === null ? '' : text), Math.round(x) + OX, y + OY);
}

/* 超宽则截断加省略号 */
function ellipsize(ctx, text, maxWidth, size) {
  var s = String(text === undefined || text === null ? '' : text);
  if (tw(s, size) <= maxWidth) return s;
  var out = '';
  var i;
  for (i = 0; i < s.length; i++) {
    if (tw(out + s.charAt(i), size) + size > maxWidth) break;
    out = out + s.charAt(i);
  }
  return out + '…';
}

/* 状态：与手机端的"进行中/未开始/已结束"一致，同时给卡片颜色 */
function statusOf(iso, sectionTimes, startSection, endSection) {
  var now = D.nowMinutes();
  var s = D.hhmmToMinutes(startText(sectionTimes, startSection));
  var e = D.hhmmToMinutes(endText(sectionTimes, endSection));
  if (s < 0 || e < 0) return { key: 'unknown', color: '#9A9AA0' };
  if (now >= s && now < e) return { key: 'ongoing', color: '#34C759' };
  if (now < s) return { key: 'notstarted', color: '#64B5F6' };
  return { key: 'done', color: '#8A8A90' };
}

function startText(sectionTimes, section) {
  var v = sectionTimes ? sectionTimes[String(section)] : '';
  if (!v) return '';
  var p = String(v).split('-');
  return p[0] ? p[0] : '';
}

function endText(sectionTimes, section) {
  var v = sectionTimes ? sectionTimes[String(section)] : '';
  if (!v) return '';
  var p = String(v).split('-');
  return p[1] ? p[1] : '';
}

function timeRange(sectionTimes, a, b) {
  var s = startText(sectionTimes, a);
  var e = endText(sectionTimes, b);
  if (s && e) return s + '-' + e;
  if (s) return s;
  return '';
}

function sectionsText(a, b) {
  if (a === b) return '第' + a + '节';
  return '第' + a + '-' + b + '节';
}

function hit(x, y, rect) {
  return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/* 从 click 事件里取坐标，兼容 clientX/offsetX/pageX 三种命名 */
/*
 * 事件坐标：本项目实测 lite 的 click 事件字段是
 * { type, target, currentTarget, timestamp, globalX, globalY }，
 * 没有 clientX/offsetX，所以优先读 globalX/globalY（相对屏幕左上角）。
 */
function pointOf(e) {
  if (!e) return null;
  var x;
  var y;
  if (e.globalX !== undefined) { x = e.globalX; y = e.globalY; }
  else if (e.clientX !== undefined) { x = e.clientX; y = e.clientY; }
  else if (e.offsetX !== undefined) { x = e.offsetX; y = e.offsetY; }
  else if (e.pageX !== undefined) { x = e.pageX; y = e.pageY; }
  if (x === undefined || y === undefined) return null;
  return { x: x, y: y };
}

/* -------------------------------------------------------------------------
 * 以下三个 helper 原本在 pages/index/index.js 里，为把页面 bundle 压到真机
 * 单文件 49,152 B 硬闸（js_fwk_common.h:89）以下而搬到内核侧：app.js 与页面
 * 各自独立享有该配额；内核引用由 app.js 挂到全局 $app.data.NEXIO（真机没有
 * globalThis，只有 JSFWK_TEST==1 的模拟器才有），页面用 getApp().data.NEXIO 取。
 * ------------------------------------------------------------------------- */

/* 应用图标点阵还原：canvas 没有 drawImage，icon 以「每行 RLE」内联在
   common/icon.js；x/y 取整并跟随全局绘制偏移，避免过渡期半像素错行。 */
function drawIcon(ctx, icon, x, y) {
  if (!icon) return;
  x = Math.round(x + OX);
  y = Math.round(y + OY);
  var rows = icon.enc.split('~');
  var pal = icon.pal;
  var r;
  for (r = 0; r < icon.n && r < rows.length; r++) {
    var row = rows[r];
    var cx = x;
    var k;
    for (k = 0; k + 1 < row.length; k += 2) {
      var ci = ALPHA.indexOf(row.charAt(k));
      var len = ALPHA.indexOf(row.charAt(k + 1)) + 1;
      if (ci < 0 || len < 1) continue;
      ctx.fillStyle = '#' + pal.substr(ci * 6, 6);
      ctx.fillRect(cx, y + r, len, 1);
      cx = cx + len;
    }
  }
}

/* 某节课“已上多久”的比例（0..1）：首页进度条与卡片内进度条共用 */
function curPctOf(st, c) {
  if (!c) return 0;
  var s = D.hhmmToMinutes(startText(st.sectionTimes, c.startSection));
  var e = D.hhmmToMinutes(endText(st.sectionTimes, c.endSection));
  if (s < 0 || e <= s) return 0;
  var p = (D.nowMinutes() - s) / (e - s);
  if (p < 0) p = 0;
  if (p > 1) p = 1;
  return p;
}

/* 环：底环 + 按达成率绘制的进度弧，12 点方向起顺时针（arc 不自动带偏移，手工跟随） */
var C_RING_TRACK = '#26262B';
function drawRing(ctx, cx, cy, r, lw, p, color) {
  cx = cx + OX;
  cy = cy + OY;
  ctx.beginPath();
  ctx.strokeStyle = C_RING_TRACK;
  ctx.lineWidth = lw;
  ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
  ctx.stroke();
  if (p > 0.002) {
    var sweep = p > 1 ? 1 : p;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep, false);
    ctx.stroke();
  }
}

/* 缓动：官方标准曲线 cubic-bezier(0.40, 0.00, 0.20, 1.00) 的 33 点 LUT。
   Lite 的 CSS 只认 linear/ease-in/ease-out/ease-in-out，没有 cubic-bezier，
   所以烘焙成查表；输入输出都是 0..1 的进度。 */
var EASE_LUT = [
  0, 0.0022, 0.0093, 0.0224, 0.043, 0.0728, 0.1139, 0.1683, 0.2366, 0.3164, 0.4014,
  0.4842, 0.5597, 0.6261, 0.6836, 0.733, 0.7756, 0.8122, 0.8438, 0.871, 0.8945,
  0.9147, 0.932, 0.9468, 0.9594, 0.9699, 0.9785, 0.9855, 0.991, 0.9951, 0.9979, 0.9995, 1
];
function ease(p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  var i = Math.round(p * 32);
  if (i < 0) i = 0;
  if (i > 32) i = 32;
  return EASE_LUT[i];
}

export {
  hexA, roundRect, tw, ctext, ltext, ellipsize,
  statusOf, startText, endText, timeRange, sectionsText, hit, pointOf, ease,
  setOffset, offsetX, offsetY, rect, drawIcon, curPctOf, drawRing
};
export default {
  hexA: hexA, roundRect: roundRect, tw: tw, ctext: ctext, ltext: ltext, ellipsize: ellipsize,
  statusOf: statusOf, startText: startText, endText: endText, timeRange: timeRange,
  sectionsText: sectionsText, hit: hit, pointOf: pointOf, ease: ease,
  setOffset: setOffset, offsetX: offsetX, offsetY: offsetY, rect: rect,
  drawIcon: drawIcon, curPctOf: curPctOf, drawRing: drawRing
};
