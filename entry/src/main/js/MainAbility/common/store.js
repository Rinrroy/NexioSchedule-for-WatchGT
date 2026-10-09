/*
 * NexioWatch - 全局状态（内存态）
 *
 * 数据来源只有一条：手机端局域网同步（sync.js）。课表不再落盘 —— m09613 起
 * @system.file 通道整体删除，原因：真机 JS 堆紧张（jerry 的 JS HEAP OOM 会被
 * fatal_handler 转成 AMS 重启，即「软重启」），而读盘要 file.access + 分片 readText
 * 拼 65KB 字符串再 JSON.parse 出一整棵对象树，是启动期最大的单笔堆峰值之一；
 * 且没有任何调用者调用 save()（写入侧本来就是死码）。
 *
 * 只把「下次开机还要用」的三个小标志写 @system.storage（单值 < 128 字节）：
 * 当前周 / 上次同步时间 / 手机端同步地址；课表内容每次开机由 autoSync 从手机端拉取。
 */
import storage from '@system.storage';
import {
  MAX_COURSES, MAX_WEEKS, KEY_WEEK, KEY_SYNC_AT, KEY_SYNC_HOST,
  DEFAULT_SYNC_PORT
} from './const.js';
import * as M from './model.js';
import * as D from './date.js';
import * as DEF from './defaults.js';
import * as HOL from './holiday.js';

function defaultSettings() {
  var s = DEF.settings();
  return {
    currentWeek: s.currentWeek,
    totalWeeks: s.totalWeeks,
    morningSections: s.morningSections,
    afternoonSections: s.afternoonSections,
    eveningSections: s.eveningSections,
    scheduleName: s.scheduleName,
    reminderEnabled: s.reminderEnabled,
    termStart: s.termStart
  };
}

var state = {
  ready: false,
  courses: [],
  holidays: [],
  /* 当前 courses 属于哪一周（0 = 未知：还没从手机端同步过）。
     手表端只缓存一周的课，跨周后旧数据要能提示用户重新同步。 */
  dataWeek: 0,
  settings: defaultSettings(),
  times: DEF.times(),
  sectionTimes: {},
  lastSync: 0,
  source: '未同步',
  lastError: '',
  syncHost: '',
  syncState: 'idle',
  syncError: ''
};

function refreshSectionTimes() {
  state.sectionTimes = M.absSectionTimes(
    state.times,
    state.settings.morningSections,
    state.settings.afternoonSections
  );
}

function loadCourses(list) {
  var out = [];
  var i;
  for (i = 0; i < list.length && out.length < MAX_COURSES; i++) {
    out.push(M.normalizeCourse(list[i]));
  }
  return out;
}

/* 当前缓存的数据是不是「本周」的；false 时 UI 要提示重新同步 */
function dataIsCurrentWeek() {
  if (!state.dataWeek) return true;
  return state.dataWeek === state.settings.currentWeek;
}

function dataWeekLabel() {
  if (!state.dataWeek) return '';
  return '第 ' + state.dataWeek + ' 周';
}

function get() {
  if (!state.ready) {
    state.ready = true;
    refreshSectionTimes();
  }
  return state;
}

function setSyncHost(host) {
  state.syncHost = host ? String(host) : '';
}

/* ---------------- 周次 / 日期换算（与手机端 floorDiv 规则一致） ---------------- */

/* 开学日 -> 该日期的「朴素周次」，与 dateOfWeekday 的算法互逆 */
function naiveWeek(iso) {
  var st = state.settings;
  if (!st.termStart) return st.currentWeek;
  var diff = D.daysBetween(st.termStart, iso);
  var startWd = D.isoWeekday(st.termStart);
  return Math.floor((diff + startWd - 1) / 7) + 1;
}

function weekOfDate(iso) {
  var st = state.settings;
  if (!st.termStart) return st.currentWeek;
  var week = naiveWeek(iso);
  /* 手机端 current_week 已吸收调休重组，与朴素算法最多差 ±2 周；
     用「今天」的偏差做整体平移，而不是把远处的日期直接吸附到当前周
     （否则往前翻几周会全部显示成第 N 周，与 dateOfWeekday 画出的日期对不上）。 */
  var live = M.toInt(st.currentWeek, 1);
  if (live >= 1) {
    var offset = live - naiveWeek(D.todayISO());
    if (Math.abs(offset) <= 2 && offset !== 0) week = week + offset;
  }
  if (week < 1) week = 1;
  if (week > st.totalWeeks) week = st.totalWeeks;
  return week;
}

function dateOfWeekday(week, day) {
  var st = state.settings;
  if (!st.termStart) return '';
  return D.addDays(st.termStart, (week - 1) * 7 + (day - 1));
}

function holidayName(iso) {
  return HOL.nameOf(state.holidays, iso);
}

function isHoliday(iso) {
  return HOL.isHoliday(state.holidays, iso);
}

/* ---------------- 同步结果落库 ---------------- */

