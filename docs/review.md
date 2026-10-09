# NexioWatch 轻智能手表端交付审查

- 被移植项目：`NexioSchedule`（手机端 Android / Kotlin + Jetpack Compose）
- 移植目标：`NexioWatch`（HUAWEI WATCH GT 系列轻智能手表，Lite Wearable / ACE-Lite + JS / JerryScript）
- 工程根：`C:/Users/LingLuoYi/DevEcoStudioProjects/NexioWatch`
- 依据技能：`huawei-lite-watch-development`（权威）、`miuix`（仅视觉语言参考；miuix 是 Compose Multiplatform 库，不能在轻智能表上运行）
- 本文件按技能 `references/review-output-template.md` 的六张表填写，每一行标注 **已实测 / 资料支持 / 未知**。
- 证据优先级：真机行为 > 项目 SDK 的 `.d.ts` / Lite 白名单 / 构建配置 > 官方资料 > 同版本演示工程 > 推测。

---

## 目标设备档案

| 字段 | 值 | 证据状态 |
|---|---|---|
| 型号/代号/固件 | 目标用户为 HUAWEI WATCH **GT5 / GT6**（用户明确指定，按 512 KB 档设计）。真机具体型号/代号/固件未提供；本地验证环境为 DevEco 自带 Lite Wearable 模拟器（`-device liteWearable -shape circle`）。 | 未知（真机型号/固件）/ 已实测（模拟器） |
| 屏幕与适配分辨率 | 模拟器按 **454×454 圆形**（`-or 454 454 -cr 454 454 -shape circle -sd 160`）验证，页面坐标空间 W=H=454（`pages/index/index.js:48-49`）；GT3/GT4/GT5/GT6 物理 466×466、社区表适配分辨率 336×306；GT2 46mm/e/Pro、GS3/GSPro 物理 454×454。 | 已实测（454×454）/ 资料支持（466 及适配表，未在 466 上抓帧） |
| target / compatible / deviceInfo API | `build-profile.json5`：targetSdkVersion **26.0.0**、compatibleSdkVersion **6.1.1(24)**、runtimeOS HarmonyOS；`entry/build-profile.json5`：apiType `faMode`。全项目不使用 `@system.device` / deviceInfo。 | 已实测（构建配置） |
| JS heap | `common/const.js:10 HEAP_TIER_KB = 512`（按用户"GT5/GT6 512KB 档"设计，留一半以上峰值余量）；`common/const.js:16 MAX_COURSES = 12`（只缓存当前周，见本轮章节）、`common/const.js:17-18 MAX_INCOMING = 200`。模拟器以 **`-hs 65536`（64 KB）作下限验收并通过，0 次 OOM**（见"验证结果"）。**GT5/GT6 真机实际堆档未实测**，512 KB 为资料支持。 | 已实测（模拟器 65536 通过）/ 资料支持（GT5/GT6 512KB）/ 未知（真机实际档位） |
| WearEngine | 本机 SDK `D:/DevEco Studio/sdk/default/openharmony/js/api` 中**不存在** `@system.wearengine`；全项目 0 处可执行引用（仅 `common/nav.js:14`、`common/sync.js:4` 两条历史注释）。同步改用「蓝牙发现 + 局域网 HTTP + 文件通道」。 | 已实测（SDK 目录 + 全项目 grep） |

> 未知 heap 时按 64 KB 基线实现；本项目目标明确为 512 KB 档，但**仍以 64 KB 模拟器作为下限回归**（见内存预算表）。GT2 系列只有 64 KB（资料），若要回退需把 `MAX_COURSES` 改成 5（`common/const.js:12-15` 注释原文「64KB 档可改 5，兼容 GT2 时改 5 即可」）。

---

## 发现与改动

> 严重度：P0 = 白屏/不可用；P1 = 功能或兼容风险；P2 = 体验或工程问题。
> 证据类型三选一：静态推断 / 模拟器观察 / 真机复现。
>
> **2026-10 更新（第二轮）**：本轮把课程缓存从「整学期」改为「只缓存当前周」（`MAX_COURSES` 24→12、新增 `MAX_INCOMING`）、新增 `home` 首页（打开即当前课程状态 + 右侧指示点 + 分方向手势）、今日课表页与作息页共用列表滚动；本轮事实以新增章节「本轮：当周课程内存控制 + 活动记录式首页 + 分方向手势（2026-10）」为准。
>
> **2026-10 更新（第一轮）**：本轮四合一 UI 重构删除了表端全部编辑/添加课程入口（edit 视图、编辑浮层、三个 `<input>`、`.editor/.inp` 均已移除），因此下文 P0-3、P1-2、P1-3、P1-4 中涉及编辑浮层/input 的「修复方式/兼容代价」属历史记录，当前代码已无这些容器与组件；本轮事实以新增章节「本轮四合一 UI 重构（2026-10）」为准。

### P0-1 单页架构（本引擎没有可用的页面栈）

- 真实源码与行号：`common/app.js:1-39`（单页内核：`var view='today'; var prevView='today'`，`go(next, backTo)`、`backView()`）；`common/nav.js:1-19`（仅注释 + `export default {}`）；`entry/src/main/config.json` 的 `js[0].pages` **只有 `["pages/index/index"]`**；构建产物 `loader_out_lite/default/js/MainAbility/` 下也只有 `pages/index/index.js`（第一轮 96,209 B，第二轮 108,489 B）。
- 可触发场景：`@system.router` 只有 `replace / replaceUrl`，没有 `push / back / getLength / getParams`；调用 `replace` 后是**全新的 JS 上下文**（实测：`store.selectedId` 为空、`courses` 重新播种、`getParams` 未定义、`storage.get` 也返回失败）。任何"跳页面 + 传参 + 返回"的写法在本引擎上都不成立。
- 影响：这是"右滑固定返回"历史 bug 的根因——没有页面栈可控，旧代码的 `router.push/back` 全部失败。单页化后该问题在设计上消失。
- 修复方式：整个应用做成**一个真实页面 + 8 个内部视图**，全部视图都是同一 `<canvas>` 上的自绘画面（`pages/index/index.js:105 VIEWS = ['home','today','week','detail','times','sync','settings','about']`），切换只改 `this.view`，不产生页面栈。跨视图传参用 `store.select(id)` + `st.selectedId`，不用 getParams。
- 兼容代价：无法使用系统级返回/手势返回；返回键由画布按钮承载，右滑由应用自己解释（见 P1-6）。
- 证据：模拟器观察（8 个内部视图切换 + 抓帧，见验证结果）；`@system.router.getParams` 的 `@since 7` 高于本项目 compatibleSdkVersion(6) 属静态审计。

### P0-2 历史白屏：页面 import 了本机不存在的 `@system.wearengine`

- 真实源码与行号：历史原因记录在 `common/nav.js:14`、`common/sync.js:4`；当前全项目 **0 处可执行引用**。
- 可触发场景：旧代码在页面脚本顶层 `import wearengine from '@system.wearengine'`，本机 SDK 无此模块 → 模块解析失败 → 页面 JS 整体加载失败 → 白屏。
- 影响：整页白屏，功能完全不可用。
- 修复方式：删除该 import；所有 `@system.*` IO 一律包在 `try/catch` 内，失败只更新状态不抛异常到生命周期（`store.js:306-404` 全部文件调用、`sync.js:142-172` fetch 调用、`ble.js:85-128` 蓝牙调用、`remind.js:31-45` 振动调用）。页面渲染在主流程 `try/catch` 内，异常走 `drawError`（`index.js:340-351`，"页面渲染失败" + 可返回按钮）。
- 兼容代价：无自动同步依赖，改用「蓝牙发现 + 局域网 HTTP + 文件通道」。
- 证据：静态推断（SDK 目录无该 `.d.ts` + 全项目 grep + 构建成功）。

### P0-3 容器默认 `flex-direction: row`：表单"只有按钮、没有内容"

- 真实源码与行号：`pages/index/index.css:5`（`.page{...flex-direction:column;}`）。编辑浮层 `.editor`（原 `index.css:22`）已在本轮重构中删除。
- 可触发场景：ACE-Lite 容器的默认主轴是 **row**；纵向容器若不显式声明 `flex-direction: column`，子元素会横向排列并互相重叠，容器高度塌缩成一行 → 编辑页/详情页/设置页的整列内容全部"消失"。
- 影响：视觉上与白屏同类，整屏只剩标题与按钮。
- 修复方式：凡承载多个子元素的容器一律显式 `flex-direction: column`。当前项目只有 `.page` 一个多子元素容器（`index.css` 共 10 行，仅 `.page` / `.cv`），其余界面全部由 canvas 绘制，天然不存在 flex 塌缩。
- 兼容代价：无（显式 column 是标准写法）。
- 证据：模拟器观察（编辑页表单三个 `<input>` 正常显示已有值，抓帧 `docs/screenshots/edit-form.jpg`）。

### P0-4 HML 节点数量本身吃堆：周课表与今日卡片改用 canvas

- 真实源码与行号：`pages/index/index.hml`（全文 3 行，只有 1 个 `<canvas>`，编辑浮层已删除）、`pages/index/index.js:619 drawToday / :751 drawWeek`、`common/ui.js:1-6`（注释记录"每个 HML 节点都要几 KB，7xN 网格要到 `-hs 196608` 才不 OOM"）。
- 可触发场景：周课表的 HML 网格版在 `-hs 65536 / 81920 / 98304 / 131072` 全部 OOM，只有 `196608` 才通过（历史 min 日志 `.dsh-tmp/sim-w{81920,98304,131072,week,3rows}.log` 共 15 个日志为证）。
- 影响：节点数（约数 KB/节点）比 JS 字符串更吃堆，是轻智能表的主要内存变量。
- 修复方式：周课表整页改为**单个 `<canvas>`** 的 7 行列表（`drawWeek`）；今日页卡片同样 canvas 绘制（`drawToday`）；8 个内部视图合计只占 1 个 canvas 节点（当前 `index.hml` 无 `<input>`）。
- 兼容代价：文字排版需手写宽度估算与居中（`common/ui.js:49 tw()`、`:61 ctext`、`:65 ltext`、`:70 ellipsize`），不参与 HML 数据绑定。
- 证据：模拟器观察（同一功能两种实现的堆阈值对比 + 抓帧）。

### P1-1 `ctx.measureText` 在本引擎会抛异常 → 自写宽度估算

- 真实源码与行号：`common/ui.js:5`、`common/ui.js:48`（"measureText 在本引擎会崩"）；`common/ui.js:49 function tw(text, size)`（CJK 按 `size`、拉丁按 `0.56×size`）。
- 可触发场景：任何按测量结果做居中/截断的代码在真机或模拟器上直接抛异常。
- 影响：文本排版全部失败（可能整页渲染异常）。
- 修复方式：所有宽度计算走 `tw()` 估算；居中用 `ctext`（`Math.round(cx - tw/2)`），截断用 `ellipsize`。
- 兼容代价：估算宽度与真实字形有偏差（截断可能偏保守），属可接受。
- 证据：静态推断 + 模拟器观察（全部中文文本正常渲染）。

### P1-2 `position: absolute` 不生效（负 margin 也不生效）→ 浮层用 `<stack>`

