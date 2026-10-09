/*
 * NexioWatch - 文案 helper
 * 放在模块作用域而不是页面 data 上：文案是常量，不需要参与页面渲染观测，
 * 这样既省堆（不进页面的响应式 data），也避免 HML 里出现函数调用。
 * 页面在 refresh() 里把结果写进自己的 data 字段。
 */
import app from '@system.app';

var BUNDLES = {
  'zh-CN': {
    app_name: 'Nexio课程表',
    about_author: '原作者', about_author_v: 'Haooz',
    about_watch: '手表端', about_watch_v: '澪洛依',
    about_source: '数据来源', about_source_v: 'NexioSchedule 手机端',
    about_sync: '同步方式', about_sync_v: '局域网 · 无感同步',
    about_version: '手表版',
    synced_at: '已同步', not_synced: '未同步',
    btn_back: '返回', btn_exit: '退出', btn_exit_confirm: '确认退出', exit_tip: '再点一次退出',
    exit_failed: '本机不支持退出',
    btn_ok: '确定', btn_cancel: '取消',
    btn_refresh: '刷新', btn_week: '周', btn_info: 'i', btn_day: '今日', btn_sync: '同步',
    home_hint: '上滑今日课表 · 左滑关于',
    home_week_label: '本周', home_today: '今日课程', home_data: '数据', home_host: '同步地址',
    week_total: '共{n}周',
    home_next: '下一节',
    home_cached_week: '缓存为{n}，请重新同步',
    home_done_suffix: '节已完成',
    home_holiday_sub: '假期 · 今天不上课',
    home_no_data: '课表来自手机端同步',
    hint_dismiss_min: '{n} 分钟后下课', hint_dismiss_now: '即将下课',
    hint_start_min: '{n} 分钟后上课', hint_start_now: '即将开始',
    scroll_hint: '旋转表冠滚动',
    today_prefix: '今天是',
    week_label: '周课表', week_short: '第{n}周',
    whole_week: '整周课程',
    no_class: '无课',
    status_ongoing: '进行中', status_notstarted: '未开始', status_done: '已结束',
    next_class: '下节课',
    days: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    days_short: ['一', '二', '三', '四', '五', '六', '日']
  },
  'en-US': {
    app_name: 'Nexio Schedule',
    about_author: 'Author', about_author_v: 'Haooz',
    about_watch: 'Watch port', about_watch_v: 'LingLuoYi',
    about_source: 'Data source', about_source_v: 'NexioSchedule',
    about_sync: 'Sync mode', about_sync_v: 'LAN · automatic',
    about_version: 'Watch v',
    synced_at: 'Synced', not_synced: 'Not synced',
    btn_back: 'Back', btn_exit: 'Exit', btn_exit_confirm: 'Confirm', exit_tip: 'Tap again to exit',
    exit_failed: 'Exit unavailable',
    btn_ok: 'OK', btn_cancel: 'Cancel',
    btn_refresh: 'Refresh', btn_week: 'W', btn_info: 'i', btn_day: 'Today', btn_sync: 'Sync',
    home_hint: 'Up: today · Left: about',
    home_week_label: 'Week', home_today: 'Today', home_data: 'Data', home_host: 'Sync host',
    week_total: '{n} weeks',
    home_next: 'Next',
    home_cached_week: 'Cached {n}, re-sync',
    home_done_suffix: 'done',
    home_holiday_sub: 'Holiday · no class',
    home_no_data: 'Synced from phone',
    hint_dismiss_min: 'Ends in {n} min', hint_dismiss_now: 'Ending soon',
    hint_start_min: 'Starts in {n} min', hint_start_now: 'Starting soon',
    scroll_hint: 'Rotate crown to scroll',
    today_prefix: 'Today is',
    week_label: 'Week', week_short: 'W{n}',
    whole_week: 'Whole week',
    no_class: 'Free',
    status_ongoing: 'Now', status_notstarted: 'Later', status_done: 'Done',
    next_class: 'Next',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    days_short: ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  }
};

var lang = '';

function getLang() {
  if (lang) return lang;
  lang = 'zh-CN';
  try {
    var info = app.getInfo();
    if (info && info.language && String(info.language).indexOf('en') === 0) lang = 'en-US';
  } catch (e) {
    /* 取不到语言时用中文兜底 */
  }
  return lang;
}

function bundle() {
  var b = BUNDLES[getLang()];
  return b ? b : BUNDLES['zh-CN'];
}

function t(key, n) {
  var b = bundle();
  var v = b[key];
  if (v === undefined || v === null) return key;
  /* 注意：本引擎的 String.prototype.replace 不可用（调用即 TypeError），
     所以这里用 indexOf + substring 手工替换。 */
  var slot = v.indexOf('{n}');
  if (slot >= 0) {
    return v.substring(0, slot) + String(n === undefined ? '' : n) + v.substring(slot + 3);
  }
  return v;
}

function days() {
  return bundle().days;
}

function daysShort() {
  return bundle().days_short;
}

export { t, days, daysShort, getLang };
export default { t: t, days: days, daysShort: daysShort, getLang: getLang };
