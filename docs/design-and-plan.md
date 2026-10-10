# NexioWatch 设计 + 移植计划

> 目标：把 NexioSchedule（Android / Kotlin + Jetpack Compose）的核心课表能力移植到
> 华为 GT 系列轻智能手表（Lite Wearable / FA-JS / HML + JerryScript）。
> 本文是设计与执行计划；验收与证据记录见 [review.md](./review.md)。
> 全部结论以 `NexioWatch/entry/src/main/` 下的**当前源码**为准。

## 1. 目标设备档案（决定一切设计约束）

| 项 | 结论 | 证据等级 |
| --- | --- | --- |
| 设备类型 | `liteWearable`（`entry/src/main/config.json` 的 `module.deviceType`） | 项目实测 |
| 目标机型 | 用户指定 **HUAWEI WATCH GT5 / GT6**（512 KB 档）；本地按 454×454 模拟器验证 | 用户指令 + 模拟器实测 |
| 屏幕 | 模拟器按 454×454 圆形验证（`-shape circle -sd 160`）；GT3/GT4/GT5/GT6 物理 466×466、社区表适配分辨率 336×306；GT2 46mm/e/Pro、GS3/GSPro 物理 454×454 | 模拟器实测（454）/ 资料（466） |
| 设计分辨率 | 以 **454×454** 设计，坐标空间 `W=H=454`（`pages/index/index.js:48-49`） | 模拟器实测 |
| JS 堆 | `common/const.js:10 HEAP_TIER_KB = 512`；模拟器以 `-hs 65536`（64 KB）作**下限**回归并通过 | 资料支持（GT5/GT6 512KB）/ 模拟器实测（64KB 通过） |
| 课程数上限 | `common/const.js:16 MAX_COURSES = 12`（**只缓存当前周**，第二轮由 24 下调）；另有 `common/const.js:17-18 MAX_INCOMING = 200`（手机端下发的原始条数上限） | 项目实测（配置值） |
| 编码基线 | 只用 ES5 语法 + ES module（`var`、函数声明、无箭头函数/let/const/模板串/Promise/async） | 项目约定 + 技能 `jerryscript-syntax.md` |
| API | targetSdk 26.0.0 / compatible 6.1.1(24)，本机 SDK API 26 | 项目实测 |
| Wear Engine | **不使用**：本机 SDK 无 `@system.wearengine`，全项目 0 引用 | 项目实测（SDK 目录 + grep） |

## 2. 功能范围（手机 → 手表）

移植原则：手表是"随手看一眼"的设备，1~2 秒内要看到答案；编辑能力从简。

| 手机端能力 | 手表端决策 | 说明 |
| --- | --- | --- |
| 课程状态首页 | 移植（一级视图 `home`，**打开即显示**） | 大号达成率进度环 + 当天星期/时钟 + 当前或下一节课摘要（进行中 / N 分钟后上课 / 无课 / 假期）+ 右侧 7 点页面指示器 + 今日/周/设置三胶囊，见 §4.5 |
| 今日课程 | 移植（视图 `today`，可由首页上滑或胶囊进入） | 进行中/下一节高亮，含节次时间与状态卡；卡片超过 3 张时列表可滚动 |
| 周课表 | 移植（`week`，7 行列表） | 圆形屏不适合 7×12 网格；单 canvas 画 7 行 × 每日前 2 门 |
| 课程详情 | 移植（`detail`，**只读**） | 名称/教师/地点/节次/周次/时间 + 返回；无编辑/删除按钮 |
| 课程编辑 | **不移植（表端零编辑入口）** | 课程数据只来自手机端同步或内部文件导入；表端不提供新增/修改/删除，见 §2.1 |
| 作息时间 | 移植（`times`，只读，6 行可视 + 滚动） | 上午/下午/晚上分组节次时间 + 作息名与总节数；超出 6 行用表冠或竖向拖拽按行滚动（与今日课表页共用 `scrollTopRow/scrollRows`） |
| 设置 | 移植（`settings`） | 当前周/总周数步进、上课提醒开关、作息与同步入口、关于 |
| 关于 | 移植（`about`） | 版本、作者、适配机型、数据来源、同步方式、同步时间与地址、退出 |
| 多课表/文件夹/学期 | 简化 | 手表只保留 1 张"当前课表"，由同步写入 |
| 上课提醒 | 移植（应用内 + 振动） | lite 应用无法常驻后台；仅前台 30 s 轮询提醒，见 P2-1 |
| 桌面小组件/超级岛/WebDAV 备份 | 不移植 | 平台能力不存在 |
| 换主题/壁纸/模糊 | 不移植 | 轻智能表 CSS 无 blur，改为深色底 + 主题色 |
| 手机同步 | **换方案** | 见 §5「蓝牙发现 + 局域网 HTTP + 文件通道」 |
| 导入（教务/AI/ICS/拾光） | 不移植（手表无键盘） | 由手机端生成 payload 后推送 |

### 2.1 表端边界（只读）

本轮确定：**手表端不提供任何编辑/添加入口，课程数据只来自手机端同步或内部文件导入。**

- 视图集合固定为 `home / today / week / detail / times / sync / settings / about`（`pages/index/index.js:105 VIEWS`，共 8 项，第二轮新增 `home`），不含 edit 视图。
- 已删除的编辑链路（grep 0 匹配）：`drawEdit`、编辑浮层、`index.hml` 的三个 `<input>`、`index.css` 的 `.editor/.inp`、`dispatch` 的 `addCourse/editRow/saveCourse/delCourse/cancelEdit`、业务方法 `newDraft/addCourse/openEdit/publishDraft/onName/onTeacher/onPlace/eventValue/saveCourse/delCourse/cancelEdit`、state 的 `draft/isNew/editMode/confirmDelete`。
- 课程详情页为只读页，只有「返回」（`pages/index/index.js:815 drawDetail`）。
- 设置页只保留「当前周 / 总周数」两个可调项（`doStep` 仅处理 `1001/1011/1002/1012`）。
- 数据入口只有一个：同步页的「立即同步」（局域网 HTTP，`pages/index/index.js drawSync`）。第七轮起 BLE 发现与文件导入/导出三条入口已删除。
- **数据范围**：同步只保留**当前周**的课程（`common/sync.js:42-67 collectWeek`），内存中的课程对象数与该周实际课数绑定、上限 `MAX_COURSES=12`。

## 3. 架构

**单页架构**：整个应用只有**一个真实页面** `pages/index/index`（`config.json` 的
`js[0].pages` 只有这一项，构建产物也只有 `pages/index/index.js`）。全部界面（首页/今日/周课表/
详情/作息/同步/设置/关于）都是同一个 `<canvas>` 上的**内部视图**，由 `this.view` 标识；
没有页面栈，也没有跨页传参，应用自己用 `this.stack` 维护一个**视图栈**
（`open(v, backTo)` 入栈 / `back()` 出栈 / `jump(v)` 清栈直达，`pages/index/index.js:265-310`）。
打开即 `home`（`onInit` 与 `onShow` 都设 `this.view='home'` 并清空栈，`index.js:112-153`）。
右滑不再由系统接管：应用自己实现为「上下文返回/翻页」
（首页分方向手势，今日页← 前一天，周课表← 上一周，子页面← 返回上一层），见 §6.3。

> 为什么必须是单页：本机 Lite Wearable 引擎的 `@system.router` **只有 `replace/replaceUrl`**，
> 没有 `push/back/getLength/getParams`；且 `replace` 后是**全新的 JS 上下文**
> （模块状态清空、`storage.get` 失败、`getParams` 未定义）。见 `common/nav.js:1-19`
> 与 `common/app.js:1-39` 的记录。

```
entry/src/main/
├── config.json                       deviceType=liteWearable；pages 只有 pages/index/index；
│                                     reqPermissions: VIBRATE / ACCESS_BLUETOOTH / DISCOVER_BLUETOOTH
└── js/MainAbility/
    ├── app.js                        应用生命周期：onCreate/onDestroy 只打日志，不抛异常
    ├── i18n/{zh-CN,en-US}.json       文案表（{"strings":{...}}，**40 个键**，键名全 ASCII；zh-CN 1440 B / en-US 1322 B）
    └── common/                       11 个模块（全部 ES5 + ES module；ble.js / seed.js / app.js / nav.js / remind.js 已删）
    │   ├── const.js      常量：HEAP_TIER_KB=512、MAX_COURSES=16（只缓存当前周）、MAX_INCOMING=200、协议名/版本/端口、色板、星期名、3 个 storage 键
    │   ├── model.js      Course 数据模型 + 周次/时间逻辑（Course.kt 的忠实移植）
    │   ├── store.js      全局状态（纯内存态）+ @system.storage 三个小标志（当前周 / 上次同步时间 / 同步地址）+ 同步落库
    │   ├── sync.js       局域网 HTTP 拉取（@system.fetch GET /schedule.json）+ payload 解析（唯一同步通道）
    │   ├── ui.js         canvas 绘制与交互工具：圆角矩形、宽度估算、居中/截断、命中测试、坐标提取、缓动 LUT（ease）
    │   ├── date.js       日期工具：ISO<->ms、星期、天数差、hh:mm 解析、格式化
    │   ├── holiday.js    假期/调休：normalize / find / isHoliday / nameOf
    │   ├── defaults.js   出厂兜底：空 settings + 标准作息表（无示例课程）
    │   ├── icon.js       32 色调色板 + 整行 RLE 的 32×32 圆形图标点阵
    │   └── i18n.js       语言判定（@system.app.getInfo().language）+ t(key,n) 取词
    └── pages/index/
        ├── index.hml     仅 3 行：<div class="page"> 内一个 <canvas class="cv">（无 input、无浮层）
        ├── index.css     仅 .page / .cv 两条规则（.page 显式 flex-direction: column）
        └── index.js      ~1,420 行：6 个 drawXxx 自绘视图（home/today/week/detail/sync/about）+ 视图栈 open/back/jump + 命中矩形分发 + 表冠/方向手势/列表滚动 + 同步调度
```

### 3.1 数据模型（与手机端逐字段对齐）

```
Course = { id, name, location, teacher, dayOfWeek(1-7), startSection, endSection,
           startWeek, endWeek, weekType(0全部/1单/2双), selectedWeeks[], color,
           isCustomTime, customStartTime, customEndTime }
settings = { currentWeek, totalWeeks, morningSections, afternoonSections,
             eveningSections, scheduleName, reminderEnabled, termStart }
times = { morning:{1:"08:00-08:45",...}, afternoon:{...}, evening:{...} }
holidays = [ { date, endDate, name, type(0假期/1调休), followWeek, followWeekday, custom } ]
```

关键逻辑必须与 `Course.kt` 完全一致（否则手表与手机显示不一致），全部在 `common/model.js`：

- `normalizeCourse()`：`endWeek` 缺省 16、`weekType` 归一到 0..2、`selectedWeeks` 去重排序并限 `MAX_WEEKS`。
- `isActiveInWeek(week)`：`selectedWeeks` 非空时按集合判定，否则区间 + 单双周奇偶。
- `weeksText()`：先合并连续区间，长度 >= 3 显示 `a-b周`，否则逐个 `a周`；非 `selectedWeeks` 时追加 `(单)`/`(双)`。
- `periodIndex()`：有自定义时间按钟点分上午/下午/晚上，否则按节次区间。
- `absSectionTimes()` / `calculatePeriodTimes()`：由节数/起始时间/时长/课间推算节次时间表。
- `startTimeText()/endTimeText()`：`isCustomTime` 优先。

### 3.2 持久化策略（受 API 限制驱动）

**第七轮（m09613）起持久化策略只剩一层：`@system.storage` 三个小标志 + 纯内存态。** 理由是堆：

- `@system.storage` 单值 **< 128 字节**（技能与 SDK 注释）→ 只存三个小标志：
  `nexio_week`、`nexio_sync_at`、`nexio_sync_host`（`common/const.js`；`nexio_ver` 已随版本键删除）。
- 课表本体**不再落盘**。原先的 `@system.file` 通道（`URI_DATA` 整表 JSON + 分片 `readText`
  24 轮 × 4096 + `parts.join('')` + `JSON.parse`）是**启动期最大单笔 JS 堆峰值**（要在堆里拼
  出 65 KB 字符串，再解析成对象），而且全工程 `grep '.save('` **0 命中**——写盘从来没有调用者。
  ⇒ 整条通道连同 `dirOf/readAllText/readText/writeText/save/toJson` 一并删除。
