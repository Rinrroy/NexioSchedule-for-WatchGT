/*
 * NexioWatch - 单页应用（唯一页面）
 *
 * 为什么所有界面都挤在一个页面里：本机 Lite Wearable 引擎的 @system.router 只有
 * replace/replaceUrl（没有 push/back/getLength/getParams），而且 replace 之后新页面是
 * 全新的 JS 上下文（实测 store 被重新播种、storage.get 失败、getParams 未定义），
 * 跨页传参不可行。于是整个应用改成：一个页面 + 一个内部视图状态机 + 一张全屏 canvas。
 * 好处：状态连续、点击可靠、也不存在“右滑固定返回”的语义歧义（没有页面栈）。
 *
 * 表端只读：课程数据只来自手机端的同步 / 导入，表端不提供任何“添加课程 / 编辑课程”入口，
 * 所有页面都是展示态（按 m02735 要求整体删除）。
 *
 * 操作逻辑（按 m04325 要求，仿华为自带“活动记录”）：
 *   首页 home = 大环 + 当前/下一节课状态，打开即看到“现在上什么课/下一节是什么”；
 *     上滑 -> 当日课表(today)，下滑 -> 周课表(week)，左滑 -> 关于(about)，右滑 -> 周课表(week)；
 *     左右上下四个方向之外的方向不动作；底部保留三枚快捷胶囊，便于点击直达。
 *   子页面：右滑 / 胶囊“返回” -> back()；表冠顺时针 forward 语义统一见 crownTurn()。
 *   过渡方向严格跟手：左滑/上滑一律 d=+1（新页自右/下方进入），右滑/下滑 d=-1（m06685）。
 *
 * 内存（按 m04325 要求）：只缓存“当前周”的课（store.dataWeek 标记数据归属周），
 * 手机端整学期课表在 sync.parse 里按周过滤后才入库，默认上限 MAX_COURSES 门
 * （common/const.js 定义）。设置页与作息页已按 m08330 整体删除，课表与作息只由手机端下发。
 *
 * 版式与动效依据：
 *  - ui-ux-pro-max / miuix：深色底 + 圆角卡片 + 单一强调色；正文 14-15px、次要 12-13px；
 *    主文字 #FFFFFF on #141416 对比度约 16:1，次要 #9A9AA0 约 5.6:1，均 >= 4.5:1。
 *  - harmonyos-development / huawei-lite-watch-development：8vp 网格；圆屏按适配分辨率留安全区
 *    （顶部标题行/底部按钮行单独内缩）；文字一律走统一入口：
 *    左对齐 UI.ltext、居中 UI.ctext、右对齐 rtext = 右边界 - UI.tw(text,size)。
 *    历史错位有三个根因，本轮都已修掉：
 *      (1) 把“已经算好居中用的 x”再交给 UI.ctext，于是整体左移半个字宽；
 *      (2) 右对齐/居中不再用 tw() 估算，改用引擎 textAlign（实测墨迹中心=fillText x）；
 *      (3) **本引擎 fillText(x, y) 的 y 是文本行顶部而不是基线**（实测墨迹从 y+3 开始、
 *          高度约等于字号），旧代码按“基线”给 y，于是 chip/卡片里的文字整体下沉约
 *          半个字高，看起来就是“文字和背景没对齐”。现在统一用 textY(中心, 字号) 换算。
 *  - 官方活动记录（活力三环）动效：环长 = 目标达成率；复杂动画档 300ms；
 *    标准曲线 cubic-bezier(0.40,0.00,0.20,1.00) 用 ui.ease() 的 33 点 LUT 逼近；
 *    Lite 无 requestAnimationFrame，补间用 setInterval 40ms（约 25FPS）。
 *  - 表冠：setMonitorForCrownEvents / clearMonitorForCrownEvents（ArkUI.Lite，@since 24，
 *    无需 import）。本机 typeof 探测为 function；真机是否有表冠未知，故一律 typeof 守卫。
 */
/* ---------------------------------------------------------------------------
 * 真机单文件硬闸：Lite 引擎对「每个 .js 文件」限长 49,152 B
 * （frameworks/src/core/base/js_fwk_common.h:89 FILE_CONTENT_LENGTH_MAX = 1024*48，
 *  超限时真机分支直接 return false → 页面零执行、整屏黑）。
 * app.js 与页面各自独立配额，故把 common 全部内核模块放在 app.js 顶层，
 * 经 app VM 的 data 通道发布给页面（app.js 的 export default.data.NEXIO）。
 * 本页不再 import 任何 common，页面 bundle 只含本页代码。
 * ------------------------------------------------------------------------- */
/* 内核取用（m08330 真机黑屏修复）：
 *   真机没有 globalThis —— 引擎只在 #if (JSFWK_TEST == 1) 时才把它挂到全局对象上
 *   （js_app_environment.cpp:85-89），而 JSFWK_TEST=1 只定义在模拟器的
 *   acelite_config.h:28-29。旧写法 var K = globalThis.NEXIO 在真机求值就抛
 *   ReferenceError，页面 eval 直接失败 → 整屏黑、连 onCreate 都不打。
 *   两条通道按可用性依次尝试：
 *     1) getApp()  —— AppDataModule 注册的全局函数（app_data_module.cpp:25-68），
 *        0 参调用返回 app VM；该实现要求 app VM 上有 data 属性，否则返回 undefined。
 *     2) $app      —— 引擎在 app 求值后挂到全局对象上（js_app_context.cpp:182-191）。
 *   globalThis 兜底已删（m09613）：真机本就没有它，模拟器也可由 $app 覆盖。
 *   getApp() 只在模块顶层调用一次并缓存：引擎注释警告每次调用都会动引用计数，
 *   反复调用会走到 ERR_REF_COUNT_LIMIT（JS REF LIMIT）。
 *   typeof 对未声明的标识符不抛错，这是下面这段能在真机跑完的关键。 */
var K = null;
try {
  if (typeof getApp === 'function') {
    var APP = getApp();
    if (APP && APP.data) K = APP.data.NEXIO;
  }
} catch (e) { K = null; }
if (!K) {
  try { if (typeof $app !== 'undefined' && $app && $app.data) K = $app.data.NEXIO; } catch (e2) { K = null; }
}
var store = K.store;
var M = K.M;
var D = K.D;
var UI = K.UI;
var SY = K.SY;
var t = K.t;
var ICON32 = K.ICON32;
var VERSION = K.VERSION;
var WEEK_FULL = K.WEEK_FULL;
var WEEK_LONG = K.WEEK_LONG;
var MAX_COURSES = K.MAX_COURSES;
var HEAP_TIER_KB = K.HEAP_TIER_KB;
/* 探针：页面 bundle 求值成功的唯一证据。若真机日志里连这条都没有，
   说明页面 JS 根本没被执行（49,152 B 闸或 eval 失败），而不是运行期问题。 */
console.info('NexioWatch page module ready');

var W = 454;
var H = 454;

/* 8vp 网格上的版式常量：卡片 22 起、列表行 56 起、行内边距 16 */
var CARD_X = 22;
var CARD_W = W - CARD_X * 2;   /* 410 */
var ROW_X = 56;
var ROW_W = W - ROW_X * 2;     /* 342 */
var ROW_PAD = 16;
var NAV_Y = 396;

/* 颜色令牌（禁止在绘制处散落魔数色值） */
var C_BG = '#000000';
var C_SURFACE = '#141416';
var C_SURFACE_HI = '#1A1A1C';
var C_ROW_TODAY = '#16171B';
var C_CHIP = '#1F1F23';
var C_TEXT = '#FFFFFF';
var C_TEXT2 = '#E6E6EA';
var C_DIM = '#9A9AA0';
var C_DIM2 = '#6E6E74';
var C_ACCENT = '#1D4ED8';
var C_GREEN = '#34C759';
var C_BLUE = '#64B5F6';
var C_AMBER = '#FFB300';
var C_ERR = '#FF8A80';
var C_RING_TRACK = '#26262B';

/* 手势阈值 */
var SWIPE_MIN = 40;      /* 横向位移小于该值按点击处理 */
var DRAG_STEP = 34;      /* 纵向拖拽多少像素滚动一行 */
var CROWN_STEP = 16;     /* 表冠每转 16 度算一档 */

/* 活动记录式小进度环几何（300ms 补间统一由 TWEEN_* 时钟驱动） */
var RING_CX = 74;
var RING_CY = 126;
var RING_R = 22;
var RING_LW = 6;

/* 首页大环（仿官方活动记录：环长 = 达成率） */
var HOME_RING_CX = 227;
var HOME_RING_CY = 150;
var HOME_RING_R = 60;
var HOME_RING_LW = 13;

/* 顶部一行左右各自内缩的安全距离：454x454 圆屏在 y=40 处的可视半宽约 131px，
   227±131 = [96, 358]，两侧内缩量相同 ⇒ 左右天然对称（m06685 反馈时间被裁）。 */
var HOME_SAFE_X = 96;

/* 周课表版式：七行必须整行落在圆屏内。454x454 圆心 (227,227) 半径 227，
   最末行底边 y=375 处的圆弦只有 [58,396]，所以行块左右各内缩 58（对称）；
   标题行下移到 y≈54 的弦 [93,361] 内——旧版 x=66 / 388 在 y=46 的弦 [90,364]
   之外，被圆屏切掉（m06685 反馈“周课表被裁、文字显示不全”）。 */