function applyPayload(payload) {
  if (!payload || !payload.ok) return false;
  if (payload.courses && payload.courses.length) {
    state.courses = loadCourses(payload.courses);
  }
  var s = payload.settings;
  var payloadWeek = M.toInt(payload.week, 0);
  if (s) {
    state.settings.currentWeek = M.clamp(M.toInt(s.currentWeek, 1), 1, MAX_WEEKS);
    state.settings.totalWeeks = M.clamp(M.toInt(s.totalWeeks, 18), 1, MAX_WEEKS);
    state.settings.morningSections = M.clamp(M.toInt(s.morningSections, 4), 0, 6);
    state.settings.afternoonSections = M.clamp(M.toInt(s.afternoonSections, 4), 0, 6);
    state.settings.eveningSections = M.clamp(M.toInt(s.eveningSections, 3), 0, 6);
    if (s.scheduleName) state.settings.scheduleName = String(s.scheduleName);
    if (s.termStart) state.settings.termStart = String(s.termStart);
  }
  if (payload.times) state.times = payload.times;
  if (payload.holidays && payload.holidays.length) {
    state.holidays = HOL.normalize(payload.holidays);
  }
  if (state.settings.currentWeek > state.settings.totalWeeks) {
    state.settings.currentWeek = state.settings.totalWeeks;
  }
  /* 数据归属周：同步通道给明确的 week，本地文件读回 data_week；
     都没有就认为跟 currentWeek 一致（内置示例/旧文件）。 */
  if (payloadWeek >= 1 && payloadWeek <= MAX_WEEKS) state.dataWeek = payloadWeek;
  else state.dataWeek = state.settings.currentWeek;
  state.lastSync = new Date().getTime();
  state.source = payload.source ? String(payload.source) : '同步导入';
  state.lastError = '';
  refreshSectionTimes();
  return true;
}

/* ---------------- storage 小标志 ---------------- */

function flagSet(key, value) {
  try {
    storage.set({ key: key, value: String(value), success: function () {}, fail: function () {} });
  } catch (e) {
    /* 存储不可用不影响功能 */
  }
}

function flagGet(key, cb) {
  try {
    storage.get({
      key: key,
      default: '',
      success: function (data) { cb(data === undefined || data === null ? '' : String(data)); },
      fail: function () { cb(''); }
    });
  } catch (e) {
    cb('');
  }
}

/* ---------------- 启动 / 保存 ---------------- */

function load(cb) {
  get();
  var done = false;
  var guard = 0;
  function finish(ok) {
    if (done) return;
    done = true;
    if (guard) clearTimeout(guard);
    if (cb) cb(ok);
  }
  guard = setTimeout(function () { finish(false); }, 4000);

  flagGet(KEY_WEEK, function (weekText) {
    var w = M.toInt(weekText, 0);
    if (w >= 1 && w <= MAX_WEEKS) state.settings.currentWeek = w;
  });
  flagGet(KEY_SYNC_AT, function (at) {
    var ms = M.toInt(at, 0);
    if (ms > 0) state.lastSync = ms;
  });
  flagGet(KEY_SYNC_HOST, function (host) {
    if (host) state.syncHost = host;
  });
  finish(true);
}

function markSynced() {
  state.lastSync = new Date().getTime();
  flagSet(KEY_SYNC_AT, state.lastSync);
  if (state.syncHost) flagSet(KEY_SYNC_HOST, state.syncHost);
}

function syncUrl() {
  if (!state.syncHost) return '';
  var host = state.syncHost;
  if (host.indexOf('http') !== 0) {
    host = 'http://' + host;
    if (host.indexOf(':', 8) < 0) host = host + ':' + DEFAULT_SYNC_PORT;
  }
  if (host.charAt(host.length - 1) !== '/') host = host + '/';
  /* 带 ?week=N：手机端只下发第 N 周课程，响应体远小于 sync.js 的 MAX_BODY(65536)，
     手表端 JSON.parse 也不再吃整学期的峰值内存。
     周次非法时不带参数，退回手机端的整表下发。 */
  var week = M.toInt(state.settings.currentWeek, 0);
  if (week >= 1 && week <= MAX_WEEKS) return host + 'schedule.json?week=' + week;
  return host + 'schedule.json';
}

function syncHostLabel() {
  if (!state.syncHost) return '';
  var host = state.syncHost;
  if (host.indexOf('http://') === 0) host = host.substring(7);
  else if (host.indexOf('https://') === 0) host = host.substring(8);
  if (host.indexOf(':') < 0) host = host + ':' + DEFAULT_SYNC_PORT;
  return host;
}

export {
  load, get, refreshSectionTimes,
  setSyncHost,
  weekOfDate, dateOfWeekday, holidayName, isHoliday,
  dataIsCurrentWeek, dataWeekLabel,
  applyPayload, markSynced, syncUrl, syncHostLabel,
  flagSet
};