- 每次冷启动都由 `onShow → autoSync` 走局域网 HTTP 重新拉取（`sync.js manualPull`）；没有网络时
  首页显示空态与「未同步」，不显示过期数据。
- 内存里的 `state.dataWeek` 仍记录「这批课属于第几周」，用于判断缓存是否过期
  （`store.dataIsCurrentWeek()`），只是不再持久化。
- `load()` 的兜底 `setTimeout`（4000 ms）仍配 `clearTimeout`（第二轮新增的守卫保留）。

## 4. UI 设计（MiUiX 视觉语言 → 轻智能表可落地子集）

MiUiX 是 Compose Multiplatform 组件库，**不能**在 lite 上运行；这里只借用其设计语言
（圆角卡片、克制留白、单一强调色、层次用明度而非阴影/模糊）。

- 渲染方式：只有一个 `<canvas class="cv">`（454×454）负责**全部**图形与文字；本轮重构后 HML 里
  **不再有任何 `<input>` 或编辑浮层**（`index.hml` 仅 3 行）。原因：ACE-Lite 每个 HML 节点
  要吃数 KB 堆，周课表 HML 版要到 `-hs 196608` 才不 OOM（`common/ui.js:1-6`）。
- 点击：canvas 只有一个 `@click="onTap"`；所有可点区域注册为矩形（`index.js reg(x,y,w,h,act,arg)`，`pages/index/index.js:365-367`），
  `onTap`（`index.js:1099`）用 `UI.pointOf` + `UI.hit` 顺序分发（`index.js:1111 dispatch`）。lite 的 click 事件字段是
  `{type,target,currentTarget,timestamp,globalX,globalY}`，**没有 clientX/offsetX**（`common/ui.js:120 hit` / `:130 pointOf`）。
- 宽度：`ctx.measureText` **在本引擎会抛异常**（`common/ui.js:48`），故用
  `common/ui.js:49 tw(text,size)` 估算（CJK 按 `size`、拉丁按 `0.56×size`）。
- 圆角：本引擎 canvas **没有** `quadraticCurveTo/bezierCurveTo/arcTo/createLinearGradient/drawImage`，
  且 `arc()+fill()` 画不出填充（圆角方块渲染成十字）→ `ui.js:28 roundRect()` 用
  "逐行 1px 横条逼近 1/4 圆"实现。
- 色板（令牌集中在 `pages/index/index.js:60-74`，第二轮新增 `C_ROW_TODAY '#16171B'`（:63）作为今日行高亮底色）：`C_BG #000000`、`C_SURFACE #141416`、
  `C_SURFACE_HI #1A1A1C`、`C_CHIP #1F1F23`、`C_TEXT #FFFFFF`、`C_TEXT2 #E6E6EA`、`C_DIM #9A9AA0`、
  `C_DIM2 #6E6E74`、`C_ACCENT #1D4ED8`、`C_GREEN #34C759`、`C_BLUE #64B5F6`、`C_AMBER #FFB300`、
  `C_ERR #FF8A80`、`C_RING_TRACK #26262B`；课程色沿用手机端 11 色板（`common/const.js:37-40 COURSE_COLORS`）。
- 字号：9~23px —— 页头 21px、课程名 19~21px、列表行 14~15px、说明 12~13px。
- **8vp 网格**：卡片/行的位置与尺寸基本取 8 的倍数；`CARD_X=22` 与 `NAV_Y=402` 是圆屏安全区内缩后的特例，间距与内边距统一 `ROW_PAD=16`。
- **`textY` 基线规则（本轮错位修复的核心）**：本机 Lite 引擎的 `ctx.fillText(x,y)` 把 `y` 当**文本行顶部**而非基线（实测：19px 文本 y=50 时墨迹落 y=53..68；17px y=94 → 97..112；13px y=143 → 146..158；13px y=89 → 96..103），旧代码按基线取值导致文字整体下沉约半个字高。统一用 `textY(cy,size) = round(cy - size*0.5 - 3.5)`（`pages/index/index.js:357-359`）把视觉中心换算成 `fillText` 的 y，`baseY(y,h,size) = textY(y+h/2,size)`（:361-363）。左/中/右对齐只走三个入口：`UI.ltext(text,x,y)`、`this.ctext(text,cx,y,size,color)`、`this.rtext(ctx,text,right,y,size,color)`（后者内部为 `right - UI.tw(text,size)`）；**禁止把已居中的 x 再交给 `UI.ctext`**，否则二次居中会左移半个字宽。

**今日页坐标表**（`pages/index/index.js:619 drawToday`，W=H=454）

| 元素 | 坐标/规则 |
|---|---|
| 顶部星期/时钟 | 标题左对齐 x=104、`textY(46,19)`；时钟右对齐 right=350、`textY(46,15)` |
| 日期居中行 | `textY(82,17)` |
| 小进度环 | 环心 `(74,126)`、半径 24、线宽 6；环心 `done/total` 在 `textY(126,13)`（与首页大环不是同一个环，见 §4.5） |
| 一天切换 chip | `<` (72,68,34,28)、`>` (348,68,34,28)，action 为 `day ∓1` |
| 周次/同步状态 | x=108、`textY(118,12)`；点击 chip「刷新」(314,111,84,30) 触发 `sync` |
| 今日完成数 | x=108、`textY(140,13)` |
| 课程卡 | 首卡 y=156，间距 `TODAY_PITCH=80`，高 76，`CARD_X=22`、`CARD_W=410`；**最多同时画 3 张**（`TODAY_VISIBLE=3`），超过时 `scrollTopRow/scrollRows` 支持滚动 |
| 滚动条 | 卡片超过 3 张时画在 x=`W-30`，并提示「旋转表冠滚动」`textY(378,11)` |
| 底部导航 | 子页 `nav()` 三胶囊（周课表/设置/i）位于 `NAV_Y=402`；**首页的三胶囊是 今日/周/设置**，见 §4.5 |

**子页面坐标表**（`drawWeek/drawDetail/drawTimes/drawSync/drawSettings/drawAbout`）

| 元素 | 规则 |
|---|---|
| 标题行 | 行心 46（`title()` 内部 `textY(cy,22)`、22px，`index.js:413`） |
| 副标题行 | 行心 68（`subtitle()` 内部 `textY(cy,12)`、12px、宽度上限 `W-120`） |
| 内容起点 | y=88；列表行高 34、行距 37（`ROW_X=56`、`ROW_W=342`） |
| 页脚返回胶囊 | `(W/2-54, H-58, 108, 40)`（`footerBack()`，`pages/index/index.js:421-427`；默认 action **`back`**，走视图栈出栈） |
| 周课表 7 行 | 起点 y=124、行距 42、行高 38；星期 x=36、课程 x=88（截断 196）、日期右对齐 `W-40` |
| 作息列表 | 起点 y=88、行距 38、行高 34、可视 6 行；滚动条轨道 x=`W-34` |
| 设置/同步六行 | 起点 y=88、行距 37、行高 34 |
| 关于页 | N 标 62×62 @(W/2-31,40)；应用名 y=128、版本 y=150；信息面板 (56,168,342,132)，四行 cy=192+i*30；按钮 (96,366,118,42) 与 (240,366,118,42) |

- 排版安全区：内容 x 从 56 到 `W-56`（左右各留 56px），顶部 40px / 底部 58px 起按钮；顶部标题行与底部导航按圆弦内缩（标题 x=104、右边界 350）。

### 4.1 内部视图与交互（6 个视图，全部绘制在同一个 canvas 上）

`PAGE_ORDER = ['home','today','week','sync','about']` + 二级页 `detail`（`pages/index/index.js:150`）。
**`times`（作息）与 `settings`（设置）两个视图已在第五轮删除**（m08330：全部接受手机端同步，避免内存溢出），
现在的视图集合是 home / today / week / detail / sync / about，无 edit 视图。

0. **home（默认，打开即此页）**：顶部「今天是<星期>」与时钟；中央大环（环心 `done/total` + 「节已完成」，达成率补间）；当前/下一节课摘要（进行中 / N 分钟后上课 / 无课 / 假期；数据不是当前周时补一行「缓存为第 N 周，请重新同步」）；四行信息面板（本周 / 今日课程 / 下一节 / 数据）；底部提示「上滑今日课表 · 左滑关于」与 今日/周/i 三胶囊。**右侧竖排指示点已在第四轮删除**（m06685：没和边框对齐，删掉）。详见 §4.5。
1. **today**：顶部星期/时钟 + 前一天/后一天 chip + 日期；进度环（环心显示 `done/total`）+ 周次/同步状态 + 今日完成数 + 刷新按钮；下面最多 3 张 76px 高课程卡（色条 + 课程名 + 时间 + 节次·地点·教师 + 状态），超过 3 张可滚动；底部三胶囊：周课表 / 设置 / i。假期显示假期名卡，无课显示空态卡（文案「课表来自手机端同步」）。
2. **week**：标题 + 起止日期；四个 chip（整周 / 上一周 / 返回 / 下一周）；7 行固定 42px 行距（周一~周日 + 前 2 门课 + 日期），今日行高亮；整行可点进当日。
3. **detail（只读）**：课程名/周次·星期/状态面板 + 四行（时间/节次/地点/教师）；**只有「返回」按钮**，无编辑/删除。
4. **times**：作息名 + 总节数 + 节次时间列表（左侧色条区分 上午/下午/晚上）；总节数超过 6 行时 `scrollTopRow/scrollRows` 可滚动，右侧画轨道 + 滑块，提示「旋转表冠滚动」。
4. **sync**：课程数与来源 + **两行**（同步地址 / 立即同步）+ 说明行「仅通过局域网从手机端同步」+ 提示行 + 返回。
   第七轮删掉了 BLE 行与导入/导出两行（详见 §5）。
5. **about**：圆形 N 图标 + 应用名 + 版本（`v1.0.2 · 512KB`）；四行关于信息；同步时间与地址；返回（中性灰）/ 退出（暗红 + 「再点一次退出」二次确认，`K.app.terminate()` 失败则回首页并提示「本机不支持退出」）。

> 表端只读：课程数据只来自手机端同步；已删除全部编辑/添加入口，见 §2.1。

### 4.2 实测出来的硬约束（本次移植踩过的坑）

| # | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| 1 | 白屏，整页不挂载 | 旧代码 `import '@system.wearengine'`，本机 SDK 无此模块 → 模块解析失败 | 全项目 0 引用；所有 IO 包 try/catch；渲染主流程 try/catch 走 `drawError` |
| 2 | 表单页/详情页"只有按钮、没有内容" | ACE-Lite 容器默认 `flex-direction: row`，子元素横向重叠、容器塌成一行高 | 每个多子容器显式 `flex-direction: column`（`.page`、`.editor`） |
| 3 | 编辑表单与画布错位 | `position: absolute` 不生效（负 margin 也不生效） | 浮层放 `<stack>` 里，用 `padding` 对齐 canvas 行位置 |
| 4 | 点了没反应 / 画面不更新 | 本引擎 `this.data` 是 `undefined`，HML 的 `{{x}}` 只读页面对象自身属性 | 一律写 `this.x`；`if="{{editMode}}"` 直接绑定 `this.editMode` |
| 5 | 构建失败但"改了没效果" | hvigor stdout 只给一行 `ERROR File:...:line:col`，真因在 `.hvigor/outputs/build-logs/build.log`；失败时静默保留旧产物 | 每次构建后核对 `build.log` 的 `COMPILE RESULT:SUCCESS` + `BUILD SUCCESSFUL` |
| 6 | 周课表把各档堆撑爆 | HML 节点数几乎决定堆占用（约数 KB/节点） | `week`/今日卡片整页改单 canvas 绘制；`result`：堆阈值 `196608 → 65536` |
| 7 | 编辑页 `<input>` 编译报错 | `tag \`input\` not support event \`change\` when the type is not checkbox and radio` | 字段 type 收敛为 `text`（当前 3 个 input 均 `type="text"`） |
| 8 | 圆角方块渲染成十字 | 本引擎 `arc()+fill()` 画不出填充，且无曲线 API | `ui.js roundRect()` 逐行 1px 横条逼近 1/4 圆 |
| 9 | 文案宽度算不出 | `ctx.measureText` 抛异常 | `ui.js tw()` 估算宽度 + `ctext/ellipsize` |
| 10 | `String.prototype.replace` 调用即 TypeError | 引擎裁剪 | `i18n.js t()` 用 `indexOf + substring` 手工替换 `{n}` |
| 11 | **所有文字整体下沉约半个字高**（文字与背景没对齐） | 本机 Lite 引擎 `ctx.fillText(x,y)` 的 `y` 是**文本行顶部**而非基线（实测墨迹从 y+3 起，高度约等于字号） | 统一 `textY(cy,size)=round(cy-size*0.5-3.5)`；左/中/右只走 `ltext/ctext/rtext` 三个入口 |
| 12 | 居中元素整体左移半个字宽 | 把已算好的居中 x 再传给 `UI.ctext`，发生二次居中 | 居中只调用一次 `ctext`；已定位的 x 直接走 `ltext`/`rtext` |
| 13 | 圆环补间不能用 `requestAnimationFrame`/`cubic-bezier` | Lite 只有 `linear/ease-in/ease-out/ease-in-out` 与 `setInterval` | `setInterval 40ms × 8 帧` + `common/ui.js:145-156` 的 33 点缓动 LUT，见 §4.4 |
| 14 | 首页渲染抛 `Expected a function` 并回落到错误页 | `drawHome` 误把 store 的**状态对象** `st` 当模块调用 `st.dataIsCurrentWeek()` | 改为 `store.dataIsCurrentWeek()` / `store.dataWeekLabel()`；说明 `try/catch + drawError` 兜底链路在真实 bug 上生效（第二轮） |

