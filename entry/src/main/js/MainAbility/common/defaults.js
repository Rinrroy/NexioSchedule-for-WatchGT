/*
 * defaults.js —— 出厂兜底（唯一定义处）
 *
 * 为什么存在：真机内存只有 512KB 档，手表端不再内置任何示例课表/假期，
 * 所有课程数据一律来自手机端同步（用户 m08330：「全部接受同步手机，以免内存溢出」）。
 * 但「作息时间表」必须有一份出厂值：
 *   store.refreshSectionTimes() → model.absSectionTimes(times, ...) → sectionTimes
 * 是首页/今日/详情/周课表全部时间文案（startText/endText/timeRange/statusOf）的唯一来源，
 * 表为空时所有时间位置会变成空字符串。手机端 WatchPayload 会下发 times 覆盖这份默认值，
 * 所以这里写的只是「同步完成前的占位」，不会与手机端的作息冲突。
 *
 * 另：之前的 seed.js 还牵着 12 门示例课与两个示例假期，已整体删除
 * （loadSeed 是内存溢出与「看到别的周课程」的源头）。
 */

/* 工厂默认设置：全空 —— 周次/总周数/开学日都等手机端同步下发。
   totalWeeks 给 18 只是为了让「第 N 周」不至于显示成 0/1 周的怪异值。 */
function settings() {
  return {
    currentWeek: 1,
    totalWeeks: 18,
    morningSections: 4,
    afternoonSections: 4,
    eveningSections: 3,
    scheduleName: '',
    reminderEnabled: false,
    termStart: ''
  };
}

/* 作息时间占位表（键为「第 N 节」字符串，值与手机端 WatchPayload.times 同构）。
   上午 4 节 / 下午 4 节 / 晚上 3 节，与 DEFAULT 设置里的节数一致。 */
function times() {
  return {
    morning: {
      '1': '08:00-08:45',
      '2': '08:55-09:40',
      '3': '10:00-10:45',
      '4': '10:55-11:40'
    },
    afternoon: {
      '1': '14:00-14:45',
      '2': '14:55-15:40',
      '3': '16:00-16:45',
      '4': '16:55-17:40'
    },
    evening: {
      '1': '18:30-19:15',
      '2': '19:25-20:10',
      '3': '20:30-21:15'
    }
  };
}

export { settings, times };