- 真实源码与行号：`pages/index/index.css:15-16`（注释"本引擎 position:absolute 不生效，用 stack（层叠容器）承载浮层"）；`pages/index/index.hml:2-9`（`<stack class="stk">` 内层叠 canvas 与 editor）。
- 可触发场景：用绝对定位把 `<input>` 覆盖到 canvas 指定位置时，输入框会跑到文档流位置，与画布错位。
- 影响：编辑表单与画布上的"名称/教师/地点"三行对不上，无法编辑。
- 修复方式：用 `<stack>` 层叠容器承载浮层；`.editor` 用 `padding-left:150px; padding-top:61px; flex-direction:column` 对齐 canvas 上 `y=62+i*34` 的三行（`index.js:28-30 EDIT_INPUT_X=118 / EDIT_INPUT_Y=74 / EDIT_ROW_H=34`）。**历史记录（第一轮已删除）**：编辑浮层 `.editor`、`<stack>` 层叠容器与 `index.hml` 的三个 `<input>` 均已随四合一重构移除，`index.hml` 现在只有 3 行（单个 canvas），本条的修复方式与行号只反映当时状态。
- 兼容代价：层叠位置靠 padding 手算，改动画布行距时需同步改 CSS。
- 证据：模拟器观察（编辑页三个 input 与画布标签对齐，抓帧 `edit-form.jpg`）。

### P1-3 `this.data` 在本引擎是 `undefined`：HML 直接绑定页面对象属性

- 真实源码与行号：`pages/index/index.js:108-109`（注释"本引擎里 `this.data` 是 undefined，HML 的 `{{x}}` 直接读页面对象自身的属性"）；`index.js:110 data: {}`（重构后 HML 只剩一张 canvas、没有任何数据绑定，`data` 保留为空对象）；`index.hml` 中 `if="{{editMode}}"`、`value="{{draftName}}"` 等直接读页面自身属性的写法已随编辑浮层删除（**历史记录**）。
- 可触发场景：写成 `this.data.editMode = true` 时页面属性不变，HML 的 `{{x}}` / `if="{{x}}"` 取不到值 → 点了没反应 / 画面不显示。
- 影响：曾是"点了没反应/不显示画面"的主因。
- 修复方式：当时所有会被 HML 绑定的字段都写 `this.x`（`index.js:62 this.editMode`、`:799-801 onName/onTeacher/onPlace 里 `this.draft.x = this.eventValue(e)`；**历史记录**，这些字段与方法已随编辑功能删除，`grep editMode|draftName|eventValue|EDIT_INPUT` 在 `entry/src/main/js/MainAbility` 下现为 0 处匹配）。
- 兼容代价：无；但失去 `this.data` 的自动 diff，刷新时需显式改属性。
- 证据：静态推断 + 模拟器观察（编辑表单显示已有值）。

### P1-4 `<input>` 的 `@change` 只在特定 type 下通过编译

- 真实源码与行号：`pages/index/index.hml:4-6`（当时为三个 `type="text"` 的 `<input>`，均带 `@change`；**历史记录**，`index.hml` 现已删到 3 行，只剩一个 canvas，无任何 `input`）。
- 可触发场景：编译期报

  ```
  ERROR File:C:\Users\LingLuoYi\DevEcoStudioProjects\NexioWatch\entry\src\main\js\MainAbility\pages\index\index.hml:4:4
  tag `input` not support event `change` when the type is not checkbox and radio
  ```

  （历史 `.hvigor/outputs/build-logs/build.log:13299-13310`，:5:5、:6:6 各一条，随后 `:13312 default@LegacyCompileLiteJS failed`）。
- 影响：构建失败；**hvigor 静默保留旧产物**，表现为"改了没效果"的假象（见 P1-5）。
- 修复方式：把字段 type 收敛为受支持的 `text`，编译通过；读取用 `eventValue(e)`。**当前代码已无此问题**：编辑链路删除后 `index.hml` 不再有 `input`，`eventValue` 为 0 处匹配。
- 兼容代价：编辑能力限于单行文本，多行/富文本不支持；轻智能表无键盘输入法之外的复杂输入。
- 证据：构建日志（历史失败与当前 BUILD SUCCESSFUL 对照）。

### P1-5 构建失败真因只在 build.log：stdout 只给一行 `ERROR File:...:line:col`

- 真实源码与行号：不适用（构建工具链行为）；证据文件 `NexioWatch/.hvigor/outputs/build-logs/build.log`（1869828 B，末次写 2026/10/8 17:40:49）。
- 可触发场景：hvigor 在 stdout 只打 `ERROR File:<路径>:<行>:<列>`，完整堆栈与 `COMPILE RESULT:FAIL {"ERROR":N}` 只写进 `build.log`；同时**构建失败不会清除上一次的产物**，`.hap`/loader_out 仍是旧的。
- 影响：误判"代码没生效"，浪费大量排查时间。
- 修复方式（工程约定）：构建后必须核对 `build.log` 的 `COMPILE RESULT:SUCCESS` + `BUILD SUCCESSFUL`，出现 FAIL 时打开 `build.log` 取完整错误；产物时间戳一并核对。
- 兼容代价：无。
- 证据：构建日志（历史 FAIL 与当前 SUCCESS 的完整记录）。

### P1-6 `@swipe` 可编译但不触发；右滑改由触摸事件自己实现

- 真实源码与行号：`pages/index/index.hml:2`（canvas 上绑定 `@click="onTap" @touchstart="onTS" @touchmove="onTM" @touchend="onTE" @touchcancel="onTC"`）；`pages/index/index.js:77 SWIPE_MIN = 40`、`:78 DRAG_STEP = 34`、`:1034 onTS`、`:1042 onTM`、`:1064 onTC`、`:1070 onTE`（`onSwipe` 已删除，全文件 0 匹配）；坐标取值 `common/ui.js:130 pointOf()`（优先读 `e.globalX/globalY`，本引擎事件是 `{type,target,currentTarget,timestamp,globalX,globalY}`，没有 clientX/offsetX）。
- 可触发场景：`@swipe` 属性在 HML 里可以通过编译，但运行时**一次都不触发**（探针实测）。因此"靠 `@swipe` 拦右滑"的做法在本引擎上不成立；同时单页架构下系统没有页面栈，系统右滑也就没有了可返回的目标。
- 影响：这正是历史上"右滑固定返回"这一现象的机制面另一半——旧代码用 `router.push/back`（本引擎只有 `replace/replaceUrl`）失败后，页面栈为空，系统手势成为唯一出口。
- 修复方式：应用自己解释手势：`onTE` 计算 `dx/dy`，仅当 `|dx| >= SWIPE_MIN(40)` 且 `|dx| > |dy|*1.5` 时判为滑动，否则放行给 `@click`（保证点击不失效）；子页面语义为"上下文"——今日页→前一天/后一天，周课表→上一周/下一周，其余子页面→右滑返回上一层视图（左滑不动作，避免误触退出）。首页 `home` 另有一层分方向手势，见本轮章节。
- 兼容代价：返回手势不再是系统手势，行为完全由应用定义；用户习惯的系统右滑在真机上仍可能被系统层截获（模拟器无法验证系统手势，列为真机待验证）。
- 证据：模拟器观察。探针版画布回显 `TS/TM/TE x=..y=..`（`.dsh-tmp/shots-pv2/s1.jpg`）证明 `@touchstart/@touchmove/@touchend` 可用且带 `globalX/globalY`，`@swipe` 不触发；``.dsh-tmp/swipe.js` 的 `md,x1,y1,x2,y2` 步骤（`MousePress + MouseMove×8 + MouseRelease`）可被引擎翻译成完整触摸流，而 `TouchPress/TouchMove/TouchRelease` 命令**注不进应用**；翻页/返回实测帧见 `.dsh-tmp/shots-sg1..sg6/`、`shots-final/`。

### P1-7 周次换算：远距离日期曾被吸附到"当前周"

- 真实源码与行号：`common/store.js:187 naiveWeek(iso)`、`:195-210 weekOfDate(iso)`、`:212-216 dateOfWeekday(week, day)`；种子自洽逻辑 `common/store.js:70-90 loadSeed()`。
- 可触发场景：旧实现写的是"若 `live` 与算出的周差超过 2 就取 `live`"，导致翻到两周以外的日期时日期与周次不匹配（例如 10/8 显示"第4周"）。另一个表现是种子里的 `currentWeek` 是写死值，时间流逝后今日页与周课表互相矛盾。
- 影响：日期↔周次错位，周课表与今日页显示不一致。
- 修复方式：（1）改为全局偏移：`offset = live - naiveWeek(todayISO())`，仅当 `|offset| <= 2 && offset !== 0` 时把 `week` 加上 `offset`，再夹到 `1..totalWeeks`；（2）`loadSeed()` 在装载后按 `termStart` 重算 `currentWeek = clamp(naiveWeek(todayISO()),1,totalWeeks)`。
- 兼容代价：当学期开学日与实际调休不一致时，全局偏移会整体平移一周——这与手机端 `current_week` 的校准语义一致，属预期行为。
- 证据：Node ESM 协议测试（`.dsh-tmp/proto-test/test2.mjs` / `test3.mjs`，把真实 watch 模块转成 `.mjs` 直接跑）：`live=5` 时 09-07→1、09-14→2、09-28→4、10-08→5；`weekOfDate→dateOfWeekday` 往返 1..7 周无 MISMATCH；种子在 2026-10-08 得 `currentWeek=5` 且 ``全部日期自洽（无漂移）``。模拟器抓帧 `.dsh-tmp/shots-wk2/s1.jpg`（周课表第5周 10月5日-10月11日）。

### P2-1 上课提醒只能是前台提醒（平台限制）

- 真实源码与行号：`common/remind.js:1-81`（`REMIND_MINUTES=10`、`evaluate()`、`vibrateShort()`）；`pages/index/index.js:169-179`（`startTick` 30 s `setInterval`，本轮改为 `home` 与 `today` 两个视图都会重绘）；`entry/src/main/config.json` 的 `reqPermissions` 含 `ohos.permission.VIBRATE`（reason "上课提醒振动"）。
- 可触发场景：轻智能应用不能后台常驻；只有应用在前台且停留在今日页时才可能触发。`evaluate` 在 `diff ∈ [0,10]` 分钟时给出文案并振动，去重键 = `day|week|start`（`remind.js:61-66`）。
- 影响：手表停留在其它页面或不唤醒时不提醒；这是平台限制而非缺陷。
- 修复方式：已实现前台提醒 + 每 30 s 刷新；`onHide/onDestroy` 清定时器（`index.js:155-165`，`stopTick`/`stopRingAnim`/`stopCrown`/`BLE.stop()`）；切课表/导入后 `resetKey()`。
- 兼容代价：无法做真正的后台闹钟。
- 证据：SDK `.d.ts` 资料支持（`@reserved ["liteWearable"]`、官方注明 lite 上持续维护）+ 模拟器渲染；**振动本体真机未验证**。

### P2-2 `@system.storage` 单值 < 128 字节 → 只放小标志

- 真实源码与行号：`common/const.js:50-53`（`KEY_VERSION='nexio_ver'`、`KEY_WEEK='nexio_week'`、`KEY_SYNC_AT='nexio_sync_at'`、`KEY_SYNC_HOST='nexio_sync_host'`）；`common/store.js:408-427 flagSet/flagGet`（`String(value)`，`try/catch` 吞异常）；`store.js:431-474 load` 读三个小标志 + `URI_DATA` 整表 JSON。
- 可触发场景：把整张课表 JSON 写进 storage 会超限或失败。
- 影响：数据丢失或存储不可用。
- 修复方式：完整数据写 `@system.file` 的 `internal://app/nexio/schedule.json`；storage 只放版本/当前周/同步时间/同步地址四个小标志。
- 兼容代价：读取需要两次来源（标志 + 文件），`load` 里分别处理。
- 证据：静态 + SDK 注释资料。

---

## 本轮四合一 UI 重构（2026-10）

