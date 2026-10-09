/* ---------------------------------------------------------------------------
 * Lite 内核加载器（app.js —— 与页面各自独立享有 49,152 B 单文件配额）
 *
 * 为什么内核放在这里：真机 Lite 引擎对每个 .js 文件限长 49,152 B
 * （js_fwk_common.h:89 FILE_CONTENT_LENGTH_MAX = 1024*48），超限即硬拒绝、
 * 页面零执行。页面自身代码已接近该限额，故把全部 common 模块先在
 * app.js 顶层 import 并发布到 globalThis.NEXIO，页面只做取引用。
 * 实测：app.js 模块顶层先于页面模块顶层执行，页面顶层即可读到 NEXIO。
 * ------------------------------------------------------------------------- */
import * as store from './common/store.js';
import * as M from './common/model.js';
import * as D from './common/date.js';
import * as UI from './common/ui.js';
import * as SY from './common/sync.js';
import * as BLE from './common/ble.js';
import * as C from './common/const.js';
import { t } from './common/i18n.js';
import { ICON32 } from './common/icon.js';
/* 退出应用要用的官方接口（@system.app.d.ts:165 static terminate）。
   页面自己 import 会多一个模块，故统一在这里发布（m06685：“退出”曾经退化成回首页）。 */
import app from '@system.app';

globalThis.NEXIO = {
  store: store,
  M: M,
  D: D,
  UI: UI,
  SY: SY,
  BLE: BLE,
  t: t,
  ICON32: ICON32,
  app: app,
  WEEK_FULL: C.WEEK_FULL,
  WEEK_LONG: C.WEEK_LONG,
  MAX_COURSES: C.MAX_COURSES,
  HEAP_TIER_KB: C.HEAP_TIER_KB,
  VERSION: C.VERSION
};

export default {
  onCreate() {
    console.info('NexioWatch onCreate');
  },
  onDestroy() {
    console.info('NexioWatch onDestroy');
  }
};
