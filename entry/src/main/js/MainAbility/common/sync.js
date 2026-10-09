/*
 * NexioWatch - 同步模块（不使用 Wear Engine）
 *
 * 本机 SDK 没有 @system.wearengine（历史白屏 bug 的直接原因），因此同步实现为：
 *   1) 局域网自动同步（主通道）：@system.fetch 轮询手机端 NexioSchedule 暴露的
 *      http://<host>:8787/schedule.json，内容就是手机端 WatchPayload.buildFullJson()
 *      的 v4 JSON；成功后落库并记录同步时间。
 *   2) 文件通道（备用/离线）：internal://app/import/nexio_schedule.json（用
 *      hdc file send 推入）与 internal://app/rawfile/nexio_schedule.json（随包内置）。
 *
 * 所有网络调用都在 try/catch 内，失败只更新状态，不抛异常到页面生命周期。
 */
import fetch from '@system.fetch';
import {
  PROTOCOL_NAME, PROTOCOL_VERSION, MAX_COURSES, MAX_INCOMING, COURSE_COLORS,
  SYNC_TIMEOUT_MS, SYNC_POLL_MS
} from './const.js';
import * as M from './model.js';
import * as D from './date.js';

var MAX_BODY = 65536;

/*
 * 手机端 WatchPayload 发的是 settings.class_start_time（开学日，格式 yyyy/MM/dd），
 * 旧协议字段是顶层 term_start。两者都要认，统一成 yyyy-MM-dd 给 store.weekOfDate 用，
 * 否则手表只能退化成「固定当前周」，跨周日期算不准。
 */
function normalizeTermStart(text) {
  if (!text) return '';
  var s = String(text).split('/').join('-');
  if (s.indexOf('-') < 0 && s.length === 8) {
    s = s.substring(0, 4) + '-' + s.substring(4, 6) + '-' + s.substring(6, 8);
  }
  if (s.length < 10) return '';
  return s.substring(0, 10);
}

/*
 * 从整表里抽出某一周真正要上的课，最多 MAX_COURSES 门。
 * 先做「周次是否命中」的廉价判断，再 normalize，避免为上百门课都建对象。
 */
function collectWeek(rawList, week) {
  var out = [];
  var i;
  for (i = 0; i < rawList.length && out.length < MAX_COURSES; i++) {
    var rc = rawList[i];
    if (!rc) continue;
    var dow = M.toInt(rc.dayOfWeek, 0);
    if (dow < 1 || dow > 7) continue;
    var probe = {
      selectedWeeks: rc.selectedWeeks,
      startWeek: M.toInt(rc.startWeek, 1),
      endWeek: M.toInt(rc.endWeek, 18),
      weekType: M.toInt(rc.weekType, 0)
    };
    if (!M.isActiveInWeek(probe, week)) continue;
    out.push(M.normalizeCourse({
      id: rc.id, name: rc.name, location: rc.location, teacher: rc.teacher,
      dayOfWeek: dow, startSection: rc.startSection, endSection: rc.endSection,
      startWeek: rc.startWeek, endWeek: rc.endWeek, weekType: rc.weekType,
      selectedWeeks: rc.selectedWeeks, isCustomTime: rc.isCustomTime,
      customStartTime: rc.customStartTime, customEndTime: rc.customEndTime,
      color: rc.color ? rc.color : COURSE_COLORS[out.length % COURSE_COLORS.length]
    }));
  }
  return out;
}

/*
 * 解析手机端下发的整表 JSON。
 *
 * 关键约束（用户反馈：整学期课表存下来内存会爆，随后软重启）：
 * 手机端优先按周下发（GET /schedule.json?week=N，顶层带 data_week=N，可能上百门的
 * 整学期从此不上手表）；文件通道或旧版手机端仍可能给整学期，所以这里一律再按
 * isActiveInWeek 过滤一次，条数上限 MAX_COURSES（12）——解析出来的数组不驻留整表。
 * 目标周优先取顶层 data_week（手机端就是按它过滤的），否则取调用方传入的周次
 * （手表设置里的当前周）；若该周过滤后为空，再退回手机端 settings.current_week 试一次，
 * 避免因周次偏差导致白屏。
 *
 * week 参数可省略（文件导入通道按手机端 data_week/week 过滤）。
 */