> 用户原始要求（逐字）：`/ui-ux-pro-max /harmonyos-development /huawei-lite-watch-development /miuix 使用这几个skills重新设计UI和解决部分问题，现在UI大部分文字与背景没对齐，还有手表端不需要加入任何编辑和添加课程的功能，最后查看一下官方活动记录的UI动画，把表冠滚动也加入功能`
> 拆成四条：(a) 重设计 UI 并修复文字/背景错位；(b) 删除手表端全部编辑/添加课程功能；(c) 模仿官方活动记录 UI 动画；(d) 加入表冠滚动。
> 本轮改动只落在 `entry/src/main/js/MainAbility/pages/index/index.js`（整体重写，1034 行）、`index.hml`（删到 3 行）、`index.css`（删到 10 行）、`common/ui.js`（新增 `ease()` 与 33 点 LUT）。

> 说明：本节记录**第一轮**四合一重构当时的状态（含当时的行号与 `index.js 1034 行`）。第二轮改动后 `index.js` 已增至 1269 行，色板、`drawToday`、`footerBack`、`crownTurn` 等行号均已整体后移；凡与本轮章节冲突之处，以「本轮：当周课程内存控制 + 活动记录式首页 + 分方向手势（2026-10）」为准。

### 改动清单

| # | 方向 | 改动 |
|---|---|---|
| 1 | 去编辑 (b) | `VIEWS` 由 8 项减为 7 项（`today/week/detail/times/sync/settings/about`，删除 edit 视图）；删除 `drawEdit` 与整个编辑浮层、`index.hml` 的 `<div class="editor">` 与三个 `<input>`、`index.css` 的 `.editor/.inp`、`dispatch` 的 `addCourse/editRow/saveCourse/delCourse/cancelEdit` 与 edit 特判、业务方法 `newDraft/addCourse/openEdit/publishDraft/onName/onTeacher/onPlace/eventValue/saveCourse/delCourse/cancelEdit`、state 的 `draft/isNew/editMode/confirmDelete`；课程详情页改为只读（只有「返回」）；今日空态文案改为「课表来自手机端同步」；`doStep` 只保留 `1001/1011/1002/1012`（当前周/总周数两个设置项）。grep 确认上述 18 个符号在 `index.js` 中 0 处匹配。 |
| 2 | 版式重排 (a) | 8vp 网格；卡片 `CARD_X=22 / CARD_W=410`；列表行 `ROW_X=56 / ROW_W=342 / ROW_PAD=16`；底部导航 `NAV_Y=402`；子页面统一「标题行心 46 / 副标题行心 68 / 内容 y=88 起 / 页脚返回胶囊 (W/2-54, H-58, 108, 40)」；颜色改为令牌化（第一轮为 `index.js:51-65`，第二轮后为 `:60-74`）。 |
| 3 | 进度环动效 (c) | 今日页环心 `(74,126)` 半径 24 线宽 6（`RING_CX/CY/R/LW`，现 `index.js:82-87`）；环长 = 达成率（已完成节次/总节次）；环心显示 `done/total`；`drawRing()` 用 `beginPath + arc + stroke`；补间 `setInterval 40ms × 8 帧 ≈ 320ms`；缓动 `common/ui.js:150-157 ease()`（33 点 LUT）；`onHide/onDestroy` 调 `stopRingAnim()`。 |
| 4 | 表冠 (d) | `onShow` 调 `startCrown()`（先做 `typeof` 守卫后注册闭包回调）；`onDestroy` 调 `stopCrown()`（`clearMonitorForCrownEvents()`）；`onCrown` 把 `degree` 累加到 `crownAcc`、每 16 度一档；`crownTurn(dir)` 分派到作息页滚动 / 今日页换一天 / 周课表换一周 / 其它子页返回。 |
| 5 | 作息滚动 | 11 节超过 6 行可视 → 新增 `scrollTopRow/scrollRows`；表冠与竖向拖拽共用（每 34px 拖拽滚一行，`.dsh-tmp/drag.js` 的 `md` 步骤）；右侧画轨道 + 滑块；页面提示「旋转表冠滚动」。第二轮起今日课表页复用同一套 `scrollTopRow/scrollRows`。 |

### 错位根因：`ctx.fillText(x, y)` 的 `y` 是「文本行顶部」，不是基线

本轮最关键的发现（**已实测**）：本机 Lite 引擎的 `fillText` 把 `y` 当作**文本行顶部**，墨迹从 `y+3` 附近开始、高度约等于字号。像素测量：

| 调用 | 字号 | 墨迹实际落点 |
|---|---:|---|
| `fillText(x, 50)` | 19px | y=53..68 |
| `fillText(x, 94)` | 17px | y=97..112 |
| `fillText(x, 143)` | 13px | y=146..158 |
| `fillText(x, 89)` | 13px | y=96..103 |
| 30px 高胶囊（y=113，下沿 y=145）内文字 | — | 墨迹 y=135..145，**超出胶囊下沿** |

旧代码按「`y` 是基线」取值（chip 用 `y+h/2+5`、课程卡用 `cy+27/47/67`），导致所有文字整体**下沉约半个字高**——这就是用户说的「UI 大部分文字与背景没对齐」。
修复：统一 `textY(cy,size) = round(cy - size*0.5 - 3.5)` 把「视觉中心」换算成 `fillText` 的 `y`；左/中/右对齐分别只走 `UI.ltext / ctext / rtext(right - UI.tw(text,size))` 三个入口。
**第二条错位根因**：把已经算好居中用的 `x` 再交给 `UI.ctext` 会**二次居中左移半个字宽**。

### 验证结果（页面 / 证据文件 / 结论）

| 页面/状态 | 证据文件（`NexioWatch/.dsh-tmp/` 下） | 结论 |
|---|---|---|
| 今日页 | `shots-nwB/s0.jpg`（42,644 B） | 进度环 4/4 + 三张课程卡，已实测 |
| 周课表 | `png-last/z1.png`（79,462 B） | 7 行、今日高亮，已实测 |
| 设置 | `png-last/z2.png`（56,648 B） | 六行 + 当前周/总周数步进，已实测 |
| 同步与导入 | `png-last/z3.png`（60,630 B） | 六行入口正常，已实测 |
| 作息页（拖拽后） | `png-last/z4.png`（74,122 B） | 滚到第 4~9 节，含滚动条与提示，已实测 |
| 关于 | `png-last/z5.png`（63,848 B）、`png-last/z7.png`（66,506 B，修正版） | 已实测 |
| 无课日 | `png-last/z8.png`（62,194 B） | 进度环退回空轨道 + 「无课」，已实测 |
| 课程详情（只读） | `pngW/f11.png`（48,631 B） | 只有「返回」，无编辑/删除，已实测 |

其它本轮证据：

| 项 | 证据 | 结论 |
|---|---|---|
| 构建 | 设置 `DEVECO_SDK_HOME` 后执行 hvigorw `--mode module -p product=default assembleHap --no-daemon` | **BUILD SUCCESSFUL**（未签名，`signingConfigs` 为空） |
| 静态审计 | `scripts/audit_lite_watch_project.ps1 -ProjectPath .../NexioWatch -TargetHeapKB 512 -TargetApi 6` | 无 FAIL；2 条 REAL-DEVICE REQUIRED（振动、`@system.file`/rawfile）；JS=15 文件、101,585 字节（第一轮值；第二轮为 117,027 字节，见内存预算表） |
| 运行期内存（模拟器管道 ack） | `{"property":"memoryUsage","result":{"totalBytes":524280,"allocBytes":107320,"peakAllocBytes":108512}}` | 峰值 108,512 B（512 KB 档余量充足） |
| 表冠逻辑（临时注入） | `onShow` 注入三次 `onCrown({degree:-16})`（顺时针 48 度 = 3 档） | 今日页由 2026年10月8日 变为 2026年10月11日，档位换算与方向映射正确（注入代码已删除） |

### 验证通道踩坑（值得记进文档，避免以后再被误导）

- `.dsh-tmp/walk.js` 与 `swipe.js` **每次截图都新开一条 WebSocket 抓最后一帧**，连续多步会反复拿到同一张陈旧画面（表现为「点击无效」）。
- 改用 `.dsh-tmp/tap.js`（SID 前缀 `nexio_`，单条 WS 持续收帧，落 `.dsh-tmp/frames-<tag>/fN.jpg` 与 `acks.txt`）后确认命令被接受（ack 里 `command` 为 `MousePress`、`result` 为 `true`）；新建的 `.dsh-tmp/drag.js` 在 tap.js 基础上加了 `md,x1,y1,x2,y2,wait` 拖拽步骤。
- 引擎会**吞掉启动后第一次点击**，所以每次自动验证的第一击必须当 dummy（**已实测**）。
- 截图 JPEG **常被截断**，需要先转 PNG 再看。

### 已知风险与待真机项

- **未知 / 待真机确认**：GT5/GT6 真机是否有表冠、表冠事件的 `degree` 方向与灵敏度；**方向映射（顺时针=向前）是推断**。（SDK 注释 `global.d.ts:112-113` 说明监听器会在页面 push back/replace 时自动移除，属**资料支持**，真机行为未实测。）
- **待真机确认**：300ms/8 帧补间在真机上的实际帧率与掉帧表现。
- **未知**：本机字体度量与 `tw()` 估算（CJK = `size`、拉丁 = `0.56*size`）在真机字体下的偏差。
- **圆屏安全区（仅外观）**：今日页课程卡仍按 `CARD_X=22 / 宽 410` 绘制，圆屏上底部两张卡的左右圆角会被表盘边缘裁掉；文字内缩到 x=40 之后仍在安全区内；顶部标题行（x=104、右边界 350）与底部导航（y=402）已按圆弦内缩。
- **仍待真机**：`@system.file`/rawfile、振动、BLE 扫描、局域网 HTTP 拉取。

---

## 本轮：当周课程内存控制 + 活动记录式首页 + 分方向手势（2026-10 第二轮）

> 用户原始要求（逐字）：`继续昨天的任务，有一下几个问题1.保存的课程只需要一周的，保存太多内存会爆然后软重启，2.设计成华为自带应用活动记录这样的操作逻辑，3.操作层建议：打开优先展示当前课程状态，向左滑是关于页，向上滑是当日课表。`
> 拆成三条：(a) 课程只缓存**当前周**，控住内存、消除软重启；(b) 首页改成华为官方「活动记录」式操作逻辑；(c) 打开先看当前课程状态，左滑→关于、上滑→当日课表。