> 注：上表第 2/3/4/7 条涉及编辑态容器与 `<input>`，本轮已随编辑浮层整体删除（§2.1），保留为历史约束。

### 4.3 表冠交互

- API 出处：`D:/DevEco Studio/sdk/default/openharmony/js/api/@internal/lite/global.d.ts:111-131` —— `setMonitorForCrownEvents(handler: Function): void`（:123）与 `clearMonitorForCrownEvents(): void`（:131）；`@syscap SystemCapability.ArkUI.ArkUI.Lite`、`@famodelonly`、`@since 24`，**无需 import**（全局函数）。
- 注册/注销：`onShow → startCrown()`（先 `typeof setMonitorForCrownEvents === 'function'` 守卫，再注册闭包回调，`crownBound` 去重）；`onDestroy → stopCrown()` 调 `clearMonitorForCrownEvents()`（`pages/index/index.js:193-208`）。
- SDK 注释 :112-113 说明**当前页面被 push back 或 replace 时监听器会自动移除**，建议在 `onShow` 注册；每页只允许一个监听器（以最后一次调用为准），禁止在 `app.js` 使用。属**资料支持**，真机未实测。
- 回调：`event.degree` **逆时针为正**；`onCrown` 返回 `true` 表示拦截事件（`pages/index/index.js:209-222`）。
- 档位换算：`onCrown` 把 `degree` 累加到 `crownAcc`，每 **16 度**（`CROWN_STEP=16`）产生一档。
- `crownTurn(dir)` 语义（`pages/index/index.js:223-260`，第二轮重写）：

  | 当前视图 | `crownTurn(1)`（顺时针 / 向前） | `crownTurn(-1)`（逆时针 / 向后） |
  |---|---|---|
  | `home` | `pageTurn(1)`：按 `PAGE_ORDER` 环形下一页 | `pageTurn(-1)`：上一页（回到 home 时走 `back()`） |
  | `today` 且列表可滚动 | 列表向下一行 | 列表向上一行 |
  | `today` 且不可滚动 | 后一天 | 前一天 |
  | `times` 且可滚动 | 列表向下一行 | 列表向上一行 |
  | `week` | 下一周（clamp 1..totalWeeks） | 上一周 |
  | 其它子页 | 返回上一层（`back()`） | 无动作 |

- **方向映射（顺时针 = 向前）是推断**；GT5/GT6 真机是否有表冠、`degree` 方向与灵敏度均**未知**。
- 注入验证：`onShow` 注入三次 `onCrown({degree:-16})`（顺时针 48 度 = 3 档），今日页由 2026-10-08 变为 2026-10-11（注入代码已删除）。

### 4.4 活动记录式动效（进度环）

- 参照官方「活动记录」进度环：今日页小环环心 `(74,126)`、半径 24、线宽 6（`RING_CX/CY/R/LW = 74/126/24/6`，`pages/index/index.js:82-87`）；**首页另有一个大环** `HOME_RING_CX/CY/R/LW = 227/150/60/13`（:90-93），两者共用 `drawRing()` 与补间；环长 = 达成率（已完成节次 / 总节次）；环心显示 `done/total`，无课显示 `—`。
- 绘制：`drawRing()` 用 `beginPath + arc + stroke`（先画 `C_RING_TRACK #26262B` 全轨道，再按 `-π/2` 起画进度弧）；Lite 的 `arc()+fill()` 画不出填充，所以只用描边。
- 时长：`RING_FRAMES=8` × `RING_FRAME_MS=40ms` ≈ **320ms**，对齐官方「复杂动画」档 300ms。
- 缓动：`common/ui.js:145-156` 的 `ease()` + **33 点 `EASE_LUT`**，把官方标准曲线 `cubic-bezier(0.40,0.00,0.20,1.00)` 烘焙成查表——因为 Lite 只有 `linear/ease-in/ease-out/ease-in-out`，没有 `cubic-bezier`，也没有 `requestAnimationFrame`，故补间用 `setInterval`。
- 生命周期：`startRingAnim(target)` 内部先 `stopRingAnim()` 再起 8 帧定时器；切换日期时 `pct !== ringTo` 会重起一轮；**`onHide` / `onDestroy` 必须 `stopRingAnim()`**，否则定时器泄漏。第二轮起 `startRingAnim` 内判断由「仅今日页重画」改为 **home 与 today 都重画**（`index.js:502`）。
- **待真机确认**：300ms/8 帧在真机上的实际帧率与掉帧表现。

### 4.5 首页版式与交互（第二轮新增）

仿华为官方「活动记录」的操作逻辑：**打开即首页**（`onInit` 与 `onShow` 都设
`this.view='home'` 并清空视图栈，`pages/index/index.js:112-153`），首页回答「我现在该上什么」。
绘制入口 `drawHome(ctx)`（`pages/index/index.js:518-600`）。

**首页坐标表**（W=H=454）

| 元素 | 坐标/规则 |
|---|---|
| 顶部星期 + 时钟 | 「今天是<星期>」居中、行心 44；时钟右对齐 right=352、行心 44 |
| 大进度环 | 环心 `HOME_RING_CX/CY=(227,150)`、半径 `HOME_RING_R=60`、线宽 `HOME_RING_LW=13`（`index.js:90-93`） |
| 环心文字 | `done/total` 28px、行心 `150-8`；其下 `home_done_suffix`「节已完成」或 `no_class`「无课」、行心 +20 |
| 课程摘要 | 课程名行心 238（21px）；时间·地点行心 262（13px）；状态提示行心 288（14px，进行中/下一节/无课/假期换色）；次行行心 314（13px，数据非当前周时显示 `home_cached_week`「缓存为第 N 周，请重新同步」） |
| 页面指示点 | `DOT_X=398`、`DOT_CY=150`、`DOT_STEP=22`（`index.js:96-98`）；当前页 6×14 圆角蓝（`C_BLUE`），其余 4×6 `#4A4A52`；每个点命中矩形 `DOT_X-12, cy-11, 24, 22` 直接 `jump(PAGE_ORDER[i])` |
| 底部提示 | `home_hint`「上滑今日课表 · 左滑关于」、行心 374（11px） |
| 底部三胶囊 | 今日 / 周 / 设置，位于 `NAV_Y=402`（`chip(cx, NAV_Y, 64, 36)`，action `jump`，`index.js:589-598`）；**注意与子页面 `nav()` 的 周/设置/i 不同** |

**手势方向映射表**（首页 `onTE`，`pages/index/index.js:1085-1092`；阈值 `SWIPE_MIN=40`）

| 手势 | 判定 | 动作 |
|---|---|---|
| 左滑 | `\|dx\| >= 40` 且 `\|dx\| > \|dy\|` 且 `dx < 0` | `jump('about')` → 关于页 |
| 右滑 | 同上且 `dx > 0` | `jump('settings')` → 设置页 |
| 上滑 | `\|dy\| >= 40` 且 `\|dy\| > \|dx\|` 且 `dy < 0` | `jump('today')` → 今日课表 |
| 下滑 | 同上且 `dy > 0` | `jump('week')` → 周课表 |
| 其它方向 | 不满足上述任一条件 | 不动作（放行给 `@click`） |

子页面仍走「上下文横向滑动」：`today` 换天、`week` 换周、其余子页右滑 `back()`；首页的竖滑
是第二轮新增的维度，由 `this.view === 'home'` 分支隔开（`index.js:1094-1096` 为子页分支）。

**表冠映射表**（`crownTurn(dir)`，`pages/index/index.js:223-260`；`CROWN_STEP=16` 度 / 档）

| 当前视图 | `dir>0`（顺时针/向前） | `dir<0`（逆时针/向后） |
|---|---|---|
| `home` | `pageTurn(1)`，按 `PAGE_ORDER` 环形下一页 | `pageTurn(-1)` 上一页；回到 `home` 时走 `back()` |
| `today`（列表可滚动） | 课程列表下滚一行 | 上滚一行 |
| `today`（不可滚动） | 后一天 | 前一天 |
| `times`（可滚动） | 作息列表下滚一行 | 上滚一行 |
| `week` | 下一周（clamp 1..totalWeeks） | 上一周 |
| 其它子页 | `back()` 返回上一层 | 无动作 |

**内存预算（第二轮）**

| 项 | 值 | 说明 |
|---|---|---|
| 课程对象常驻上限 | `MAX_COURSES=12`（`common/const.js:16`） | 只缓存**当前周**，由 `sync.js:42-67 collectWeek` 用 probe（`isActiveInWeek` 预筛）在 `normalizeCourse` **之前**过滤 |
| 原始条数闸门 | `MAX_INCOMING=200`（`common/const.js:17-18`） | `sync.js:97` 超出即 `slice(0, 200)` 截断，限制进入解析的条数 |
| 低配降级 | 64 KB 档把 `MAX_COURSES` 改成 **5**（`const.js:12-15` 注释原文「64KB 档可改 5，兼容 GT2 时改 5 即可」） | 旧文档写的「改成 8」为过时说法 |
| 模拟器实测 | `totalBytes 524280 / allocBytes 113224 / peakAllocBytes 118760` | 512 KB 档下限回归；课程由 24 降到 12 后常驻对象更少；收尾复测 115992 / 116088，差异属噪声量级 |

### 4.6 第二轮收尾修正：缓存过期判定与定时器清理

**规则一：改「当前周」即视为缓存过期，能同步就立刻重拉**（`doStep`，`pages/index/index.js:1155-1170`）。
`1001/1011` 两个设置项改为累积 `weekChanged`，循环末尾：

```js
// pages/index/index.js:1169
if (weekChanged && !store.dataIsCurrentWeek() && store.get().syncHost) this.doSync();
```

理由：手表只缓存**当前周**（§6.1），周次一改，本地 `courses` 就属于旧的一周；已配同步地址时立刻重拉当周，未配地址时由首页提示（规则二）。
模拟器实测：设置页当前周 5 → 点两次「+」（坐标 368,105）→ 7（`.dsh-tmp/pngwk1/f10.png`、`pngwk1/f12.png`）；联动重拉本身依赖真机 HTTP，列 §7 待办 11。

**规则二：首页辅助行的优先级——过期提示压倒「下一节」**（`drawHome`，`pages/index/index.js:578-585`）。

```js
// pages/index/index.js:580-583
if (!store.dataIsCurrentWeek()) {
  next2 = t('home_cached_week', store.dataWeekLabel());
} else if (nn.current && nn.next) {
  next2 = t('home_next') + ' ' + nn.next.name + ' ' + UI.startText(st.sectionTimes, nn.next.startSection);
}
```

修正前：缓存属于第 5 周、当前周已改到 6 时，首页仍在行心 314 显示上一周的「下一节 创新创业基础 14:00」，会被误当成当前状态（对照帧 `.dsh-tmp/pngwk2/f12.png`）。修正后同一路径显示「缓存为第 5 周，请重新同步」（`.dsh-tmp/pngwk4/f12.png`）。

**规则三：`sync.js pull()` 的超时兜底定时器成对清理**（`common/sync.js:142-156`）。
`var guard = setTimeout(...)`（:156）在 `finish()` 里 `if (guard) clearTimeout(guard);`（:149）——请求先返回时不再白留定时器。属工程审计项（长跑不累积），不是用户可见行为。

