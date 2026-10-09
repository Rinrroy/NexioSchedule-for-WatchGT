/* ---------------------------------------------------------------------------
 * Lite 内核加载器（app.js —— 与页面各自独立享有 49,152 B 单文件配额）
 *
 * 为什么内核放在这里：真机 Lite 引擎对每个 .js 文件限长 49,152 B
 * （js_fwk_common.h:89 FILE_CONTENT_LENGTH_MAX = 1024*48），超限即硬拒绝、
 * 页面零执行。页面自身代码已接近该限额，故把全部 common 模块先在 app.js
 * 顶层 import 并发布给页面，页面只做取引用。
 *
 * 为什么不再用 globalThis（m08330 真机黑屏根因）：
 *   引擎只在 #if (JSFWK_TEST == 1) 时才把 globalThis 挂到全局对象
 *   （frameworks/src/core/context/js_app_environment.cpp:85-89），而
 *   JSFWK_TEST=1 只定义在 targets/simulator/acelite_config.h:28-29 ⇒ 真机没有
 *   globalThis。旧写法 globalThis.NEXIO = {...} 会让 app.js 求值当场抛
 *   ReferenceError —— 表现就是「无 onCreate 日志、整屏黑、不重启」，而
 *   模拟器一切正常（模拟器定义了 JSFWK_TEST）。
 *   现在发布走 ViewModel 的 data 通道：runtime-core 的 ViewModel 在
 *   __appVing__ 为真（app 求值期）时直接 vm.data = data
 *   （runtime-core/src/core/index.js:80-84），而 AppDataModule 的全局函数
 *   getApp() 返回这个 app VM（modules/presets/app_data_module.cpp:45-68），
 *   页面因此读 getApp().data.NEXIO。引擎另把 app VM 挂在全局 $app 上
 *   （js_app_context.cpp:182-191），页面同时保留 $app.data 兜底。
 *   m09613 又删掉了 globalThis.NEXIO 兼容分支：那是给模拟器留的后路，真机上只会
 *   白建一个永远不被读取的全局属性。
 * ------------------------------------------------------------------------- */
import * as store from './common/store.js';
import * as M from './common/model.js';
import * as D from './common/date.js';
import * as UI from './common/ui.js';
import * as SY from './common/sync.js';
import * as C from './common/const.js';
import { t } from './common/i18n.js';
import { ICON32 } from './common/icon.js';
/* 退出应用要用的官方接口（@system.app.d.ts:165 static terminate）。
   页面自己 import 会多一个模块，故统一在这里发布（m06685：“退出”曾经退化成回首页）。 */
import app from '@system.app';

var NEXIO = {
  store: store,
  M: M,
  D: D,
  UI: UI,
  SY: SY,
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
  /* data 是 ViewModel 唯一会原样保留的自定义通道；getApp() 还要求 app VM 上
     有 data 属性，否则返回 undefined（app_data_module.cpp:55-59）。 */
  data: {
    NEXIO: NEXIO
  },
  onCreate() {
    console.info('NexioWatch onCreate');
  },
  onDestroy() {
    console.info('NexioWatch onDestroy');
  }
};