### 改动清单（第二轮：全部落在 watch 侧 JS，共 4 个文件）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `entry/src/main/js/MainAbility/common/const.js` | `MAX_COURSES` **24 → 12**（`const.js:16`，注释「只缓存『当前周』的课」，:12-15）；新增 `MAX_INCOMING = 200`（:17-18，手机端下发的原始条数上限）；`named` 与 `default` 两处导出同步登记（:64、:95）。 |
| 2 | `entry/src/main/js/MainAbility/common/sync.js` | 新增 `collectWeek(rawList, week)`（:42-67）：先用**廉价 probe 对象**（只含 `selectedWeeks/startWeek/endWeek/weekType`，:50-55）跑 `M.isActiveInWeek` 预筛（:56），命中才 `M.normalizeCourse`（:57-64），最多 `MAX_COURSES` 门（:45），`dayOfWeek` 不在 1..7 直接跳过（:48-49）。`parse(text, week)` 增加周次参数（:80）；`rawList.length > MAX_INCOMING` 时 `slice(0, MAX_INCOMING)` 截断（:97）；先按 `targetWeek` 过滤，为空且 `phoneWeek !== targetWeek` 时退回手机端 `rs.current_week` 并置 `usedWeek`（:100-111）；仍为空返回 `error '第 N 周没有课程数据'`（:112）；返回值新增 `week: usedWeek` 与 `incoming: rawList.length`（:124-135）。`manualPull` 与 `importText` 都传 `store.get().settings.currentWeek`（:189、:206）。 |
| 3 | `entry/src/main/js/MainAbility/common/store.js` | `state` 新增 `dataWeek`（:48，注释「0 = 未知/内置示例」）；新增 `dataIsCurrentWeek()`（:101-105，`dataWeek` 为 0 视为 true）与 `dataWeekLabel()`（:107-110）；`applyPayload` 接受 `payload.week` 写入 `dataWeek`（:234、:253-255，`payload.source` 以「本地」开头则置 0）；`toJson` 输出 `data_week`（:269）；`loadSeed` 里 `dataWeek` 取 `settings.currentWeek`（:87）；`load` 回读 `data_week`（:468）。**四处 IO 兜底 setTimeout 都补了 clearTimeout**：`readAllText`（guard 6000 ms，:345，:316 清）、`readText`（3000 ms，:358）、`writeText`（5000 ms）、`load`（4000 ms）；两处导出同步登记（:522-530、:532-545）。 |
| 4 | `entry/src/main/js/MainAbility/pages/index/index.js` | 新增 `home` 视图（`VIEWS` 7 → **8** 项，:105）与首页常量 `HOME_RING_CX/CY/R/LW = 227/150/60/13`（:90-93）、`DOT_X=398 / DOT_CY=150 / DOT_STEP=22`（:96-98）、`PAGE_ORDER`（:99）、`TODAY_VISIBLE=3 / TODAY_PITCH=80`（:102-103）。新增方法 `drawHome(ctx)`（:518-600）、`pageDots(ctx)`（:603-615）、`pageTurn(dir)`（:302-310）、`pageIndex()`（:1257-1261）、`jump(v)`（:292-300）。`onInit/onShow` 都设 `this.view = 'home'` 并清空 `this.stack`（:113、:143-144）。`onTE` 增加首页分方向手势（:1085-1092）。`crownTurn` 重写（:223-260）。今日课表页新增纵向滚动（:648-651、:676-690）。`open/back` 统一走视图栈（:265-290），`openCourse` 改为 `this.open('detail')`（:1144-1152），`footerBack` 默认 act 改为 `back`（:421-427），周课表「返」与关于页「返回」都改为 `back`。**收尾修正**：`doStep` 改为累积 `weekChanged`（:1155-1170），末尾 `if (weekChanged && !store.dataIsCurrentWeek() && store.get().syncHost) this.doSync();`（:1169）——手表只缓存当前周，周次一改缓存即过期，已配同步地址就立刻重拉当周；`drawHome` 辅助行改为缓存过期**优先**（:578-585）。 |

### 根因与设计理由

**(a) 内存：课程由「整学期」改为「只缓存当前周」**
- 根因：一轮同步会把手机端**整学期**的课程全部 `normalizeCourse` 后常驻内存。`MAX_COURSES` 原为 24 只是**截断上限**，实际是"按 dayOfWeek 顺序取前 24 门"，既不能保证覆盖当前周，也让 `courses` 数组与 `redraw()` 的遍历量随数据规模膨胀——用户反馈的「保存太多内存会爆然后软重启」就是这条链路。
- 设计：`collectWeek` 把过滤提前到**归一化之前**——probe 对象只有 4 个字段，先判 `isActiveInWeek`，命中才付 `normalizeCourse` 的代价，于是"内存里的课程对象数"与"当前周实际有几门课"绑定，上限 12。`MAX_INCOMING=200` 是第二道闸：限制进入解析的原始条数。
- 低配降级：`const.js:12-15` 注释明确 512 KB 档（GT5/GT6）一周 12 门余量充足，**64 KB 档可改 5**（旧文档写的「改成 8」已过时）。
- 一致性：`dataWeek` 记录"内存里这批课属于第几周"，首页据此在数据不是当前周时显示「缓存为第 N 周，请重新同步」（`i18n home_cached_week`）；`dataWeek` 为 0（内置示例）时按"就是当前周"处理，避免内置数据被误报为过期。

**(b) 首页：仿华为官方「活动记录」操作逻辑**
- 打开即 `home`（`onInit` 与 `onShow` 都设 `this.view='home'`，并清空视图栈），首页回答"我现在该上什么"：顶部今天星期与时钟 → 中央大环（环心 `done/total` + 「节已完成」，达成率补间动画）→ 课程名/时间地点/状态文案（进行中 / 下一节还有 N 分钟 / 无课 / 假期）→ 底部提示与 今日/周/设置 三胶囊。
- 右侧竖排 **7 个指示点**（`pageDots`，x=398、cy=150、步距 22）对应 `PAGE_ORDER` 的 7 个页，当前页的点更高更亮（6×14 蓝色 vs 4×6 #4A4A52），并且**每个点可点击直达**；这是「活动记录」式左右翻页的表盘化表达。
- 大环与今日页的小环**不是同一个环**：首页 `HOME_RING_R=60 / LW=13`（突出），今日页 `RING_R=24 / LW=6`（信息密集）。共用 `drawRing()` 与同一套补间。
- 底部三胶囊在首页是 **今日/周/设置**（`index.js:589-598`），与子页面 `nav()` 的 周/设置/i 不同——首页承担一级导航，子页面保留旧的 `nav()` 语义。

**(c) 分方向手势**
- `onTE` 在 `home` 上先做方向判定：`|dx| >= 40` 且 `|dx| > |dy|` → 左滑 `jump('about')`、右滑 `jump('settings')`；`|dy| >= 40` 且 `|dy| > |dx|` → 上滑 `jump('today')`、下滑 `jump('week')`；其余方向不动作。`jump` 清空视图栈直达一级页，所以从首页进「关于」后右滑返回不会回到奇怪的中间态。
- 子页面仍保留"上下文"横向滑动（今日页换天、周课表换周、其余返回）；首页的竖滑是新增维度，两者由 `this.view === 'home'` 分支隔开。

**(d) 返回与滚动**
- 子页返回统一走视图栈 `back()`（`footerBack` 默认 act 改为 `back`，周课表「返」与关于页「返回」也都是 `back`；`openCourse` 改为 `this.open('detail')`，详情页返回时回到**进入它的那个视图**，而不是"总是回今日页"）。
- 今日课表页复用作息页的 `scrollTopRow/scrollRows`：超过 3 张卡时可滚动，右侧画轨道 + 滑块并提示「旋转表冠滚动」；表冠、竖向拖拽、手势三条输入都归一到这一个状态上。

**(e) 本轮顺带修掉的一个真 bug**
- `drawHome` 初版误写成 `st.dataIsCurrentWeek()`（`st` 是 store 的**状态对象**，不是模块），首页渲染抛 `Expected a function`，被主流程 `try/catch` 接住后回落到 `drawError` 错误页。已改为 `store.dataIsCurrentWeek()` / `store.dataWeekLabel()`。这条说明"渲染主流程 try/catch + drawError 兜底"确实在真实 bug 上生效过。

### 验证结果（页面 / 证据文件 / 结论）

模拟器环境：DevEco Lite Wearable，**454×454 圆形**（`-shape circle -sd 160`）；harness 为 `.dsh-tmp/tap.js`（点击）与 `.dsh-tmp/drag.js`（拖拽/手势），**第一击必须当 dummy**。

| 页面/状态 | 证据文件（`NexioWatch/.dsh-tmp/` 下） | 结论 |
|---|---|---|
| 首页（打开即此页） | `pnghmC/f9.png` | 顶部「今天是星期五 09:46」、中央大环 0/2 与「节已完成」、右侧 7 个竖排指示点（当前点蓝色更高更亮）、课程行「计算机网络 / 10:00-11:40 · 机房A305 / 14 分钟后上课」、底部提示「上滑今日课表 · 左滑关于」+ 今日/周/设置 三胶囊。已实测 |
| 左滑 / 上滑 / 右滑 | `pngGestures/grid.png`（左中右三格） | 左滑→关于页、上滑→今日课表、右滑→设置页，三方向均正确。已实测 |
| 下滑 | `pnggDown2/f10.png` | 下滑→周课表页。已实测 |
| 指示点与胶囊点击直达 | `pngNav3/grid.png`（`p4b/f10`=关于、`p5b/f9`=设置、`p1/f10`=今日课表、`p2/f10`=周课表、`p3/f10`=设置页） | 右侧 7 个指示点与底部三胶囊都能点击直达对应视图。已实测 |
| 今日课表滚动 | （随 `pnghmC`/`pngNav3` 抓帧一并覆盖） | `scrollRows>0` 时画滚动条 + 「旋转表冠滚动」；**表冠本体在模拟器无法注入**，滚动行数变化由拖拽验证 |

其它本轮证据：

| 项 | 证据 | 结论 |
|---|---|---|
| 构建 | 设置 `DEVECO_SDK_HOME` 后 hvigorw `--mode module -p product=default assembleHap --no-daemon` | **BUILD SUCCESSFUL**（增量约 6.3 s；未签名，`signingConfigs` 为空） |
| 运行期内存（模拟器管道 ack） | `allocBytes 113224 / peakAllocBytes 118760 / totalBytes 524280` | 峰值 118,760 B（512 KB 档下余量约 4.4 倍）；**课程数已由 24 降到 12，常驻对象更少**。收尾复测（同一 512 KB 档模拟器）为 `allocBytes 115992 / peakAllocBytes 116088`，与上列数值并列，均属**已实测** |
| 证据总量 | `.dsh-tmp` 下共 **111 个 PNG**（`crops/`、`pngA`~`pngW`、`png-last/z1`~`z10`、`png-z11/z12`、`frames-*` 等） | 本轮新增 `pnghmC`、`pngGestures`、`pnggDown2`、`pngNav3` 四组；收尾修正复测又追加 `pngwk1`（改前第 5 周）、`pngwk2`（修正前仍显示「下一节」）、`pngwk4`（修正后显示「缓存为第 5 周，请重新同步」）三组 |

### 遗留待真机项（本轮新增）

- **表冠 `pageTurn` 未在硬件验证**：模拟器**无法注入表冠事件**（`@since 24` 的 `setMonitorForCrownEvents` 在模拟器里拿不到真实 `degree`），本轮 `crownTurn` 的分派（首页翻页、今日课表滚动、作息滚动、其余返回）与 `pageTurn` 的环形翻页逻辑**全部只有静态正确性**，GT5/GT6 真机必须有表冠才能确认。
- **收尾修正的联动重拉未在真机验证**：模拟器只验证到「点 + 后缓存标记变为过期」的抓帧链路（`.dsh-tmp/pngwk1`、`pngwk4`），`doStep → doSync()` 真正走通依赖真机 HTTP（见下方真机项 2）。
- **GT2 64 KB 档需把 `MAX_COURSES` 降到 5**（`const.js:12-15` 注释原文；旧文档的「降到 8」为过时说法）。
- 沿用上一轮仍未解决的真机项：`@system.file`/rawfile 读写、振动、BLE 扫描、局域网 HTTP 拉取（`@system.fetch`）在真机上均**未验证**。
- **未知**：首页 8 个内部视图在 64 KB 真机上的常驻峰值（本轮只跑了 512 KB 配置的模拟器下限回归）。

### 本轮收尾修正（2026-10 第二轮·续）

本轮章节写完后，又按新证据修了两处**用户可见行为**与一处工程隐患：

