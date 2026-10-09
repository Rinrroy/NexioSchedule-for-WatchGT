/*
 * NexioWatch - 节假日 / 调休
 * 数据格式与手机端 HolidayManager.Entry.toJson() 一致：
 *   { date, endDate, name, type, followWeek, followWeekday, custom }
 *   type 0 = 假期（当天不上课，周课表显示假期名）
 *   type 1 = 调休上班/上课（按 followWeek/followWeekday 借课表，本期只做展示提示）
 * 查找按区间包含判定，最多 4 年内的条目，条目数按 MAX_HOLIDAYS 截断。
 */
var MAX_HOLIDAYS = 60;

function normalize(raw) {
  var out = [];
  var i;
  if (!raw || !raw.length) return out;
  for (i = 0; i < raw.length && out.length < MAX_HOLIDAYS; i++) {
    var e = raw[i];
    if (!e || !e.date) continue;
    out.push({
      date: String(e.date),
      endDate: e.endDate ? String(e.endDate) : '',
      name: e.name ? String(e.name) : '',
      type: parseInt(e.type, 10) === 1 ? 1 : 0,
      followWeek: parseInt(e.followWeek, 10) || -1,
      followWeekday: parseInt(e.followWeekday, 10) || -1,
      custom: e.custom === true
    });
  }
  return out;
}

/* 命中返回条目，否则 null。ISO 字符串可直接比较（同长度同格式）。 */
function find(list, iso) {
  if (!list || !list.length || !iso) return null;
  var i;
  for (i = 0; i < list.length; i++) {
    var e = list[i];
    var last = e.endDate ? e.endDate : e.date;
    if (iso >= e.date && iso <= last) return e;
  }
  return null;
}

function isHoliday(list, iso) {
  var e = find(list, iso);
  return e !== null && e.type === 0;
}

function nameOf(list, iso) {
  var e = find(list, iso);
  if (!e) return '';
  if (e.type === 1) return '';
  return e.name;
}

export { MAX_HOLIDAYS, normalize, find, isHoliday, nameOf };