| 项 | 值 | 分级 |
|---|---|---|
| 设置页改周次 | 5 → 7（两次「+」），`pngwk1` | 已实测（模拟器） |
| 首页过期提示 | 「缓存为第 5 周，请重新同步」，`pngwk4/f12.png` | 已实测（模拟器） |
| 修正前对照 | 仍显示「下一节 创新创业基础 14:00」，`pngwk2/f12.png` | 已实测（模拟器） |
| 联动重拉真实往返 | 依赖真机 HTTP（§7 待办 11） | 未知·待真机 |
| 收尾构建/审计/内存 | BUILD SUCCESSFUL 8.5 s / 7.9 s；FAIL=0、WARN=2、PASS=12；117,027 B；115992 / 116088 B | 已实测 |

## 5. 手机同步方案：只有局域网 HTTP 一条通道

已确认本机 SDK **没有** `@system.wearengine`（历史白屏 bug 的直接原因）。
::: warning 第七轮（m09613）本节的通道裁剪
原本设计的三段式（**蓝牙发现地址 → 局域网 HTTP 传数据 → 离线走文件通道**）已删到只剩中间一段：

| 原通道 | 结论 |
| --- | --- |
| 蓝牙广播发现地址 | **删除**。`@system.bluetooth` 在本引擎的模块表 `ohos_module_config.h:97-158` 里**根本没有条目**，`requireNative` 只能得到 `undefined` ⇒ 这条通道从来没有生效过（`typeof` 守卫能防抛错，防不了静态 `import` 被编进 bundle） |
| 文件通道（import / rawfile / export） | **删除**。表端没有文件管理器可放文件；`entry/src/main/resources/rawfile/` 一直是空目录；读盘是启动期最大堆峰值（见 §3.2） |
| 局域网 HTTP | **保留，且是唯一通道**。手机端 `WatchSyncServer.kt` 已经在跑，地址改为在同步页手动选择 |

下面 5.1–5.3 保留**历史设计记录**，便于回溯当时为什么这么想；实现已按上表裁剪。
:::

### 5.1 第一段：蓝牙发现（只扫描广播，不传数据）

- 手表端 `common/ble.js`：`@system.bluetooth`（`@since 6`、`@syscap SystemCapability.Communication.Bluetooth.Lite`、
  `@famodelonly`）只有 `startBLEScan / stopBLEScan / subscribeBLEFound / unsubscribeBLEFound` 四个静态方法。
  `available()` 先做 `typeof` 判断（**本机模拟器里该模块解析为 undefined**，`ble.js:14` 实测）。
- 约定：手机端在 BLE 广播里携带 ASCII 字符串 `NEXIO|<ip>:<port>`；手表 `parseAdv(data)`
  在 `String(data)` 里找 `NEXIO|`（明文），找不到再按十六进制串 `4E4558494F7C` 还原
  （`ble.js:45-67`），随后只接受 `[0-9.:]` 字符构成 `host:port`。
- 服务标识：`BLE_SERVICE_UUID='0000FEE7-0000-1000-8000-00805F9B34FB'`、
  `BLE_LOCAL_NAME='NexioSchedule'`、扫描超时 `BLE_SCAN_MS=8000`（`common/const.js:33-35`）。
- 流程：`discover(cb, timeoutMs)` → 命中则 `finish(true, '发现手机端 <addr>', host)`，
  超时若只发现设备则回退到已保存的同步地址，什么都没发现则报"未发现手机端广播"。
- 权限：`config.json` 已声明 `ohos.permission.ACCESS_BLUETOOTH` 与
  `ohos.permission.DISCOVER_BLUETOOTH`（usedScene.when = inuse）。
- 手机端 `NexioSchedule/app/src/main/java/com/haooz/chedule/wearable/WatchSyncServer.kt`：
  `ADV_PREFIX = "NEXIO|"`、`COMPANY_ID = 0x0A0E`（小端字节 0x0E,0x0A）、
  `DEVICE_NAME = "NexioSchedule"`；AdvertiseSettings `LOW_LATENCY + TX_POWER_HIGH + connectable=false + timeout=0`，
  数据为 `addManufacturerData(0x0A0E, "NEXIO|<ip>:<port>".toByteArray(US_ASCII))`；
  若 `DATA_TOO_LARGE`（31 字节限制）则去掉设备名重试一次；IP 每 30 s 轮询，变化后重启广播。

### 5.2 第二段：局域网 HTTP（主数据通道）

- 手表端 `common/sync.js`：`@system.fetch`（`@since 3`，syscap `SystemCapability.Communication.NetStack`，
  `.d.ts` 无 `@permission` 标注）执行
  `GET http://<host>:<port>/schedule.json`，`responseType:'text'`，`res.data` 为字符串；
  `SYNC_TIMEOUT_MS=3000` 兜底、响应体 > `MAX_BODY=65536` 视为"数据过大"。
- 地址来源与规范化（`store.js:502-513`）：`syncHost` 缺省空；`syncUrl()` 自动补
  `http://`、缺端口补 `DEFAULT_SYNC_PORT=8787`、末尾补 `/`，最后拼 `schedule.json`；
  `syncHostLabel()` 用于显示。地址可通过「蓝牙发现」自动获得，也可在同步页手动循环切换候选
  （`index.js:1208 cycleHost()`：`10.0.2.2:8787 / 192.168.1.100:8787 / 127.0.0.1:8787 / ''`）。
- 自动同步：`onShow → autoSync()`，仅当已存有 `syncHost` 且本次未试过时拉取一次（`index.js:181-187`）。
- 成功路径：`parse(text)` → `store.applyPayload(parsed)` → `store.markSynced()` →
  `syncState='ok'`；失败置 `syncState='error'` 并写入 `syncError`，UI 只提示不抛异常。
- 手机端 `WatchSyncServer.kt`：HTTP 服务监听 `0.0.0.0:8787`（`PORT = 8787`，注释"与手表端
  const.js DEFAULT_SYNC_PORT 对齐"），`reuseAddress=true`，线程池 daemon `nexio-watch-http`，
  10 s `soTimeout`，**只允许 GET**；路由：`/schedule.json` 与 `/schedule` → 200 JSON、
  `/ping` → 200 `"nexio.schedule/4"`（`PING_BODY`）、其余 404、非 GET 405；
  `?schedule=<课表名>`（URLDecoder UTF-8）可指定课表；响应头含
  `Content-Type: application/json; charset=utf-8` / `Content-Length` / `Connection: close` /
  `Cache-Control: no-store`；`status()` 返回形如
  `"HTTP 服务 192.168.1.5:8787 · BLE 广播中(NEXIO|ip:8787)"`。

### 5.3 第三段：文件通道（**已删除**，仅存档历史设计）

- `internal://app/import/nexio_schedule.json`（`URI_IMPORT`）、
  `internal://app/rawfile/nexio_schedule.json`（`URI_RAW`）、
  `internal://app/nexio/export.json`（`URI_EXPORT`）三个 URI 与其读写实现
  已在第七轮整体删除（`const.js` 里只剩过时的注释，实现与 `@system.file` import 全无）。
- 服务端状态：`WatchSyncServer.kt` **已存在（573 行）**，不是"计划中"；公开 API 为
  `start(context)` / `stop()` / `isRunning()` / `currentIpAddress()` / `status()`。

### 5.4 接口契约（手表端 ⇄ 手机端）

**传输契约**

| 项 | 值 | 定义位置 |
| --- | --- | --- |
| HTTP 端口 | `8787` | 手表 `const.js:27 DEFAULT_SYNC_PORT` / 手机 `WatchSyncServer.kt:56 PORT` |
| 数据路径 | `GET /schedule.json`（同义 `/schedule`） | 同上 |
| 探活路径 | `GET /ping` → body `nexio.schedule/4` | `WatchSyncServer.kt:65 PING_BODY` |
| Content-Type | `application/json; charset=utf-8` | `WatchSyncServer.kt:73` |
| BLE 广播前缀 | `NEXIO|` | `WatchSyncServer.kt:62 ADV_PREFIX` / 手表 `ble.js:45-67` |
| BLE Manufacturer ID | `0x0A0E` | `WatchSyncServer.kt:59 COMPANY_ID` |
| BLE 设备名 | `NexioSchedule` | `WatchSyncServer.kt:68 DEVICE_NAME` / 手表 `const.js:34 BLE_LOCAL_NAME` |
| BLE 服务 UUID | `0000FEE7-0000-1000-8000-00805F9B34FB` | 手表 `const.js:33 BLE_SERVICE_UUID`（用于兜底识别） |

**JSON 契约（v4，`protocol="nexio.schedule"`、`version=4`、`action="replace"`）**

```
{
  "protocol": "nexio.schedule",      // 手表校验必须严格相等，否则 "协议不匹配"
  "version": 4,                       // > 4 时手表报 "版本过新(vN)，请升级手表应用"
  "action": "replace",                // 手表只识别 replace 语义
  "sentAt": 1730000000000,
  "schedule_name": "2026 秋季学期",
  "term_start": "2026-09-07",
  "settings": {
    "current_week": 4,                // 手表 clamp 1..MAX_WEEKS(30) 且 <= total_weeks
    "total_weeks": 18,
    "morning_sections": 4,            // 手表 clamp 0..6
    "afternoon_sections": 4,          // 手表 clamp 0..6
    "evening_sections": 3             // 手表 clamp 0..6
  },
  "times": { "morning": {"1":"08:00-08:45", ...}, "afternoon": {...}, "evening": {...} },
  "courses": [
    { "id":"s01", "name":"高等数学", "dayOfWeek":1, "startSection":2, "endSection":3,
      "startWeek":1, "endWeek":16, "weekType":0, "selectedWeeks":[],
      "isCustomTime":false, "customStartTime":"", "customEndTime":"",
      "location":"教三201", "teacher":"张老师", "color":"#2196F3" }
  ],
  "holidays": [ { "date":"2026-10-01", "endDate":"2026-10-03", "name":"国庆节", "type":0 } ]
}
```

- 校验与截断（`sync.js:80-135 parse(text, week)`）：`protocol` 存在则必须相等；`version > 4` 拒收；
  原始条数超 `MAX_INCOMING=200` 先截断（`:97`）；`courses` 为空或全部无效（`dayOfWeek` 不在 1..7）时拒收；
  再经 `collectWeek` 只保留目标周、上限 `MAX_COURSES=12`；目标周取不到时回退手机端 `current_week`（`:100-111`）。
- 手表 → 手机端方向：`store.toJson()`（`store.js:263-296`，额外输出 `data_week`）输出同构 JSON，
  经「导出到内部文件」写到 `internal://app/nexio/export.json`（**该路径与实现已在第七轮删除**）。

## 6. 内存基线与两个历史 bug

### 6.1 内存基线（GT5 / GT6，512 KB 档）

- **目标机型**：HUAWEI WATCH **GT5 / GT6**，按 **512 KB JS heap** 设计
  （`common/const.js:10 HEAP_TIER_KB = 512`），课程上限 `MAX_COURSES = 12`（`:16`，**只缓存当前周**），
  另设 `MAX_INCOMING=200`（`:17-18`，手机端下发原始条数上限）、`MAX_HOLIDAYS=60`、`MAX_WEEKS=30`、`MAX_SECTIONS=12`。
- **课程内存由「整学期」改为「只缓存当前周」（第二轮）**：同步时先用只有 4 个字段的 probe
  对象（`selectedWeeks/startWeek/endWeek/weekType`）跑 `isActiveInWeek` **预筛**，命中才
  `normalizeCourse`（`common/sync.js:42-67 collectWeek`），于是常驻课程对象数与该周实际课数绑定、上限 12；
  `MAX_INCOMING=200` 是第二道闸。`store.dataWeek` 记录这批课属于第几周，首页据此提示过期缓存。
- **下限回归**：本地模拟器以 `-hs 65536`（64 KB）跑全部 8 个内部视图，**0 次 OOM**；
  即当前实现在最低档也站得住，512 KB 档应有一半以上余量。
- **GT2 回退**：GT2 系列只有 64 KB（社区矩阵，资料支持，未真机）。若要兼容，
  把 `MAX_COURSES` 改成 **5** 即可（`const.js:12-15` 注释原文「64KB 档可改 5，兼容 GT2 时改 5 即可」，
  `store` 会自动截断；旧文档写的「改成 8」已过时）。该回退**未在 64 KB 真机验证**，标注为**未知**。