1. **改周次即视为缓存过期**（`index.js:1155-1170`）：`doStep` 里 `1001/1011` 现在累积 `weekChanged`，循环末尾 `if (weekChanged && !store.dataIsCurrentWeek() && store.get().syncHost) this.doSync();`（:1169）。手动改「当前周」后如果本地缓存已不属于该周，且已配同步地址，就立刻重拉当周；没配地址时首页会显示「缓存为第 N 周，请重新同步」，而不是继续拿上一周的课表当当前状态。（模拟器实测：设置页当前周 5 → 点两次「+」→ 7）
2. **首页缓存过期提示优先于「下一节」**（`index.js:578-585`）：`drawHome` 的辅助行（行心 314）先判断 `!store.dataIsCurrentWeek()` → 显示 `home_cached_week`「缓存为第 N 周，请重新同步」，否则才显示 `home_next`「下一节 …」。修正前缓存已过期时仍显示上一周的「下一节」，具误导性。
3. **`sync.js pull()` 的兜底定时器补 `clearTimeout`**（`sync.js:142-156`）：超时 `setTimeout` 存入 `var guard`（:144），`finish()` 内 `if (guard) clearTimeout(guard);`（:149）；请求先返回时不再白留定时器。属「定时器成对清理」审计项，非用户可见行为。

| 页面/状态 | 证据文件（`NexioWatch/.dsh-tmp/` 下） | 结论 |
|---|---|---|
| 设置页改周次 | `pngwk1/f10.png`（改前第 5 周）、`pngwk1/f12.png`（两次「+」后第 7 周） | 已实测（模拟器 512 KB 档；联动重拉依赖 HTTP，真机未验） |
| 首页缓存过期（修正后） | `pngwk4/f12.png` | 显示「缓存为第 5 周，请重新同步」，已实测 |
| 首页缓存过期（修正前对照） | `pngwk2/f12.png` | 仍显示「下一节 创新创业基础 14:00」，属误导，已修正 |

- 构建与审计（收尾这一版）：`hvigorw --mode module -p product=default assembleHap --no-daemon` 两次 **BUILD SUCCESSFUL**（8.5 s / 7.9 s，26 tasks）；审计脚本 **FAIL=0 / WARN=2（均为 REAL-DEVICE REQUIRED：振动、`@system.file`/rawfile）/ PASS=12**；`JS=15` 文件 **117,027 B**、HML=1、styles=1、images=2、audio=0；`Timers create=8 / clear=8`、`Subscriptions subscribe=1 / unsubscribe=1`。
- 运行期内存复测（模拟器 454×454、512 KB 档）：`totalBytes 524280 / allocBytes 115992 / peakAllocBytes 116088`（上一轮为 113224 / 118760，两个值并列；差异属噪声量级）。
- 仍属**未知·待真机**：表冠 `pageTurn` 与 16 度/档手感、`doStep` 联动重拉的真实 HTTP 往返（依赖下方真机项 2）、GT2 64 KB 档峰值。

---

## API 兼容表

| API/组件 | 最低版本 | syscap/权限 | Lite Wearable 差异 | 目标机状态 |
|---|---:|---|---|---|
| `@system.app.getInfo / terminate` | @since 3（`getInfo` 部分项 ArkUI.Full @since 6） | syscap `ArkUI.ArkUI.Lite` | `getInfo().language` 用于判定语言（`common/i18n.js`）；`terminate()` 用于"退出应用"按钮（`index.js:1249 doExit`，实际写为 `this.$app.terminate()`） | **部分已验证**：关于页在模拟器中渲染正常；`getInfo()` 实际返回值与 `terminate()` 的退出行为**未实测**（模拟器不能退出） |
| `@system.bluetooth.startBLEScan / stopBLEScan / subscribeBLEFound / unsubscribeBLEFound` | **@since 6** | syscap `SystemCapability.Communication.Bluetooth.Lite`；`@famodelonly`；config.json 已声明 `ohos.permission.ACCESS_BLUETOOTH` + `ohos.permission.DISCOVER_BLUETOOTH`（均为 inuse） | 只有 4 个静态方法，**无 GATT/connect/特征读写**，只能扫描广播；本机模拟器中 `@system.bluetooth` **解析为 undefined**（`common/ble.js:14` 实测注释），故一律 `typeof` 判断 | **资料支持**（`.d.ts` @since 6 与本项目 compatible 6.1.1(24) 相符、权限已声明）；真机 BLE 扫描未验证 |
| `@system.fetch.fetch` | @since 3 | syscap `SystemCapability.Communication.NetStack`；`.d.ts` **无 `@permission` 标注**；`ohos.permission.INTERNET` **已声明**（system_grant / normal / since 9，见 `PermissionDefinitions.json:1738-1746`） | `responseType:'text'` 时 `res.data` 为字符串；本项目 `GET http://<host>:<port>/schedule.json` | **资料支持**（`.d.ts` + 权限声明表 + 构建通过）；真机网络行为未验证 |
| `@system.file.access / readText / writeText / mkdir` | @since 3 | syscap `SystemCapability.FileManagement.File.FileIO.Lite`；`@reserved ["liteWearable"]`；`.d.ts` 无 `@permission`；单次读写上限 4096 B | **模拟器/预览器不执行该模块**（技能明确） | **未知，真机阻塞**（`internal://app/...` 读写必须在真机验证） |
| `@system.storage.get / set` | @since 3（API 6 起 deprecated 标注） | syscap `SystemCapability.DistributedDataManager.Preferences.Core.Lite`；无权限；value < 128 字节 | 只存小标志 | **未知，真机阻塞**（模拟器不执行，见 §验证结果） |
| `@system.vibrator.vibrate` | @since 3（API 8 起 deprecated；官方注明 lite 上持续维护） | **`ohos.permission.VIBRATE`（已声明）**；`@famodelonly`；`@reserved ["liteWearable"]`；syscap `SystemCapability.Sensors.MiscDevice.Lite` | `mode:'short' \| 'long'` | **资料支持**（`.d.ts`）；**振动本体真机未验证** |
| `@system.router.replace / replaceUrl` | @since 3（`@reserved ["liteWearable"]`） | syscap `ArkUI.ArkUI.Lite` | **只有 `replace/replaceUrl`**，无 `push/back/getLength`；`replace` 后是全新 JS 上下文 | 已验证（正是该限制推动了单页架构；项目已不依赖路由） |
| `@system.router.getParams` | **@since 7**（ArkUI.Full） | — | 高于本项目 compatibleSdkVersion 6.1.1(24) | **不可用 → 已移除**，改 `store.select(id)` 传参 |
| `<canvas>` + `getContext('2d')` + `fillText` / `fillRect` / `arc` / `rect` / `beginPath` / `moveTo` / `lineTo` | 项目实测可用 | — | **没有 `quadraticCurveTo/bezierCurveTo/arcTo/createLinearGradient/drawImage`**；`arc()+fill()` 画不出填充（圆角方块渲染成十字），故圆角用逐行 1px 横条逼近（`common/ui.js:28-46`） | **已验证**（模拟器抓帧，8 个内部视图全部正常渲染，中文可显示） |
| `@system.wearengine` | 本机 SDK 不存在 | — | — | **已确认不可用 → 全项目 0 引用；同步改「蓝牙发现 + 局域网 HTTP + 文件通道」** |

> 弃用 ≠ 目标旧设备不可用（router/vibrator/storage 在 API 8 起标 deprecated，但官方文档说明 vibrator 在 lite 上持续维护）；替代接口 ≠ 目标旧设备支持（`router.getParams` @since 7 高于目标 API 6）。两者分别陈述。
>
> 待确认项：`@system.fetch` 的 `.d.ts` 没有 `@permission` 标注，SDK 权限表也只给出 `grantMode: system_grant`；本项目已**防御性声明 `ohos.permission.INTERNET`**（`config.json` reqPermissions 第 4 项），真机上是否必须声明、以及 `@system.fetch` 在 lite 运行时是否真正可用，仍列为真机待验证项（**未知**）。

---

## 资源路径与命名

| 资源/用途 | 源码目录 | 运行时路径 | 英文 ASCII 命名 | 验证状态 |
|---|---|---|---|---|
| HML/CSS 固定图片 | 不适用（本项目 **0 张页面图片**，全部图形由 canvas 绘制） | — | — | 构建 |
| media 应用图标 | `entry/src/main/resources/base/media/icon.png`（104×104，8420 B）、`icon_small.png`（92×92，7199 B） | `$media:icon` / `$media:icon_small`（config.json `abilities[0].icon`） | **通过**（审计：2/2 文件 ASCII 路径） | 构建 + 审计 |
| i18n 文案 | `entry/src/main/js/MainAbility/i18n/zh-CN.json`（1440 B）、`en-US.json`（1322 B）（`{"strings":{...}}`，**40 个键**；`en-US.json` 同为 40 键） | 打包后 `loader_out_lite/.../i18n/*.json`；运行时由 `common/i18n.js` 的 `app.getInfo().language` 选择 | 键名全 ASCII（`app_name`、`btn_back`、`week_short` 等）；**UI 文案一律走 key，不硬编码中文字符串**（`common/i18n.js:69 t(key,n)`） | 构建 + 模拟器渲染（`-l zh_CN`） |
| file API 原始文件（离线通道） | `entry/src/main/resources/rawfile/`（**当前目录为空，未随包内置 `nexio_schedule.json`**） | `internal://app/rawfile/nexio_schedule.json`（`common/const.js:58 URI_RAW`） | **通过**（文件名 ASCII） | **未知，真机阻塞**（`@system.file` 模拟器不执行） |
| 运行时导入文件 | 不适用 | `internal://app/import/nexio_schedule.json`（`const.js:57 URI_IMPORT`，用 `hdc file send` 推入） | 通过 | **未知，真机阻塞** |
| 运行时可写数据 / 导出 | 不适用 | `internal://app/nexio/schedule.json`（`const.js:56 URI_DATA`）、`internal://app/nexio/export.json`（`const.js:59 URI_EXPORT`） | 通过 | **未知，真机阻塞** |

- 无中文/空格/非 ASCII 图片名（审计 PASS + 构建输出确认）。`common` 对用户文件系统不可见，页面资源若将来需要图片应放 `js/MainAbility/common`，用 `/common/...` 绝对路径引用。
- 路径无动态拼接：所有 URI 常量集中在 `common/const.js:56-59`（均 ≤ 128 字节且全 ASCII）；`store.js:300 dirOf()` 只用 `lastIndexOf('/')` 截断，最终目标路径可静态核对。
- `.d.ts` 与技能均说明：DevEco 5.0/API 10 预览器与 Lite Wearable 模拟器**不能执行 `@system.file`**，因此 rawfile / 运行时数据三行只能写"**未知，真机阻塞**"，不能写"通过"。

---

## 内存预算

