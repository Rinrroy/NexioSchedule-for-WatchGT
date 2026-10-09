<div align="center">

# NexioSchedule for Watch GT

**把手机上的 NexioSchedule 课表，搬到华为 GT 系列手表上。**

纯 JavaScript + ACE-Lite（Lite Wearable / JerryScript 运行时）· 没有 ArkTS · 没有 Stage 模型
整个界面画在一张 454×454 的 canvas 上，由内部视图状态机切换页面

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Lite%20Wearable%20%7C%20ACE--Lite-green.svg)](#)
[![Runtime](https://img.shields.io/badge/runtime-JerryScript%20(ES5)-orange.svg)](#)
[![Version](https://img.shields.io/badge/version-v1.0.2-lightgrey.svg)](#)
[![Target](https://img.shields.io/badge/target-HUAWEI%20WATCH%20GT5%20%2F%20GT6-red.svg)](#)

</div>

---

## 目录

- [这是什么](#这是什么)
- [功能特性](#功能特性)
- [交互方式](#交互方式)
- [架构设计](#架构设计)
- [与手机端的同步](#与手机端的同步)
- [内存与数据策略](#内存与数据策略)
- [构建与运行](#构建与运行)
- [真机 49152 B 单文件硬闸](#真机-49152-b-单文件硬闸)
- [目录结构](#目录结构)
- [开发约束：ACE-Lite 引擎坑速查](#开发约束ace-lite-引擎坑速查)
- [兼容性与已知限制](#兼容性与已知限制)
- [常见问题](#常见问题)
- [路线图](#路线图)
- [特别致谢](#特别致谢)
- [开源协议](#开源协议)
- [免责声明](#免责声明)

---

## 这是什么

**NexioSchedule for Watch GT** 是安卓应用 [NexioSchedule](https://github.com/HaoZai000/NexioSchedule)（Kotlin / Jetpack Compose）
的**手表端移植**。手机端负责课表的录入、编辑、导入与存储；手表端只做一件事——**把课表戴在手腕上看**。

因此手表端是**彻底的只读端**：

- 没有「添加课程」「编辑课程」「删除课程」
- 没有表单、没有输入框、没有编辑浮层
- 没有整学期课表浏览，也不支持在手表上换周
- 只有：当前状态、今天的课、这一周的课、课程详情、同步

这也是项目在工程上最有意思的地方：它不是在写一个 App，而是在**一个没有 DOM、没有路由、没有动画框架、
每个 JS 文件还有 48 KB 硬上限的运行时里**，把一块圆形屏幕从零画出来。

---

## 功能特性

### 界面

| 页面 | 内容 |
| --- | --- |
| **首页** | 活动记录（活力三环）风格：中央进度环显示今日完成节数、当前或下一节课的名称与时间、本周与数据来源四行信息、底部导航胶囊 |
| **今日课表** | 当天课程卡片列表、课程状态（已结束 / 进行中 / 未开始）、进行中课程的进度条、上一天与下一天切换、手动刷新 |
| **周课表** | **仅当前周**的七行课表（周一至周日），今日高亮，日期列右对齐；只读呈现 |
| **课程详情** | 课程名、时间、节次、地点、教师 |
| **同步** | 局域网同步状态、同步地址切换、手动同步（原「设置」页已删除，功能并入本页） |
| **关于** | 应用图标、名称、版本与内存档位、作者与数据来源、返回与退出（退出带二次确认） |

### 引擎能力

- **canvas 自绘 UI**：所有文字、圆环、圆角胶囊、进度条、图标全部用 fillRect / stroke / fillText 手绘
  （本引擎 arc() + fill() 画不出填充，也没有曲线 API）。
- **自研缓动补间**：Lite 只支持 linear / ease-in / ease-out / ease-in-out，且没有 requestAnimationFrame
  ⇒ 用 33 点缓动查找表 + setInterval 逐帧重绘实现 300 ms 过渡与进度环补间。
- **方向跟手的页面转场**：上滑、下滑、左滑、右滑分别对应内容自下、自上、自右、自左进入，位移实时跟随手指。
- **表冠交互**：setMonitorForCrownEvents() 全局注册；首页转表冠翻页（与官方活动记录一致），今日页转表冠滚动列表。
- **图标内嵌**：应用图标被量化成 32 色调色板 + 整行 RLE 点阵（圆形构图直接烘进点阵），写进 common/icon.js，不依赖 drawImage。
- **中英双语**：i18n/zh-CN.json 与 i18n/en-US.json，由 @system.app.getInfo().language 判定。

---

## 交互方式

| 手势 / 操作 | 行为 |
| --- | --- |
| **上滑** | 进入今日课表（内容自下方进入） |
| **下滑** | 进入周课表（内容自上方进入） |
| **左滑** | 进入关于页 |
| **右滑** | 进入周课表；在子页上为「返回上一层」 |
| **表冠** | 首页：左右翻页 · 今日页：滚动课程列表 |
| **点击** | 底部导航胶囊、课程卡片、日期切换按钮、同步与退出按钮 |

> 首页底部三枚胶囊（今日 / 周 / i）与子页导航栏**完全同轴同尺寸**，位置逐像素对齐。

---

## 架构设计

### 1）单页 + 内部视图状态机

Lite Wearable 的 @system.router **只有 replace / replaceUrl，没有 push**；而且引擎在 js_router.cpp 的
ReplaceSync() 里会 delete currentSm_ —— 旧页面的 JS 上下文直接被销毁。所以「多页面」在这块表上等于
「每次跳转都冷启动 + 状态必须落盘」。

于是本项目只注册**一个页面**：

```json
config.json -> module.js[0].pages = ["pages/index/index"]
```

六个界面（home / today / week / detail / sync / about）都是同一个 canvas 上的**视图状态**，
由 this.view 与视图栈 this.stack 驱动。

### 2）内核分离（为 48 KB 闸门服务）

真机对**每个 JS 文件**限长 49,152 B（见下文）。为了让页面文件永远待在闸门以内，把全部 common/* 模块
在入口处**内联进 app.js**，再由入口把内核发布到页面：

```js
// app.js —— 顶层 import 全部 common，再通过 ViewModel 的 data 通道发布内核
import store from './common/store';
import UI from './common/ui';
// ...
var NEXIO = { store: store, M: M, D: D, UI: UI, t: t, ICON32: ICON32, ... };
if (typeof globalThis !== 'undefined') { globalThis.NEXIO = NEXIO; } // 仅模拟器
export default { data: { NEXIO: NEXIO }, onCreate: function () { ... } };
```

```js
// pages/index/index.js —— 零 import：三通道取内核（真机 -> $app -> 模拟器兜底）
var K = null;
try { if (typeof getApp === 'function') { var A = getApp(); if (A && A.data) K = A.data.NEXIO; } } catch (e) {}
if (!K) { try { if (typeof $app !== 'undefined' && $app && $app.data) K = $app.data.NEXIO; } catch (e2) {} }
if (!K && typeof globalThis !== 'undefined') K = globalThis.NEXIO;
```

这条约束（**页面 0 import**）是硬性的：页面里任何一句 import 都会把被依赖模块复制进页面产物，
而页面的预算只有 49,152 B。

> **为什么不用 globalThis？** 真机上没有 `globalThis`（引擎只在 `JSFWK_TEST==1` 的模拟器里创建它，见「引擎坑速查」第 15 条）。
> 写 `globalThis.NEXIO` 会让真机在求值入口时直接抛 `ReferenceError` —— 表现就是**装到真机全黑屏，但不重启**。
> 现在内核走 `export default { data: ... }`（引擎把 app 的 VM 挂到全局 `$app`），页面用内置全局函数 `getApp().data.NEXIO` 取，模拟器与真机同一条主通道。
> `getApp()` 只在顶层调用一次并缓存：引擎注释警告反复调用会丢引用计数，触发 `ERR_REF_COUNT_LIMIT`。

### 3）模块划分

| 模块 | 职责 |
| --- | --- |
| app.js | 入口：import 全部 common，通过 export default { data: { NEXIO } } 发布内核（真机无 globalThis） |
| common/const.js | 常量与单一版本号来源、内存档位、协议版本、存储键、文件 URI |
| common/model.js | 课程数据模型（isActiveInWeek、时间段、节次） |
| common/store.js | 内存态全局状态 + @system.storage 三个小标志（当前周 / 上次同步时间 / 同步地址）；数据全部来自手机端同步 |
| common/defaults.js | 出厂兜底：空设置 + 标准作息时间表（不携带任何示例课程） |
| common/sync.js | 局域网 HTTP 拉取、响应解析、超时守卫（唯一同步通道） |
| common/date.js | 日期与时间工具（周次推算、格式化、分钟数） |
| common/holiday.js | 节假日名（课表行显示假期） |
| common/ui.js | 绘制原语：textY 基线规则、roundRect、ltext / ctext / rtext、ellipsize、tw 宽度估算、缓动 ease、图标绘制、进度环 |
| common/i18n.js | 中英文案表与占位符插值（手工 indexOf + substring） |
| common/icon.js | 32 色调色板 + 整行 RLE 的 32×32 圆形图标点阵 |

---

## 与手机端的同步

**不使用 Wear Engine。** 手表与手机之间只有一条通道：同一局域网下的 HTTP 拉取（蓝牙发现、文件导入导出、落盘持久化三条通道已在 m09613 整体删除，原因见下）。

### 1）局域网 HTTP 拉取（主通道）

手机端 WatchSyncServer（Kotlin）在局域网提供 HTTP 服务，手表侧主动拉取：

```
GET http://<host>:8787/ping                    # 探活
GET http://<host>:8787/schedule.json?week=N    # 拉取第 N 周课表
```

响应体根部带 data_week 字段，标明这批课属于第几周；手表端据此判断缓存是否过期：

```json
{
  "data_week": 5,
  "courses": [ /* 仅第 5 周真正要上的课 */ ]
}
```

- 协议名与版本：nexio.schedule / v4（common/const.js）
- 默认端口 8787；拉取超时 3000 ms；自动轮询 60000 ms
- 权限：ohos.permission.INTERNET（config.json 里**只剩这一条**；VIBRATE / ACCESS_BLUETOOTH / DISCOVER_BLUETOOTH 已随无用通道删除）

### 2）为什么只有一条通道

| 通道 | 处置 | 原因 |
| --- | --- | --- |
| **BLE 广播发现** | 删除 | `@system.bluetooth` 在本引擎的模块表（`ohos_module_config.h:97-158`）里**没有条目**，`requireNative` 只能拿到 `undefined` ⇒ 这条通道从来没有生效过；静态 `import` 仍会把它编译进 bundle |
| **文件导入 / 导出** | 删除 | 表端没有文件管理器可放文件，`rawfile` 目录一直是空的；`@system.file` 读盘要在 JS 堆里拼 65 KB 字符串再 `JSON.parse`，是启动期最大单笔内存峰值 |
| **`@system.file` 落盘** | 删除 | 全工程没有任何调用者（`grep '.save('` 0 命中）；持久化只保留 `@system.storage` 的三个小标志（当前周 / 上次同步时间 / 同步地址），该 API 官方限制单值 < 128 字节 |
| **`@system.fetch` 局域网 HTTP** | **保留（唯一通道）** | 手机端 WatchSyncServer 已经在跑；不再需要 BLE 发现地址，改为在同步页手动选地址（首次配对视情况用手机端显示的本机 IP） |

---

## 内存与数据策略

手表端的内存预算是**硬约束**，这块表不是手机。

| 常量 | 值 | 说明 |
| --- | --- | --- |
| HEAP_TIER_KB | 512 | 目标机型 GT5 / GT6 档位（64 KB 档机型可下调） |
| MAX_COURSES | 16 | **只缓存当前周**真正要上的课；64 KB 档建议改 8 |
| MAX_INCOMING | 200 | 手机端下发条数上限，超出直接丢弃（避免解析期爆堆） |
| MAX_HOLIDAYS / MAX_WEEKS / MAX_SECTIONS | 60 / 30 / 12 | 其余上限 |

**为什么只留一周？** 手机端下发的是整学期课表（可能有上百门）。整表驻留 JS 堆会触发 ERR_OUT_OF_MEMORY
并导致**系统软重启**。现在 common/sync.js 的 collectWeek() 会用 isActiveInWeek **先探测再规范化**
（probe 预筛，命中才构造对象），把驻留量压到「一周十几门」。

首页在缓存周不等于当前周时会显示「缓存为第 N 周，请重新同步」，改周次后自动触发一次同步。

---

## 构建与运行

### 环境

- **DevEco Studio**（含 Lite Wearable SDK）
- JDK 与 Node 由 DevEco 自带；DEVECO_SDK_HOME 需显式设置

### 命令行构建

```powershell
$env:DEVECO_SDK_HOME = 'D:/DevEco Studio/sdk'
cd NexioWatch

# 调试包（仅用于模拟器）
& 'D:/DevEco Studio/tools/hvigor/bin/hvigorw.bat' --mode module -p product=default assembleHap --no-daemon

# 发布包（真机必须用这个）
& 'D:/DevEco Studio/tools/hvigor/bin/hvigorw.bat' --mode module -p product=default -p buildMode=release assembleHap --no-daemon
```

产物：

```
entry/build/default/outputs/default/entry-default-signed.hap     # 配了签名时产出，可直接装真机
entry/build/default/outputs/default/entry-default-unsigned.hap   # 未配签名时只有这个
```

> **签名**：本仓库**不附带**签名配置（build-profile.json5 里的 signingConfigs 含本机绝对路径与口令，
> 因此不入库）。装真机前请在 build-profile.json5 里补上 signingConfigs
> （DevEco 的 File → Project Structure → Signing Configs 可自动生成，需华为开发者账号），
> 否则只能拿到 unsigned 包，构建日志里会出现 Will skip sign ... No signingConfigs profile is configured。
>
> 本项目实测过一次：配好 DevEco 自动签名后，SignHap 任务成功，产出 entry-default-signed.hap = **289,197 B**。

### 在模拟器里跑

DevEco Studio 的 **Lite Wearable 模拟器**（454×454）即可开发调试，但请务必记住：

> 模拟器**不会**复现 48 KB 硬闸（它只打 WARN），也**不能**验证局域网 HTTP、@system.storage 与真机表冠。
> 「模拟器能跑」不等于「真机能跑」。

---

## 真机 49,152 B 单文件硬闸

这是本项目**最容易被忽略、后果最严重**的坑：装上真机直接**黑屏**，而且没有任何日志提示。

### 成因

Lite 引擎对**每一个** JS 文件有 48 KB 上限：

```c
/* frameworks/src/core/base/js_fwk_common.h:89 */
constexpr uint16_t FILE_CONTENT_LENGTH_MAX = 1024 * 48;   /* = 49,152 B */
```

门禁在 js_fwk_common.cpp:649 的 CheckFileLength()，由每次读取文件的 ReadFile() 调用。真机分支是：

```c
if (fileSize > FILE_CONTENT_LENGTH_MAX) {
#if (TARGET_SIMULATOR == 1)
    HILOG_WARN(..., "File exceeds size limit but allowed on simulator.");
#else
    ACE_ERROR_CODE_PRINT(..., EXCE_ACE_PAGE_FILE_TOO_HUGE);   /* 0x0003 */
    return false;                                             /* scriptBuffer 保持空 */
#endif
}
```

- 比较是**严格大于** ⇒ 正好 49,152 B 是合法的
- 真机 return false ⇒ 文件**一行都不执行**（随后 js_page_state_machine.cpp 报 Eval JS file failed）⇒ **整屏黑**
- **额度按文件独立**：app.js 一份，每个页面各一份
- .bc（字节码）走同一个门禁，同样是 49,152 B
- **模拟器只 WARN**，所以模拟器永远发现不了这个问题

### 而且 debug 构建永远不会压缩

hvigor 用 targetService.isDebug() 决定 hapMode，只有 release 才挂 Terser：

```js
/* hvigor-ohos-plugin/src/tasks/legacy-tasks/legacy-compile-lite-node.js */
hapMode: (!this.targetService.isDebug()).toString()
```

⇒ **debug 包在真机上必然超闸**（结构性，不是代码写多写少的问题）。

### 实测尺寸

| 构建 | app.js | pages/index/index.js | 结果 |
| --- | --- | --- | --- |
| debug（默认） | 69,750 B | 43,927 B | app.js **超闸 20,598 B**（结构性） |
| -p buildMode=release | **40,737 B**（余 8,415） | **26,680 B**（余 22,472） | 两者合规 |
| release 包内 .bc | 34,600 B | 22,154 B | 字节码路径同样合规 |

### 每次打包后请跑守门脚本

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-lite-size.ps1
```

输出示例：

```
[ OK ] app.js = 40737 B, 8415 B of headroom
[ OK ] pages\index\index.js = 26680 B, 22472 B of headroom
All .js artifacts are inside the real-device per-file hard limit.
```

**结论：安装到真机请务必使用 -p buildMode=release 的包，并先过守门脚本。**
（脚本必须保持纯 ASCII：Windows PowerShell 5.1 会按 ANSI 读取无 BOM 的 UTF-8 文件。）

---

## 目录结构

```
NexioWatch/
├── entry/
│   ├── build-profile.json5
│   └── src/main/
│       ├── config.json                 # 模块、设备类型、页面注册、权限声明
│       ├── resources/base/             # 应用图标与字符串
│       └── js/MainAbility/
│           ├── app.js                  # 入口：import 全部 common -> $app.data.NEXIO
│           ├── common/                 # 内核（见「架构设计 · 模块划分」）
│           │   ├── const.js  model.js  store.js  sync.js  ble.js
│           │   ├── date.js   holiday.js  ui.js   i18n.js  icon.js  defaults.js
│           │   └── img/app_icon.png
│           ├── pages/index/            # 唯一页面
│           │   ├── index.hml           # 3 行：一张 canvas + 5 个事件绑定
│           │   ├── index.css           # 10 行
│           │   └── index.js            # 视图状态机（全部 UI 绘制与交互）
│           └── i18n/                   # zh-CN.json / en-US.json
├── docs/
│   ├── design-and-plan.md              # 设计、决策记录、待办与里程碑
│   ├── review.md                       # 逐轮复核记录（根因与证据）
│   └── screenshots/                    # 历史归档截图
├── tools/check-lite-size.ps1           # 49,152 B 守门脚本
├── build-profile.json5
└── hvigorfile.ts
```

---

## 开发约束：ACE-Lite 引擎坑速查

以下每一条都是**实测**结论（不是文档抄来的），踩一次就黑屏或错版，欢迎直接抄走：

| # | 现象 / 约束 | 正确做法 |
| --- | --- | --- |
| 1 | **ctx.font 带字体族名则字号被完全忽略**。引擎按空格切分后只有首字符是数字才取字号，否则整串当族名，回退默认 30 px | 一律写 ctx.font = '17px'，**绝不写** '17px sans-serif' |
| 2 | ctx.fillText(x, y) 的 y 是**文本行顶部**，不是基线，导致所有文字整体下沉半行 | 统一 textY(cy, size) = round(cy - size * 0.5 - 3.5)，只走 ltext / ctext / rtext 三个入口 |
| 3 | ctx.measureText 返回垃圾值（CJK 得到 7.6e-313，拉丁得到 false） | 自写 tw() 估算：**汉字 advance 约等于 size + 2**，**数字与拉丁约 0.6 * size + 1**（逐字形实测拟合） |
| 4 | arc() + fill() 画不出填充；没有曲线 API | roundRect() 用逐行 1 px 横条逼近圆角；圆环用 stroke |
| 5 | 没有 requestAnimationFrame，缓动只有 linear / ease-in / ease-out / ease-in-out | setInterval 逐帧 + 33 点缓动查找表 |
| 6 | String.prototype.replace 调用即 TypeError | 文案插值用 indexOf + substring 手工替换 |
| 7 | clearRect、fill()、createLinearGradient、setLineDash 不可用 | 整屏重绘用 fillRect 底色铺满 |
| 8 | 容器默认 flex-direction: row，多子元素横向重叠、容器塌成一行 | 每个多子容器显式 flex-direction: column **并给明确高度** |
| 9 | position: absolute 与负 margin 不生效 | 浮层用 stack 加 padding 对齐 |
| 10 | @system.router 只有 replace / replaceUrl，且会销毁旧页面上下文 | 单页 + 内部视图状态机；跨页状态必须落盘 |
| 11 | HML 节点数几乎决定堆占用（约数 KB 每节点），容易 OOM | 整页改**单 canvas** 绘制 |
| 12 | 圆屏：任何版式都可能被圆形裁掉 | 所有内容落在弦 [227 - sqrt(227^2 - dy^2), 227 + sqrt(227^2 - dy^2)] 内 |
| 13 | 运行时是 **JerryScript**，只保证 ES5 | 禁 let / const / 箭头函数 / 模板串 / async / await / Promise / class / 展开 / 可选链 |
| 14 | 订阅必须有取消路径，定时器必须有清理 | onDestroy 清 setInterval，clearMonitorForCrownEvents() |
| 15 | **真机没有 globalThis**（引擎只在 JSFWK_TEST==1 的模拟器里创建）。入口写 globalThis.X = ... ⇒ 真机求值即 ReferenceError：**全黑屏但不重启**，无任何日志 | 跨文件共享只走 $app / getApp().data / @system.*；getApp() 在顶层调用一次并缓存（反复调用会触发 JS REF LIMIT） |
| 16 | ViewModel(options) 只保留 render / data / styleSheet 与**函数**成员，其它 key 静默丢弃 | app.js 要发布的对象必须挂在 export default { data: { ... } } 上 |
| 17 | canvas 没有 drawImage / clip，位图只能自己填矩形 | 图标量化为调色板 + 整行 RLE 点阵；要做圆形就把圆形构图烘进点阵（圆外纯黑） |
| 18 | **ctx.font 写单个 'NNpx' 会每次都打一条引擎 WARN 并释放 fontValue_**（FontSetter 循环解析 index=0/1 两个 token，单 token 时 index=1 必然失败）。真机 HILOG 是阻塞 I/O，一次过渡能刷出上百条 | 写两个 token：ctx.font = '13px 13px'；并且**同尺寸重复赋值直接跳过**（本项目统一走 setFont(ctx, size)） |
| 19 | **setInterval 不丢帧也不合并**：回调经 DispatchAsyncWork 排队后会被一次性排空，逐帧动画只数帧数就会越欠越多 ⇒ 连滑卡死 | 动画按**真实时间**推进（el / 总时长），并加硬上限（本项目 TRANS_MAX_MS=480 / TRANS_MAX_FRAMES=16） |
| 20 | getContext('2d') 不是免费操作（每次 BeginPath + jerry_acquire_value） | 缓存返回的上下文对象，只在绘制抛异常时失效重建 |

---

## 兼容性与已知限制

### 目标机型

- **HUAWEI WATCH GT5 / GT6**（512 KB 内存档，圆形表盘）
- 其他 GT 系列理论上可用；**64 KB 档机型请把 MAX_COURSES 调到 8**（见 common/const.js 注释）

### 已实现但**尚未在真机验证**的项

- **真机安装必须使用 release 构建**（见上文硬闸），且本仓库未附签名配置
- **内核通道**：getApp().data.NEXIO 在真机上是否可用（模拟器走的已是同一条主通道，但真机未经证实）
- **桌面图标是否为圆形、桌面显示名是否为 Nexio**（均编译期生效，需真机确认）
- **未同步前的空态**：首页 / 周课表 / 同步页在无数据时的文案与版式
- **表冠**：GT5 / GT6 是否具备表冠、event.degree 的方向与灵敏度、16 度每档的手感
- **canvas 字号写法**在真机字体回退链下的表现（若真机字号异常，优先怀疑 ctx.font 是否带了族名）
- **@system.app.terminate()** 是否真正结束应用（失败时会提示「本机不支持退出」）
- **@system.storage**：三个小标志（当前周 / 上次同步时间 / 同步地址）的真机读写
- **局域网 HTTP 拉取**：GET /schedule.json?week=N 的端到端联调（`@system.fetch` 在模拟器里也不真正出网）
- **真机分辨率**：模拟器验证的是 454×454，真机为 466×466 圆屏
- **长时间运行与反复进出页面**：峰值内存
- **软重启是否消失**（第六、七轮）：第六轮修掉字体日志风暴 868→0 与动画定时器无上限；第七轮删掉三条无用通道并把模拟器启动净需堆从 ≈96 KB 压到 ≈88 KB。真机需实测打开后长时间停留 + 多次翻页，并用 `hdc` 抓 hilog 确认无 `ERR_OUT_OF_MEMORY` / `JS HEAP OOM`
- **已签名包能否安装**：entry-default-signed.hap（DevEco 自动生成的调试签名，一年有效期）在 GT5 / GT6 上的安装与启动；包体因删通道变小，需重新出包

> 以上属于「代码已实现 + 模拟器可跑，但缺硬件证据」的部分，请以真机实测为准。

---

## 常见问题

**Q：装到手表上是全黑屏，什么都没显示？**
A：先看现象 —— **黑屏但手表没软重启**，两个常见原因：

1. **48 KB 硬闸**：你装的是 debug 包（debug 构建永不压缩）。请用 -p buildMode=release 重新打包，
   并跑 tools/check-lite-size.ps1。真机对超限文件是**硬拒绝**（该文件一行都不执行），模拟器只打 WARN。
2. **入口用了 globalThis**：真机没有 globalThis，入口求值即抛 ReferenceError。本项目已改为
   export default { data: { NEXIO } } + 页面 getApp().data.NEXIO（见「引擎坑速查」第 15 条）。

判断方法：模拟器能跑而真机黑屏 ⇒ 优先查第 1 条；真机连 onCreate 日志都没有 ⇒ 第 2 条。

**Q：能打开，但显示页面后手表直接软重启？**
A：多半是**引擎字体日志风暴**：ctx.font 用单个 'NNpx' 时，引擎每次赋字号都会同步写一条 HILOG_WARN 并释放字体串。
真机 HILOG 是阻塞 I/O，一次 300 ms 过渡要重画 10 帧、每帧几十处文字 ⇒ 主线程被拖住触发看门狗。
本项目已改为 setFont(ctx, size)（写 '13px 13px' + 同尺寸去重），实测日志条数 **868 → 0**。
顺带还修了三个同类问题：动画定时器改按真实时间推进并加硬上限、缓存 canvas 上下文、单次读文件上限收到 65,536 字符。

**Q：在模拟器里连续滑几次就卡死？**
A：同上的第 2、3 条。setInterval 在 Lite 引擎里**不丢帧、不合并**，只数帧数的动画会不断积压回调。
修完后本项目用 .dsh-tmp/stress.js 做 48 次 / 80 ms 的连滑压力测试，全程 alive=true crashed=false。

**Q：所有文字看起来都一样大，挤成一团？**
A：ctx.font 带了字体族名。本引擎只有 '<size>px'（不带族名）才服从字号，详见「引擎坑速查」第 1 条。

**Q：为什么只能看一周的课，不能翻周？**
A：内存。整学期课表驻留 JS 堆会 ERR_OUT_OF_MEMORY 并软重启。手表端只保留当前周，翻周请用手机端。

**Q：为什么设置页和作息页不见了？**
A：已按使用反馈删除。作息时间表改由手机端随同步一起下发（times 字段），手表端不再自带示例数据；
同步地址与手动同步并入「同步」页，导航胶囊的中间一枚也改成了「同步」。

**Q：没同步之前打开，课表是空的？**
A：是预期行为。手表端不再内置任何示例课程（种子数据已删除，避免占用内存与出现「别的周」的课），
首次打开会显示「课表来自手机端同步」，同步一次后即为真实课表。

**Q：为什么手表上不能添加或编辑课程？**
A：设计如此。手表只负责「看」，录入与编辑全部在手机端完成。

**Q：手机和手表怎么连？需要 Wear Engine 吗？**
A：不需要。同一局域网下，手机端开 HTTP 服务，手表拉取，地址在同步页手动选择（BLE 地址发现与文件导入导出通道已删除）。

**Q：构建日志报 Will skip sign？**
A：没有配置签名，产物是 unsigned HAP，装不到真机。在 DevEco 的 File → Project Structure → Signing Configs
里自动生成一份（需华为开发者账号）即可，之后 SignHap 任务成功会产出 entry-default-signed.hap。
本仓库不附带签名配置，因为它含本机绝对路径与口令。

**Q：模拟器能跑，真机一定行吗？**
A：不一定。模拟器不复现 48 KB 硬闸，也不真正出网、不执行 @system.storage 与真机表冠。

---

## 路线图

- [x] 单页 canvas 架构与六个内部视图
- [x] 局域网 HTTP 同步（唯一通道；BLE 发现与文件通道已删）
- [x] 只缓存当前周（内存控制）
- [x] 活动记录式首页、方向跟手转场、表冠交互
- [x] 手表端彻底去编辑（只读）
- [x] 真机 48 KB 硬闸的架构应对（内核分离 + release 构建）
- [x] 真机黑屏根因修复（去 globalThis，改 $app.data 通道）
- [x] 圆形应用图标（桌面 PNG + 关于页点阵）
- [x] 删除设置页与作息页、去掉种子数据（全部依赖手机端同步）
- [x] 运行期优化：字体日志风暴、动画定时器硬上限、帧内开销、读文件上限
- [x] 打通签名链路（首次产出 entry-default-signed.hap）
- [x] 删净无用通道 + 运行期减堆（BLE / 文件导入导出 / @system.file 落盘；启动净需堆 ≈96 KB → ≈88 KB）
- [ ] **真机签名包实测**（安装、渲染、字体、内存、getApp 通道、软重启是否消失）
- [ ] 表冠方向与灵敏度标定
- [ ] 真机局域网 HTTP 与 @system.storage 联调
- [ ] 64 KB 档机型（GT2 等）回归
- [ ] 更多机型分辨率适配

---

## 特别致谢

| 项目 / 资源 | 作者 / 来源 | 与本项目的关系 |
| --- | --- | --- |
| [NexioSchedule](https://github.com/HaoZai000/NexioSchedule) | **Haooz**（HaoZai000） | 上游手机端；手表端的数据模型、同步协议与整体功能蓝本 |
| [OpenHarmony ACE Engine（Lite）](https://gitee.com/openharmony/arkui_ace_engine_lite) | 开放原子开源基金会 / OpenHarmony | 引擎实现来源；49,152 B 硬闸与 canvas 行为均据此定位 |
| DevEco Studio 与 Lite Wearable SDK | 华为 | 构建、模拟器与调试 |
| [JerryScript](https://github.com/jerryscript-project/jerryscript) | JerryScript 项目 | Lite Wearable 的 JS 运行时 |
| [Python](https://www.python.org/) 与 [Pillow](https://python-pillow.org/) | Python 社区 | 应用图标重采样（LANCZOS）与抓帧像素级版式分析 |
| AI 编码助手：DeepSeek Harness | DeepSeek | 协助引擎行为排查、像素级标定与文档整理 |

以及所有在圆屏小设备上写过 UI 的人——你们知道为什么这里没有一行 CSS 布局。

---

## 开源协议

本项目采用 **[GNU Affero General Public License v3.0](LICENSE)**（AGPL-3.0）开源。

选择与上游 [NexioSchedule](https://github.com/HaoZai000/NexioSchedule) **一致的协议**，是因为手表端是它的
移植与衍生作品（数据模型、同步协议与包名 com.haooz.chedule 都继承自上游），这样两边的授权链是干净的。

简单来说：

- 可以自由使用、学习、修改、分发，包括商业用途
- 分发修改版时，必须同样以 AGPL-3.0 开源，并保留版权声明
- 若通过**网络**向他人提供服务，也必须提供完整对应的源代码（AGPL 第 13 条）
- 上游作品的版权归原作者所有；本仓库对其的修改与移植同样受 AGPL-3.0 约束

协议全文见 [LICENSE](LICENSE)，上游归属与修改声明见 [NOTICE](NOTICE)。

> 版权人：**澪洛依（Rinrroy）** ｜ 上游版权：**Haooz（HaoZai000）**
> 如需改用其他协议（例如 MIT），须同时获得上游授权。

---

## 免责声明

1. **按「现状」提供。** 本项目为个人学习与技术研究性质的开源项目，不提供任何形式的明示或默示担保，
   包括但不限于对适销性、特定用途适用性、准确性与不侵权的担保。
2. **风险自负。** 使用本软件所造成的任何直接、间接、附带、特殊或后果性损失（包括但不限于数据丢失、
   课表错误、**手表系统异常 / 软重启 / 数据被清除**、设备损坏、学业或工作损失），作者与贡献者概不负责。
3. **非官方。** 本项目与**华为技术有限公司**及**开放原子开源基金会**无任何隶属、赞助或背书关系。
   「HUAWEI」「WATCH GT」「HarmonyOS」「OpenHarmony」等为其各自权利人的商标，本项目仅在描述兼容性时以指称方式使用。
4. **课表数据。** 课表内容由使用者自行在手机端录入，作者不接触、不存储、不采集任何用户数据；
   本应用不含埋点、统计与遥测。请自行确保数据来源合法合规（例如从教务系统导入须遵守学校规定）。
5. **网络。** 同步功能会在局域网内以明文 HTTP 传输课表数据，请在可信网络中使用；
   由此产生的信息泄露风险由使用者自行承担。
6. **时间与提醒。** 本应用**不保证**任何课程时间、节次与提醒的准确性。请勿将其作为考试、报到等重要事项的唯一依据。
7. **合规使用。** 使用者应自行遵守所在地法律法规及所在学校的相关管理规定。因违规使用产生的一切后果由使用者承担。
8. **最终解释。** 以上条款若与 AGPL-3.0 正文冲突，以 AGPL-3.0 正文为准。

---

<div align="center">

**如果这块表帮你少掏了几次手机，欢迎点个 Star**

Made with love and a lot of round-screen math.

</div>