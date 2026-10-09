/*
 * NexioWatch - 全局状态与持久化
 *
 * 持久化策略（受 lite API 限制驱动）：
 *   - @system.storage 单值 < 128 字节 -> 只放小标志（版本/当前周/同步时间/同步地址）；
 *   - 完整数据用 @system.file 写到 internal://app/nexio/schedule.json；
 *   - 任何一步失败都只降级（保留内存里的上一份数据），不抛异常、不白屏。
 *
 * 同步地址（syncHost）是唯一允许写入 storage 的动态值：手机端局域网服务地址，
 * 形如 "10.0.2.2" 或 "10.0.2.2:8787"，长度远小于 128 字节。
 *
 * 注意：模拟器与预览器不执行 @system.file，真机才算证据。
 */
import file from '@system.file';
import storage from '@system.storage';
import {
  MAX_COURSES, MAX_WEEKS, KEY_VERSION, KEY_WEEK, KEY_SYNC_AT, KEY_SYNC_HOST,
  URI_DATA, URI_IMPORT, URI_RAW, URI_EXPORT, PROTOCOL_VERSION, PROTOCOL_NAME,
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
  fileOk: true,
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
  selectedId: '',
  selectedDay: 0,
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

/*
 * 本地文件二次防线：旧版本可能往文件里写过整学期课程
 * （sync.js 的 MAX_BODY=65536 会直接拒绝那种响应，但文件通道没有这层保护）。
 * 读回时按该文件所属的周用 isActiveInWeek 滤一遍并截到 MAX_COURSES，
 * 内存里就永远只留一周的课；week 不在 1..MAX_WEEKS 时只截断不过滤。
 */
function filterCoursesByWeek(list, week) {
  var out = [];
  var i;
  if (!list || !list.length) return out;
  var w = M.toInt(week, 0);
  if (w < 1 || w > MAX_WEEKS) {
    /* 周次未知：保持旧行为，只截断不筛选 */
    for (i = 0; i < list.length && out.length < MAX_COURSES; i++) {
      out.push(M.normalizeCourse(list[i]));
    }
    return out;
  }
  /* 先做廉价命中判断再 normalize，旧整表文件上百门课时不为未命中的课建对象。
     兜底与 sync.js collectWeek 一致：startWeek<=0 视为 1、endWeek<=0 视为整学期，
     否则旧数据里 startWeek=0/endWeek=0 的新建课程会被整个丢掉。 */
  for (i = 0; i < list.length && out.length < MAX_COURSES; i++) {
    var raw = list[i];
    if (!raw) continue;
    var sw = M.toInt(raw.startWeek, 1);
    var ew = M.toInt(raw.endWeek, 18);
    if (sw <= 0) sw = 1;
    if (ew <= 0) ew = MAX_WEEKS;
    var probe = {
      selectedWeeks: raw.selectedWeeks,
      startWeek: sw,
      endWeek: ew,
      weekType: M.toInt(raw.weekType, 0)
    };
    if (!M.isActiveInWeek(probe, w)) continue;
    out.push(M.normalizeCourse(raw));
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

function courseById(id) {
  var i;
  for (i = 0; i < state.courses.length; i++) {
    if (state.courses[i].id === id) return state.courses[i];
  }
  return null;
}

function selectedCourse() {
  return courseById(state.selectedId);
}

function select(id) {
  state.selectedId = id ? String(id) : '';
}

function selectDay(day) {
  state.selectedDay = M.clamp(M.toInt(day, 0), 0, 7);
}

function upsert(course) {
  var c = M.normalizeCourse(course);
  var i;
  for (i = 0; i < state.courses.length; i++) {
    if (state.courses[i].id === c.id) {
      state.courses[i] = c;
      return c;
    }
  }
  if (state.courses.length >= MAX_COURSES) return null;
  state.courses.push(c);
  return c;
}

function remove(id) {
  var out = [];
  var i;
  for (i = 0; i < state.courses.length; i++) {
    if (state.courses[i].id !== id) out.push(state.courses[i]);
  }
  state.courses = out;
  if (state.selectedId === id) state.selectedId = '';
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
  else if (payload.source && String(payload.source).indexOf('本地') === 0) state.dataWeek = 0;
  else state.dataWeek = state.settings.currentWeek;
  state.lastSync = new Date().getTime();
  state.source = payload.source ? String(payload.source) : '同步导入';
  state.lastError = '';
  refreshSectionTimes();
  return true;
}

function toJson() {
  var out = {
    protocol: PROTOCOL_NAME,
    version: PROTOCOL_VERSION,
    action: 'replace',
    sentAt: new Date().getTime(),
    data_week: state.dataWeek,
    schedule_name: state.settings.scheduleName,
    term_start: state.settings.termStart,
    settings: {
      current_week: state.settings.currentWeek,
      total_weeks: state.settings.totalWeeks,
      morning_sections: state.settings.morningSections,
      afternoon_sections: state.settings.afternoonSections,
      evening_sections: state.settings.eveningSections
    },
    times: state.times,
    courses: [],
    holidays: state.holidays
  };
  var i;
  for (i = 0; i < state.courses.length; i++) {
    var c = state.courses[i];
    out.courses.push({
      id: c.id, name: c.name, dayOfWeek: c.dayOfWeek,
      startSection: c.startSection, endSection: c.endSection,
      startWeek: c.startWeek, endWeek: c.endWeek, weekType: c.weekType,
      selectedWeeks: c.selectedWeeks, isCustomTime: c.isCustomTime,
      customStartTime: c.customStartTime, customEndTime: c.customEndTime,
      location: c.location, teacher: c.teacher, color: c.color
    });
  }
  return JSON.stringify(out);
}

/* ---------------- 文件接口（全部回调式，禁止异步语法） ---------------- */

function dirOf(uri) {
  var i = uri.lastIndexOf('/');
  return i > 0 ? uri.substring(0, i) : uri;
}

/* 单次读取上限 4096（官方接口上限），超长文件按 position 连续读 */
function readAllText(uri, cb) {
  var parts = [];
  var offset = 0;
  var rounds = 0;
  var done = false;
  var guard = 0;

  function finish(ok, text) {
    if (done) return;
    done = true;
    if (guard) clearTimeout(guard);
    cb(ok, text);
  }

  function step() {
    rounds = rounds + 1;
    if (rounds > 24) { finish(parts.length > 0, parts.join('')); return; }
    try {
      file.readText({
        uri: uri,
        position: offset,
        length: 4096,
        success: function (data) {
          var text = (data && data.text) ? data.text : '';
          parts.push(text);
          if (text.length < 4096) { finish(true, parts.join('')); return; }
          offset = offset + 4096;
          step();
        },
        fail: function () {
          if (parts.length > 0) finish(true, parts.join(''));
          else finish(false, '');
        }
      });
    } catch (e) {
      finish(false, '');
    }
  }

  guard = setTimeout(function () { finish(parts.length > 0, parts.join('')); }, 6000);
  step();
}

function readText(uri, cb) {
  var done = false;
  var guard = 0;
  function finish(ok, text) {
    if (done) return;
    done = true;
    if (guard) clearTimeout(guard);
    cb(ok, text);
  }
  guard = setTimeout(function () { finish(false, ''); }, 3000);
  try {
    file.access({
      uri: uri,
      success: function () { readAllText(uri, finish); },
      fail: function () { finish(false, ''); }
    });
  } catch (e) {
    state.fileOk = false;
    finish(false, '');
  }
}

function writeText(uri, text, cb) {
  var done = false;
  var guard = 0;
  function finish(ok) {
    if (done) return;
    done = true;
    if (guard) clearTimeout(guard);
    if (cb) cb(ok);
  }
  guard = setTimeout(function () { finish(false); }, 5000);
  function doWrite() {
    try {
      file.writeText({
        uri: uri,
        text: text,
        success: function () { finish(true); },
        fail: function () { finish(false); }
      });
    } catch (e) {
      finish(false);
    }
  }
  try {
    file.mkdir({
      uri: dirOf(uri),
      recursive: true,
      success: doWrite,
      fail: doWrite
    });
  } catch (e) {
    state.fileOk = false;
    finish(false);
  }
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

  readText(URI_DATA, function (ok, text) {
    if (ok && text) {
      var parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        parsed = null;
        state.lastError = '本地数据解析失败';
      }
      if (parsed) {
        /* 旧文件可能躺着整学期课程：按这份文件所属的周再滤一次，只把那一周的课装进内存。
           周次以 data_week 为准（与下面回填的 dataWeek 同源），旧文件没有该字段时退回
           settings.current_week，再退回内存里的当前周。 */
        var storedWeek = M.toInt(parsed.data_week, 0);
        if (storedWeek < 1 || storedWeek > MAX_WEEKS) {
          storedWeek = parsed.settings ? M.toInt(parsed.settings.current_week, 0) : 0;
        }
        if (storedWeek < 1 || storedWeek > MAX_WEEKS) storedWeek = state.settings.currentWeek;
        applyPayload({
          ok: true,
          courses: filterCoursesByWeek(parsed.courses, storedWeek),
          settings: parsed.settings,
          times: parsed.times, holidays: parsed.holidays, source: '本地文件',
          week: M.toInt(parsed.data_week, 0)
        });
      }
    }
    finish(ok);
  });
}

function save(cb) {
  var text = toJson();
  writeText(URI_DATA, text, function (ok) {
    flagSet(KEY_VERSION, PROTOCOL_VERSION);
    flagSet(KEY_WEEK, state.settings.currentWeek);
    if (state.lastSync > 0) flagSet(KEY_SYNC_AT, state.lastSync);
    if (!ok) {
      state.fileOk = false;
      state.lastError = '文件写入失败，数据仅本次运行有效';
    } else {
      state.lastError = '';
    }
    if (cb) cb(ok);
  });
}

function readImportFile(cb) { readText(URI_IMPORT, cb); }
function readRawFile(cb) { readText(URI_RAW, cb); }
function exportToFile(cb) { writeText(URI_EXPORT, toJson(), cb); }

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
  load, save, get, refreshSectionTimes,
  select, selectDay, selectedCourse, courseById, upsert, remove,
  setSyncHost,
  weekOfDate, dateOfWeekday, holidayName, isHoliday,
  dataIsCurrentWeek, dataWeekLabel,
  applyPayload, toJson, markSynced, syncUrl, syncHostLabel,
  flagSet, flagGet, readImportFile, readRawFile, exportToFile
};

export default {
  load: load, save: save, get: get, refreshSectionTimes: refreshSectionTimes,
  select: select, selectDay: selectDay, selectedCourse: selectedCourse, courseById: courseById,
  upsert: upsert, remove: remove,
  setSyncHost: setSyncHost,
  weekOfDate: weekOfDate, dateOfWeekday: dateOfWeekday,
  holidayName: holidayName, isHoliday: isHoliday,
  dataIsCurrentWeek: dataIsCurrentWeek, dataWeekLabel: dataWeekLabel,
  applyPayload: applyPayload, toJson: toJson, markSynced: markSynced,
  syncUrl: syncUrl, syncHostLabel: syncHostLabel,
  flagSet: flagSet, flagGet: flagGet,
  readImportFile: readImportFile, readRawFile: readRawFile, exportToFile: exportToFile
};