var WEEK_SAFE_X = 96;
var WEEK_ROW_X = 58;
var WEEK_ROW_W = W - WEEK_ROW_X * 2;   /* 338 */
var WEEK_ROW_Y0 = 92;
var WEEK_ROW_PITCH = 41;
var WEEK_ROW_H = 37;
var WEEK_TEXT_X = 64;    /* 周几左端 */
var WEEK_NAME_X = 96;    /* 课名左端 */
var WEEK_NAME_W = 235;   /* 课名最大宽度：日期列左端(378-35=343) 再留 12px 间隙 */
var WEEK_DATE_R = 382;   /* 日期右对齐：墨迹右端 378，仍在弦内 */

/* 一级页面顺序（表冠 / 左右滑动按此顺序前后翻页） */
var PAGE_ORDER = ['home', 'today', 'week', 'sync', 'about'];

/* 当日课表可见卡片数（其余靠表冠 / 竖向拖拽滚动） */
var TODAY_VISIBLE = 3;
var TODAY_PITCH = 76;
var TODAY_CARD_H = 72;

/* 页面过渡动画：官方“复杂动画”档 300ms（10 帧 x 30ms）+ 标准曲线 LUT。
   Lite 没有 translate/rAF，整屏平移靠 ui.js 的全局绘制偏移实现。 */
var TRANS_FRAMES = 10;
var TRANS_MS = 30;
/* 数值补间（环长 / 进度条 / 指示点）：与官方 300ms 档同源 */
var TWEEN_FRAMES = 10;
var TWEEN_MS = 30;
/* 动画时间预算（真机看门狗兜底，m09147）：定时器每帧的真实成本可能远大于 30ms，
   而本引擎的定时器是 C++ 侧串行派发（timer_module.cpp Task -> DispatchAsyncWork），
   积压回调会被一次性排空（async_task_manager.cpp Callback）。若只按帧数推进，
   慢机器上会把 300ms 拖成几十帧、几十次整屏重绘 —— 模拟器上表现为连续滑动卡死，
   真机上表现为看门狗软重启。因此改为按真实时间推进，并设硬上限必然收尾。 */
var TRANS_MS_TOTAL = TRANS_FRAMES * TRANS_MS;
var TRANS_MAX_MS = TRANS_MS_TOTAL + 180;
var TRANS_MAX_FRAMES = 16;
var TWEEN_MS_TOTAL = TWEEN_FRAMES * TWEEN_MS;
var TWEEN_MAX_MS = TWEEN_MS_TOTAL + 180;
var TWEEN_MAX_FRAMES = 16;

