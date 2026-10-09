/*
 * NexioWatch - 日期工具
 * lite 上不依赖 Date.parse 的宽松解析，统一用显式数值构造，避免不同引擎差异。
 * 全部按本地时区的"日"运算，跨夏令时用 Math.round 归一到整天。
 */
var DAY_MS = 86400000;

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function toISO(ms) {
  var d = new Date(ms);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/* "2026-10-01" -> 本地零点的毫秒数；格式不合法返回 0 */
function isoToMs(iso) {
  if (!iso) return 0;
  var p = String(iso).split('-');
  if (p.length < 3) return 0;
  var y = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  var d = parseInt(p[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return 0;
  return new Date(y, m - 1, d).getTime();
}

function todayISO() {
  return toISO(new Date().getTime());
}

function addDays(iso, n) {
  var ms = isoToMs(iso);
  if (!ms) return iso;
  return toISO(ms + n * DAY_MS);
}

/* 1=周一 ... 7=周日 */
function isoWeekday(iso) {
  var ms = isoToMs(iso);
  if (!ms) return 1;
  var w = new Date(ms).getDay();
  return w === 0 ? 7 : w;
}

/* b 比 a 晚几天（可为负） */
function daysBetween(a, b) {
  var ma = isoToMs(a);
  var mb = isoToMs(b);
  if (!ma || !mb) return 0;
  return Math.round((mb - ma) / DAY_MS);
}

function nowMinutes() {
  var d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function hhmmToMinutes(text) {
  if (!text) return -1;
  var p = String(text).split(':');
  if (p.length < 2) return -1;
  var h = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

function minutesToText(min) {
  var m = min < 0 ? 0 : min;
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}

/* 长日期：zh "2026年10月1日" / en "Oct 1, 2026" */
var MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtLong(iso, lang) {
  var ms = isoToMs(iso);
  if (!ms) return iso;
  var d = new Date(ms);
  if (lang === 'en-US') {
    return MONTH_EN[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

/* 中文月日：10月1日 */
function fmtMonthDay(iso) {
  var ms = isoToMs(iso);
  if (!ms) return iso;
  var d = new Date(ms);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

/* 短日期：9/28 */
function fmtShort(iso) {
  var ms = isoToMs(iso);
  if (!ms) return iso;
  var d = new Date(ms);
  return (d.getMonth() + 1) + '/' + d.getDate();
}

export {
  DAY_MS, pad2, toISO, isoToMs, todayISO, addDays, isoWeekday, daysBetween,
  nowMinutes, hhmmToMinutes, minutesToText, fmtLong, fmtMonthDay, fmtShort
};

export default {
  DAY_MS: DAY_MS,
  pad2: pad2,
  toISO: toISO,
  isoToMs: isoToMs,
  todayISO: todayISO,
  addDays: addDays,
  isoWeekday: isoWeekday,
  daysBetween: daysBetween,
  nowMinutes: nowMinutes,
  hhmmToMinutes: hhmmToMinutes,
  minutesToText: minutesToText,
  fmtLong: fmtLong,
  fmtMonthDay: fmtMonthDay,
  fmtShort: fmtShort
};
