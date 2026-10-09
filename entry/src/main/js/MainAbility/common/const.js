/*
 * NexioWatch - 常量表
 * 说明：lite wearable 运行在 JerryScript 上，本文件只用 ES5 语法 + ES module，
 * 不用箭头函数/let/const/模板串/异步语法。
 *
 * 内存基线：目标机型为 HUAWEI WATCH GT5 / GT6（据用户信息为 512KB 档），
 * 因此按 512KB 基线设计，留出一半以上余量给峰值；同时保留降级能力
 * （见 HEAP_TIER），低端机型可通过改一个常量收紧。
 */
var HEAP_TIER_KB = 512;

/* 版本号：单一来源（页面与 app.js 共用），避免多处硬编码漂移 */
var VERSION = 'v1.0.1';

/* 课程数上限：只缓存「当前周」的课，而不是整学期。
   手机端下发的是整学期课表（可能有上百门），若整表驻留 JS 堆会爆内存并软重启，
   因此手表端只保留当前周真正要上的课。
   512KB 档（GT5/GT6）一周 16 门余量充足；64KB 档（GT2 等）请改 8。 */
var MAX_COURSES = 16;
/* 手机端下发的原始条数上限：超出部分直接丢弃，避免解析期就撑爆内存 */
var MAX_INCOMING = 200;
var MAX_HOLIDAYS = 60;
var MAX_WEEKS = 30;
var MAX_SECTIONS = 12;

/* 与手机端 NexioSchedule/wearable/WatchPayload.kt 对齐 */
var PROTOCOL_NAME = 'nexio.schedule';
var PROTOCOL_VERSION = 4;
/* 无感同步服务端（手机端局域网服务）默认端口与探活间隔 */
var DEFAULT_SYNC_PORT = 8787;
var SYNC_TIMEOUT_MS = 3000;
var SYNC_POLL_MS = 60000;

/* 蓝牙发现（只扫描广播）：手机端 NexioSchedule 以此 UUID/名称广播，
   广播数据里带 "NEXIO|<ip>:<port>" 供手表回连局域网拉取数据。 */
var BLE_SERVICE_UUID = '0000FEE7-0000-1000-8000-00805F9B34FB';
var BLE_LOCAL_NAME = 'NexioSchedule';
var BLE_SCAN_MS = 8000;

var COURSE_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#F44336', '#E6B422', '#E91E63',
  '#00BCD4', '#3F51B5', '#AB47BC', '#009688', '#673AB7'
];

var WEEK_SHORT = ['一', '二', '三', '四', '五', '六', '日'];
var WEEK_LONG = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
var WEEK_FULL = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

var PERIODS = ['morning', 'afternoon', 'evening'];
var PERIOD_LABEL = { morning: '上午', afternoon: '下午', evening: '晚上' };

/* 存储键：@system.storage 官方要求 value < 128 字节，只能放小标志 */
var KEY_VERSION = 'nexio_ver';
var KEY_WEEK = 'nexio_week';
var KEY_SYNC_AT = 'nexio_sync_at';
var KEY_SYNC_HOST = 'nexio_sync_host';

/* 文件 URI：只用 ASCII 字符，长度 <= 128 */
var URI_DATA = 'internal://app/nexio/schedule.json';
var URI_IMPORT = 'internal://app/import/nexio_schedule.json';
var URI_RAW = 'internal://app/rawfile/nexio_schedule.json';
var URI_EXPORT = 'internal://app/nexio/export.json';

export {
  HEAP_TIER_KB,
  VERSION,
  MAX_COURSES,
  MAX_INCOMING,
  MAX_HOLIDAYS,
  MAX_WEEKS,
  MAX_SECTIONS,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  DEFAULT_SYNC_PORT,
  SYNC_TIMEOUT_MS,
  SYNC_POLL_MS,
  BLE_SERVICE_UUID,
  BLE_LOCAL_NAME,
  BLE_SCAN_MS,
  COURSE_COLORS,
  WEEK_SHORT,
  WEEK_LONG,
  WEEK_FULL,
  PERIODS,
  PERIOD_LABEL,
  KEY_VERSION,
  KEY_WEEK,
  KEY_SYNC_AT,
  KEY_SYNC_HOST,
  URI_DATA,
  URI_IMPORT,
  URI_RAW,
  URI_EXPORT
};

export default {
  HEAP_TIER_KB: HEAP_TIER_KB,
  VERSION: VERSION,
  MAX_COURSES: MAX_COURSES,
  MAX_INCOMING: MAX_INCOMING,
  MAX_HOLIDAYS: MAX_HOLIDAYS,
  MAX_WEEKS: MAX_WEEKS,
  MAX_SECTIONS: MAX_SECTIONS,
  PROTOCOL_NAME: PROTOCOL_NAME,
  PROTOCOL_VERSION: PROTOCOL_VERSION,
  DEFAULT_SYNC_PORT: DEFAULT_SYNC_PORT,
  SYNC_TIMEOUT_MS: SYNC_TIMEOUT_MS,
  SYNC_POLL_MS: SYNC_POLL_MS,
  BLE_SERVICE_UUID: BLE_SERVICE_UUID,
  BLE_LOCAL_NAME: BLE_LOCAL_NAME,
  BLE_SCAN_MS: BLE_SCAN_MS,
  COURSE_COLORS: COURSE_COLORS,
  WEEK_SHORT: WEEK_SHORT,
  WEEK_LONG: WEEK_LONG,
  WEEK_FULL: WEEK_FULL,
  PERIODS: PERIODS,
  PERIOD_LABEL: PERIOD_LABEL,
  KEY_VERSION: KEY_VERSION,
  KEY_WEEK: KEY_WEEK,
  KEY_SYNC_AT: KEY_SYNC_AT,
  KEY_SYNC_HOST: KEY_SYNC_HOST,
  URI_DATA: URI_DATA,
  URI_IMPORT: URI_IMPORT,
  URI_RAW: URI_RAW,
  URI_EXPORT: URI_EXPORT
};