| 类别 | 常驻 | 操作峰值 | 回收点 | 证据 |
|---|---:|---:|---|---|
| 页面/模块 JS 状态 | `MAX_COURSES=12`（**只缓存当前周**）门课程对象 + `settings` + `times` + 常量表；按 512 KB 档设计，模拟器 64 KB 档下稳定 | 每次 `redraw()` 重建 `this.taps` 命中矩形数组（8 视图各自 `reg()`），`drawWeek` 每帧遍历 7 天 × 课程 | 视图切换时 `this.taps = []` 重建（`index.js:321`）；`onDestroy` 清定时器、`BLE.stop()`（编辑态字段已随重构删除） | 模拟器实测（`-hs 65536`，0 次 OOM） |
| 文件读取与 JSON 解析 | 0（模拟器不执行 file API） | `store.js:306-347 readAllText`：`length:4096` / 次、`rounds>24` 截断 → 峰值文本 ≤ 96 KB，随后 `JSON.parse` 生成对象图；`save()` 时 `toJson()` 会同时存在对象与完整序列化字符串（`store.js:263-296`）。第二轮起同步只落当前周，`courses` 数组本身 ≤ 12 门。**真机峰值未实测，列为风险** | `readAllText` `parts` 拼接后一次性 `finish()` 释放；`readText` 3000 ms、`readAllText` 6000 ms、`writeText` 5000 ms、`load` 4000 ms 兜底，全部由 `done` 标志保证只回调一次；**第二轮起这四处 `finish()` 内都补了 `clearTimeout`**（`store.js:316` 等），避免回调已返回后定时器仍二次触发 | 静态估算（未在真机测量） |
| 定时器、订阅和回调 | 今日页 30 s `setInterval`（`index.js:169`，`startTick` 有 `if (this.timer) return` 重复保护）；BLE 扫描 8 s `setTimeout`（`ble.js:122`） | `store.js` 4 处超时兜底（3000/4000/5000/6000 ms）+ `sync.js:156`（`SYNC_TIMEOUT_MS=3000`，定义在 `common/const.js:28`）网络超时**且 `pull()` 的兜底定时器已补 `clearTimeout`**（`guard` 在 `sync.js:144` 声明、`:149` 清理，请求先返回时不再白留定时器） + `remind.js` 无定时器 | `onHide/onDestroy` → `stopTick()` `clearInterval` 并置 `null`（`index.js:177-179`）；`onDestroy` 调 `BLE.stop()`（`clearTimeout` + `unsubscribeBLEFound` + `stopBLEScan`）；审计统计 timers create=8 / clear=8、subscribe=1 / unsubscribe=1 | 静态 + 审计 |
| 图片池最大并发 | 0 张页面图片（2 个图标仅用于桌面/应用列表，非页面渲染） | 0（解码估算约 0.07 MiB，若同时解码两个图标） | 不适用 | 静态 + 审计 |

- 审计脚本内建体量：JS 15 个文件 **117,027 B**（收尾复核；先前 116,844 B、第一轮 101,585 B、更早 94,324 B）、HML **1** 个（155 B）、styles **1** 个（137 B）、images 2 个（15,619 B）。**注意：源码字节数不等于运行时堆占用。**
- 第二轮实测运行期内存（模拟器 454×454、512 KB 档）：`totalBytes 524280 / allocBytes 113224 / peakAllocBytes 118760`（收尾复测 `allocBytes 115992 / peakAllocBytes 116088`；第一轮为 107320 / 108512）。课程上限由 24 降到 12 后常驻对象更少，但因新增 home 视图与 7 个指示点，峰值仅小幅上升。
- 证据归档：`docs/screenshots/index-today.jpg`（17344 B）、`week-grid.jpg`（22035 B）、`edit-form.jpg`（25466 B）、`sync-page.jpg`（19623 B）；另有模拟器抓帧目录 `NexioWatch/.dsh-tmp/`（本轮复核共 **111 个 PNG**，含 `crops/`、`pngA`~`pngW`、`png-last/z1`~`z10`、`png-z11/z12`、`frames-*`，第二轮新增 `pnghmC`、`pngGestures`、`pnggDown2`、`pngNav3` 四组；收尾复测再追加 `pngwk1`、`pngwk2`、`pngwk4` 三组）。
- 常量表设计（`common/const.js`）：`HEAP_TIER_KB=512`、`MAX_COURSES=12`（`:16`）、`MAX_INCOMING=200`（`:17-18`）、`MAX_HOLIDAYS=60`、`MAX_WEEKS=30`、`MAX_SECTIONS=12`。
- 降级路径：`MAX_COURSES` 若改为 **5** 即可回退到 GT2 系列 64 KB 档（`const.js:12-15` 注释原文「64KB 档可改 5，兼容 GT2 时改 5 即可」；旧文档写的「改成 8」已过时）。该回退**未在 64 KB 真机上验证**，属资料支持/未知。
- 垃圾回收敏感点：今日页与周课表全部 canvas 绘制，不产生 HML 节点；周课表 HML 版实测要到 `-hs 196608` 才不 OOM，canvas 版 64 KB 即稳定（`ui.js:1-6` 注释记录）。

---

## 验证结果

| 层级 | 环境 | 结果 | 未覆盖风险 |
|---|---|---|---|
| 静态审计 | `scripts/audit_lite_watch_project.ps1 -ProjectPath NexioWatch -TargetHeapKB 512 -TargetApi 6 -SdkApiPath D:/DevEco Studio/sdk/default/openharmony/js/api` | **通过**：Lite Wearable 配置 PASS；图片命名 PASS（2/2 ASCII）；平台 API 版本全部 PASS（`@system.app.getInfo/terminate` @since 3、`@system.bluetooth` 四项 @since 6、`@system.fetch.fetch` @since 3、`@system.storage.get/set` @since 3、`@system.vibrator.vibrate` @since 3）；平台 import 仅 `@system.app/bluetooth/fetch/file/storage/vibrator`；timers create=8 / clear=8、subscribe=1 / unsubscribe=1；2 条 REAL-DEVICE REQUIRED（振动；`@system.file`/rawfile） | 2 条真机阻断项。曾有 2 条 `async/await` / 运行时内建 WARN 系**注释文本误命中**（`store.js:258`、`const.js:4`），已改写注释；`entry/src/main` 下 `await|async |Promise` 现为 0 处匹配 |
| DevEco 构建 | SDK API 26、compatibleSdkVersion 6.1.1(24)、`hvigorw assembleHap`；签名配置为空 | **通过**：`.hvigor/outputs/build-logs/build.log` 多次 `COMPILE RESULT:SUCCESS` + `BUILD SUCCESSFUL in 7~9 s`（:17519、:17951、:18363）；产物 `entry-default-unsigned.hap` 1,095,772 B @2026/10/8 17:40:49；loader_out 只有 1 个页面 JS（第二轮 108,489 B，第一轮 96,209 B）。**第二轮增量构建 BUILD SUCCESSFUL，耗时约 6.3 s** | 未配置 `signingConfigs`（仅签名 WARN，不影响本地验证）；真机安装需用户侧签名 |
| Lite 模拟器（点击 + 手势） | `Simulator.exe -hs 65536`（64 KB 下限）、454×454 圆形、`-sd 160`、`-l zh_CN`；harness `.dsh-tmp/tap.js`（点击，单条 WS 持续收帧）+ `.dsh-tmp/drag.js`（手势 `md,x1,y1,x2,y2`）+ WebSocket 抓帧 | **通过**：8 个内部视图全部渲染、**0 次 OOM**。已注入命中并截图归档：今日页课表卡片、课程详情页（本轮已改为**只读**，仅「返回」）、周课表页、作息时间页（本轮改为可滚动）、设置页（当前周/总周数步进、上课提醒开关）、同步与导入页、关于页；本轮四合一重构后的逐页证据见下节「本轮四合一 UI 重构（2026-10）」；**手势**：今日页右滑→前一天、左滑→后一天，周课表右滑→上一周、左滑→下一周，详情页右滑→返回（原「编辑页右滑收起浮层」已随编辑浮层删除；帧字节随内容变化，约 20~38 KB，逐帧记于 `.dsh-tmp/shots-*/`） | 模拟器**不能执行 `@system.file` / `@system.storage` 的真实读写**（技能明确），文件通道与存储未覆盖；蓝牙在本机模拟器解析为 undefined，BLE 扫描未覆盖；振动未覆盖；**系统级右滑手势**未覆盖；466×466 真机分辨率未覆盖 |
| 真机 | HUAWEI WATCH GT5 / GT6（型号/固件待用户提供） | **未运行** | 实际 JS heap 档位（512 KB 假设待验证）、BLE 扫描广播、局域网 HTTP 拉取与 INTERNET 权限、`@system.file` 读写、`@system.storage` 读写、振动权限与强度、466×466 圆屏裁切与字号 |
| 压力回归 | 模拟器 `-hs 65536` 反复冷启动；历史 HML 版 vs canvas 版堆阈值对比 | **通过**（canvas 版 8 视图 0 OOM；历史 HML 周课表需 196608 才通过，已在 65536/81920/98304/131072 复现 OOM） | 未做长时间运行 / 低电量 / 真机大文件导入峰值；`MAX_COURSES=12` 未在 64 KB 真机档压测（设计目标为 512 KB） |

### 本地验证方法（可复现）

- 模拟器：`D:/DevEco Studio/sdk/default/openharmony/previewer/liteWearable/bin/Simulator.exe`，参数含 `-device liteWearable -shape circle -or 454 454 -cr 454 454 -hs <JSHEAP> -l zh_CN`。
- 注入点击：命名管道 `\\.\pipe\<SID>_commandPipe`（`SID='nw_'+tag`），发送 `{"version":"1.0.1","command":"MousePress"|"MouseRelease","type":"action","args":{"x":<x>,"y":<y>,"duration":<ms>}}`；按 60 ms 按下、0 ms 释放、间隔 900 ms 的节奏。
- 注入手势：同一条命名管道改用 `MouseMove`，即 `MousePress → MouseMove×8 → MouseRelease`（`.dsh-tmp/drag.js` 的 `md` 步骤）。**实测 `TouchPress/TouchMove/TouchRelease` 命令注不进应用**（画面字节完全不变、无事件），必须走 Mouse 系列；而 `@swipe` 属性即使编译通过也从不触发，只有 `@touchstart/@touchend/@touchcancel` 可用。
- 抓帧：WebSocket 握手后从二进制帧里截取 JPEG（`FF D8 FF` SOI）。
- 用法：`node tap.js <tag> pages/index/index <port> 'shot;t,x,y;shot'`，截图落在 `NexioWatch/.dsh-tmp/frames-<tag>/fN.png`（`.dsh-tmp/tap.js` 单条 WS 持续收帧，避免 walk.js/swipe.js「每步新开 WS 抓到陈旧帧」的问题）。
- **实测注意：启动后第一次点击会被引擎吞掉，脚本必须以 `shot` 开头。**
- 归档截图：`docs/screenshots/index-today.jpg`（17344 B）、`week-grid.jpg`（22035 B）、`edit-form.jpg`（25466 B）、`sync-page.jpg`（19623 B）。

### 最终兼容声明

本次仅在「**DevEco 构建（API 26 / compatible 6.1.1(24)）+ Lite Wearable 模拟器（454×454、`-hs 65536`、8 个内部视图全量冷启动 + 注入点击与手势）**」这一矩阵内验证通过。

- 资料支持但**未真机测试**的设备单独列出，不合并为"全系列兼容"：**GT5 / GT6**（用户指定 512 KB 档；模拟器只有 64 KB 档做下限回归）。
- **GT2 系列（64 KB）按资料处理**：当前 `MAX_COURSES=12`（只缓存当前周）未在 64 KB 真机验证；回退需把 `MAX_COURSES` 改为 **5**（`const.js:12-15`，旧文档的「改成 8」已过时），属**未知**。
- GT3（256 KB）、GT3 Pro / FIT2 / FIT3（512 KB）为资料支持，未真机测试。

### 真机待验证清单（阻断项优先）

