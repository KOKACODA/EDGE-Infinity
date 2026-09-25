# Changelog

## [1.8.0] - 2026-09-25

### Changed
- **Finish phase rules**
  - `green` = 允许释放；`red` = 不允许释放（与现有准备文案一致）
  - 选项「极品贱狗不被允许排精！」(cum=0)：只从 **red** 池随机
  - 其他 cum 值：以 cum 为允许概率，再在对应颜色池内 **随机** 抽句
  - **不再**拼接 `gameover.nocum1/2/3` 固定结束语
- Placeholder dirs: `EDGE7/images/{go,stop,finish}/`、`EDGE7/video/{go,stop,finish}/`

### Docs
- Updated `DOCS-结构说明.md` (finish rules, media folders, format notes).

## [1.7.1] - 2026-09-25

- Finish when cum=0 used deny lines + voice (intermediate fix).

## [1.7.0] – [1.0.0]

See git history.