export default {
  /* 注意：本引擎里 this.data 是 undefined，HML 的 {{x}} 直接读页面对象自身的属性。
     重构后 HML 只剩一张 canvas，没有任何数据绑定，data 保留为空对象即可。 */
  data: {},

  onInit() {
    /* 探针：页面模块求值成功、onInit 被调用的唯一证据（见 app.js 顶部说明） */
    console.info('NexioWatch page onInit');
    this.drawLogged = '';
    this.drawRetry = 0;
    this.drawTimer = null;
    this.view = 'home';
    /* 视图栈：lite 没有页面栈，这里自己维护一份，保证任意层级都能逐级返回 */
    this.stack = [];
    this.aDate = '';
    this.week = 0;
    this.taps = [];
    this.detailCourse = null;
    this.tip = '';
    this.hostIdx = 0;
    this.swipeX = -1;
    this.swipeY = -1;
    this.dragY = -1;
    this.dragAcc = 0;
    this.didDrag = false;
    this.scrollTopRow = 0;
    this.scrollRows = 0;
    this.syncTried = false;
    this.crownAcc = 0;
    this.crownBound = false;
    this.ringA = 0;
    this.doneA = 0;
    this.barA = 0;
    this.tRing = -1;
    this.tDone = -1;
    this.tBar = -1;
    this.fRing = 0;
    this.fDone = 0;
    this.fBar = 0;
    /* 关于页“退出”的二次确认状态（m06685：返回与退出必须能区分） */
    this.exitArmed = false;
    this.tweenI = 0;
    this.tweenTimer = null;
    /* 页面切换过渡状态：animOn=true 时每帧同时画“旧页 + 新页” */
    this.animOn = false;
    this.animP = 0;
    this.animV = 'x';
    this.animDir = 1;
    this.animFrom = '';
    this.animI = 0;
    this.animTimer = null;
    /* canvas 上下文与字号都做缓存：getContext 每次都 BeginPath + acquire
       （canvas_component.cpp GetContext :325-328），字号是原生字符串属性，且单
       token 的 'NNpx' 一定会让引擎打一条 WARN（FontSetter :536-562）。两者原本
       每帧都发生 ⇒ 真机上是阻塞式日志 I/O（历史日志累计上万条）。 */
    this.ctx = null;
    this.fontKey = '';
    /* 过渡期间由 animateTo 指定“哪一页在绘制”，用于过滤另一页发起的补间请求 */
    this.drawViewName = 'home';
  },

  onShow() {
    var self = this;
    console.info('NexioWatch page onShow');
    this.aDate = D.todayISO();
    this.week = store.get().settings.currentWeek;
    this.view = 'home';
    this.exitArmed = false;
    this.stack = [];
    this.startCrown();
    /* 首次绘制：真机上 onShow 可能早于 canvas 节点就绪（$refs.cv 尚未挂上），
       此时 redraw() 会直接返回、屏幕永远不亮。这里改成带上限的重试，
       由 ensureDraw 负责，避免「能打开但一直黑屏」被系统当成无响应而拆掉应用。 */
    this.ensureDraw();
    store.load(function (ok) {
      console.info('NexioWatch store load ok=' + ok);
      if (!self.week) self.week = store.get().settings.currentWeek;
      self.redraw();
    });
    this.startTick();
    this.autoSync();
    console.info('NexioWatch onShow done');
    this.hbN = 0;
    /* 心跳（m11079 第二轮排障）：真机启动链已全部打通，接下来要定位「画出首页之后
       到被销毁之间」到底活了多久、死在哪个定时器。心跳 2s 一次、首条在 2s 后，
       真机日志里最后一条心跳的编号 = 存活秒数 / 2。 */
    this.hbTimer = setInterval(function () {
      self.hbN = self.hbN + 1;
      console.info('NexioWatch hb ' + self.hbN);
    }, 2000);
  },

  /* 引擎在 RenderPage() 完成后调用 onReady（js_page_state.js:52），此时 canvas 节点
     一定已经建好；把它作为首绘的第二次机会。 */
  onReady() {
    console.info('NexioWatch page onReady');
    this.ensureDraw();
  },

  onHide() {
    console.info('NexioWatch page onHide');
    this.stopDraw();
    this.stopHb();
    this.stopTick();
    this.stopAnim();
    this.stopTween();
    /* 丢掉缓存的画布上下文与字号：再次 onShow 时由 redraw 重新取一次 */
    this.ctx = null;
    this.fontKey = '';
  },
  onDestroy() {
    console.info('NexioWatch page onDestroy');
    this.stopDraw();
    this.stopHb();
    this.stopTick();
    this.stopAnim();
    this.stopTween();
    this.stopCrown();
    this.ctx = null;
    this.fontKey = '';
  },

  /* ---------------- 计时与同步 ---------------- */

  startTick() {
    if (this.timer) return;
    var self = this;
    this.timer = setInterval(function () {
      /* 首页与当日页都显示时钟与“当前课程状态”，需要定期重画 */
      if (!self.tickLogged) { self.tickLogged = true; console.info('NexioWatch tick fire'); }
      if (self.view === 'home' || self.view === 'today') self.redraw();
    }, 30000);
  },
  stopTick() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },
  stopHb() {
    if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = null; }
  },

  autoSync() {
    var self = this;
    var st = store.get();
    console.info('NexioWatch autoSync host=' + (st.syncHost ? st.syncHost : 'none'));
    if (!st.syncHost || this.syncTried) return;
    this.syncTried = true;
    SY.manualPull(store, function (ok, msg) {
      console.info('NexioWatch autoSync result ok=' + ok + ' ' + (msg ? msg : ''));
      self.redraw();
    });
  },

  /* ---------------- 表冠 ----------------
     ArkUI.Lite 的 setMonitorForCrownEvents(handler) 在 onShow 注册、销毁时
     clearMonitorForCrownEvents()；每页只允许一个监听器，禁止在 app.js 注册。
     event.degree 是度数、逆时针为正；回调返回 true 表示已消费、不再向下分发。 */
  startCrown() {
    if (this.crownBound) return;
    console.info('NexioWatch crown api=' + (typeof setMonitorForCrownEvents === 'function' ? 'yes' : 'no'));
    if (typeof setMonitorForCrownEvents !== 'function') return;
    var self = this;
    try {
      setMonitorForCrownEvents(function (ev) { return self.onCrown(ev); });
      this.crownBound = true;
    } catch (err) {
      this.crownBound = false;
    }
  },
  stopCrown() {
    if (!this.crownBound) return;
    try { clearMonitorForCrownEvents(); } catch (err) { /* ignore */ }
    this.crownBound = false;
  },
  onCrown(ev) {
    if (!this.crownFireLogged) { this.crownFireLogged = true; console.info('NexioWatch crown fire'); }
    if (this.animOn) return true;  /* 过渡中忽略表冠，避免叠帧 */
    var deg = 0;
    try {
      if (ev && typeof ev.degree === 'number') deg = ev.degree;
      else if (ev && typeof ev.angularVelocity === 'number') deg = ev.angularVelocity / 30;
    } catch (err) { deg = 0; }
    if (deg === 0) return false;
    this.crownAcc = this.crownAcc + deg;
    var guard = 0;
    /* 顺时针（degree 变小）向前翻，逆时针向后翻 */
    while (this.crownAcc <= -CROWN_STEP && guard < 12) { this.crownAcc = this.crownAcc + CROWN_STEP; this.crownTurn(1); guard++; }
    while (this.crownAcc >= CROWN_STEP && guard < 12) { this.crownAcc = this.crownAcc - CROWN_STEP; this.crownTurn(-1); guard++; }
    return true;
  },
  crownTurn(dir) {
    /* 首页：表冠上/下 = 前后换页（与官方活动记录一致的“转表冠翻页”） */
    if (this.view === 'home') {
      this.pageTurn(dir);
      return;
    }
    /* 当日课表：表冠滚动课程列表（超过 3 门时），与作息页共用 scrollTopRow */
    if (this.view === 'today' && this.scrollRows > 0) {
      var t = this.scrollTopRow + dir;
      if (t < 0) t = 0;
      if (t > this.scrollRows) t = this.scrollRows;
      if (t !== this.scrollTopRow) {
        this.scrollTopRow = t;
        this.redraw();
        return;
      }
      return;
    }
    /* 作息页已删除（m08330）：表冠在今日页只做滚行与换日 */
    if (this.view === 'today') { this.aDate = D.addDays(this.aDate, dir); this.redraw(); return; }
    /* 周课表只呈现“当前周”：不再支持换周查看（m06685 明确要求删掉查看功能） */
    /* 子页面：向前（右滑 / 表冠顺时针）等于返回，向后不动作 —— 与旧版已验证的
       右滑语义保持一致，左滑不动作以免误触退出 */
    if (dir > 0) this.back();
  },

  /* ---------------- 导航（内部视图，无页面栈） ---------------- */

  /* 进入下一层视图（纵向过渡：新页从下方推入）。backTo 传 '' 表示返回目标是首页。 */
  open(v, backTo, dir) {
    this.animateTo(v, dir === undefined ? 1 : (dir > 0 ? 1 : -1), 'y',
      backTo === undefined ? undefined : (backTo === '' ? 'home' : backTo));
  },
  /* 返回上一层（纵向过渡：上一页从上方向下压回）；栈空回首页 */
  back() {
    this.exitArmed = false;
    var v;
    if (!this.stack || !this.stack.length) {
      v = 'home';
    } else {
      v = this.stack.pop();
      if (!v) v = 'home';
    }
    this.beginAnim(v, this.view, -1, 'y');
  },
  /* 首页直接跳到某个一级页面（不叠加栈层，避免越点越深）；横向过渡 */
  jump(v, dir) {
    if (v === this.view) { this.stopAnim(); return; }
    var d = dir;
    if (d === undefined) {
      var cur = this.pageIndex();
      var to = PAGE_ORDER.indexOf(v);
      d = (cur >= 0 && to >= 0 && to < cur) ? -1 : 1;
    }
    /* 过渡方向跟手：左滑/往前翻 d=+1（新页从右侧进入），右滑/往回 d=-1 */
    this.stack = [];
    this.beginAnim(v, this.view, d > 0 ? 1 : -1, 'x');
  },
  /* 首页表冠 / 横向手势翻页：按右侧指示点的顺序在 7 个一级页面间前后移动 */
  pageTurn(dir) {
    var cur = this.pageIndex();
    var next = cur + dir;
    if (next < 0) next = PAGE_ORDER.length - 1;
    if (next >= PAGE_ORDER.length) next = 0;
    var v = PAGE_ORDER[next];
    if (v === 'home') {
      this.stack = [];
      this.beginAnim('home', this.view, dir, 'x');
      return;
    }
    this.stack = [];
    this.beginAnim(v, this.view, dir, 'x');
  },

  /* ---------------- 绘制入口 ---------------- */

  /* 首绘保证：canvas 节点没就绪时按 100ms 重试，最多 10 次（1s）。
     一次成功就不再重试；显式拿到引用后会由 redraw 自己置 drawLogged。 */
  ensureDraw() {
    var self = this;
    this.redraw();
    if (this.drawLogged) return;
    if (this.drawRetry >= 10) {
      console.info('NexioWatch ensureDraw gave up');
      return;
    }
    this.drawRetry = this.drawRetry + 1;
    this.drawTimer = setTimeout(function () {
      self.drawTimer = null;
      self.ensureDraw();
    }, 100);
  },
  /* 与 ensureDraw 成对：页面隐藏/销毁时停掉首绘重试（技能要求定时器必须有清理路径） */
  stopDraw() {
    if (this.drawTimer) { clearTimeout(this.drawTimer); this.drawTimer = null; }
  },

  redraw() {
    var refs = this.$refs;
    if (!refs || !refs.cv) return;
    /* 上下文只在首次（或失效后）取一次：过渡期每帧都要重画，而每次 getContext
       引擎都会 BeginPath + acquire（canvas_component.cpp:325-328）。 */
    if (!this.ctx) {
      try { this.ctx = refs.cv.getContext('2d'); } catch (e) { return; }
      if (!this.ctx) return;
      this.fontKey = '';
    }
    var ctx = this.ctx;
    /* 复用同一数组：每帧 new Array 会在 30s 定时器与过渡期里持续制造垃圾 */
    this.taps.length = 0;
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, W, H);
    /* 任何视图绘制异常都不允许留下纯黑画面：捕获后画出可返回的错误提示。
       这是“移植后不显示画面”这类问题的最后一道保险。 */
    try {
      if (this.animOn) {
        var e = UI.ease(this.animP);
        /* 先画进入页、再画离开页：离开页盖住它自己逐渐移出时露出的陈旧像素，
           而进入页的落点区域始终由它自己或背景占据，不会出现残影。 */
        UI.setOffset(this.animV === 'x' ? this.animDir * W * (1 - e) : 0,
                     this.animV === 'y' ? this.animDir * H * (1 - e) : 0);
        this.drawView(ctx, this.view);
        UI.setOffset(this.animV === 'x' ? -this.animDir * W * e : 0,
                     this.animV === 'y' ? -this.animDir * H * e : 0);
        this.drawView(ctx, this.animFrom);
        UI.setOffset(0, 0);
      } else {
        this.drawView(ctx, this.view);
      }
      /* 首帧绘制成功即留一条探针：崩溃若发生在首帧之后，日志里就有分界点 */
      if (!this.drawLogged) {
        this.drawLogged = this.view;
        console.info('NexioWatch first draw ' + this.view);
      }
    } catch (err) {
      /* 绘制异常多半是上下文失效：丢掉缓存，下一帧重新取一次再画错误页 */
      this.ctx = null;
      this.fontKey = '';
      console.info('NexioWatch drawError ' + (err && err.message ? err.message : err));
      this.drawError(ctx, err);
    }
  },

  drawView(ctx, v) {
    this.drawViewName = v;
    if (v === 'home') this.drawHome(ctx);
    else if (v === 'today') this.drawToday(ctx);
    else if (v === 'week') this.drawWeek(ctx);
    else if (v === 'detail') this.drawDetail(ctx);
    else if (v === 'sync') this.drawSync(ctx);
    else this.drawAbout(ctx);
  },

  drawError(ctx, err) {
    var msg = '';
    try { msg = err && err.message ? String(err.message) : String(err); } catch (e2) { msg = '未知错误'; }
    ctx.fillStyle = C_ERR;
    this.setFont(ctx, 17);
    UI.ctext(ctx, '页面渲染失败', W / 2, this.textY(180, 17), 17);
    ctx.fillStyle = C_DIM;
    this.setFont(ctx, 12);
    UI.ctext(ctx, UI.ellipsize(ctx, this.view + ': ' + msg, W - 80, 12), W / 2, this.textY(212, 12), 12);
    this.chip(ctx, t('btn_back'), W / 2 - 60, H - 110, 120, 40, true);
    this.reg(W / 2 - 60, H - 110, 120, 40, 'jump', 'home');
  },

  /* ---------------- 绘制原语 ---------------- */

  /* fillText 的 y 是文本行顶部：实测墨迹自 y+3 起、高度约等于字号，
     所以要让文字视觉中心落在 cy，应传 y = cy - size/2 - 3.5 */
  textY(cy, size) {
    return Math.round(cy - size * 0.5 - 3.5);
  },
  /* 行内文字的 y：给定行顶 y 与行高 h，视觉中心取行中心 */
  baseY(y, h, size) {
    return this.textY(y + h / 2, size);
  },

  /* 命中区要跟着过渡偏移一起移动，否则动画期间点击会落到错误的位置 */
  reg(x, y, w, h, act, arg) {
    /* 过渡期每帧要重画两页、各推一遍命中区（每帧几十个对象）。过渡中的点击本来
       就被 onTap 丢弃，这里干脆不登记，避免每帧产生一批短命对象。 */
    if (this.animOn) return;
    this.taps.push({ x: x + UI.offsetX(), y: y + UI.offsetY(), w: w, h: h, act: act, arg: arg });
  },

  chip(ctx, label, x, y, w, h, on) {
    ctx.fillStyle = on ? C_ACCENT : C_CHIP;
    UI.roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = C_TEXT;
    this.setFont(ctx, 13);
    UI.ctext(ctx, label, x + w / 2, this.textY(y + h / 2, 13), 13);
  },

  panel(ctx, x, y, w, h, color) {
    ctx.fillStyle = color ? color : C_SURFACE;
    UI.roundRect(ctx, x, y, w, h, 14);
  },

  /* 列表行：左标签 + 右值，两者各自按自身字号对齐到同一行中心 */
  row(ctx, x, y, w, h, label, value, opts) {
    var o = opts ? opts : {};
    var rad = o.rad === undefined ? 11 : o.rad;
    ctx.fillStyle = o.fill ? o.fill : C_SURFACE;
    UI.roundRect(ctx, x, y, w, h, rad);
    ctx.fillStyle = o.labelColor ? o.labelColor : C_TEXT2;
    this.setFont(ctx, 14);
    UI.ltext(ctx, label, x + ROW_PAD, this.baseY(y, h, 14));
    if (value !== undefined && value !== null && value !== '') {
      var vs = o.valueSize ? o.valueSize : 13;
      var shown = UI.ellipsize(ctx, value, w - ROW_PAD * 2 - UI.tw(label, 14) - 12, vs);
      this.rtext(ctx, shown, x + w - ROW_PAD, this.baseY(y, h, vs), vs, o.valueColor ? o.valueColor : C_DIM);
    }
  },

  /* 字号设置：用两个数字 token（'13px 13px'）让引擎的 GetSubFont(0)/(1) 都拿到可
     解析的字号 —— 单 token 的 'NNpx' 在 index=1 时必然解析失败，引擎会释放
     fontValue_ 并打一条 'get text font size or font family failed'
     （canvas_component.cpp FontSetter :536-562，真机上属阻塞式日志 I/O）。
     同尺寸重复赋值直接跳过：字号是原生字符串属性，每次赋值都要 malloc/ace_free。 */
  setFont(ctx, size) {
    var key = size + 'px ' + size + 'px';
    if (this.fontKey === key) return;
    this.fontKey = key;
    ctx.font = key;
  },

  /* 右对齐文本：交给引擎的 textAlign='right'（canvas_component.cpp:1274 DrawLabel
     用真实字形度量对齐，实测右端恒为 x-4）——比 right-tw() 估算精确，且不会越界。 */
  rtext(ctx, text, right, y, size, color) {
    ctx.fillStyle = color ? color : C_DIM;
    this.setFont(ctx, size);
    ctx.textAlign = 'right';
    ctx.fillText(String(text === undefined || text === null ? '' : text), Math.round(right) + UI.offsetX(), y + UI.offsetY());
    ctx.textAlign = 'left';
  },

  /* 居中文本（y 需要是 textY 的结果，避免调用方忘记换算） */
  ctext(ctx, text, cx, y, size, color) {
    ctx.fillStyle = color ? color : C_TEXT;
    this.setFont(ctx, size);
    UI.ctext(ctx, text, cx, y, size);
  },

  title(ctx, text, cy) {
    this.ctext(ctx, text, W / 2, this.textY(cy, 22), 22, C_TEXT);
  },

  subtitle(ctx, text, cy) {
    this.ctext(ctx, UI.ellipsize(ctx, text, W - 120, 12), W / 2, this.textY(cy, 12), 12, C_DIM);
  },

  /* 子页面统一的返回胶囊：默认走视图栈 back()，逐级返回不会迷路 */
  footerBack(ctx, label, act, arg) {
    /* y=396..436 的圆弦在 y=436 处收窄到 [90,364]，所以胶囊宽 108、居中即安全 */
    var w = 108;
    var x = W / 2 - w / 2;
    var txt = label ? label : t('btn_back');
    this.chip(ctx, txt, x, H - 58, w, 40, true);
    this.reg(x, H - 58, w, 40, act ? act : 'back', arg ? arg : 0);
  },

  /* 底部主导航：周课表 / 设置 / 关于。
     454x454 圆屏在胶囊垂直中心 y=414 处的可视区间只有 [72,382]，旧版三枚 64 宽
     胶囊横跨 [121,331] 虽然在内，但离边框只有 51px、视觉上贴边；改为 60 宽、
     中心间距 65（=±65），左端 108 / 右端 346，四边留白对称（m06685 反馈“右侧点
     没和边框对齐、左右不对称”）。 */
  nav(ctx) {
    /* 设置页已删除（m08330）：中间那枚改为「同步」。同步地址在这里改，
       删掉设置页后必须有入口，否则首次配对无处可去。 */
    var labels = [t('btn_week'), t('btn_sync'), t('btn_info')];
    var targets = ['week', 'sync', 'about'];
    var w = 60;
    var gap = 5;
    var x0 = (W - (w * 3 + gap * 2)) / 2;
    var i;
    for (i = 0; i < 3; i++) {
      var cx = x0 + i * (w + gap);
      this.chip(ctx, labels[i], cx, NAV_Y, w, 36, this.view === targets[i]);
      this.reg(cx, NAV_Y, w, 36, 'jump', targets[i]);
    }
  },

  clock() {
    var d = new Date();
    return D.pad2(d.getHours()) + ':' + D.pad2(d.getMinutes());
  },
  clockOf(ms) {
    var d = new Date(ms);
    return D.pad2(d.getHours()) + ':' + D.pad2(d.getMinutes());
  },
  syncLabel() {
    var st = store.get();
    return st.lastSync > 0 ? (t('synced_at') + ' ' + this.clockOf(st.lastSync)) : t('not_synced');
  },
  currentWeek() {
    var st = store.get();
    var w = this.week ? this.week : st.settings.currentWeek;
    return M.clamp(w, 1, st.settings.totalWeeks);
  },
  weekOf(iso) {
    var st = store.get();
    return st.settings.termStart ? store.weekOfDate(iso) : st.settings.currentWeek;
  },

  /* ---------------- 进度环（仿官方活动记录） ---------------- */

  /*
   * 补间引擎：一个 300ms 时钟同时驱动三个数值（环长 / 完成度 / 进度条），
   * 每帧按同一条官方标准曲线求值。任何时刻只有一个 setInterval 在跑。
   * 每个值各自记录 from/to，目标不变就不重启动画——避免过渡期间两页互相抢目标。
   */
  setScalar(name, target) {
    /* 过渡期间两页同时绘制，各自的目标会互相覆盖 → 冻结补间，落幕后由 stopAnim 的
       一次 redraw 重新取目标并跑完动画 */
    if (this.animOn) return;
    if (name === 'ring') {
      if (target === this.tRing) return;
      this.fRing = this.ringA; this.tRing = target;
    } else if (name === 'done') {
      if (target === this.tDone) return;
      this.fDone = this.doneA; this.tDone = target;
    } else {
      if (target === this.tBar) return;
      this.fBar = this.barA; this.tBar = target;
    }
    this.startTween();
  },
  startTween() {
    var self = this;
    if (this.tweenTimer) return;
    this.tweenI = 0;
    var t0 = new Date().getTime();
    this.tweenTimer = setInterval(function () {
      self.tweenI = self.tweenI + 1;
      /* 按真实时间推进 + 硬上限：慢机器上不会把 300ms 拖成几十帧 */
      var el = new Date().getTime() - t0;
      var p = el / TWEEN_MS_TOTAL;
      if (p > 1) p = 1;
      if (el >= TWEEN_MAX_MS || self.tweenI >= TWEEN_MAX_FRAMES) p = 1;
      var e = UI.ease(p);
      if (!self.tweenLogged) { self.tweenLogged = true; console.info('NexioWatch tween fire'); }
      self.ringA = self.fRing + (self.tRing - self.fRing) * e;
      self.doneA = self.fDone + (self.tDone - self.fDone) * e;
      self.barA = self.fBar + (self.tBar - self.fBar) * e;
      if (self.view === 'today' || self.view === 'home') self.redraw();
      if (p >= 1) {
        self.ringA = self.tRing;
        self.doneA = self.tDone;
        self.barA = self.tBar;
        self.stopTween();
        if (!self.tweenDoneLogged) { self.tweenDoneLogged = true; console.info('NexioWatch tween done'); }
      }
    }, TWEEN_MS);
  },
  stopTween() {
    if (this.tweenTimer) { clearInterval(this.tweenTimer); this.tweenTimer = null; }
  },
  /* ---------------- 页面过渡动画 ----------------
     官方活动记录翻页是整屏平移，Lite 没有 translate/动画帧回调，
     所以用 ui.js 的全局绘制偏移：每帧先把“旧页”画在 -dir*kW 处，
     再把“新页”画在 dir*(W-kW) 处，两页共用同一张画布。
     注意绘制顺序是“先画进入页、后画离开页”：离开页会盖住进入页露出的
     陈旧像素，但离开页自身是逐渐移出屏幕的，不会挡住最终画面。 */

  animateTo(v, dir, axis, backTo) {
    if (v === this.view && axis !== 'x') { return; }
    var from = this.view;
    if (backTo === undefined) this.stack.push(from === 'home' ? 'home' : from);
    else this.stack.push(backTo === '' ? 'home' : backTo);
    this.beginAnim(v, from, dir, axis);
  },
  beginAnim(v, from, dir, axis) {
    var self = this;
    this.stopTween();
    this.animOn = true;
    this.animV = axis;
    this.animDir = dir;
    this.animFrom = from;
    this.view = v;
    this.tip = '';
    this.scrollTopRow = 0;
    this.scrollRows = 0;
    this.animI = 0;
    this.animP = 0;
    if (this.animTimer) { clearInterval(this.animTimer); this.animTimer = null; }
    var t0 = new Date().getTime();
    this.redraw();
    this.animTimer = setInterval(function () {
      self.animI = self.animI + 1;
      /* 按真实时间推进 + 硬上限：定时器积压时 10 帧会被排成几十帧，每帧两次
         整屏绘制，真机看门狗会判定卡死并软重启（m09147） */
      if (!self.animFireLogged) { self.animFireLogged = true; console.info('NexioWatch anim fire'); }
      var el = new Date().getTime() - t0;
      var p = el / TRANS_MS_TOTAL;
      if (p > 1) p = 1;
      if (el >= TRANS_MAX_MS || self.animI >= TRANS_MAX_FRAMES) p = 1;
      self.animP = p;
      self.redraw();
      if (p >= 1) self.stopAnim();
    }, TRANS_MS);
  },
  stopAnim() {
    if (this.animTimer) { clearInterval(this.animTimer); this.animTimer = null; }
    this.animOn = false;
    this.animP = 0;
    UI.setOffset(0, 0);
    this.redraw();
  },

  /* ---------------- 首页（活动记录式） ----------------
     信息层次（自上而下，全部左右对称居中）：顶部日期行（左右同内缩）→ 大环（今日
     完成度）→ 当前课/下一节大字 + 时间地点 + 剩余时间 → 已上进度条 → 手势提示 →
     三行信息行（本周 / 今日课程 / 数据与同步方式）→ 底部三枚胶囊。
     官方活动记录右侧那一列页面点已按 m06685 反馈删除（未与圆屏边框对齐）。 */

  drawHome(ctx) {
    var st = store.get();
    /* 首页不可滚动：清掉上一屏（今日课表）可能留下的滚动状态 */
    this.scrollRows = 0;
    this.scrollTopRow = 0;
    var dow = D.isoWeekday(this.aDate);
    var week = this.weekOf(this.aDate);
    var holiday = store.holidayName(this.aDate);

    /* 顶部一行：左右各内缩同一个 HOME_SAFE_X（圆屏 y=40 处的可视半宽），左右完全对称；
       右对齐交给引擎的 textAlign='right'——旧实现用 tw() 估算宽度，含拉丁字符时会偏，
       正是 m06685 说的“时间被裁 / 不是对称关系”。 */
    ctx.fillStyle = C_TEXT;
    this.setFont(ctx, 17);
    UI.ltext(ctx, t('today_prefix') + WEEK_FULL[dow - 1], HOME_SAFE_X, this.textY(44, 17));
    this.rtext(ctx, this.clock(), W - HOME_SAFE_X, this.textY(44, 15), 15, C_DIM);

    var list = holiday ? [] : M.coursesOfDay(st.courses, dow, week);
    var total = list.length;
    var done = 0;
    var i;
    for (i = 0; i < total; i++) {
      if (UI.statusOf(this.aDate, st.sectionTimes, list[i].startSection, list[i].endSection).key === 'done') done++;
    }
    var nn = total > 0 ? M.nowAndNextIn(list, st.sectionTimes, D.nowMinutes()) : { current: null, next: null };
    var cur = nn.current;

    /* 环中心显示“已结束 N 门”，所以环长与中心数字共用同一条达成率，
       数字本身也走补间——官方活动记录里大环与中心数字是同步生长的。 */
    var pct = total > 0 ? done / total : 0;
    var curPct = UI.curPctOf(st, cur);
    this.setScalar('ring', pct);
    this.setScalar('done', done);
    this.setScalar('bar', curPct);
    var ringColor = (total > 0 && done >= total) ? C_GREEN : C_BLUE;
    UI.drawRing(ctx, HOME_RING_CX, HOME_RING_CY, HOME_RING_R, HOME_RING_LW, this.ringA, ringColor);

    ctx.fillStyle = C_TEXT;
    this.setFont(ctx, 26);
    var doneShown = Math.round(this.doneA);
    if (doneShown > done) doneShown = done;
    if (doneShown < 0) doneShown = 0;
    UI.ctext(ctx, total > 0 ? (doneShown + '/' + total) : '—', HOME_RING_CX, this.textY(HOME_RING_CY - 8, 26), 26);
    this.ctext(ctx, total > 0 ? t('home_done_suffix') : t('no_class'), HOME_RING_CX, this.textY(HOME_RING_CY + 20, 11), 11, C_DIM);

    var head = '';
    var sub = '';
    var hint = '';
    var hintColor = C_BLUE;
    if (holiday) {
      head = holiday;
      sub = t('home_holiday_sub');
      hintColor = C_AMBER;
    } else if (nn.current) {
      head = nn.current.name;
      sub = UI.timeRange(st.sectionTimes, nn.current.startSection, nn.current.endSection);
      if (nn.current.location) sub = sub + ' · ' + nn.current.location;
      var left = D.hhmmToMinutes(UI.endText(st.sectionTimes, nn.current.endSection)) - D.nowMinutes();
      hint = left > 0 ? t('hint_dismiss_min', left) : t('hint_dismiss_now');
      hintColor = C_GREEN;
    } else if (nn.next) {
      head = nn.next.name;
      sub = UI.timeRange(st.sectionTimes, nn.next.startSection, nn.next.endSection);
      if (nn.next.location) sub = sub + ' · ' + nn.next.location;
      var wait = D.hhmmToMinutes(UI.startText(st.sectionTimes, nn.next.startSection)) - D.nowMinutes();
      hint = wait > 0 ? t('hint_start_min', wait) : t('hint_start_now');
      hintColor = C_BLUE;
    } else {
      head = t('no_class');
      sub = t('home_no_data');
    }

    this.ctext(ctx, UI.ellipsize(ctx, head, W - 120, 21), W / 2, this.textY(232, 21), 21, C_TEXT);
    if (sub) this.ctext(ctx, UI.ellipsize(ctx, sub, W - 120, 13), W / 2, this.textY(254, 13), 13, C_DIM);
    if (hint) this.ctext(ctx, hint, W / 2, this.textY(272, 14), 14, hintColor);
    /* 当前课“已上多久”的细进度条：把圆环那套 300ms 补间复用到进度条上 */
    if (cur && this.barA > 0.002) {
      var barW = 200;
      var barX = W / 2 - barW / 2;
      ctx.fillStyle = C_RING_TRACK;
      UI.roundRect(ctx, barX, 286, barW, 4, 2);
      ctx.fillStyle = C_GREEN;
      UI.roundRect(ctx, barX, 286, Math.round(barW * this.barA), 4, 2);
    }

    /* 同一行位置复用：有提示（如「退出不可用」）时显示提示，否则显示手势提示 ——
       beginAnim 会清 tip，所以提示必须在跳转之后再置位（doExit 即如此）。 */
    if (this.tip) this.ctext(ctx, this.tip, W / 2, this.textY(294, 11), 11, C_ERR);
    else this.ctext(ctx, t('home_hint'), W / 2, this.textY(294, 11), 11, C_DIM2);

    /* 信息行（m06685：主页信息更丰富）：周次 / 今日课程 / 下一节 / 数据，
       四行都走同一个 row()，左右内缩一致 ⇒ 与上方环、下方胶囊同轴。
       行高 20、间距 22，四行占 303..389；行内文字中心最靠下的是第四行 y=379，
       该高度圆弦约 [58,396]，文字实际范围 [72,382] 落在弦内（m06685：不能被圆屏切）。 */
    var totalWeeks = st.settings.totalWeeks;
    var firstStart = total > 0 ? UI.startText(st.sectionTimes, list[0].startSection) : '';
    var todayText = total > 0 ? (total + ' 节' + (firstStart ? ' · ' + firstStart + ' 起' : '')) : t('no_class');
    var nextText = t('no_class');
    if (holiday) nextText = t('home_holiday_sub');
    else if (nn.current) nextText = t('status_ongoing') + ' · ' + UI.timeRange(st.sectionTimes, nn.current.startSection, nn.current.endSection);
    else if (nn.next) nextText = UI.startText(st.sectionTimes, nn.next.startSection) + ' · ' + nn.next.name;
    var fresh = store.dataIsCurrentWeek();
    var dataText = fresh ? (this.syncLabel() + (st.syncHost ? ' · ' + store.syncHostLabel() : ''))
                         : t('home_cached_week', store.dataWeekLabel());
    var panelRows = [
      [t('home_week_label'), t('week_short', week) + ' · ' + t('week_total', totalWeeks)],
      [t('home_today'), todayText],
      [t('home_next'), nextText],
      [t('home_data'), dataText]
    ];
    for (i = 0; i < panelRows.length; i++) {
      this.row(ctx, ROW_X, 303 + i * 22, ROW_W, 20, panelRows[i][0], panelRows[i][1],
        { rad: 9, valueColor: (i === 3 && !fresh) ? C_AMBER : C_DIM });
    }

    /* 与子页 nav() 完全同轴（宽 60 / 间距 5 / 中心 162.5·227·291.5），
       这样首页胶囊和子页胶囊在同一视觉列上（m06685：左右要对称） */
    var labels = [t('btn_day'), t('btn_week'), t('btn_info')];
    var targets = ['today', 'week', 'about'];
    var w = 60;
    var gap = 5;
    var x0 = (W - (w * 3 + gap * 2)) / 2;
    for (i = 0; i < 3; i++) {
      var cx = x0 + i * (w + gap);
      this.chip(ctx, labels[i], cx, NAV_Y, w, 36, false);
      this.reg(cx, NAV_Y, w, 36, 'jump', targets[i]);
    }
  },

  /* ---------------- 今日 ---------------- */

  drawToday(ctx) {
    var st = store.get();
    var dow = D.isoWeekday(this.aDate);
    var week = this.weekOf(this.aDate);
    var holiday = store.holidayName(this.aDate);

    /* 顶部两行按圆屏安全区内缩（y<100 处圆弦只有 230 左右宽） */
    ctx.fillStyle = C_TEXT;
    this.setFont(ctx, 19);
    UI.ltext(ctx, t('today_prefix') + WEEK_FULL[dow - 1], 104, this.textY(46, 19));
    this.rtext(ctx, this.clock(), 350, this.textY(46, 15), 15, C_DIM);

    this.chip(ctx, '<', 72, 68, 34, 28, false);
    this.reg(72, 68, 34, 28, 'day', -1);
    this.chip(ctx, '>', 348, 68, 34, 28, false);
    this.reg(348, 68, 34, 28, 'day', 1);
    this.ctext(ctx, D.fmtLong(this.aDate, 'zh-CN'), W / 2, this.textY(82, 17), 17, C_TEXT);

    var list = holiday ? [] : M.coursesOfDay(st.courses, dow, week);
    var total = list.length;
    var done = 0;
    var i;
    for (i = 0; i < total; i++) {
      if (UI.statusOf(this.aDate, st.sectionTimes, list[i].startSection, list[i].endSection).key === 'done') done++;
    }
    var pct = total > 0 ? done / total : 0;
    /* 目标变了就重起一轮补间（统一时钟），避免切日期时环长停在上一屏的值 */
    this.setScalar('ring', pct);
    this.setScalar('done', done);
    /* 课程超过可见条数时，列表可滚动（表冠或竖向拖拽），与作息页共用 scrollTopRow */
    this.scrollRows = total > TODAY_VISIBLE ? total - TODAY_VISIBLE : 0;
    if (this.scrollTopRow > this.scrollRows) this.scrollTopRow = this.scrollRows;
    if (this.scrollTopRow < 0) this.scrollTopRow = 0;

    UI.drawRing(ctx, RING_CX, RING_CY, RING_R, RING_LW, this.ringA, (total > 0 && done >= total) ? C_GREEN : C_BLUE);
    var doneShown2 = Math.round(this.doneA);
    if (doneShown2 > done) doneShown2 = done;
    if (doneShown2 < 0) doneShown2 = 0;
    this.ctext(ctx, total > 0 ? (doneShown2 + '/' + total) : '—', RING_CX, this.textY(RING_CY, 13), 13, C_TEXT);

    ctx.fillStyle = C_GREEN;
    this.setFont(ctx, 12);
    UI.ltext(ctx, t('week_short', week) + ' · ' + this.syncLabel(), 108, this.textY(118, 12));
    ctx.fillStyle = C_TEXT2;
    this.setFont(ctx, 13);
    UI.ltext(ctx, total > 0 ? ('今日课程 ' + done + ' / ' + total + ' 节已完成') : t('no_class'), 108, this.textY(140, 13));
    /* 环区热区原来跳设置页；设置页已删除（m08330），改为跳同步页（数据只来自手机同步） */
    this.reg(40, 98, 254, 56, 'open', 'sync');
    this.chip(ctx, t('btn_refresh'), 314, 111, 84, 30, true);
    this.reg(314, 111, 84, 30, 'sync', 0);

    var y = 156;
    if (holiday) {
      this.panel(ctx, CARD_X, y, CARD_W, 76, C_SURFACE_HI);
      this.ctext(ctx, holiday, W / 2, this.textY(y + 28, 20), 20, C_AMBER);
      this.ctext(ctx, t('no_class'), W / 2, this.textY(y + 54, 14), 14, '#8A8A90');
    } else if (!total) {
      this.panel(ctx, CARD_X, y, CARD_W, 76, C_SURFACE);
      this.ctext(ctx, t('no_class'), W / 2, this.textY(y + 28, 18), 18, C_DIM);
      this.ctext(ctx, t('home_no_data'), W / 2, this.textY(y + 54, 13), 13, C_BLUE);
    } else {
      for (i = this.scrollTopRow; i < total && i < this.scrollTopRow + TODAY_VISIBLE; i++) {
        this.drawCourseCard(ctx, st, list[i], y + (i - this.scrollTopRow) * TODAY_PITCH, TODAY_CARD_H);
      }
      if (this.scrollRows > 0) {
        var trackH = TODAY_VISIBLE * TODAY_PITCH - (TODAY_PITCH - TODAY_CARD_H);
        var trackY = y;
        ctx.fillStyle = '#2A2A2E';
        UI.roundRect(ctx, W - 30, trackY, 3, trackH, 2);
        var thumbH = Math.round(trackH * TODAY_VISIBLE / total);
        var span = trackH - thumbH;
        var ratio = this.scrollTopRow / this.scrollRows;
        ctx.fillStyle = '#5A5A62';
        UI.roundRect(ctx, W - 30, trackY + Math.round(span * ratio), 3, thumbH, 2);
        this.ctext(ctx, t('scroll_hint'), W / 2, this.textY(386, 10), 10, C_DIM2);
      }
    }

    this.nav(ctx);
  },

  /* 课程卡：名称/时间、副标题/状态、提示行三行；左右内边距都是 18 */
  drawCourseCard(ctx, st, c, cy, h) {
    var left = CARD_X + 18;
    var right = CARD_X + CARD_W - 18;
    ctx.fillStyle = UI.hexA(c.color, 0.18);
    UI.roundRect(ctx, CARD_X, cy, CARD_W, h, 14);
    ctx.fillStyle = c.color;
    UI.rect(ctx, CARD_X, cy + 10, 4, h - 20);

    var range = UI.timeRange(st.sectionTimes, c.startSection, c.endSection);
    var stat = UI.statusOf(this.aDate, st.sectionTimes, c.startSection, c.endSection);
    var label = '';
    if (stat.key === 'ongoing') label = t('status_ongoing');
    else if (stat.key === 'notstarted') label = t('status_notstarted');
    else if (stat.key === 'done') label = t('status_done');

    var hint = '';
    if (stat.key === 'ongoing') {
      var remain = D.hhmmToMinutes(UI.endText(st.sectionTimes, c.endSection)) - D.nowMinutes();
      hint = remain > 0 ? (remain + ' 分钟后结束') : '';
    } else if (stat.key === 'notstarted') {
      var wait = D.hhmmToMinutes(UI.startText(st.sectionTimes, c.startSection)) - D.nowMinutes();
      hint = wait > 0 ? (wait + ' 分钟后开始') : '';
    }

    /* 三行时整块居中（行心 16/40/63），只有两行时重新居中（行心 27/52） */
    var c1 = hint ? 16 : 27;
    var c2 = hint ? 40 : 52;
    var c3 = 63;

    var name = UI.ellipsize(ctx, c.name, CARD_W - 40 - UI.tw(range, 15), 19);
    ctx.fillStyle = C_TEXT;
    this.setFont(ctx, 19);
    UI.ltext(ctx, name, left, this.textY(cy + c1, 19));
    this.rtext(ctx, range, right, this.textY(cy + c1, 15), 15, C_TEXT2);

    var sub = UI.sectionsText(c.startSection, c.endSection);
    if (c.location) sub = sub + ' · ' + c.location;
    if (c.teacher) sub = sub + ' · ' + c.teacher;
    /* 状态改为半透明状态胶囊：比裸灰字更容易一眼分辨“进行中/已结束” */
    var chipW = UI.tw(label, 12) + 16;
    ctx.fillStyle = UI.hexA(stat.color, 0.18);
    UI.roundRect(ctx, right - chipW, cy + c2 - 10, chipW, 20, 10);
    ctx.fillStyle = stat.color;
    this.setFont(ctx, 12);
    UI.ctext(ctx, label, right - chipW / 2, this.textY(cy + c2, 12), 12);

    var subMax = CARD_W - 40 - chipW - 12;
    ctx.fillStyle = C_DIM;
    this.setFont(ctx, 13);
    UI.ltext(ctx, UI.ellipsize(ctx, sub, subMax, 13), left, this.textY(cy + c2, 13));
    /* 进行中的课多一条“已上多久”的进度条，复用圆环那套补间数值 */
    if (stat.key === 'ongoing') {
      this.setScalar('bar', UI.curPctOf(st, c));
      ctx.fillStyle = C_RING_TRACK;
      UI.roundRect(ctx, left, cy + h - 12, right - left, 3, 1);
      ctx.fillStyle = c.color;
      UI.roundRect(ctx, left, cy + h - 12, Math.round((right - left) * this.barA), 3, 1);
    }

    if (hint) {
      ctx.fillStyle = stat.key === 'ongoing' ? C_AMBER : C_BLUE;
      this.setFont(ctx, 14);
      UI.ltext(ctx, hint, left, this.textY(cy + c3, 14));
    }
    this.reg(CARD_X, cy, CARD_W, h, 'openCourse', c.id);
  },

  /* ---------------- 周课表 ---------------- */

  drawWeek(ctx) {
    var st = store.get();
    var week = this.currentWeek();
    ctx.fillStyle = C_TEXT;
    this.setFont(ctx, 21);
    UI.ltext(ctx, t('week_label'), WEEK_SAFE_X, this.textY(54, 21));
    this.rtext(ctx, t('week_short', week), W - WEEK_SAFE_X, this.textY(54, 15), 15, '#C8C8CE');

    var start = st.settings.termStart ? store.dateOfWeekday(week, 1) : '';
    var end = st.settings.termStart ? store.dateOfWeekday(week, 7) : '';
    var rangeText = (start && end) ? (D.fmtMonthDay(start) + ' - ' + D.fmtMonthDay(end)) : '同步后显示日期';
    this.ctext(ctx, rangeText, W / 2, this.textY(80, 16), 16, (start && end) ? C_TEXT2 : C_AMBER);


    var todayISO = D.todayISO();
    var i;
    for (i = 1; i <= 7; i++) {
      var iso = st.settings.termStart ? store.dateOfWeekday(week, i) : '';
      var hol = iso ? store.holidayName(iso) : '';
      var list = (hol || !iso) ? [] : M.coursesOfDay(st.courses, i, week);
      var isToday = iso && iso === todayISO;
      var y = WEEK_ROW_Y0 + (i - 1) * WEEK_ROW_PITCH;
      var rowH = WEEK_ROW_H;
      if (isToday) {
        ctx.fillStyle = C_ROW_TODAY;
        UI.roundRect(ctx, WEEK_ROW_X, y, WEEK_ROW_W, rowH, 10);
      }
      var cy = y + rowH / 2;
      ctx.fillStyle = isToday ? C_TEXT : (i > 5 ? '#8A8A90' : C_TEXT2);
      this.setFont(ctx, 15);
      UI.ltext(ctx, WEEK_LONG[i - 1], WEEK_TEXT_X, this.textY(cy, 15));
      var text = '';
      var color = C_DIM2;
      if (hol) { text = hol; color = C_AMBER; }
      else if (!list.length) { text = t('no_class'); }
      else {
        var parts = [];
        var k;
        for (k = 0; k < list.length && k < 2; k++) {
          var s = UI.startText(st.sectionTimes, list[k].startSection);
          /* 只有第一门课带开课时间：一行放不下「课名+时间 · 课名+时间」，
             但两门课的名字都要保留（m06685：行内文字不能压到右侧日期列）。
             超宽部分交给 ellipsize 截断。 */
          parts.push(list[k].name + ((k === 0 && s) ? ' ' + s : ''));
        }
        text = parts.join(' · ');
        color = C_TEXT;
      }
      ctx.fillStyle = color;
      this.setFont(ctx, 13);
      UI.ltext(ctx, UI.ellipsize(ctx, text, WEEK_NAME_W, 13), WEEK_NAME_X, this.textY(cy, 13));
      if (iso) {
        this.rtext(ctx, D.fmtShort(iso), WEEK_DATE_R, this.textY(cy, 13), 13, isToday ? C_GREEN : C_DIM2);
      }
      /* 行不可点（m06685「不需要查看功能」）：周课表只读呈现，不再跳今日课表。 */
    }
    this.footerBack(ctx, t('btn_back'), 'back', 0);
  },

  /* ---------------- 课程详情（只读） ---------------- */

  drawDetail(ctx) {
    var st = store.get();
    var c = this.detailCourse ? this.detailCourse : null;
    if (!c) {
      this.ctext(ctx, '课程不存在', W / 2, this.textY(H / 2, 18), 18, C_DIM);
      this.footerBack(ctx, t('btn_back'), 'back', 0);
      return;
    }
    this.panel(ctx, ROW_X, 40, ROW_W, 116, C_SURFACE_HI);
    ctx.fillStyle = c.color;
    UI.roundRect(ctx, W / 2 - 20, 56, 40, 4, 2);
    this.ctext(ctx, UI.ellipsize(ctx, c.name, ROW_W - 40, 21), W / 2, this.textY(96, 21), 21, C_TEXT);
    this.ctext(ctx, M.weeksText(c) + ' · ' + WEEK_LONG[c.dayOfWeek - 1], W / 2, this.textY(122, 13), 13, C_DIM);
    var stat = UI.statusOf(store.dateOfWeekday(this.currentWeek(), c.dayOfWeek), st.sectionTimes, c.startSection, c.endSection);
    var stLabel = '';
    if (stat.key === 'ongoing') stLabel = t('status_ongoing');
    else if (stat.key === 'notstarted') stLabel = t('status_notstarted');
    else stLabel = t('status_done');
    this.ctext(ctx, stLabel, W / 2, this.textY(144, 13), 13, stat.color);

    var rows = [
      ['时间', UI.timeRange(st.sectionTimes, c.startSection, c.endSection)],
      ['节次', UI.sectionsText(c.startSection, c.endSection)],
      ['地点', c.location ? c.location : '未填写'],
      ['教师', c.teacher ? c.teacher : '未填写']
    ];
    var i;
    for (i = 0; i < rows.length; i++) {
      var y = 172 + i * 40;
      ctx.fillStyle = C_SURFACE;
      UI.roundRect(ctx, ROW_X, y, ROW_W, 34, 9);
      ctx.fillStyle = '#75757C';
      this.setFont(ctx, 13);
      UI.ltext(ctx, rows[i][0], ROW_X + ROW_PAD, this.baseY(y, 34, 13));
      var shown = UI.ellipsize(ctx, rows[i][1], ROW_W - 104, 14);
      ctx.fillStyle = C_TEXT2;
      this.setFont(ctx, 14);
      UI.ltext(ctx, shown, ROW_X + 88, this.baseY(y, 34, 14));
    }
    if (this.tip) {
      this.ctext(ctx, this.tip, W / 2, this.textY(344, 13), 13, C_ERR);
    }
    this.footerBack(ctx, t('btn_back'), 'back', 0);
  },

  /* ---------------- 同步 ---------------- */

  drawSync(ctx) {
    var st = store.get();
    this.title(ctx, '同步', 46);
    this.subtitle(ctx, st.courses.length + ' 门课 · 来源 ' + st.source, 68);
    /* 只剩局域网一条通道（m09613）：蓝牙发现手机端、导入/导出内部文件三行已删。
       「恢复示例数据」更早已删（m08330）——表端只读，数据只来自手机同步。 */
    var items = [
      ['同步地址', store.syncHostLabel() || '未设置'],
      ['立即同步', this.syncLabel()]
    ];
    var acts = ['editHost', 'syncNow'];
    var i;
    for (i = 0; i < items.length; i++) {
      var y = 128 + i * 50;
      this.row(ctx, ROW_X, y, ROW_W, 44, items[i][0], items[i][1]);
      this.reg(ROW_X, y, ROW_W, 44, acts[i], 0);
    }
    this.ctext(ctx, '仅通过局域网从手机端同步', W / 2, this.textY(254, 12), 12, C_DIM);
    var msg = this.tip ? this.tip : (st.syncError ? st.syncError : '');
    if (msg) {
      this.ctext(ctx, UI.ellipsize(ctx, msg, W - 120, 13), W / 2, this.textY(324, 13), 13, '#7BD389');
    }
    if (st.courses.length >= MAX_COURSES) {
      this.ctext(ctx, '已达课程上限 ' + MAX_COURSES + ' 门', W / 2, this.textY(346, 12), 12, C_AMBER);
    }
    this.footerBack(ctx, t('btn_back'), 'back', 0);
  },

  /* ---------------- 关于 ---------------- */

  drawAbout(ctx) {
    var st = store.get();
    /* 原项目 NexioSchedule 图标（32x32 点阵，居中） */
    UI.drawIcon(ctx, ICON32, W / 2 - 16, 42);
    this.ctext(ctx, t('app_name'), W / 2, this.textY(112, 23), 23, C_TEXT);
    this.ctext(ctx, t('about_version') + ' ' + VERSION + ' · ' + HEAP_TIER_KB + 'KB', W / 2, this.textY(134, 12), 12, C_DIM);

    this.panel(ctx, ROW_X, 152, ROW_W, 132, C_SURFACE);
    var rows = [
      [t('about_author'), t('about_author_v')],
      [t('about_watch'), t('about_watch_v')],
      [t('about_source'), t('about_source_v')],
      [t('about_sync'), t('about_sync_v')]
    ];
    var i;
    for (i = 0; i < rows.length; i++) {
      var cy = 176 + i * 30;
      ctx.fillStyle = '#75757C';
      this.setFont(ctx, 12);
      UI.ltext(ctx, rows[i][0], ROW_X + ROW_PAD, this.textY(cy, 12));
      var shown = UI.ellipsize(ctx, rows[i][1], ROW_W - ROW_PAD * 2 - UI.tw(rows[i][0], 12) - 12, 12);
      this.rtext(ctx, shown, ROW_X + ROW_W - ROW_PAD, this.textY(cy, 12), 12, C_TEXT2);
    }

    var ok = st.lastSync > 0;
    ctx.fillStyle = ok ? C_GREEN : '#8A8A90';
    UI.roundRect(ctx, 86, 306, 8, 8, 4);
    ctx.fillStyle = ok ? C_GREEN : '#8A8A90';
    this.setFont(ctx, 13);
    UI.ltext(ctx, this.syncLabel(), 102, this.textY(310, 13));
    this.rtext(ctx, store.syncHostLabel(), W - 86, this.textY(310, 13), 13, C_TEXT2);

    /* 两枚按钮必须一眼可分：返回＝中性面，退出＝红色危险色 + 二次确认（m06685 反馈） */
    ctx.fillStyle = C_SURFACE_HI;
    UI.roundRect(ctx, 96, 362, 118, 42, 21);
    this.ctext(ctx, t('btn_back'), 155, this.textY(383, 14), 14, C_TEXT2);
    this.reg(96, 362, 118, 42, 'back', 0);

    ctx.fillStyle = this.exitArmed ? '#C62828' : '#33171A';
    UI.roundRect(ctx, 240, 362, 118, 42, 21);
    this.ctext(ctx, this.exitArmed ? t('btn_exit_confirm') : t('btn_exit'), 299, this.textY(383, 14), 14, this.exitArmed ? C_TEXT : C_ERR);
    this.reg(240, 362, 118, 42, 'exit', 0);
    if (this.exitArmed) this.ctext(ctx, t('exit_tip'), W / 2, this.textY(340, 11), 11, C_DIM2);
  },

  /* ---------------- 手势 ----------------
     本引擎没有页面栈，右滑不会“固定返回”：
       今日页  -> 后一天
       周课表  -> 后一周
       子页面  -> 返回上一层视图（左滑不动作，避免误触退出）
     竖向拖拽在可滚动列表（作息）上按行滚动，与表冠共用 scrollTopRow。 */
  onTS(e) {
    if (!this.tsLogged) { this.tsLogged = true; console.info('NexioWatch touch start'); }
    if (this.animOn) return;
    var p = UI.pointOf(e);
    this.swipeX = p ? p.x : -1;
    this.swipeY = p ? p.y : -1;
    this.dragY = p ? p.y : -1;
    this.dragAcc = 0;
    this.didDrag = false;
  },
  onTM(e) {
    if (this.animOn) return;
    if (this.dragY < 0) return;
    var p = UI.pointOf(e);
    if (!p) return;
    var dy = p.y - this.dragY;
    this.dragY = p.y;
    if (this.scrollRows <= 0) return;
    this.didDrag = true;
    this.dragAcc = this.dragAcc + dy;
    var moved = false;
    while (this.dragAcc <= -DRAG_STEP && this.scrollTopRow < this.scrollRows) {
      this.dragAcc = this.dragAcc + DRAG_STEP;
      this.scrollTopRow = this.scrollTopRow + 1;
      moved = true;
    }
    while (this.dragAcc >= DRAG_STEP && this.scrollTopRow > 0) {
      this.dragAcc = this.dragAcc - DRAG_STEP;
      this.scrollTopRow = this.scrollTopRow - 1;
      moved = true;
    }
    if (moved) this.redraw();
  },
  onTC() {
    this.swipeX = -1;
    this.swipeY = -1;
    this.dragY = -1;
    this.didDrag = false;
  },
  onTE(e) {
    if (this.animOn) return;
    if (this.swipeX < 0) return;
    var p = UI.pointOf(e);
    var x0 = this.swipeX;
    var y0 = this.swipeY;
    this.swipeX = -1;
    this.swipeY = -1;
    this.dragY = -1;
    if (!p) return;
    if (this.didDrag) { this.didDrag = false; return; }  /* 竖向拖拽滚动过，不再当作滑动导航 */
    var dx = p.x - x0;
    var dy = p.y - y0;

    /* 首页分层滑动：上滑当日课表、下滑周课表、左滑关于、右滑设置，只认主轴方向。
       过渡方向必须跟手：新页从手指来的那一侧进入（m06685 反馈“上划却从别的方向出来”）。 */
    if (this.view === 'home') {
      if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
        /* 设置页已删除（m08330）：右滑改成回到上一页（周课表） */
        if (dx < 0) this.jump('about', 1);
        else this.jump('week', -1);
      } else if (Math.abs(dy) >= SWIPE_MIN && Math.abs(dy) > Math.abs(dx)) {
        if (dy < 0) this.open('today', undefined, 1);
        else this.open('week', undefined, -1);
      }
      return;
    }

    if (Math.abs(dx) < SWIPE_MIN) return;           /* 当作点击，交给 @click */
    if (Math.abs(dy) > Math.abs(dx) * 1.5) return;  /* 主要是竖向动作，忽略 */
    /* 详情是唯一的二级页：右滑返回；其余一级页面左滑下一页、右滑上一页，
       两边的过渡方向都与滑动方向一致。 */
    if (this.view === 'detail') {
      if (dx > 0) this.back();
      return;
    }
    this.pageTurn(dx < 0 ? 1 : -1);
  },

  onTap(e) {
    if (this.animOn) return;
    var p = UI.pointOf(e);
    if (!p) return;
    /* 刚做过竖向拖拽滚动时丢弃这次 click，避免误触发行/课程 */
    if (this.didDrag) { this.didDrag = false; return; }
    var i;
    for (i = 0; i < this.taps.length; i++) {
      var r = this.taps[i];
      if (UI.hit(p.x, p.y, r)) { this.dispatch(r); return; }
    }
  },

  dispatch(r) {
    var a = r.act;
    var v = r.arg;
    if (a === 'open') { this.open(v); return; }   /* 子页入口：纵向滑入 */
    if (a === 'jump') { this.jump(v); return; }   /* 首页胶囊 / 底部导航 */
    if (a === 'back') { this.back(); return; }    /* 子页返回胶囊 */
    if (a === 'day') { this.aDate = D.addDays(this.aDate, v); this.redraw(); return; }
    if (a === 'openCourse') { this.openCourse(v); return; }
    if (a === 'sync' || a === 'syncNow') { this.doSync(); return; }
    if (a === 'exit') {
      /* 二次确认：退出不可逆，第一次点击只把按钮变成“确认退出”（m06685） */
      if (this.exitArmed) { this.doExit(); return; }
      this.exitArmed = true;
      this.redraw();
      return;
    }
    if (a === 'editHost') { this.cycleHost(); return; }
  },

  /* ---------------- 业务动作 ---------------- */

  openCourse(id) {
    var i;
    var list = store.get().courses;
    this.detailCourse = null;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) { this.detailCourse = list[i]; break; }
    }
    this.open('detail');
  },

  doSync() {
    var self = this;
    var st = store.get();
    if (!st.syncHost) { this.tip = '未设置同步地址'; this.redraw(); return; }
    this.tip = '同步中…';
    this.redraw();
    SY.manualPull(store, function (ok, msg) {
      console.info('NexioWatch manual sync ok=' + ok + ' ' + (msg ? msg : ''));
      self.tip = ok ? msg : ('同步失败：' + msg);
      self.redraw();
    });
  },

  cycleHost() {
    var hosts = ['10.0.2.2:8787', '192.168.1.100:8787', '127.0.0.1:8787', ''];
    this.hostIdx = (this.hostIdx + 1) % hosts.length;
    store.setSyncHost(hosts[this.hostIdx]);
    store.flagSet('nexio_sync_host', hosts[this.hostIdx]);
    this.tip = hosts[this.hostIdx] ? ('同步地址 ' + hosts[this.hostIdx]) : '已清空同步地址';
    this.redraw();
  },

  doExit() {
    /* @system.app.terminate() 是官方 API（@system.app.d.ts:165 的 static terminate），
       由 app.js 通过 NEXIO.app 下发（页面自己 import 会多一个模块、顶到 49,152 B 闸）。
       与「返回」的区别：返回只是切回上一层视图，退出是结束整个应用。
       部分机型/stage model 下 terminate 无效，故失败时明确提示而不是静默回首页。 */
    try {
      if (K.app && typeof K.app.terminate === 'function') { K.app.terminate(); return; }
    } catch (e) { /* 落到下面的失败提示 */ }
    this.exitArmed = false;
    /* 先跳转再置 tip：beginAnim() 会清空 tip，反序会让提示看不到（实测缺陷）。 */
    this.jump('home', -1);
    this.tip = t('exit_failed');
    this.redraw();
  },

  /* 当前视图在 PAGE_ORDER（一级页面顺序，表冠与左右滑动按此翻页）中的序号 */
  pageIndex() {
    var i;
    for (i = 0; i < PAGE_ORDER.length; i++) { if (PAGE_ORDER[i] === this.view) return i; }
    return 0;
  },
};
