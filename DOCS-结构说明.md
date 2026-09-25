# EDGE-Infinity 应用结构说明（手动改代码用）

版本对应：`1.7.1` 起  
线上：https://edge-infinity.pages.dev  
源码目录：仓库根目录下的 **`EDGE7/`**（Cloudflare Pages 部署的就是这一层）

---

## 1. 目录长什么样

```
EDGE-Infinity/
├── VERSION                 # 版本号纯文本
├── CHANGELOG.md            # 更新日志
├── README.md
├── DOCS-结构说明.md         # 本文件
├── wrangler.toml
└── EDGE7/                  # ★ 网站根目录（改这里）
    ├── index.html          # 页面结构 + 内联样式
    ├── game.js             # 全部游戏逻辑
    ├── messages.json       # 全部文案、编号、标签
    ├── minimize-js.js      # jQuery / Bootstrap（一般不用动）
    ├── minimize-css.css    # 原版样式（一般不用动）
    ├── nosleep.js          # 防息屏
    ├── _headers            # CDN 缓存头
    ├── game.css            # 旧暗色样式，当前未引用，可忽略
    └── audio/              # 语音（按阶段分子目录）
        ├── go/go_0.wav … go_20.wav
        ├── stop/stop_0.wav … stop_10.wav
        └── finish/finish_0.wav … finish_8.wav
```

**以后若加图片，建议同样建：**

```
EDGE7/images/
  go/
  stop/
  finish/
```

视频同理可用 `EDGE7/video/`（见第 6 节）。

---

## 2. 三个页面（都在同一个 index.html）

| 界面 | DOM | 何时出现 |
|------|-----|----------|
| 选项主页 | `#choose` | 打开网站默认 |
| 主人留音 | `#voiceLibPage` | 点标题旁「主人留音」 |
| 游戏进行 | `#gamewrapper` | 点「开始调教任务」 |

逻辑切换在 `game.js` 的 `showHome()` / `showVoiceLib()` / `startSession()`。

右下角缩放：`#scaleControl`，用 CSS 变量 `--ui-scale`，记在 `localStorage.edge_ui_scale`。

---

## 3. 文案文件 `messages.json`（改话术主要改这里）

### 3.1 顶层字段

| 字段 | 含义 |
|------|------|
| `version` | 文案版本，界面会显示 |
| `phases.phase2` / `phase3` | 半程、冲刺阶段提示 |
| `gameover.*` | 结束后的补充说明 |
| `first` / `go` / `stop` / `finish` | 各阶段语句数组 |
| `tags` | 与 go/stop/finish **下标对齐**的标签（影响随机权重） |
| `images` | `{ go:[], stop:[], finish:[] }` 背景图 URL 列表（可写路径） |
| `audioCounts` | 预载数量提示 |

### 3.2 每条语句的数组格式（做法 B）

**必须从 0 开始的数字编号**，最后一项是语音编号 `audioIdx`：

```text
go:     [ "文案HTML", 持续秒数, 节奏fps, audioIdx ]
stop:   [ "文案HTML", 持续秒数, audioIdx ]
finish: [ "文案HTML", 持续秒数, "red"|"green", fps, audioIdx ]
first:  [ "文案HTML", 持续秒数, fps, audioIdx ]   ← audioIdx 实际播 go_{n}.wav
```

- `finish` 里 **`"red"` = 拒绝释放**，`"green"` = 允许释放  
- 语音文件路径固定为：

```text
audio/{阶段}/{阶段}_{audioIdx}.wav
例：audio/go/go_3.wav
    audio/finish/finish_0.wav
```

- **数组顺序可以乱，编号才决定播哪条语音。**  
- 新增一句：文案写进 json，语音文件用下一个空编号（如已有 0–20，新文件用 `go_21.wav`，json 最后写 `21`）。

### 3.3 标签 `tags`（可选但建议同步）

`tags.go[i]` 对应 `go` 数组第 i 条（**数组下标**，不是 audioIdx）。  
常用：`base` / `fast` / `edge` / `prostate` / `fleshlight` / `humiliate` / `pain` …

- 未勾选飞机杯时，带 `fleshlight` 的句不会被抽到。  
- 难度高会更偏向 `edge` / `prostate` 等。

---

## 4. 游戏流程（`game.js`）

```text
点「开始」
  → unlockAudio() 解锁浏览器播放
  → startSession() 按选项算目标时长（有随机浮动）
  → goOn() 循环：
       pass==1 : 显示 first，播 go_{audioIdx}
       未到总时长 : 抽 go 或 stop，播对应语音，走进度条
       到总时长后 : 进入 Finish 分支
```

### 4.1 Finish 与「是否允许排精」选项

首页「渴望排精」对应 `cum` 数值 `0 ~ 0.95`：

| 选项值 | 行为 |
|--------|------|
| **0** | 只从 finish 里 **红色（拒绝）** 句中抽取，**会播 finish 语音**，进度结束后附带 gameover 说明 |
| **0.2~0.95** | 按概率允许；未允许时用 `finish[0]`（默认拒绝稿）；允许则用绿色句 |

