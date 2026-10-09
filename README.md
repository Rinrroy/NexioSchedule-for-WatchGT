# NexioSchedule for Watch GT

把安卓端 **NexioSchedule**（Kotlin / Compose）的课表搬到华为 **GT 系列 Lite Wearable** 手表上的客户端。
纯 JS + ACE-Lite（Lite JS 框架），没有 ArkTS / Stage 模型，全部 UI 画在一张 `<canvas>` 上。

> 当前版本：**v1.0.1** ｜ 目标内存档位：512KB（GT5 / GT6）

## 功能

- **首页**：活动记录（活力三环）风格——圆环显示今日完成进度，下面是今天/下一节课与课表来源状态。
- **今日课表**：当天课程卡片、状态（已结束 / 进行中 / 未开始）、上下节切换。
- **周课表**：**只显示当前这一周**（内存考虑，不做换周、不做整学期缓存），只读呈现。
- **课程详情**：时间、地点、教师、节次。
- **同步**：手机端局域网 HTTP 拉取（`GET /schedule.json?week=N`）、rawfile 导入导出、BLE 扫描发现。**不使用 Wear Engine**。
- **设置 / 关于**：同步地址切换、手动同步、重置、版本信息、退出。

手表端**只读**：没有任何编辑 / 添加课程的功能。

## 操作

| 手势 | 行为 |
| --- | --- |
| 上滑 | 今日课表（从下方进入） |
| 下滑 | 周课表（从上方进入） |
| 左滑 | 关于页 |
| 右滑 | 设置页（子页返回上一层） |
| 表冠 | 首页左右翻页；今日 / 课表页滚动 |
| 点击 | 底部胶囊、卡片、按钮 |

## 构建

需要 DevEco Studio（含 Lite Wearable SDK）。命令行构建：

```powershell
$env:DEVECO_SDK_HOME = 'D:/DevEco Studio/sdk'

# 调试包（模拟器用）
& 'D:/DevEco Studio/tools/hvigor/bin/hvigorw.bat' --mode module -p product=default assembleHap --no-daemon

# 发布包（真机必须用这个，见下）
& 'D:/DevEco Studio/tools/hvigor/bin/hvigorw.bat' --mode module -p product=default -p buildMode=release assembleHap --no-daemon
```

产物：`entry/build/default/outputs/default/entry-default-unsigned.hap`（未签名，需在 `build-profile.json5` 配好 `signingConfigs` 后再打包安装）。

## ⚠️ 真机 49,152 B 单文件硬闸

Lite 引擎对**每一个** JS 文件有 48KB 硬上限（`js_fwk_common.h:89  FILE_CONTENT_LENGTH_MAX = 1024 * 48`）。
真机上超限的文件会被**直接拒绝**（`scriptBuffer` 置空）⇒ 该文件一行都不执行 ⇒ **整屏黑**；模拟器只打一条 WARN，
所以「模拟器能跑」完全不能说明真机没问题。

而且 **debug 构建永远不会压缩**（hvigor 用 `isDebug()` 决定 `hapMode`），只有 release 才挂 Terser。

因此：

- **安装到真机请务必使用 `-p buildMode=release` 的包**；
- 每次打包后跑一遍守门脚本：

```powershell
powershell -ExecutionPolicy Bypass -File tools/check-lite-size.ps1
```

当前实测：

| 构建 | `app.js` | `pages/index/index.js` | 结果 |
| --- | --- | --- | --- |
| debug | 72,110 B | 47,837 B | `app.js` 超闸（结构性，debug 不压缩） |
| release | **42,327 B** | **29,144 B** | 两者合规 |

配套的架构约束：**内核分离** —— `app.js` 顶层 import 全部 `common/*` 并发布到 `globalThis.NEXIO`，
页面 `pages/index/index.js` 里 **0 条 import**（只 `var K = globalThis.NEXIO;`），这样页面文件能一直待在闸门以内。

## 目录

```
entry/src/main/js/MainAbility/
  app.js                  # 入口：import 全部 common 并发布 globalThis.NEXIO
  common/                 # const / model / store / sync / ble / date / holiday / ui / i18n / icon / seed
  pages/index/            # 唯一的页面：index.hml（一张 canvas）+ index.css + index.js（视图状态机）
  i18n/                   # zh-CN.json / en-US.json
entry/src/main/resources/  # 应用图标与字符串
docs/                     # 设计计划、复核记录、截图
tools/check-lite-size.ps1 # 49,152 B 守门脚本
```

## 已知的真机待验证项

- 表冠是否存在及 `degree` 方向 / 灵敏度（`setMonitorForCrownEvents`，模拟器无法验证）
- canvas `ctx.font` 在真机字体回退链下的字号表现（一律写 `'<size>px'`，**不要带字体族名**，否则字号会被忽略）
- `@system.app.terminate()` 是否真正结束应用
- 振动、BLE 扫描、局域网 HTTP 拉取

## 说明

- 手表端为个人学习项目，代码按现状提供，未附许可证。
- 手机端（`NexioSchedule` Android 工程）不在本仓库。
