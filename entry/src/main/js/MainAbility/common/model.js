/*
 * NexioWatch - 数据模型与周次/时间逻辑
 * 移植自 NexioSchedule/app/src/main/java/com/haooz/chedule/data/Course.kt
 * 判定规则必须与手机端一致，否则手机和手表显示的课不同。
 */
import C from './const.js';

var idSeq = 0;

function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function toInt(v, def) {
  var n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return n;
}

function newId() {
  idSeq = idSeq + 1;
  return 'c' + (new Date().getTime()) + '_' + idSeq;
}

function normalizeCourse(raw) {
  var c = raw || {};
  var course = {
    id: (c.id === undefined || c.id === null || c.id === '') ? newId() : String(c.id),
    name: (c.name === undefined || c.name === null || c.name === '') ? '未命名课程' : String(c.name),
    location: c.location ? String(c.location) : '',
    teacher: c.teacher ? String(c.teacher) : '',
    dayOfWeek: clamp(toInt(c.dayOfWeek, 1), 1, 7),
    startSection: clamp(toInt(c.startSection, 1), 1, C.MAX_SECTIONS),
    endSection: clamp(toInt(c.endSection, 1), 1, C.MAX_SECTIONS),
    startWeek: clamp(toInt(c.startWeek, 1), 1, C.MAX_WEEKS),
    endWeek: clamp(toInt(c.endWeek, 16), 1, C.MAX_WEEKS),
    weekType: clamp(toInt(c.weekType, 0), 0, 2),
    selectedWeeks: [],
    color: c.color ? String(c.color) : C.COURSE_COLORS[0],
    isCustomTime: c.isCustomTime === true,
    customStartTime: c.customStartTime ? String(c.customStartTime) : '',
    customEndTime: c.customEndTime ? String(c.customEndTime) : ''
  };
  if (course.endSection < course.startSection) course.endSection = course.startSection;
  if (course.endWeek < course.startWeek) course.endWeek = course.startWeek;
  var sw = c.selectedWeeks;
  if (sw && sw.length) {
    var i;
    for (i = 0; i < sw.length && i < C.MAX_WEEKS; i++) {
      var w = toInt(sw[i], 0);
      if (w >= 1 && w <= C.MAX_WEEKS && course.selectedWeeks.indexOf(w) < 0) {
        course.selectedWeeks.push(w);
      }
    }
    course.selectedWeeks.sort(function (a, b) { return a - b; });
  }
  return course;
}

/* Course.kt: isActiveInWeek - selectedWeeks 优先，其次区间 + 单双周 */
function isActiveInWeek(c, week) {
  var w = toInt(week, 1);
  if (c.selectedWeeks && c.selectedWeeks.length > 0) {
    return c.selectedWeeks.indexOf(w) >= 0;
  }
  if (w < c.startWeek || w > c.endWeek) return false;
  if (c.weekType === 1) return (w % 2) === 1;
  if (c.weekType === 2) return (w % 2) === 0;
  return true;
}

/* Course.kt: getWeekText */
function weeksText(c) {
  if (!c.selectedWeeks || c.selectedWeeks.length === 0) {
    var tail = '';
    if (c.weekType === 1) tail = '(单)';
    else if (c.weekType === 2) tail = '(双)';
    return c.startWeek + '-' + c.endWeek + '周' + tail;
  }
  var ws = [];
  var i;
  for (i = 0; i < c.selectedWeeks.length; i++) ws.push(c.selectedWeeks[i]);
  ws.sort(function (a, b) { return a - b; });
  var parts = [];
  var idx = 0;
  while (idx < ws.length) {
    var start = idx;
    var end = idx;
    while (end + 1 < ws.length && ws[end + 1] === ws[end] + 1) end = end + 1;
    var len = end - start + 1;
    if (len >= 3) parts.push(ws[start] + '-' + ws[end] + '周');
    else {
      var k;
      for (k = start; k <= end; k++) parts.push(ws[k] + '周');
    }
    idx = end + 1;
  }
  return parts.join('、');
}