1. **`@system.bluetooth`**：GT5/GT6 上 `startBLEScan`/`subscribeBLEFound` 是否返回手机端广播，且 `res.devices[i].data` 的形态是明文 `"NEXIO|ip:port"` 还是十六进制串（`ble.js:45-67` 两种都兼容但需实测确认）。
2. **`@system.fetch`**：局域网 `GET http://<host>:8787/schedule.json` 是否可用（`ohos.permission.INTERNET` 已声明，属防御性补齐；`.d.ts` 无 `@permission` 标注）。
3. **`@system.file`**：读 `internal://app/rawfile/nexio_schedule.json`（rawfile 目录当前为空）与 `internal://app/import/nexio_schedule.json`、写 `internal://app/nexio/schedule.json` 是否成功（模拟器不执行）。
4. **`@system.storage`**：四个小标志读写是否成功；`< 128 字节` 限制下是否有额外行为。
5. **`@system.vibrator`**：振动是否触发、时长/强度与权限弹窗行为。
6. **实际 JS heap 档位**：决定 `MAX_COURSES` 能否维持 12；若真要覆盖 GT2，改为 5。
7. **466×466 圆屏**：中文字号与安全区表现（模拟器只验证了 454×454）。
8. **`onDestroy` 与蓝牙订阅**：离开页面后是否确实停止扫描（模拟器上 `@system.bluetooth` 为 undefined，无法覆盖）。
9. **表冠（第二轮新增阻断项）**：模拟器**无法注入表冠事件**，`onCrown`/`crownTurn`/`pageTurn` 的分派与首页环形翻页**未在硬件验证**；真机需确认顺时针方向、灵敏度与 16 度/档的手感。
10. **首页在 64 KB 档的峰值**：本轮模拟器内存 ack 为 512 KB 档配置（`allocBytes 113224`/`peakAllocBytes 118760`；收尾复测 115992/116088），64 KB 真机（GT2）未测。

## 第三轮（2026-10-09）：真机「单文件 49,152 B 硬闸」——黑屏根因与内核分离

### 根因（引擎源码证据）

- 阈值：`frameworks/src/core/base/js_fwk_common.h:89` `constexpr uint16_t FILE_CONTENT_LENGTH_MAX = 1024 * 48;` = **49,152 B**。
- 门禁：`frameworks/src/core/base/js_fwk_common.cpp:649 CheckFileLength()`，由 `js_fwk_common.cpp:684 ReadFile` **每次调用** ⇒ 所有 `.js`/`.bc` 都过闸；比较是严格 `>`，正好 49,152 B 合法。
- 真机分支（`js_fwk_common.cpp:657-665`）**硬拒绝、不是截断**：`return false` ⇒ `scriptBuffer` 置空 ⇒ `js_page_state_machine.cpp:324` 判定 `IS_UNDEFINED(evalResult)` 直接 return ⇒ **该文件零执行、整屏黑**；失败后还会 `.js`↔`.bc` 换后缀重试，`.bc` 同样卡 49,152 B（`js_app_context.cpp:157`）。
- 模拟器分支只打 WARN（文案 `js_fwk_common.cpp:661` `File exceeds size limit but allowed on simulator.`；另一条 `%s is bigger than %zu KB.` 在 `:632`）⇒ **模拟器通过不能替代真机结论**，必须量产物字节数。错误码：`include/base/ace_event_id.h:60` `EXCE_ACE_PAGE_FILE_TOO_HUGE` (0x0003)。
- **配额是按文件独立**的：`app.js` 走 `js_ability_impl.cpp:81`，每个页面走 `js_page_state_machine.cpp:323` ⇒ N 个页面 ≈ N × 49,152 B 容量。
- debug 构建**永不压缩**：`D:/DevEco Studio/tools/hvigor/hvigor-ohos-plugin/src/tasks/legacy-tasks/legacy-compile-lite-node.js` 里 `hapMode:(!this.targetService.isDebug()).toString()` 且 `.addBuildMode(this.targetService.isDebug())`，只有 release 才挂 `TerserPlugin{compress:false,mangle:true}`（`webpack.lite.config.js:229-240`）。

### 修法：内核分离（common 全部搬到 app.js）

- `NexioWatch/entry/src/main/js/MainAbility/app.js` 顶层 `import` 全部 common 模块并发布 `globalThis.NEXIO = {...}`（13 键：`store,M,D,UI,SY,BLE,t,ICON32,WEEK_FULL,WEEK_LONG,MAX_COURSES,HEAP_TIER_KB,app`）。
- 页面 `pages/index/index.js` **0 条 import**，只 `var K = globalThis.NEXIO;` 取别名；实测 app.js 模块顶层先于页面模块顶层执行，页面顶层即可读到 NEXIO。
- 删死模块 `common/app.js`、`common/nav.js`、`common/remind.js`（全项目 0 引用）。

### 尺寸实测（本轮，两个构建都 BUILD SUCCESSFUL）

| 构建 | 文件 | 字节数 | 49,152 B 闸 | 余量 |
| --- | --- | --- | --- | --- |
| debug（默认） | `app.js` | 72,094 | 超闸 | **-22,942** |
| debug（默认） | `pages/index/index.js` | 47,527 | 合规 | +1,625 |
| `-p buildMode=release` | `app.js` | 42,400 | 合规 | +6,752 |
| `-p buildMode=release` | `pages/index/index.js` | 29,057 | 合规 | +20,095 |

- 表中 debug 的 `app.js` 超闸是**结构性**的：`app.js` 必须内联全部 common（store 18,113 / model 10,236 / sync 8,089 / ui 6,771 / i18n 4,255 / const 4,082 / ble 3,766 / date 3,209 / seed 2,947 / holiday 1,674），terser 实测 debug 产物只去空白仍 56,526 B、mangle 后 41,478 B ⇒ **只有 release 构建能进闸**。
- 结论：**真机安装必须用 release 构建的包**（`hvigorw --mode module -p product=default -p buildMode=release assembleHap --no-daemon`）；debug 包只用于模拟器。
- 新增守门脚本 `NexioWatch/tools/check-lite-size.ps1`：读 `entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/{app.js, pages/index/index.js}`，任一 > 49,152 打印 `[FAIL] … over the limit by N B` 并 `exit 1`；全部合规打印 `[ OK ] … of headroom` 并 `exit 0`。**脚本必须保持纯 ASCII**（Windows PowerShell 5.1 按 ANSI 读取无 BOM 的 UTF-8 会把中文弄坏并报 `Missing closing '}'`）。

### 本轮代码改动（在原有功能不变的前提下）

- 删死代码：`RING_FRAMES`、`RING_FRAME_MS`、`TODAY_Y0`、`repaint()`、`startRingAnim()`、`stopRingAnim()`、`viewIndex()`、`VIEWS`、页面里已无引用的 `ALPHA`/`ICON24` 别名。
- 把三个 helper 搬进 `common/ui.js`（页面改 `UI.xxx` 调用）：`drawIcon(ctx, icon, x, y)`、`curPctOf(st, c)`、`drawRing(ctx, cx, cy, r, lw, p, color)`；`ui.js` 顶部新增 `import { ALPHA } from './icon.js';`、模块内新增 `var C_RING_TRACK = '#26262B';`，named export 与 default export 两份清单都已同步。
- 语义清理：关于页版本号两处改 `v1.0.1`；删设置页「上课提醒」行与 `dispatch` 的 `remind` 分支；`common/store.js` 的 `setReminder()` 及其两处导出（已无调用者）；退出应用改为 `K.app.terminate()`（`app.js` 新增 `import app from '@system.app'` 并在 NEXIO 发布 `app`），失败降级 `jump('home')`。
- **修复真实 bug**：`pages/index/index.js` 原 `this.setScalar('bar', curPctOf(st, c));` 把 `curPctOf` 当**裸函数名**调用（模块作用域里不存在该函数）⇒ 今日课表只要出现「进行中」卡片就抛 `ReferenceError`，被 `redraw` 的 `try/catch → drawError` 兜成「页面渲染失败」错误屏；现为 `UI.curPctOf(st, c)`。
- 行号漂移提示：本轮删除约 87 行，`pages/index/index.js` 现为 **1,410 行**；本文与 `design-and-plan.md` 中早于本轮的 `index.js:NNN` 锚点在删除位置之后会整体上移，引用时请以当前文件为准。

### 证据

- 构建：debug `BUILD SUCCESSFUL in 7 s 598 ms`、release `BUILD SUCCESSFUL in 7 s 733 ms`；守门脚本 release `exit 0`、debug `exit 1`。
- 契约：`app.js` 发布 13 键，页面 `K.*` 读取同一 13 键，双向差集为空；页面 `^import`=0、`this.$app`=0、`require(`=0、编辑/加课残留=0。
- 运行：`node .dsh-tmp/runapp.js final7 9000` → `crash=false` 且日志有 `[Console Info] NexioWatch onCreate`，无 JS 异常、无 `bigger than` 警告；`.dsh-tmp/burst-final7b/s0.jpg`（21,569 B）与 `.dsh-tmp/burst-about5/s0.jpg`（21,488 B）目视首页版式正常。
- 独立复核报告：`.dsh-tmp/verify/report-task7.md`（由 Lead 执行，verifier teammate 未启动）。

## 第四轮（2026-10-09）：m06685 四项 UI/交互修复 + 引擎字号族缺陷

### 反馈与处置

| # | 用户反馈（要点） | 根因 | 处置 | 证据 |
| --- | --- | --- | --- | --- |
| ① | 首页左右不对称、中间文字与背景不是对称关系、右侧竖排点未与边框对齐、主页信息可更丰富 | 对齐用 `UI.tw()` 估算宽度（拉丁系数偏大）；右侧指示点列未与圆弦对齐 | 右对齐改交引擎 `ctx.textAlign='right'`；顶部左右同内缩 `HOME_SAFE_X=96`；删右侧指示点列与 `'dot'` 补间通道；信息行 3 → 4 行（本周 / 今日课程 / 下一节 / 数据） | `.dsh-tmp/shots-h1/f11.png`：顶部带 x=97..357（y=42 弦 [95,359]）；四行 x=73..381；胶囊带 x=148..305 |
| ② | 关于页文字显示不全；「返回」「退出」两个按钮功能好像一样 | 旧 `ellipsize` 预算偏大 ⇒ 值被截断；两按钮同为中性色，且退出退化为回首页 | 四行 panel 全部完整；返回＝中性灰胶囊 / 退出＝红胶囊 + 二次确认（`exitArmed`）；退出走 `@system.app.terminate()`，失败提示 `exit_failed` | `.dsh-tmp/shots-h4/f21.png`：panel 四行 y=168..269 x=74..383 完整 |
| ③ | 只留一周课程、不需要查看功能 | 周课表行仍 `reg(...,'pickDay',i)` ⇒ 点击跳「今日课表」 | 删行命中区与 `dispatch` 的 `pickDay` 分支（周课表只读）；同时删 `crownTurn` 的换周分支 | 全项目 `pickDay` 0 命中 |
| ④ | 动画方向错乱：上划内容却从别的方向出来 | `jump()` 方向由 `PAGE_ORDER` 序号算、`open()` 恒 `dir=1`，与手势无关 | 手势显式传方向：上滑 `open('today',undefined,1)`、下滑 `open('week',undefined,-1)`、左滑 `jump('about',1)`、右滑 `jump('settings',-1)` | `.dsh-tmp/shots-v6`、`shots-g4`、`shots-h3` 过渡帧跟手 |

### 隐藏根因：引擎忽略「带字体族」的 canvas 字号（本轮最大发现）

- `ctx.font = '17px sans-serif'` 之类**只要带字体族名就完全不生效**：`canvas_component.cpp:509-564 FontSetter` 用 `GetSubFont()`（`:2178-2229`，按空格切分）取子串，仅 `:549` 首字符为数字才 `strtol` 取字号；带族名时整串被当字体族名，`ProductAdapter::GetDefaultFontFamilyName()` 返回 `DEFAULT_VECTOR_FONT_FILENAME`（`product_adapter.cpp:238-241`）⇒ 回退默认字号 `g_defaultFontSize=30`（`product_adapter.cpp:67`）并忽略 JS 请求字号。
- 实测（`.dsh-tmp/shots-calA..calF`）：`'40px sans-serif'`、`'40px SourceHanSansSC-Regular'`、`'sans-serif 40px'`、`'40 px sans-serif'` 全部渲染成同一个固定小字号；不写族名的 `'8px'`…`'40px'` 严格按字号单调放大。
- 后果：页面 24 处 `'px sans-serif'` ⇒ 标题、环内大字、行文字全挤成同一小字号，正是用户说的「文字显示不全 / 与背景不对称 / 行内重叠」。已全量替换为 `'<size>px'`（现 22 处无族名写法，`sans-serif` 0 命中）。
- 结论：本项目 canvas 写字**一律 `'<size>px'`，绝不带字体族名**；`measureText` 返回垃圾值（CJK → 7.6392917001e-313、拉丁 → false），不可用。