function parse(text, week) {
  var obj = null;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'JSON 解析失败' };
  }
  if (!obj || typeof obj !== 'object') return { ok: false, error: '内容不是 JSON 对象' };
  if (obj.protocol && String(obj.protocol) !== PROTOCOL_NAME) {
    return { ok: false, error: '协议不匹配: ' + obj.protocol };
  }
  var version = M.toInt(obj.version, 0);
  if (version > PROTOCOL_VERSION) {
    return { ok: false, error: '版本过新(v' + version + ')，请升级手表应用' };
  }
  var rawList = obj.courses;
  if (!rawList || !rawList.length) return { ok: false, error: '没有课程数据' };
  if (rawList.length > MAX_INCOMING) rawList = rawList.slice(0, MAX_INCOMING);

  var rs = obj.settings || {};
  var phoneWeek = M.toInt(rs.current_week, 1);
  var targetWeek = M.toInt(week, 0);
  if (targetWeek < 1 || targetWeek > 30) targetWeek = phoneWeek;

  /* 手机端按周下发时顶层带 data_week，它比调用方传入的周次更权威：
     手机端正是按这个周次过滤的，若手表再按别处推导的周次过滤，会把课全滤掉。
     整表通道写 0 或字段缺失/非法时忽略，仍走上面的兜底。 */
  var dataWeek = M.toInt(obj.data_week, 0);
  if (dataWeek >= 1 && dataWeek <= 30) targetWeek = dataWeek;

  /* 两遍扫描：第一遍用目标周，第二遍（仅当结果为空且周次不同）用手机端周次。
     每遍都是流式的，最多只保留 MAX_COURSES 门，不会驻留整表。 */
  var courses = collectWeek(rawList, targetWeek);
  var usedWeek = targetWeek;
  if (!courses.length && phoneWeek !== targetWeek) {
    courses = collectWeek(rawList, phoneWeek);
    usedWeek = phoneWeek;
  }
  if (!courses.length) return { ok: false, error: '第 ' + targetWeek + ' 周没有课程数据' };
  var settings = {
    currentWeek: M.toInt(rs.current_week, 1),
    totalWeeks: M.toInt(rs.total_weeks, 18),
    morningSections: M.toInt(rs.morning_sections, 4),
    afternoonSections: M.toInt(rs.afternoon_sections, 4),
    eveningSections: M.toInt(rs.evening_sections, 3),
    scheduleName: obj.schedule_name ? String(obj.schedule_name) : '同步课表',
    termStart: normalizeTermStart(obj.term_start ? obj.term_start : rs.class_start_time),
    reminderEnabled: true
  };

  return {
    ok: true,
    error: '',
    courses: courses,
    week: usedWeek,
    settings: settings,
    times: (obj.times && typeof obj.times === 'object') ? obj.times : null,
    holidays: obj.holidays ? obj.holidays : [],
    action: obj.action ? String(obj.action) : 'replace',
    source: '无感同步',
    incoming: rawList.length
  };
}

/*
 * state: store 状态对象（提供 syncUrl()/syncHostLabel()/markSynced()/applyPayload()）
 * opts:  { onResult: function(ok, message, payload) }
 */
function pull(url, opts, cb) {
  var done = false;
  var guard = 0;
  function finish(ok, err, text) {
    if (done) return;
    done = true;
    /* 请求先返回时必须清掉超时兜底，否则每次拉取都会白留一个定时器（长跑会累积） */
    if (guard) clearTimeout(guard);
    cb(ok, err, text);
  }
  if (!url) {
    finish(false, '未配置同步地址', '');
    return;
  }
  guard = setTimeout(function () { finish(false, '网络超时', ''); }, SYNC_TIMEOUT_MS);
  try {
    fetch.fetch({
      url: url,
      method: 'GET',
      responseType: 'text',
      success: function (res) {
        var body = (res && res.data) ? String(res.data) : '';
        if (!body) { finish(false, '响应为空', ''); return; }
        if (body.length > MAX_BODY) { finish(false, '数据过大', ''); return; }
        finish(true, '', body);
      },
      fail: function (data, code) {
        finish(false, '连接失败(' + code + ')', '');
      }
    });
  } catch (e) {
    finish(false, '网络不可用', '');
  }
}

/* 手动「刷新」：拉一次并落库 */
function manualPull(store, cb) {
  var url = store.syncUrl();
  if (!url) {
    if (cb) cb(false, '未配置同步地址');
    return;
  }
  store.syncState = 'loading';
  pull(url, null, function (ok, err, text) {
    if (!ok) {
      store.syncState = 'error';
      store.syncError = err;
      if (cb) cb(false, err);
      return;
    }
    var parsed = parse(text, store.get().settings.currentWeek);
    if (!parsed.ok) {
      store.syncState = 'error';
      store.syncError = parsed.error;
      if (cb) cb(false, parsed.error);
      return;
    }
    store.applyPayload(parsed);
    store.markSynced();
    store.syncState = 'ok';
    store.syncError = '';
    if (cb) cb(true, '已同步第 ' + parsed.week + ' 周 ' + parsed.courses.length + ' 门课');
  });
}

/* 文件通道导入（rawfile / internal import 文件都由 page 先读出文本再调用） */
function importText(store, text, sourceName, cb) {
  var parsed = parse(text, store.get ? store.get().settings.currentWeek : 0);
  if (!parsed.ok) {
    if (cb) cb(false, parsed.error);
    return;
  }
  parsed.source = sourceName;
  store.applyPayload(parsed);
  store.save();
  if (cb) cb(true, sourceName + '：' + parsed.courses.length + ' 门课');
}

export { parse, pull, manualPull, importText, SYNC_POLL_MS };
export default { parse: parse, pull: pull, manualPull: manualPull, importText: importText };