- **峰值来源**：`readAllText` 分片读取（4096 B × 最多 24 轮 ≈ 96 KB 文本）+ `JSON.parse`
  对象图 + `toJson()` 的对象与字符串同时存在；这些是真机需要实测的部分。第二轮起
  `courses` 本身 ≤ 12 门，对象图规模随之收敛。
- **回收点**：`onHide/onDestroy → stopTick()`（`clearInterval` + 置 null）；
  `onDestroy → BLE.stop()`（`clearTimeout` + `unsubscribeBLEFound` + `stopBLEScan`）；
  `readAllText/readText/writeText/load` 四处超时兜底均由 `done` 标志保证只回调一次。
- **已验证的堆杠杆**：把 HML 版周课表与今日卡片改成 canvas 后，不 OOM 的 `-hs` 阈值从
  `196608` 降到 `65536`。教训：HML 节点数（约数 KB/节点）比 JS 字符串更吃堆，
  真正的杠杆是"减少常驻对象数量"，而不是改字符串字面量的写法。

### 6.2 历史 bug 一：不显示画面（白屏）

- 根因：页面脚本顶层 `import '@system.wearengine'`，本机 SDK 无此模块 → 模块解析失败 →
  页面 JS 整体加载失败 → 白屏（记录在 `common/nav.js:14`、`common/sync.js:4`）。
- 修复规则（已写入代码约束）：
  1. 任何 `@system.*` 导入前先确认该 `.d.ts` 存在于本机 SDK；lite 代码禁止 wearengine。
  2. 生命周期钩子内不做可能抛异常的初始化；所有 IO/网络调用包在 `try/catch` 里，
     失败只更新 UI 状态。
  3. 页面首屏渲染不依赖 IO：先用内置数据渲染，IO 完成后再 `redraw()`；
     渲染整体再包一层 `try/catch`，异常走 `drawError` 给出可返回的兜底画面。

### 6.3 历史 bug 二：右滑固定返回

- 根因：本引擎 `@system.router` **没有页面栈可控**（只有 `replace/replaceUrl`），
  旧代码调 `router.push/back/getLength` 全部失败。
- 修复方式（设计上消除这类 bug）：
  1. 单页架构：只有一个真实页面 + 8 个内部视图，**不存在系统页面栈**；返回由应用自维护的
     视图栈承接（`index.js:265 open() / :278 back()`，另有 `:292 jump()` 清栈直达、
     `:302 pageTurn()` 环形翻页）。
  2. 跨视图传参走 `store.select(id)` + `st.selectedId`，不用 `getParams`（`@since 7` 高于本项目 API 6）。
  3. `common/nav.js` 不再提供任何路由函数，仅作为该结论的记录点。
- **右滑语义自己定义（而不是交给系统）**：画布上绑定 `@touchstart/@touchend/@touchcancel`
  （`index.hml:2`），`index.js:1034 onTS / :1042 onTM / :1070 onTE` 记录起点与终点，
  `|dx| >= SWIPE_MIN(40)` 且横向位移大于竖向位移 1.5 倍才判定为滑动，否则当作点击交给 `@click`。
  子页面滑动的语义是"上下文"：
  今日页 → 前一天/后一天；周课表 → 上一周/下一周；其余子页面 → 右滑返回上一层视图（左滑不动作，避免误触退出）。
  **第二轮新增首页分方向手势**：左滑→关于、右滑→设置、上滑→今日课表、下滑→周课表，
  由 `index.js:1085-1092` 的 `home` 分支处理；旧的 `onSwipe(dir)` 已删除（全文件 0 匹配），见 §4.5。
- **关键实测结论（本次新增）**：本引擎里 `@swipe` 属性可以编译通过但**不会触发**；
  真正可用的是 `@touchstart/@touchmove/@touchend`，且事件的坐标在 `e.globalX/e.globalY`
  （`common/ui.js:130 pointOf()`）。模拟器侧：`TouchPress/TouchMove/TouchRelease` 命令**注不进应用**，
  但 `MousePress + MouseMove×N + MouseRelease` 会被翻译成完整触摸流 —— 因此手势可自动化验证，
  见 `.dsh-tmp/drag.js` 的 `md,x1,y1,x2,y2` 步骤。
- 已验证：右滑/左滑在今日页与周课表翻页、详情页右滑返回，均有模拟器抓帧（`.dsh-tmp/shots-sg*/`、`shots-final/`）；本轮又新增表冠与竖向拖拽共用同一列表滚动（§4.3）。系统级「右滑固定返回」手势本身模拟器不注入，真机仍需确认。

## 7. 已完成 / 待办

### 已完成（均以当前源码 + 构建 + 模拟器抓帧为证据）

| # | 事项 | 证据 |
| --- | --- | --- |
| 1 | 单页架构改造：`config.json` 只留 `pages/index/index`，内部视图落在同一 canvas（现为 6 个） | 构建产物只有 1 个页面 JS；各视图抓帧 |
| 2 | 数据层：`model.js` 移植 Course.kt + `store.js` 内存态状态机（`seed.js` 种子与 `@system.file` 落盘已在第五/七轮删除） | 源码 + 模拟器渲染 |
| 3 | 6 个引擎坑全部规避（flex column / stack 浮层 / this.x 绑定 / input type / build.log 排查 / canvas 取代 HML 节点） | 本文 §4.2 表 + review.md「发现与改动」 |
| 4 | 视图全部实现并注入点击验证：首页（大环）/ 今日（进度环）/ 周课表 / 详情（只读）/ 同步 / 关于（作息与设置页已删） | `.dsh-tmp/png-last/z*.png`、`pngW/f11.png`、`shots-nwB/s0.jpg`、第七轮 `.dsh-tmp/frames-v7/v8` |
| 5 | ~~蓝牙发现模块 `common/ble.js`~~ **已在第七轮删除**：`@system.bluetooth` 在本引擎模块表里没有条目，`requireNative` 只能得到 `undefined` | 引擎源码 `ohos_module_config.h:97-158` + 第七轮删除提交 |
| 6 | 局域网 HTTP 同步 `common/sync.js` + `store.syncUrl()` 地址规范化 + 自动同步 | 源码 + 协议审计 |
| 7 | ~~文件通道：import / rawfile / export 三个 URI~~ **已在第七轮删除**（表端无文件管理器可放文件，rawfile 目录一直为空） | 第七轮删除提交 |
| 8 | 内存基线抬到 512 KB / `MAX_COURSES=12`（只缓存当前周），同时以 64 KB 模拟器作下限回归 0 OOM | `const.js:10/:16` + `sim-fin-*` 日志 |
| 9 | i18n：中英双语文案表 + `app.getInfo().language` 判定 | `i18n/*.json` + 模拟器 `-l zh_CN` |
| 10 | 手机端 `WatchSyncServer.kt`（HTTP 服务 + BLE 广播 + IP 轮询） | 源码 573 行，已存在 |
| 11 | 构建通过（`COMPILE RESULT:SUCCESS` + `BUILD SUCCESSFUL 7~9 s`），产出 1,095,772 B 的 unsigned HAP | `.hvigor/outputs/build-logs/build.log` + `entry-default-unsigned.hap` |
| 12 | 表端去编辑：删除 edit 视图、编辑浮层、3 个 `<input>`、`.editor/.inp` 与全部增删改业务方法 | `index.js` grep 上述符号 0 匹配；`index.hml` 3 行；`index.css` 10 行 |
| 13 | 版式重排：8vp 网格 + 色令牌 + `textY` 基线规则 | `index.js:60-74`、`:357-363`；模拟器逐页抓帧 |
| 14 | 修复文字/背景错位（`fillText` 的 y 是顶部） | 像素测量 + 全页面重排后抓帧（review.md 本轮章节） |
| 15 | 活动记录式进度环（320ms、33 点 LUT） | `.dsh-tmp/png-last/z8.png`（无课日空轨道）+ `shots-nwB/s0.jpg`（4/4） |
| 16 | 表冠交互（`@since 24` API + 16 度/档 + `crownTurn` 语义） | 注入 `onCrown` 三次验证日期跳 3 天；真机未验证 |
| 17 | 作息页可滚动（表冠 + 竖向拖拽共用 `scrollTopRow`）；第二轮今日课表页复用同一套滚动状态 | `.dsh-tmp/png-last/z4.png`（滚到第 4~9 节） |
| 18 | **只缓存当前周**：`collectWeek` 用 probe 预筛（`isActiveInWeek` 命中才 `normalizeCourse`）、`MAX_COURSES` 24→12、`MAX_INCOMING=200` 截断 | `.dsh-tmp/pnghmC/*.png`（首页课程摘要与周次）+ 源码 `sync.js:42-135` |
| 19 | **首页（home）**：打开即此页 + 大环 227,150/r60/lw13 + 右侧 7 个可点击指示点 + 今日/周/设置三胶囊 + 数据非当前周时的过期提示 | `.dsh-tmp/pnghmC/f9.png`；点击直达 `.dsh-tmp/pngNav3/grid.png` |
| 20 | **首页分方向手势**：左滑→关于、右滑→设置、上滑→今日课表、下滑→周课表 | `.dsh-tmp/pngGestures/grid.png`、`.dsh-tmp/pnggDown2/f10.png` |
| 21 | **视图栈返回**：`open/back/jump/pageTurn` 取代旧的直接改 `this.view`；`footerBack` 默认 action 改为 `back`，`openCourse` 走 `open('detail')` | 源码 + 导航抓帧 |
| 22 | `store` 四处 IO 兜底 `setTimeout` 补 `clearTimeout`；`dataWeek`/`data_week` 记录这批课属于第几周 | 源码 `store.js:48/:87/:101-110/:269/:306-474` |
| 23 | 修复 `drawHome` 误调 `st.dataIsCurrentWeek()` 导致首页抛 `Expected a function` 并回落错误页 | 改为 `store.dataIsCurrentWeek()/store.dataWeekLabel()`；`drawError` 兜底链路实测生效 |

### 待办

| # | 事项 | 阻断项 | 备注 |
| --- | --- | --- | --- |
| 1 | ~~真机验证 BLE 扫描~~ **已作废**（第七轮删除该通道：`@system.bluetooth` 在本引擎模块表里没有条目） | — | 见 §5 的通道裁剪表 |
| 2 | **真机验证 HTTP 拉取**：`GET http://<host>:8787/schedule.json` 是否通。`ohos.permission.INTERNET` **已声明**（`config.json`，system_grant/normal，SDK 声明表 PermissionDefinitions.json:1738） | 是 | `.d.ts` 无 `@permission` 标注，故属防御性声明 |
| 3 | **真机验证 `@system.storage`**：三个小标志（当前周 / 上次同步时间 / 同步地址）读写（`@system.file` 通道已在第七轮删除） | 是 | 模拟器不执行该模块，技能明确 |
| 4 | **GT2 兼容回退**：`MAX_COURSES` 由 16 降到 **8** 并在 64 KB 机型验证 | 否（资料支持/未知） | 改一个常量即可（`common/const.js:19` 注释原文「64KB 档（GT2 等）请改 8」） |
| 5 | **手机端 WatchSyncServer 联调**：HTTP 同机联调，确认 `/ping` 探活与 `/schedule.json?week=N` 拉取 | 否 | 服务端已实现，缺端到端联调 |
| 6 | ~~rawfile 内置种子~~ **已作废**（第五轮去种子、第七轮删文件通道） | — | 数据全部来自手机端同步 |
| 7 | 真机验证 466×466 圆屏字号/安全区（振动通道与权限已在第七轮删除） | 否 | 模拟器只验证 454×454 |
| 8 | 真机压测：`MAX_COURSES=16` + 长时间运行、反复进出页面 | 否 | 当前只有静态估算与模拟器堆档位扫描 |
| 9 | **表冠 `pageTurn` 真机验证**（第二轮新增阻断项）：模拟器无法注入表冠事件，`onCrown`/`crownTurn`/`pageTurn` 的分派与首页环形翻页、以及 16 度/档手感均未在硬件验证 | 是（模拟器不支持） | 真机需确认顺时针方向与灵敏度 |
| 10 | **首页在 64 KB 档的峰值**：本轮 ack 为 512 KB 档配置，GT2 的 64 KB 档未测 | 否 | 与 #4 一起做 |
| 11 | **改周次后的联动重拉真机验证**：`doStep` 的 `weekChanged → doSync()`（`index.js:1169`）在真机走通需 HTTP 可用，模拟器只验证到「缓存标记变为过期 + 首页提示」这一半 | 是（依赖 #2） | 依赖真机 HTTP；`pngwk1`、`pngwk4` 为模拟器半程证据 |
| 12 | **真机安装仍建议使用 release 构建**（第三轮新增阻断项，第七轮修正）：真机对**每个 `.js` 文件**限长 49,152 B 且硬拒绝；debug 构建永不压缩（hvigor 用 `targetService.isDebug()` 决定 `hapMode`）。第七轮删掉无用通道后 debug `app.js` 从 69,750 B 降到 **48,228 B**，**首次也落在闸内**（余量仅 924 B）；release 为 `app.js` 28,724 B / 页面 25,227 B（余量 20,428 / 23,925），仍应优先 | 是（真机硬闸） | 守门脚本 `NexioWatch/tools/check-lite-size.ps1`（release exit 0）；详见 review.md「第三轮」与「第七轮」 |
| 13 | **真机复测软重启是否消失**（第六轮新增阻断项）：本轮修的是四个「主线程被长时间占用 + 堆峰值」缺陷（字体日志风暴 868→0、动画定时器改按真实时间 + 硬上限、每帧开销、读文件上限 65,536 字符），模拟器侧 48 次连滑无卡死；真机需实测打开应用后是否还软重启，并用 `hdc` 抓 hilog 确认无 `ERR_OUT_OF_MEMORY` / `JS HEAP OOM` | 是（真机） | 详见 review.md「第六轮」与本文 §13 |
| 14 | **已签名包安装验证**（第六轮新增）：`entry-default-signed.hap`（289,197 B，DevEco 生成的调试签名 profile，bundle `com.haooz.chedule`，有效期至 2027-10-09）能否在 GT5/GT6 正常安装与启动 | 是（真机 + 账号） | `build-profile.json5` 含本机绝对路径与口令，**不入库** |

