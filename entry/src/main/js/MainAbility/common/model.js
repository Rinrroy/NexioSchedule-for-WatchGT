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

/* 与 Course.kt 的 11 色色板对应（用 #RRGGBB 形式，lite 的颜色校验只认十六进制） */
function colorOf(index) {
  var i = toInt(index, 0);
  if (i < 0) i = 0;
  return C.COURSE_COLORS[i % C.COURSE_COLORS.length];
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

function cloneCourse(c) {
  var out = {};
  var k;
  for (k in c) {
    if (c.hasOwnProperty(k)) out[k] = c[k];
  }
  out.selectedWeeks = [];
  var i;
  for (i = 0; i < c.selectedWeeks.length; i++) out.selectedWeeks.push(c.selectedWeeks[i]);
  return out;
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

function sectionText(c) {
  if (c.startSection === c.endSection) return '第' + c.startSection + '节';
  return '第' + c.startSection + '-' + c.endSection + '节';
}

function timeText(c, sectionTimes) {
  var a = startTimeText(c, sectionTimes);
  var b = endTimeText(c, sectionTimes);
  if (a && b) return a + '-' + b;
  if (a) return a;
  if (b) return b;
  return sectionText(c);
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

function hhmm(h, m) {
  return pad2(toInt(h, 0)) + ':' + pad2(toInt(m, 0));
}

/* Course.kt: calculatePeriodTimes - 由节数/起始时间/时长/课间推算节次时间表 */
function calculatePeriodTimes(count, startHour, startMinute, classDuration, shortBreak, longBreak, longBreakSection) {
  var out = {};
  var total = toInt(count, 0);
  if (total <= 0) return out;
  var lb = toInt(longBreakSection, 2);
  var cur = toInt(startHour, 8) * 60 + toInt(startMinute, 0);
  var dur = toInt(classDuration, 45);
  var sb = toInt(shortBreak, 10);
  var longB = toInt(longBreak, 20);
  var i;
  for (i = 1; i <= total; i++) {
    var s = cur;
    var e = cur + dur;
    out[String(i)] = hhmm(Math.floor(s / 60), s % 60) + '-' + hhmm(Math.floor(e / 60), e % 60);
    cur = e + (i === lb ? longB : sb);
  }
  return out;
}

/* Course.kt: periodIndex - 有自定义时间按钟点分时段，否则按绝对节次分段 */
function periodIndex(c, sectionTimes, morningCount, afternoonCount) {
  var m = toInt(morningCount, 4);
  var a = toInt(afternoonCount, 4);
  if (c.isCustomTime && c.customStartTime) {
    var hm = c.customStartTime.split(':');
    var mins = toInt(hm[0], 0) * 60 + toInt(hm[1], 0);
    if (mins < 12 * 60) return 'morning';
    if (mins < 18 * 60) return 'afternoon';
    return 'evening';
  }
  var s = toInt(c.startSection, 1);
  if (s <= m) return 'morning';
  if (s <= m + a) return 'afternoon';
  return 'evening';
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

function hasCourseOnDay(courses, day, week) {
  return coursesOfDay(courses, day, week).length > 0;
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

/* 返回 {current:第几节在上的课, next:下一节} ，无则 null */
function nowAndNext(courses, day, week, sectionTimes, nowMinutes) {
  var list = coursesOfDay(courses, day, week);
  var res = { current: null, next: null, currentLeft: -1 };
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

export {
  clamp,
  toInt,
  newId,
  colorOf,
  normalizeCourse,
  cloneCourse,
  isActiveInWeek,
  weeksText,
  startTimeText,
  endTimeText,
  sectionText,
  timeText,
  absSectionTimes,
  calculatePeriodTimes,
  periodIndex,
  coursesOfDay,
  hasCourseOnDay,
  minutesOfHhmm,
  nowAndNext,
  nowAndNextIn,
  pad2,
  hhmm
};

export default {
  clamp: clamp,
  toInt: toInt,
  newId: newId,
  colorOf: colorOf,
  normalizeCourse: normalizeCourse,
  cloneCourse: cloneCourse,
  isActiveInWeek: isActiveInWeek,
  weeksText: weeksText,
  startTimeText: startTimeText,
  endTimeText: endTimeText,
  sectionText: sectionText,
  timeText: timeText,
  absSectionTimes: absSectionTimes,
  calculatePeriodTimes: calculatePeriodTimes,
  periodIndex: periodIndex,
  coursesOfDay: coursesOfDay,
  hasCourseOnDay: hasCourseOnDay,
  minutesOfHhmm: minutesOfHhmm,
  nowAndNext: nowAndNext,
  nowAndNextIn: nowAndNextIn,
  pad2: pad2,
  hhmm: hhmm
};