若你感觉「结束不是我准备的话、也没声音」：  
以前 `cum=0` 时会**完全跳过** finish，只显示 `gameover.nocum*` 且不播语音。  
**1.7.1 已改为走 finish 拒绝句 + 语音。**

### 4.2 关键函数

| 函数 | 作用 |
|------|------|
| `getAudioIdx(phase, msg)` | 从语句数组取 audioIdx |
| `playVoice(phase, idx)` | 播放 `audio/phase/phase_idx.wav` |
| `pickMessage(...)` | 按难度/飞机杯/防重复加权抽句 |
| `showBg(phase)` | 若 `messages.images[phase]` 非空，随机设背景图 |
| `buildVoiceLibrary()` | 生成「主人留音」表格 |

---

## 5. 图片：可以单独建文件夹吗？

**可以。** 推荐与语音平行：

```text
EDGE7/images/go/xxx.jpg
EDGE7/images/stop/xxx.jpg
EDGE7/images/finish/xxx.jpg
```

当前代码已支持在 `messages.json` 里写路径（相对网站根，即相对 `EDGE7/`）：

```json
"images": {
  "go": [
    "images/go/01.jpg",
    "images/go/02.webp"
  ],
  "stop": ["images/stop/01.jpg"],
  "finish": ["images/finish/allow.jpg", "images/finish/deny.jpg"]
}
```

`showBg('go'|'stop'|'finish')` 会在对应阶段随机挑一张做 `#mainwrapper` 背景。

**注意：**

- 路径不要写成 `/EDGE7/images/...`，应是 `images/...`。  
- 文件必须一起部署到 Pages。  
- 若希望「像语音一样每条语句绑一张图」，需要再在语句数组里加字段并改 `game.js`（当前是**按阶段随机**，不是按句子一对一）。

---

## 6. 图片 / 视频格式建议

### 图片（背景）

| 格式 | 建议 | 说明 |
|------|------|------|
| **WebP** | ★首选 | 体积小、浏览器支持好 |
| **JPEG** | 照片类很好 | 兼容性最好 |
| **PNG** | 图标/透明 | 照片会偏大，背景慎用 |
| GIF | 不推荐当大背景 | 体积大 |

建议：

- 分辨率：约 **1280×720 ~ 1920×1080**，不必 4K（浪费流量）  
- 单张：**100–400KB** 较合适  
- 颜色暗一些，避免盖住黄色文字

### 视频

当前**没有**内置视频播放逻辑，要自己在 `index.html` + `game.js` 加 `<video>` 或背景视频。

若以后要加，格式建议：

| 格式 | 建议 |
|------|------|
| **MP4 (H.264 + AAC)** | ★首选，手机/桌面都稳 |
| WebM (VP9) | 可作第二来源，体积更小 |
| MOV | 不推荐网页直链 |

建议：

- 分辨率 720p 或 1080p，码率控制在可接受范围  
- 单段尽量 **&lt; 5–15MB**（Pages/流量友好）  
- 循环背景可用 `video` 标签 `muted loop playsinline`（移动端自动播放通常必须静音）

语音继续用 **WAV** 可以；若嫌大可转 **MP3/OGG**，但要同步改 `game.js` 里的扩展名。

---

## 7. 手动改代码的常用步骤

1. 改文案 → 编辑 `EDGE7/messages.json`（注意 JSON 逗号、引号）  
2. 加语音 → 放入 `audio/阶段/阶段_编号.wav`，json 里写上同一编号  
3. 加背景图 → 放入 `images/阶段/`，填进 `messages.json` 的 `images`  
4. 改逻辑 → 编辑 `EDGE7/game.js`  
5. 改排版 → 编辑 `EDGE7/index.html` 里 `<style>`  
6. 本地可用任意静态服务器打开 `EDGE7/` 目录测试  
7. 部署：把 `EDGE7/` 内容推到 GitHub 后用 Cloudflare Pages 发布（或沿用现有流水线）

### 自检清单

- [ ] `audioIdx` 从 **0** 起，且文件真实存在  
- [ ] `finish` 拒绝句的颜色字段是字符串 **`"red"`**，允许是 **`"green"`**  
- [ ] 改完 json 用校验工具确认没有多余逗号  
- [ ] 手机上需先点页面（开始/试听）才能出声（浏览器策略）

---

## 8. 选项与代码字段对照

| 界面文案 | 表单 name | 代码变量 |
|----------|-----------|----------|
| 控制时长 | `duration` | `durationMin`（分钟） |
| 难度 | `mode` | `modeKey` → `modes` 倍率 |
| 是否渴望排精 | `cum` | `cumFactor`（0~0.95） |
| 飞机杯 | `fleshlight` | `useFleshlight` |

难度倍率在 `game.js` 顶部 `modes` 对象。

---

有问题优先查：`messages.json` 是否保存成功、语音编号是否对上、结束时 `cum` 是否为 0（拒绝路径）、浏览器控制台是否有 `playVoice failed`。