## 8. 验证计划

| 层级 | 手段 | 结果 |
| --- | --- | --- |
| 静态审计 | 12 个 `.js` 全部 `node --check`（拷成 `.mjs` 到 `.dsh-tmp/chk/`）；禁用语法与残留符号扫描 | 第七轮：**syntax fails = 0 / 12**；`KEY_VERSION`/`URI_DATA`/`SYNC_POLL_MS`/`days_short` **0 命中**；`export default` 只剩 3 处且都必需（`app.js` app VM、`const.js` 被 `model.js` 默认导入、`pages/index/index.js` 页面 VM）；`ctx.font` 全项目仅 `setFont` 内部 1 处 |
| 构建 | 设 `DEVECO_SDK_HOME` 后 hvigorw `--mode module -p product=default assembleHap --no-daemon`（真机另加 `-p buildMode=release`） | 第七轮 debug 与 release **均 BUILD SUCCESSFUL**（exit=0）：debug `app.js` **48,228 B** / 页面 **41,622 B**；release `app.js` **28,724 B** / 页面 **25,227 B**，`.bc` 25,180 / 20,652。守门脚本 `tools/check-lite-size.ps1` **exit 0**。双构建脚本 `.dsh-tmp/build3.ps1` |
| 尺寸守门 | `tools/check-lite-size.ps1` 读 `loader_out_lite/default/js/MainAbility` 下 `app.js` 与 `pages/index/index.js`，任一 > 49,152 即 `exit 1` | 第七轮 release **exit 0**（`[ OK ] app.js = 28724 B, 20428 B of headroom` / `[ OK ] pages\\index\\index.js = 25227 B, 23925 B of headroom`）；debug 本轮也首次合规（余量 924 / 7,530） |
| 页面渲染 | `Simulator.exe`（454×454 圆形）+ WebSocket 抓帧 + 命名管道注入点击/拖拽 | 第七轮用 `.dsh-tmp/verify7.js`（**一次 WS 全程抓帧**，规避「WS 存活 4–8 s 后引擎崩溃」）：首页 / 今日 / 周课表 / 同步 / 关于全部抓帧正常（`.dsh-tmp/frames-v7`、`frames-v8`），运行期内存 ack totalBytes 524280 / allocBytes 87496 / peakAllocBytes 87728。**表冠无法注入**，`crownTurn/pageTurn` 只有静态正确性 |
| 堆档位 | `.dsh-tmp/heapsweep.js <KB列表>`：逐档起模拟器，判定 `app=/page=/render=/alive=/OOM=`（`-hs` 直通 jerry 堆字节数） | 第七轮：改前 92 KB OOM、96 KB 通过；**改后 80 KB OOM、88 KB 通过** ⇒ 启动净需 ≈96 KB → ≈88 KB（OOM 账单见 `.dsh-tmp/sim-hs80.log:33-47`） |
| 真机 | 签名 HAP 安装到 GT5 / GT6（用户侧） | **未运行**，见 §7 待办 2、3、7、8、9 与 §14.4 |

## 9. 里程碑

- M1 核心数据层 + 今日页跑通（构建 + 抓帧）—— **完成**
- M2 周课表（canvas 7 行列表）—— **完成**
- M3 详情/编辑/作息/设置/同步/关于 六视图 —— **完成**
- M4 蓝牙发现 + 局域网 HTTP + 文件通道三段式同步 —— **完成（手表端 + 手机端 WatchSyncServer；端到端联调待办）**
- M5 内存基线抬到 GT5/GT6 512 KB、`MAX_COURSES=12`（只缓存当前周），并保 64 KB 下限回归 —— **完成**
- M6 静态审计 + 全视图注入点击截图 + 两份文档 —— **完成（真机项除外）**
- M7 四合一 UI 重构（去编辑 / 版式重排 / 活动记录式进度环 / 表冠 / 作息滚动）—— **完成（模拟器已验证；表冠与动效待真机）**
- M8（用户）真机安装：表冠、HTTP 拉取、`@system.storage` 读写、466×466 显示 —— **待用户**（BLE 扫描、`@system.file` 读写、振动三条通道已在第七轮删除）
- M9 第二轮：当周课程内存控制 + 活动记录式首页 + 分方向手势 + 视图栈返回 —— **完成（模拟器已验证；表冠 `pageTurn` 与 64 KB 档峰值待真机）**
- M10 第二轮收尾修正：改周次即判定缓存过期并联动重拉（`doStep` + `index.js:1169`）、首页缓存过期提示优先于「下一节」（`index.js:578-585`）、`sync.js pull()` 兜底定时器成对清理 —— **完成（模拟器已验证；联动重拉的真机往返见 §7 待办 11）**
## 10. 第三轮（2026-10-09）：单文件 49,152 B 硬闸与 release 构建要求

### 10.1 根因（引擎源码）

- 阈值 `frameworks/src/core/base/js_fwk_common.h:89` `FILE_CONTENT_LENGTH_MAX = 1024 * 48` = 49,152 B；门禁 `js_fwk_common.cpp:649 CheckFileLength()` 由 `ReadFile :684` 每次调用；比较是严格 `>`。
- 真机分支 `js_fwk_common.cpp:657-665` 直接 `return false`（`scriptBuffer` 置空）⇒ 该文件零执行、整屏黑；模拟器分支只 `HILOG_WARN`（`:661`）⇒ 模拟器通过不能替代真机结论。`.bc` 同卡 49,152 B（`js_app_context.cpp:157`）。
- 配额按文件独立：`app.js` 走 `js_ability_impl.cpp:81`，每个页面走 `js_page_state_machine.cpp:323`。
- debug 构建永不压缩（`hvigor-ohos-plugin/src/tasks/legacy-tasks/legacy-compile-lite-node.js` 的 `hapMode:(!this.targetService.isDebug()).toString()`；只有 release 挂 `TerserPlugin{compress:false,mangle:true}`，见 `webpack.lite.config.js:229-240`）。

### 10.2 架构决策：内核分离

- `app.js` 顶层 `import` 全部 common + `globalThis.NEXIO = {...}`（13 键），页面 **0 条 import**、只 `var K = globalThis.NEXIO`；删死模块 `common/app.js`/`nav.js`/`remind.js`。
- 决策理由：本机 `@system.router` 只有 `replace/replaceUrl`（`js_router.cpp:203-238 ReplaceSync()` 会 `delete currentSm_`），拆多页会让每个页面冷启动且跨页状态必须落盘；内核放 `app.js` 可复用同一份 JS 上下文，代价是两个文件各自独立吃 49,152 B 配额。

### 10.3 尺寸与验收（本轮实测）

| 构建 | `app.js` | `pages/index/index.js` | 49,152 B 闸 |
| --- | --- | --- | --- |
| debug（默认，IDE/模拟器） | 72,094 B | 47,527 B | app.js **超闸**（-22,942），页面合规（+1,625） |
| `-p buildMode=release` | 42,400 B | 29,057 B | **两者合规**（+6,752 / +20,095） |

- 验收口径：**release 两文件 ≤ 49,152 B 为硬通过**（已通过）；debug 页面 ≤ 49,152 B 已达成；debug `app.js` 结构性无法通过（全部 common 内联 + 无压缩），不为此删功能。
- 守门脚本：`NexioWatch/tools/check-lite-size.ps1`（纯 ASCII），release `exit 0`、debug `exit 1`（打印超标字节数）。
- 本轮代码改动、bug 修复清单与运行证据（`crash=false` + `NexioWatch onCreate` + 抓帧）见 review.md「第三轮（2026-10-09）」与 `.dsh-tmp/verify/report-task7.md`。
- 行号漂移：`pages/index/index.js` 本轮删约 87 行后为 **1,410 行**，本文早于本轮的 `index.js:NNN` 锚点在删除位置之后需整体上移约 87 行。

- M11 第三轮：真机单文件 49,152 B 硬闸定位（引擎源码级证据）+ 内核分离 + 页面瘦身与守门脚本 + 修复「进行中卡片触发页面渲染失败」的真实 bug —— **完成（release 构建已进闸并通过模拟器冒烟；真机最终判据见 §7 待办 12）**

## 11. 第四轮（2026-10-09）：m06685 四项修复 + 引擎字号缺陷

### 11.1 用户反馈与处置

| # | 反馈 | 处置 |
| --- | --- | --- |
| ① | 首页左右不对称、中间文字与背景不对称、右侧竖排点未与边框对齐（可删）、主页信息可更丰富 | 右对齐全部改交引擎 `ctx.textAlign='right'`（不再用 `tw()` 估算）；顶部左右同内缩 `HOME_SAFE_X=96`；**删右侧指示点列**与 `'dot'` 补间；信息行 3 → 4 行（本周 / 今日课程 / 下一节 / 数据）；底部三胶囊与子页 `nav()` 同轴（宽 60 / 间距 5 / 中心 162·227·292） |
| ② | 关于页文字显示不全；「返回」「退出」功能好像一样 | 四行 panel 值不再被截断；返回＝中性灰胶囊、退出＝红胶囊 + 二次确认（`exitArmed`）；退出改走 `@system.app.terminate()`（`NEXIO.app`），失败提示 `exit_failed` 而不是静默回首页 |
| ③ | 只留一周课程、不需要查看功能 | 行命中区 `pickDay` 与 `dispatch` 分支已删（周课表只读）；`crownTurn` 的换周分支已删 |
| ④ | 动画方向与手势不一致 | 手势显式传方向：上滑 `open('today',undefined,1)` / 下滑 `open('week',undefined,-1)` / 左滑 `jump('about',1)` / 右滑 `jump('settings',-1)`；子页左滑下一页、右滑上一页，详情页右滑返回 |

### 11.2 引擎约束（写 UI 代码必须遵守）

- **canvas 字体的字号只在「不带字体族名」时生效**：`canvas_component.cpp:509-564 FontSetter` 用 `GetSubFont()`（`:2178-2229`）按空格切分，仅 `:549` 首字符为数字才 `strtol` 取字号；带族名（如 `'17px sans-serif'`）整串被当字体族名，回退 `g_defaultFontSize=30`（`product_adapter.cpp:67`）并忽略请求字号 ⇒ 全项目一律写 `'<size>px'`。
- 宽度估算（`common/ui.js tw()`，仅服务 `ellipsize` 与排版预算）：**汉字 advance ≈ size + 2**，**数字/拉丁 ≈ 0.6*size + 1**（逐字形实测，`.dsh-tmp/shots-calE`）；`measureText` 返回垃圾值，不可用；对齐一律 `ctx.textAlign`。
- 圆屏安全区：所有版式必须落在弦 `[227−sqrt(227²−dy²), 227+sqrt(227²−dy²)]` 内，逐带核对脚本 `.dsh-tmp/bands.py`（越界会打 `<<< OUT OF CHORD`）。

