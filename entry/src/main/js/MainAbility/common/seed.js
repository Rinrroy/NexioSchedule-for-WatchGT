/*
 * NexioWatch - 首屏种子数据
 * 任何 IO/网络失败时 UI 仍然有内容，绝不白屏。真实数据由同步导入覆盖。
 * 目标机型 GT5/GT6（512KB JS 堆档），因此样例给到 12 门课并带国庆假期/调休，
 * 用来验收周课表的假期显示与"整天无课"状态。
 */
var RAW_COURSES = [
  's01|高等数学|4|1|2|1|16|0|教三201|张老师|#2196F3',
  's02|大学英语|1|3|4|1|16|0|外语楼305|Linda|#FF9800',
  's03|程序设计基础|4|5|6|1|16|1|机房A402|陈立|#4CAF50',
  's04|线性代数|2|3|4|1|16|0|教二108|刘敏|#E91E63',
  's05|大学物理|4|7|8|1|16|0|实验楼5|刘老师|#00BCD4',
  's06|体育（篮球）|2|7|8|1|16|0|体育馆|孙涛|#009688',
  's07|数据结构|3|1|2|1|16|0|机房A301|陈立|#4CAF50',
  's08|概率论与数理统计|3|3|4|1|16|0|教三305|王建国|#2196F3',
  's09|形势与政策|3|5|6|1|8|2|教一101|李国强|#673AB7',
  's10|离散数学|4|3|4|1|16|0|教二210|刘敏|#E91E63',
  's11|计算机网络|5|3|4|1|16|0|机房A305|吴斌|#3F51B5',
  's12|创新创业基础|5|5|6|1|8|0|教四401|郑楠|#E6B422'
];

var RAW_HOLIDAYS = [
  { date: '2026-10-01', endDate: '2026-10-03', name: '国庆节', type: 0, followWeek: -1, followWeekday: -1, custom: false },
  { date: '2026-10-04', endDate: '2026-10-04', name: '国庆假期', type: 0, followWeek: -1, followWeekday: -1, custom: false }
];

function settings() {
  return {
    currentWeek: 4,
    totalWeeks: 18,
    morningSections: 4,
    afternoonSections: 4,
    eveningSections: 3,
    scheduleName: '2026 秋季学期',
    reminderEnabled: true,
    termStart: '2026-09-07'
  };
}

function times() {
  return {
    morning: { '1': '08:00-08:45', '2': '08:55-09:40', '3': '10:00-10:45', '4': '10:55-11:40' },
    afternoon: { '1': '14:00-14:45', '2': '14:55-15:40', '3': '16:00-16:45', '4': '16:55-17:40' },
    evening: { '1': '18:30-19:15', '2': '19:25-20:10', '3': '20:30-21:15' }
  };
}

function courses() {
  var out = [];
  var i;
  for (i = 0; i < RAW_COURSES.length; i++) {
    var f = RAW_COURSES[i].split('|');
    out.push({
      id: f[0], name: f[1],
      dayOfWeek: parseInt(f[2], 10), startSection: parseInt(f[3], 10), endSection: parseInt(f[4], 10),
      startWeek: parseInt(f[5], 10), endWeek: parseInt(f[6], 10), weekType: parseInt(f[7], 10),
      location: f[8], teacher: f[9], color: f[10],
      selectedWeeks: [], isCustomTime: false, customStartTime: '', customEndTime: ''
    });
  }
  return out;
}

function holidays() {
  var out = [];
  var i;
  for (i = 0; i < RAW_HOLIDAYS.length; i++) out.push(RAW_HOLIDAYS[i]);
  return out;
}

export { settings, times, courses, holidays };
export default { settings: settings, times: times, courses: courses, holidays: holidays };