/* Course.kt: getEffectiveStartTime/EndTime - 自定义时间优先，其次节次时间表 */
function startTimeText(c, sectionTimes) {
  if (c.isCustomTime && c.customStartTime) return c.customStartTime;
  var v = sectionTimes ? sectionTimes[String(c.startSection)] : '';
  if (!v) return '';
  var p = v.split('-');
  return p[0] ? p[0] : '';
}

function endTimeText(c, sectionTimes) {
  if (c.isCustomTime && c.customEndTime) return c.customEndTime;
  var v = sectionTimes ? sectionTimes[String(c.endSection)] : '';
  if (!v) return '';
  var p = v.split('-');
  return p[1] ? p[1] : '';
}

/* 把 payload 的 {morning:{1:..},afternoon:{1:..},evening:{1:..}} 展开成
 * 绝对节次索引表，与 Course.kt 里 sectionTimes[startSection] 的语义一致。 */
function absSectionTimes(times, morningCount, afternoonCount) {
  var out = {};
  var k;
  var m = toInt(morningCount, 4);
  var a = toInt(afternoonCount, 4);
  if (times && times.morning) {
    for (k in times.morning) {
      if (times.morning.hasOwnProperty(k)) out[String(k)] = times.morning[k];
    }
  }
  if (times && times.afternoon) {
    for (k in times.afternoon) {
      if (times.afternoon.hasOwnProperty(k)) out[String(toInt(k, 0) + m)] = times.afternoon[k];
    }
  }
  if (times && times.evening) {
    for (k in times.evening) {
      if (times.evening.hasOwnProperty(k)) out[String(toInt(k, 0) + m + a)] = times.evening[k];
    }
  }
  return out;
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function coursesOfDay(courses, day, week) {
  var out = [];
  var i;
  for (i = 0; i < courses.length; i++) {
    var c = courses[i];
    if (c.dayOfWeek !== toInt(day, 1)) continue;
    if (!isActiveInWeek(c, week)) continue;
    out.push(c);
  }
  out.sort(function (x, y) {
    if (x.startSection !== y.startSection) return x.startSection - y.startSection;
    return x.endSection - y.endSection;
  });
  return out;
}

function minutesOfHhmm(text) {
  if (!text) return -1;
  var p = String(text).split(':');
  if (p.length < 2) return -1;
  var h = toInt(p[0], -1);
  var m = toInt(p[1], -1);
  if (h < 0 || m < 0) return -1;
  return h * 60 + m;
}

/* 与 nowAndNext 相同，但接收已过滤好的当天列表，避免每次刷新多分配一份数组 */
function nowAndNextIn(list, sectionTimes, nowMinutes) {
  var res = { current: null, next: null };
  var i;
  for (i = 0; i < list.length; i++) {
    var c = list[i];
    var s = minutesOfHhmm(startTimeText(c, sectionTimes));
    var e = minutesOfHhmm(endTimeText(c, sectionTimes));
    if (s >= 0 && e >= 0) {
      if (nowMinutes >= s && nowMinutes < e) res.current = c;
      else if (nowMinutes < s) {
        if (res.next === null || s < minutesOfHhmm(startTimeText(res.next, sectionTimes))) res.next = c;
      }
    } else if (res.next === null && c.startSection > 0) {
      res.next = c;
    }
  }
  return res;
}

/* 只导出页面与其它模块真正取用的成员：本引擎每次导入都有取值开销，
   export default 的大对象更是白占堆（全工程没有默认导入，除 const.js）。 */
export {
  clamp,
  toInt,
  normalizeCourse,
  isActiveInWeek,
  weeksText,
  startTimeText,
  endTimeText,
  absSectionTimes,
  coursesOfDay,
  minutesOfHhmm,
  nowAndNextIn,
  pad2
};