### 宽度模型重标定（`common/ui.js tw()`）

- 逐字形 advance 实测（`.dsh-tmp/shots-calE/f0.png`，8 档字号）：**汉字 advance ≈ size + 2**（8/11/13/16/20/26/34px → 10/13/15/18/22/28/36）；**数字/拉丁 advance ≈ 0.6*size + 1**（→ 6/8/9/11/13/16/21）。
- 旧系数（CJK `0.95*size`、拉丁 `0.45*size`）系统性低估：13px 的「周二线性代数 10:00 · 体育（篮球） 16:00」估算 211px、实际渲染 271px（低估 22%）⇒ `ellipsize` 判「不超宽」不截断 ⇒ 课名墨迹压到日期列。
- 周课表据此收紧：`WEEK_NAME_W` 240 → **235**（日期列左端 343 再留 12px）；一行两门课时只第一门带开课时间，超宽由 `ellipsize` 截断。

### 尺寸（本轮收尾，两次构建均 BUILD SUCCESSFUL）

| 构建 | `app.js` | `pages/index/index.js` | 49,152 B 闸 |
| --- | --- | --- | --- |
| debug（默认） | 72,110 B | 47,837 B | app.js 超闸（-22,958，结构性）；页面合规（+1,315） |
| `-p buildMode=release` | **42,327 B** | **29,144 B** | 两者合规（+6,825 / +20,008） |

- 本轮瘦身：删死数据 `ICON24`（24×24 图标点阵，全项目 0 引用）⇒ `common/icon.js` 4,415 → **3,754 B**；`ICON32` 数据块与备份逐字节一致（789 B）。
- 守门脚本复测：release `exit 0`、debug `exit 1`。
- 真机会在 `.js` 失败后做 `.js`↔`.bc` 后缀互换重试（`js_app_context.cpp:170-179`，`.bc` 同卡 49,152），故两条路径都实测：release 包内 `assets/js/MainAbility/app.bc` **35,872 B**、`pages/index/index.bc` **24,102 B** ⇒ 均合规；release HAP 体积 268,494 B（debug 1,095,772 B）。

### 证据

- 抓帧：`.dsh-tmp/shots-h1`（首页）、`shots-h2`（今日）、`shots-h3`/`shots-g4`（周课表）、`shots-h4`（关于页）；`bands.py` 逐带与圆弦对照全部 in-chord。
- 静态：`$app` / `sans-serif` / `pageDots` / `DOT_X` / `RING_FRAME` / `TODAY_Y0` / `viewIndex` / `repaint(` / `startRingAnim` / `stopRingAnim` / `pickDay` 全项目 **0 命中**；页面与 `common/ui.js` `node --check` 通过。
- 独立性：docs-writer 与 verifier teammate 本轮仍长期 inactive，全部复核由 Lead 亲自执行（弱于外部 reviewer）。

## 第五轮（2026-10-09）：真机黑屏根因（globalThis）+ 圆形图标 + 显示名 + 删设置/作息页 + 全走手机同步

用户反馈（逐字）：「再说几个问题，不要动UI，去解决一下，实机安装打开应用黑屏但不软重启，我猜是内存问题，手表端的图标应该为圆形，包括关于页面，程序在手表端被称为lable而不是Nexio其次设置页面，作息页面都可以不要，全部接受同步手机，以免内存溢出」⇒ 五项 + 一条硬约束（不动 UI 版式）。

### ① 真机黑屏：根因是 globalThis，不是内存

| 事实 | 出处 |
| --- | --- |
| `jerry_init(JERRY_INIT_EMPTY)` 之后**只有 `#if (JSFWK_TEST == 1)` 才把 `globalThis` 挂到全局对象** | `frameworks/src/core/context/js_app_environment.cpp:82-89` |
| `JSFWK_TEST=1` 只由 `frameworks/BUILD.gn:184-186`（`if (LOSCFG_TEST_JS_BUILD)`）与 `frameworks/targets/simulator/acelite_config.h:28-29` 定义 | 同上 |
| 全 `.lite_research` 树 `globalThis` 仅 3 处命中，全在 `js_app_environment.cpp:86-88` | grep |
| 旧代码 `app.js:23 globalThis.NEXIO = {...}`、`pages/index/index.js:49 var K = globalThis.NEXIO;` | — |

⇒ 真机（`JSFWK_TEST != 1`）没有 `globalThis`，`app.js` 求值即 `ReferenceError`：无 `onCreate` 日志、整屏黑、**不软重启**（与用户描述吻合）。模拟器因 `JSFWK_TEST=1` 一直正常，所以此前测不出来。**与内存无关**。

修法（双通道 + 兜底）：

- `app.js`：`var NEXIO = {...}`（14 键，键名不变）→ `export default { data: { NEXIO: NEXIO }, onCreate(){...}, onDestroy(){...} }`。依据：`runtime-core/src/core/index.js:34-95 ViewModel()` 只认 `render`/`data`/`styleSheet` 与函数成员；`initState` 在 `__appVing__` 为真时直接 `vm.data = data`（`:80-84`）；`js_ability_impl.cpp:80-82` 在 app 求值期写 `__appVing__`，`js_app_context.cpp:182-191 SetGlobalNamedProperty(true, vm)` 把 app VM 挂到全局 `$app`。
- `app.js` 仍保留 `if (typeof globalThis !== 'undefined') { globalThis.NEXIO = NEXIO; }`（`typeof` 对未声明标识符不抛错），模拟器因此零回归。
- 页面侧三通道：`getApp().data.NEXIO` → `$app.data.NEXIO` → `globalThis.NEXIO`，任一路可用即可；`getApp()` 只在顶层调用一次并缓存（`app_data_module.cpp` 注释警告反复调用会造成 `ERR_REF_COUNT_LIMIT`「JS REF LIMIT」）。`getApp` 是引擎内置全局（`app_data_module.cpp:25-30`，`LoadAceBuiltInModules` 里 `AppDataModule::Load()`），**模拟器上也可用 ⇒ 抓帧验证走的就是真机同一条主通道**。

### ② 圆形图标

- **桌面图标**：`entry/src/main/resources/base/media/icon.png`（104×104，10,107 B）与 `icon_small.png`（92×92，8,198 B）重制为白底圆盘 + 内嵌 logo（logo 取原图 `mipmap-xxxhdpi/nexio_schedule.webp` 的彩色本体，占比 0.86，圆盘用椭圆掩码抗锯齿）；圆外 `alpha=0`，四角 alpha 全部为 0。
- **关于页图标**：Lite canvas 无 `drawImage`、无 `clip`，只能靠点阵自身构图。`common/icon.js` 的 `ICON32` 重写为圆形点阵（32×32、32 色调色板，选色＝频次×(1+6×饱和度) 后按最小色距 45 贪心；实测 meanErr 4.35 / vivid 17，16 色档只剩 1 个鲜艳色故取 32 色）。校验：`rows=32 badRows=0 maxPaletteIndex=31 paletteCount=32 encLen=1015`。
- 教训：给原图直接贴圆掩码会留白底残留；先缩小再合成会把 logo 混到盘外（紫/橙虚边）；正解是**在最终尺寸上合成**（超采样绘制椭圆掩码后 `putalpha`，不要在 `putalpha` 前 resize 掩码）。PIL 12.3.0：`Image.UNIFORM` 不存在；`quantize().getpalette()` 必须在 `convert('RGB')` 之前取。

### ③ 显示名 label → Nexio

- 根因：`entry/src/main/resources/base/element/string.json:12-13` 的 `MainAbility_label` 值是字面量 `"label"`（`config.json` 里 `label: "$string:MainAbility_label"`）⇒ 桌面显示 `label`。已改为 `"Nexio"`。

### ④ 删设置页与作息页

- `PAGE_ORDER` 去掉 `times`/`settings`；`drawView` 的两条分支、`crownTurn` 的 times 滚动分支、`drawTimes()`、`drawSettings()`、`doStep()`、`dispatch` 的 `step`/`reset` 分支全部删除；`nav()` 中间那枚胶囊由「设置」改为「同步」（新增 i18n 键 `btn_sync`，`common/i18n.js` 与打包用 `i18n/{zh-CN,en-US}.json` 同步补齐）；首页底部胶囊改为「今日 / 周 / i」；今日页环区热区与首页右滑手势改指向同步页。
- `common/ui.js` 里「页面只通过 globalThis.NEXIO 取引用」的注释同步更正。
- `store.js` 侧同步清理：`loadSeed` / `setCurrentWeek` / `setTotalWeeks` 已无调用者，一并删除。

### ⑤ 全走手机同步（去种子）

- `common/seed.js`（12 门示例课 + 2 条示例假期 + 示例设置）**删除**；新建 `common/defaults.js`：`settings()` 返回全空设置（`currentWeek:1`、`totalWeeks:18`，其余空串），`times()` 保留标准作息表。
- `times()` 必须保留：`store.refreshSectionTimes()` → `model.absSectionTimes()` 用它建 `sectionTimes`，是首页/今日/详情/周课表所有时间文案的唯一来源；手机端 `WatchPayload` 会下发 `times` 覆盖它。
- 同步页删掉「恢复示例数据」一行（`acts` 由 6 项减为 5 项）。
- 空态表现（抓帧确认）：首页环内「—」「无课」、标题「无课」、副标题「课表来自手机端同步」、信息行「本周 第1周 · 共18周 / 今日课程 无课 / 下一节 无课 / 数据 未同步」；周课表标题下显示琥珀色「同步后显示日期」+ 七行「周一..周日 无课」；同步页 5 行「同步地址 未设置 / 立即同步 未同步 / 蓝牙发现手机端 本机不支持 / 导入内部文件 / 导出到内部文件」。

### 尺寸与守门（第五轮两次构建）

| 构建 | `app.js` | `pages/index/index.js` | 49,152 B 闸 |
| --- | --- | --- | --- |
| debug | 69,677 B | 42,896 B | app.js 超闸（-20,525，结构性：debug 不压缩且 app.js 内联全部 common）；页面合规（+6,256） |
| `-p buildMode=release` | **40,702 B** | **26,070 B** | 两者合规（+8,450 / +23,082）；`app.bc` 34,572 B、`pages/index/index.bc` 21,854 B 亦合规 |

- `tools/check-lite-size.ps1`：release `exit 0`、debug `exit 1`（`app.js` 一项）。
- 本轮页面 bundle 由上一轮 47,837 B 降到 42,896 B（debug），主要来自删两页 + 删设置/作息代码。

### 证据

- 抓帧：`.dsh-tmp/shots-q1`（首页空态）、`shots-q2`（周课表空态）、`shots-q3`（关于页：圆形点阵图标 + 返回/退出）、`shots-q4`（下滑→周课表）、`shots-q5`（同步页 5 行）；`bands.py` 逐带与圆弦对照全部 in-chord。
- 静态：`drawTimes|drawSettings|doStep|loadSeed|'times'|'settings'|'reset'` 全项目 0 命中；`node --check`（页面、`common/ui.js`、`common/i18n.js`、`app.js`）通过；`btn_sync` 4 处命中。
- 独立性：docs-writer 与 verifier teammate 本轮仍长期 inactive，全部复核由 Lead 亲自执行（弱于外部 reviewer）；真机项未验证（见 `design-and-plan.md` §12.4）。