### 11.3 尺寸（本轮收尾）

| 构建 | `app.js` | `pages/index/index.js` | 49,152 B 闸 |
| --- | --- | --- | --- |
| debug（默认） | 72,110 B | 47,837 B | app.js 结构性超闸；页面 +1,315 |
| `-p buildMode=release` | **42,327 B** | **29,144 B** | 两者合规（+6,825 / +20,008） |

- 本轮瘦身：删死数据 `ICON24`（0 引用）⇒ `common/icon.js` 4,415 → 3,754 B。守门脚本 release `exit 0` / debug `exit 1`（`tools/check-lite-size.ps1`，保持纯 ASCII）。
- `.bc` 路径同卡 49,152（`js_app_context.cpp:157`，`.js` 失败后做后缀互换重试 `:170-179`）：release 包内 `app.bc` **35,872 B**、`pages/index/index.bc` **24,102 B** ⇒ 均合规；release HAP 268,494 B。
- 真机安装口径不变：**必须 release 构建**；本轮 release 产物仍为 unsigned（`build-profile.json5` 无 `signingConfigs`）。

### 11.4 待办增量（接 §7）

| # | 事项 | 阻断项 | 备注 |
| --- | --- | --- | --- |
| 13 | **真机核验 canvas 字号写法**：模拟器上 `'<size>px'`（无族名）已按字号单调放大，但真机字体回退链可能不同；若真机出现字号异常，优先怀疑 `ctx.font` 字符串 | 是（真机字体） | 第四轮根因见 §11.2 |
| 14 | **退出行为的真机验证**：`@system.app.terminate()` 在 GT5/GT6 是否真正结束应用；失败时会提示 `本机不支持退出` | 是（真机 API） | 与 §7 待办 7 一起做 |

- M12 第四轮：m06685 四项（首页对称与信息四行 / 关于页完整与按钮可分 / 周课表只读当周 / 过渡跟手）+ 引擎字号族缺陷定位与全量修复 + 宽度模型重标定 —— **完成（模拟器抓帧逐项核验；真机判据见 §11.4）**

## 12. 第五轮（2026-10-09）：真机黑屏根因与瘦身（m08330）

用户反馈（逐字）：「再说几个问题，不要动UI，去解决一下，实机安装打开应用黑屏但不软重启，我猜是内存问题，手表端的图标应该为圆形，包括关于页面，程序在手表端被称为lable而不是Nexio其次设置页面，作息页面都可以不要，全部接受同步手机，以免内存溢出」。**硬约束：不动 UI 版式**（本轮只改数据通道、图标、显示名与页面集合，版式坐标一律未动）。

### 12.1 反馈与处置

| # | 反馈 | 处置 |
| --- | --- | --- |
| ① | 真机安装后黑屏，但不软重启（用户猜内存） | **不是内存**。根因：ACE-Lite 只在 `JSFWK_TEST==1`（仅模拟器）时创建 `globalThis`（`js_app_environment.cpp:82-89`）⇒ 真机求值 `globalThis.NEXIO` 抛 `ReferenceError`，app.js 与页面都不执行 ⇒ 无 `onCreate`、整屏黑、不软重启。修法：内核改由 `export default { data: { NEXIO } }` 发布（`js_ability_impl.cpp:80-82` + `js_app_context.cpp:182-191` ⇒ 全局 `$app`），页面三通道取用 `getApp().data.NEXIO` → `$app.data.NEXIO` → `globalThis.NEXIO` |
| ② | 图标应为圆形（桌面 + 关于页） | 桌面 `icon.png`/`icon_small.png` 重制为圆形 PNG（圆外 `alpha=0`）；关于页 `ICON32` 重写为圆形 32 色点阵（canvas 无 `drawImage`/`clip`，只能把圆形构图烘进点阵） |
| ③ | 手表端显示名为 `lable` | `string.json` 的 `MainAbility_label` 由 `"label"` 改为 `"Nexio"` |
| ④ | 设置页、作息页都不要 | `PAGE_ORDER`/`drawView`/`crownTurn`/`drawTimes`/`drawSettings`/`doStep`/`step`/`reset` 全部删除；`nav()` 中间胶囊改「同步」（新增 `btn_sync`）；首页胶囊改「今日/周/i」；今日页环区热区与首页右滑改指向同步页 |
| ⑤ | 全部接受手机同步，以免内存溢出 | 删 `common/seed.js`（12 门示例课 + 2 条示例假期）；新建 `common/defaults.js`（空设置 + 标准作息表）；`store.js` 的 `loadSeed` 与 `setCurrentWeek`/`setTotalWeeks` 一并删除；同步页删「恢复示例数据」行 |

### 12.2 引擎约束（本轮新增，写 Lite 代码必须遵守）

- **真机没有 `globalThis`**：只有 `JSFWK_TEST==1`（`frameworks/targets/simulator/acelite_config.h:28-29`，或 `LOSCFG_TEST_JS_BUILD`）才有。跨文件共享状态的可用通道只有：`$app`（`ATTR_APP`，引擎在 app 求值时挂的全局）、`getApp().data.*`（`app_data_module.cpp`，引擎内置全局函数）、或 `@system.*` 模块。
- `ViewModel(options)`（`runtime-core/src/core/index.js:34-95`）只保留 `render`/`data`/`styleSheet` 与**函数**成员，其它 key 静默丢弃 ⇒ app.js 里塞自定义对象必须走 `data`。
- `getApp()` **只在顶层调用一次并缓存**：引擎注释警告每次调用会丢一次 `$app` 引用，反复调用触发 `ERR_REF_COUNT_LIMIT`（「JS REF LIMIT」）。
- `import x from '@system.app'` 是构建期被 ace-loader 转成 `requireNative('system.app')`（产物里可见 `requireModule("@system.app")`），写法无需改。
- 页面与 app.js **各享一份 49,152 B 配额**（`js_fwk_common.h:89`，按文件判定）；debug 构建永不压缩（`legacy-compile-lite-node.js` 的 `isDebug()` → `hapMode`），所以 `app.js` debug 超闸是结构性的，真机必须装 release 包。

### 12.3 尺寸（本轮两次构建）

| 构建 | `app.js` | `pages/index/index.js` | 49,152 B 闸 |
| --- | --- | --- | --- |
| debug | 69,677 B | 42,896 B | app.js 超闸 -20,525；页面 +6,256 |
| `-p buildMode=release` | **40,702 B** | **26,070 B** | +8,450 / +23,082；`app.bc` 34,572 / `index.bc` 21,854 亦合规 |

`tools/check-lite-size.ps1`：release `exit 0` / debug `exit 1`。页面 bundle debug 由 47,837 → 42,896 B（删两页与相应代码）。release 产物仍是 unsigned（`build-profile.json5` 无 `signingConfigs`）。

### 12.4 待办增量（接 §7 与 §11.4）

