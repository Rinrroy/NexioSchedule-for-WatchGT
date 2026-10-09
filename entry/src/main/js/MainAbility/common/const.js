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
var VERSION = 'v1.0.2';

/* 课程数上限：只缓存「当前周」的课，而不是整学期。
   手机端下发的是整学期课表（可能有上百门），若整表驻留 JS 堆会爆内存并软重启，
   因此手表端只保留当前周真正要上的课。
   512KB 档（GT5/GT6）一周 16 门余量充足；64KB 档（GT2 等）请改 8。 */
var MAX_COURSES = 16;
/* 手机端下发的原始条数上限：超出部分直接丢弃，避免解析期就撑爆内存 */
var MAX_INCOMING = 200;
var MAX_WEEKS = 30;
var MAX_SECTIONS = 12;

/* 与手机端 NexioSchedule/wearable/WatchPayload.kt 对齐 */
var PROTOCOL_NAME = 'nexio.schedule';
var PROTOCOL_VERSION = 4;
/* 无感同步服务端（手机端局域网服务）默认端口与探活间隔 */
var DEFAULT_SYNC_PORT = 8787;
var SYNC_TIMEOUT_MS = 3000;

var COURSE_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#F44336', '#E6B422', '#E91E63',
  '#00BCD4', '#3F51B5', '#AB47BC', '#009688', '#673AB7'
];

var WEEK_LONG = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
var WEEK_FULL = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

/* 存储键：@system.storage 官方要求 value < 128 字节，只能放小标志 */
var KEY_WEEK = 'nexio_week';
var KEY_SYNC_AT = 'nexio_sync_at';
var KEY_SYNC_HOST = 'nexio_sync_host';

export {
  HEAP_TIER_KB,
  VERSION,
  MAX_COURSES,
  MAX_INCOMING,
  MAX_WEEKS,
  MAX_SECTIONS,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  DEFAULT_SYNC_PORT,
  SYNC_TIMEOUT_MS,
  COURSE_COLORS,
  WEEK_LONG,
  WEEK_FULL,
  KEY_WEEK,
  KEY_SYNC_AT,
  KEY_SYNC_HOST
};

/* 默认导出只服务 common/model.js 的 `import C from './const.js'`：
   全工程唯一的默认导入，且只取 MAX_SECTIONS / MAX_WEEKS / COURSE_COLORS 三个键，
   其余键已删（m09613 模块瘦身：默认对象是纯运行期分配）。 */
export default {
  MAX_WEEKS: MAX_WEEKS,
  MAX_SECTIONS: MAX_SECTIONS,
  COURSE_COLORS: COURSE_COLORS
};