EDGE-Infinity 本地资料包说明
============================

本压缩包解压后目录结构必须保持如下（可增文件，勿改文件夹名称）：

  EDGE-Pack/
    README.txt          ← 本说明
    messages.json       ← 文案逻辑（与 Excel 二选一；同时存在时优先 json）
    EDGE-内容.xlsx      ← 可用 Excel 编辑，再在网页导出/导入
    audio/
      go/go_0.wav, go_1.wav, ...
      stop/stop_0.wav, ...
      finish/finish_0.wav, ...
    images/
      go/   背景图（jpg/webp/png）
      stop/
      finish/
    video/
      go/   预留（当前版本可不放）
      stop/
      finish/

编号规则
--------
语音文件名：{阶段}_{编号}.wav，编号从 0 开始。
messages.json / Excel 里每条的「编号 audioIdx」必须与文件名数字一致。

使用方式
--------
1. 按结构放好自己的文案与媒体
2. 将整个 EDGE-Pack 文件夹重新打成 .zip
3. 打开网站 →「我有主人」→ 导入本地资料包（zip）
4. 仅在本机浏览器解析，不会上传到服务器；刷新页面后恢复默认

图片
----
也可在 messages.json 的 images.go / stop / finish 数组中写相对路径，
例如 "images/go/01.webp"。导入 zip 后会自动匹配包内文件。