| # | 事项 | 阻断项 | 备注 |
| --- | --- | --- | --- |
| 15 | **真机核验内核通道**：`getApp().data.NEXIO` 在 GT5/GT6 上是否可用（模拟器验证走的就是这条主通道，但不等于真机） | 是（真机） | 若真机仍黑屏，用 `hdc` 抓 hilog 找 `ReferenceError` / @@EXCE_ACE_PAGE_JS_EVAL_FAILED` |
| 16 | **真机核验圆形图标与 5 位以下显示名**：桌面图标是否为圆、名称是否为 `Nexio` | 是（真机） | 显示名来自 `string.json`，编译期生效 |
| 17 | **真机核验空态**：未同步时首页/周课表/同步页的空态文案与手机端首次同步后的填充 | 是（真机） | 已删种子数据，未同步前课表为空是预期行为 |
| 18 | 真机签名包：`build-profile.json5` 配 `signingConfigs`（DevEco 自动签名需华为开发者账号） | 是（账号） | 与 §7 第 12 条同源 |

- **M13 第五轮：真机黑屏根因（globalThis 缺失）定位与修复 + 圆形图标 + 显示名 Nexio + 删设置/作息页 + 去种子全走手机同步 + debug/release 双构建与抓帧回归 —— 完成（模拟器侧；真机判据见 §12.4）**

## 13. 第六轮（2026-10-09）：真机软重启与仿真器连滑卡死（m09147）

用户反馈（逐字）：「这次可以打开了，但是显示页面后直接软重启，在仿真器里连续滑动多次页面也会卡死，看看如何优化」。第五轮修掉了「打开即黑屏」，本轮处理的是**打开之后**的运行期问题。

### 13.1 反馈与处置

| # | 反馈 | 根因 | 处置 |
| --- | --- | --- | --- |
| ① | 真机显示页面后**直接软重启** | 单一主因是**引擎字体日志风暴**：`canvas_component.cpp` FontSetter :536-562 会解析 index=0/1 两个 font token，本项目全用单 token 的 `'13px'`，index=1 处 GetSubFont 必然返回 nullptr ⇒ 每次赋字号都写一条 `HILOG_WARN "get text font size or font family failed"` 并 `ace_free(fontValue_)`。真机 HILOG 是阻塞式 I/O，一次过渡要重画 10 帧、每帧几十处文字 ⇒ 短时间数百条同步日志 + 频繁 malloc/free，主线程被拖住触发看门狗 | `setFont(ctx, size)`：写 **`'13px 13px'`（两个数字 token）** 让 index=0/1 都能解析，并做同尺寸去重；全页 22 处 `ctx.font =` 收敛到这一个入口 |
| ② | 仿真器**连续滑动多次卡死** | 动画定时器**按帧计数**（`p = animI / TRANS_FRAMES`），30 ms 周期在单帧成本 > 30 ms 时不会丢帧；引擎侧 `timer_module.cpp:186 DispatchAsyncWork` + `async_task_manager.cpp Callback()` 会把积压回调**一次性排空** ⇒ 每多滑一次就多欠一批帧 | 过渡与补间都改为**按真实时间推进**（`t0 = new Date().getTime()`，`p = el / TRANS_MS_TOTAL`），并加硬上限 **TRANS_MAX_MS=480 / TRANS_MAX_FRAMES=16**（TWEEN 同理）——无论掉多少帧，最多 16 帧内必定收尾 |
| ③ | （同②）每帧重复开销 | 每帧一次 `getContext('2d')`（引擎每次 `BeginPath` + `jerry_acquire_value`）；过渡期每帧两次完整 `drawView`；`reg()` 每帧推几十个命中对象；`drawIcon` 每帧 `enc.split('~')` 造新数组 | ctx 缓存到 `this.ctx`（绘制异常时置空重取）；`reg()` 在 `animOn` 时直接 return（过渡中的点击本就被 `onTap` 丢弃）；图标行数组缓存到 `icon.rowsCache` |
| ④ | （同①，堆峰值）单次读文件上限偏大 | `readAllText` 原为 24 轮 × 4096 = **98,304 字符**，读满后 `parts.join('')` 再整串 `JSON.parse`，峰值是数据的两份 | 收紧到 **16 轮 × 4096 = 65,536**，与 `sync.js` 的 `MAX_BODY` 对齐，给解析峰值留余量 |

### 13.2 引擎约束（本轮新增）

- `ctx.font` 的**单 token `'NNpx'` 会稳定触发一条 WARN 并释放 `fontValue_`**；写两个数字 token（`'13px 13px'`）即可让 GetSubFont(0)/(1) 都成功。带字体族名的写法本来就是禁的（§11.2：字号会被整串忽略）。
- `setInterval` 在 Lite 引擎里**不丢帧、不合并**：回调会经 `DispatchAsyncWork` 排队并由 `AsyncTaskManager::Callback()` 全部排空。任何逐帧动画都必须有**按真实时间的硬上限**，不能只数帧。
- `getContext('2d')` **不是免费操作**（每次 `BeginPath` + `jerry_acquire_value(dom_)`），应缓存返回的上下文对象，只在绘制抛异常时失效重建。

### 13.3 尺寸、守门与签名（本轮三次构建）

| 构建 | `app.js` | `pages/index/index.js` | 49,152 B 闸 |
| --- | --- | --- | --- |
| debug | 69,750 B | 43,927 B | app.js 超闸 -20,598（结构性）；页面 +5,225 |
| `-p buildMode=release`（优化后） | **40,737 B** | **26,680 B** | +8,415 / +22,472；`app.bc` 34,600 / `index.bc` 22,154 亦合规 |

- `tools/check-lite-size.ps1`：release **exit 0** / debug exit 1。
- **首次产出已签名包**：用户在 DevEco 生成调试签名（`C:/Users/LingLuoYi/.ohos/config/` 下 `.cer/.csr/.p12/.p7b`；profile `type: debug`、bundle `com.haooz.chedule`、有效期 2026-10-09 → 2027-10-09），`SignHap` 成功 ⇒ `entry-default-signed.hap` = **289,197 B**（unsigned 269,126 B）。
- `build-profile.json5` 含本机绝对路径与加密口令，**不纳入版本库**。
- 版本升至 **v1.0.2**（`common/const.js:13` 单一来源）；已核对签名包内 `assets/js/MainAbility/app.js` 含 `v1.0.2`、不含 `v1.0.1`。

### 13.4 待办增量（接 §7 与 §12.4）

| # | 事项 | 阻断项 | 备注 |
| --- | --- | --- | --- |
| 19 | **真机复测软重启是否消失**：打开应用后长时间停留 + 多次翻页，用 `hdc` 抓 hilog 确认无 `ERR_OUT_OF_MEMORY` / `JS HEAP OOM`，且 `get text font size or font family failed` 为 0 | 是（真机） | 本轮只在模拟器侧证明主线程占用与日志风暴已消除 |
| 20 | **已签名包装机验证**：`entry-default-signed.hap` 在 GT5/GT6 上的安装与启动 | 是（真机） | profile 为 debug 类型、一年有效期，正式发布需在 AGC 申请发布证书 |

- **M14 第六轮：字体日志风暴 + 动画定时器无上限 + 每帧重复开销 + 读文件上限 四处优化，字体 WARN 868 → 0、48 次连滑压力测试无卡死、release 签名包产出（289,197 B）、版本升 v1.0.2 —— 完成（模拟器侧；真机判据见 §13.4）**

## 14. 第七轮（2026-10-10）：真机仍软重启（m09613）——删净无用同步通道 + 运行期减堆

用户反馈（逐字）：「还是软重启尝试一下把其他用不到的同步方式删干净」。第六轮只消除了字体日志风暴与动画欠帧，真机仍软重启；本轮同时处理「删干净」与「降堆」。

### 14.1 反馈与处置

| # | 反馈 | 根因 | 处置 |
| --- | --- | --- | --- |
| ① | 真机**仍软重启** | 唯一会触发系统重启的路径是 **jerry 自身 fatal**：`fatal_handler.cpp:90-95` 把 `HandleFatal` 注册给 `jerry_port_default_set_fatal_handler`；`:53-81` 命中后 `ProductAdapter::SendTerminatingRequest(GetCurrentAbilityToken(), true)` 通知 AMS 拆掉应用，系统随即重新拉起。**引擎不会自造 fatal**（`SetFatalError(` 全仓库仅两处调用），触发者是 jerry 的 `JERRY_FATAL_OUT_OF_MEMORY` 一类 | 本机无法复现（模拟器非设备同款引擎配置），改为**压缩启动期/运行期堆占用**保守收敛：删整条无用通道 + 删死代码 + 去重复分配 |
| ② | 删干净用不到的同步方式 | `@system.bluetooth` 在引擎模块表 `ohos_module_config.h:97-158` 里**没有条目**，`requireNative` 只能拿到 `undefined` ⇒ BLE 扫描本来就是死码；`entry/src/main` 下也**没有 rawfile 目录**；`@system.file` 读盘要在 JS 堆里拼 65 KB 字符串再 `JSON.parse` | 删 `common/ble.js` 整个文件；删文件导入/导出（`URI_IMPORT/URI_RAW/URI_EXPORT`、`readImportFile/readRawFile/exportToFile`、`sync.importText`、页面 `doImport/applyImport/doExport`）；连 `@system.file` 落盘通道整体删除（全工程 `grep '.save('` **0 命中**）；持久化只留 `@system.storage` 三个小标志 |
| ③ | （同①）堆峰值 | 92 KB 堆下 OOM 的内存账：byte code 44,160 / strings 20,678 / objects 7,752 / properties 14,080 | 删 9 个模块的 `export default`（全工程唯一默认导入是 `model.js → const.js`，其默认对象进一步只留真正取用的 3 个键）；删全部死导出/死函数；页面 `this.taps = []` → `this.taps.length = 0`；删已无引用的 `common/img/app_icon.png` |
| ④ | 权限表残留 | `config.json` 仍声明 VIBRATE / ACCESS_BLUETOOTH / DISCOVER_BLUETOOTH 三条，但源码里 `vibrator|VIBRATE|@system.bluetooth` 全 0 命中 | 只留 `ohos.permission.INTERNET`（config.json 1425 B → 949 B） |

### 14.2 引擎约束（本轮新增，写 Lite 代码必须遵守）

- **唯一软重启通道**是 jerry fatal → `fatal_handler.cpp` → `SendTerminatingRequest(token, true)`；`EXCE_ACE_PAGE_FILE_TOO_HUGE`（49,152 B 超闸）**只黑屏不重启**（`js_app_context.cpp:85-100` 直接 `return UNDEFINED`）。两者不要再混为一谈。
- 设备侧**恒为 snapshot 模式**（`platform_adapter.cpp:41-48`：`#if (TARGET_SIMULATOR != 1) mode = true;`），`.bc` 与 `.js` 都会打进 HAP；模拟器两个 mode 函数都是空操作，**永远 parser 模式**，因此**本机无法用 .bc 复现真机堆账**（实测把 `.js` 删掉只留 `.bc` 会得到 `TypeError: Invalid snapshot version or unsupported features present`）。
- `-hs <字节>` 直通 jerry 堆容量（OOM 报文的 `heap total size:` 与之相同）。这是本机**唯一**能调堆的旋钮，也是唯一能量化「启动净需堆」的手段。
- `@system.bluetooth`/`@system.wearengine` 不在模块表里 ⇒ `requireNative` 返回 `undefined`，不会抛错；**但静态 `import` 仍会把它编译进 bundle**（多一份模块包装与字符串）。无用通道应连 import 一起删。
- `export default {...}` 在每个模块求值时都要建一个对象并填属性，是**纯运行期堆分配**；没有默认导入的模块应整块删掉。

### 14.3 尺寸、守门与堆档位（本轮三次构建）

| 构建 | `app.js` | `pages/index/index.js` | 49,152 B 闸 |
| --- | --- | --- | --- |
| debug | **48,228 B** | 41,622 B | **首次两者同时合规**（+924 / +7,530） |
| `-p buildMode=release` | **28,724 B** | **25,227 B** | +20,428 / +23,925；`app.bc` 25,180 / `index.bc` 20,652 |

堆档位扫描（`.dsh-tmp/heapsweep.js`）：改前 92 KB OOM、96 KB 恰好够用；改后 **80 KB OOM、88 KB 通过** ⇒ 启动净需 **≈96 KB → ≈88 KB**（字节码 44,160 → 38,104，strings 20,678 → 18,738，objects 7,752 → 6,944，properties 14,080 → 11,744）。

### 14.4 待办增量（接 §7、§12.4 与 §13.4）

| # | 事项 | 阻断项 | 备注 |
| --- | --- | --- | --- |
| 21 | **真机复测软重启**：打开后长时间停留 + 多次翻页，`hdc` 抓 hilog 确认无 `ERR_OUT_OF_MEMORY` / `JS HEAP OOM` | 是（真机） | 若仍复现，说明真机堆比 88 KB 更紧或存在运行期增长点，下一步转向「按需分配 + 更激进的缓存裁剪」 |
| 22 | 已签名包装机验证（第六轮遗留，包体因删通道变小） | 是（真机） | 需先在 DevEco 里重新出包 |

- **M15 第七轮：删净 BLE/文件导入导出/文件落盘三条无用通道、权限表收敛到 INTERNET、9 个 export default 与全部死函数删除、页面减少每帧分配；debug 包首次同时满足 49,152 B 闸；启动净需堆 ≈96 KB → ≈88 KB —— 完成（模拟器侧；真机判据见 §14.4）**

## 15. 第八轮（2026-10-10）：真机日志判读与探针化

用户提供 HUAWEI WATCH GT 6-026 的日志（逐字）：

```
10 07:36:15 0 0 I 31/APP: [Console Info] NexioWatch onCreate
10 07:36:16 0 0 I 31/APP: [Console Info] NexioWatch onDestroy
```

### 15.1 判读（对本项目方向的重大修正）

| 结论 | 依据 |
| --- | --- |
| 应用求值成功，**不是 49,152 B 硬闸** | 有 `onCreate` ⇒ app.js 执行了；超闸时该文件零执行 |
| **不是 JS 堆 OOM** | 有 `onDestroy`。`InvokeMethodWithoutParameter` 第一句 `if (IsJSRuntimeFatal()) return;`（`js_ability_impl.cpp:404-409`），而 `IsJSRuntimeFatal()` 只对 JS HEAP OOM / REF LIMIT / DISABLED BYTE CODE / ASSERTION 为 true（`fatal_handler.cpp:268-286`）⇒ 这四类会跳过 onDestroy |
| 应用被**系统正常销毁**（或非 JS-runtime 致命） | `TransferToDestroy` 三个调用点中，`fatal_handler.cpp:135` 已被上一条排除 |
| 本地日志通道只能看到应用自己的 `console` | 真机抓到的是 `31/APP` 域；引擎错误在 ACE 域（本次截图看不到） |

> 第四~七轮按「真机 JS 堆 OOM」优化（删通道、删 export default、启动堆 −8 KB）的**方向被这条日志否掉**。后续定位必须靠页面侧日志。

### 15.2 本轮改动

1. **探针链**（13 条，全部 ASCII 短串）：`app onCreate` / `app onDestroy` / `page module ready` / `page onInit` / `page onReady` / `first draw <view>` / `drawError <msg>` / `page onShow|onHide|onDestroy` / `crown api=` / `store load ok=` / `autoSync host=` 与 `result` / `pull fail:`。
2. **首绘保证**：新增 `onReady()`（引擎 `RenderPage()` 后回调，`js_page_state.js:44-59`，此时 canvas 必然就绪）+ `ensureDraw()`（100 ms × 最多 10 次重试）+ `stopDraw()`（onHide/onDestroy 成对清理）。旧 `redraw()` 在 `$refs.cv` 未就绪时直接 return 且**永不重试** ⇒ 真机可能「启动成功但一直黑屏」。
3. **修掉探针自身引入的 bug**：`app.js` 的 onCreate 探针误用未定义的 `VERSION`（应为 `C.VERSION`），模拟器日志报 `ReferenceError: VERSION is not defined`；若直接上真机会让 app.js 求值失败、亲手制造黑屏。已修复并复测。

### 15.3 尺寸与验证

| 构建 | `app.js` | `pages/index/index.js` | 49,152 B 闸 |
| --- | --- | --- | --- |
| debug | 48,308 B | 43,231 B | 两者合规（+844 / +5,921） |
| `-p buildMode=release` | **28,790 B** | **26,454 B** | +20,362 / +22,698；`app.bc` 25,260 / `index.bc` 21,794 |

- `tools/check-lite-size.ps1` release **exit 0**。
- 模拟器探针链完整、0 条 JS Error / 0 条 fatal（`.dsh-tmp/sim-probe3.log`）；五视图抓帧复测正常（`.dsh-tmp/frames-r8`、`frames-r9`）。
- 96 KB 堆 + 90 s「page」手势压测：53 次手势 / 566 ack，`crashed=false`，探针各出现一次（无重复回调、无定时器泄漏）。
- 已签名包 `entry-default-signed.hap` = **223,471 B**（debug 签名）。

### 15.4 待办增量（接 §7、§13.4 与 §14.4）

| # | 事项 | 阻断项 | 备注 |
| --- | --- | --- | --- |
| 23 | **带探针版本的真机日志**：按 13 条探针判断故障停在哪一步 | 是（真机） | 判据表见 review.md「第八轮」§⑤ |
| 24 | 若日志显示 `first draw` 之后才被销毁 ⇒ 转查系统侧（内存水位、看门狗、ability 配置），不再改 JS | 是（真机） | — |

- **M16 第八轮：真机日志判读（排除 49,152 B 闸与 JS 堆 OOM）+ 13 条探针 + onReady/ensureDraw 首绘保证 + 修复探针自身的 `VERSION` 未定义缺陷 —— 完成（代码与模拟器侧；真机判据见 §15.4）**
