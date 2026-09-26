/**
 * EDGE-Infinity game logic (v1.10.1)
 */
(function (window, $) {
  'use strict';

  var modes = {
    '0': [1.25, 1.5],
    '1': [1, 1.25],
    '2': [1, 1],
    '3': [0.75, 0.6],
    '4': [0.6, 0.3]
  };

  var noSleep = null;
  try { noSleep = new NoSleep(); } catch (e) {}

  var MSG = null;
  var audioPools = { go: [], stop: [], finish: [] };
  /** @type {Object.<string, string>} key phase:idx -> blob/object URL from local pack */
  var packAudioUrls = {};
  var packVideoUrls = {}; // phase:idx -> blob/url
  var packImageUrls = {};
  var packObjectUrls = []; // for revoke on reset
  var session = null;
  var unlocked = false;

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function weightedPick(pool, weights) {
    var total = 0;
    for (var i = 0; i < weights.length; i++) total += weights[i];
    if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];
    var r = Math.random() * total;
    for (var j = 0; j < pool.length; j++) {
      r -= weights[j];
      if (r <= 0) return pool[j];
    }
    return pool[pool.length - 1];
  }

  /* go: [text, sec, fps, audioIdx]  stop: [text, sec, audioIdx]
     finish: [text, sec, color, fps, audioIdx]  first: [text, sec, fps, audioIdx] */
  function getAudioIdx(phase, msg) {
    if (!msg || !msg.length) return -1;
    if (phase === 'go' || phase === 'first') return typeof msg[3] === 'number' ? msg[3] : -1;
    if (phase === 'stop') return typeof msg[2] === 'number' ? msg[2] : -1;
    if (phase === 'finish') return typeof msg[4] === 'number' ? msg[4] : -1;
    return -1;
  }

  function getFps(phase, msg) {
    if (!msg) return undefined;
    if (phase === 'go' || phase === 'first') return msg[2];
    if (phase === 'finish') return msg[3];
    return undefined;
  }

  function maxAudioIdx(phase) {
    var list = MSG[phase] || [];
    var max = -1;
    for (var i = 0; i < list.length; i++) {
      var idx = getAudioIdx(phase, list[i]);
      if (idx > max) max = idx;
    }
    return max;
  }

  function ensureAudio(phase, audioIdx) {
    if (audioIdx < 0) return null;
    if (!audioPools[phase]) audioPools[phase] = [];
    var packKey = phase + ':' + audioIdx;
    var a = audioPools[phase][audioIdx];
    var src = packAudioUrls[packKey]
      ? packAudioUrls[packKey]
      : ('audio/' + phase + '/' + phase + '_' + audioIdx + '.wav');
    if (!a) {
      a = new Audio(src);
      a.preload = 'auto';
      try { a.load(); } catch (e) {}
      audioPools[phase][audioIdx] = a;
    } else if (packAudioUrls[packKey] && a.src.indexOf(packAudioUrls[packKey]) < 0) {
      a.src = packAudioUrls[packKey];
      try { a.load(); } catch (e) {}
    }
    return a;
  }

  function preloadAudio() {
    ['first', 'go', 'stop', 'finish'].forEach(function (phase) {
      var max = maxAudioIdx(phase);
      var counts = (MSG.audioCounts && MSG.audioCounts[phase]) || (max + 1);
      var n = Math.max(max + 1, counts || 0);
      for (var i = 0; i < n; i++) ensureAudio(phase, i);
    });
  }

  function unlockAudio() {
    if (unlocked) return;
    var sample = ensureAudio('go', 0);
    if (!sample) return;
    try {
      sample.muted = true;
      var p = sample.play();
      var done = function () {
        try {
          sample.pause();
          sample.currentTime = 0;
          sample.muted = false;
        } catch (e) {}
        unlocked = true;
      };
      if (p && p.then) p.then(done).catch(done);
      else done();
    } catch (e) {
      unlocked = true;
    }
  }

  function stopAllAudio() {
    ['go', 'stop', 'finish'].forEach(function (ph) {
      (audioPools[ph] || []).forEach(function (el) {
        if (!el) return;
        try { el.pause(); el.currentTime = 0; } catch (e) {}
      });
    });
    $('#voiceLibBody .vl-play').removeClass('playing');
  }

  function clearPackMedia() {
    packObjectUrls.forEach(function (u) {
      try { URL.revokeObjectURL(u); } catch (e) {}
    });
    packObjectUrls = [];
    packAudioUrls = {};
    audioPools = { go: [], stop: [], finish: [] };
  }


  function playVoice(phase, audioIdx) {
    if (audioIdx === undefined || audioIdx === null || audioIdx < 0) return;
    var poolPhase = phase; // first 独立：audio/first/first_N.wav
    var a = ensureAudio(poolPhase, audioIdx);
    if (!a) return;
    stopAllAudio();
    try {
      a.muted = false;
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) {
        p.catch(function (err) {
          console.warn('playVoice failed', poolPhase, audioIdx, err);
          // retry once after unlock
          unlockAudio();
          setTimeout(function () {
            try {
              a.currentTime = 0;
              a.play().catch(function () {});
            } catch (e2) {}
          }, 80);
        });
      }
    } catch (e) {
      console.warn('playVoice error', e);
    }
  }

  function stopBgVideo() {
    var v = document.getElementById('bgVideo');
    if (v) {
      try { v.pause(); } catch (e) {}
      v.removeAttribute('src');
      v.removeAttribute('data-src');
      try { v.load(); } catch (e) {}
      v.style.display = 'none';
    }
    $('#mainwrapper').removeClass('has-bg-media').css('background-image', 'none');
  }

  /** 仅当存在 phase_idx 对应资源时才显示；无资源则清空背景 */
  function matchMediaPath(url, phase, audioIdx) {
    if (!url || audioIdx === undefined || audioIdx === null || audioIdx < 0) return false;
    var u = String(url);
    if (u.indexOf('blob:') === 0) return false;
    var file = u.split('?')[0];
    var slash = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
    if (slash >= 0) file = file.slice(slash + 1);
    var re = new RegExp('^' + phase + '_' + audioIdx + '\\.(mp4|webm|mov|webp|jpe?g|png|gif)$', 'i');
    return re.test(file);
  }

  function resolveVideo(phase, audioIdx) {
    if (audioIdx === undefined || audioIdx === null || audioIdx < 0) return null;
    var key = phase + ':' + audioIdx;
    if (packVideoUrls[key]) return packVideoUrls[key];
    var vids = (MSG.videos && MSG.videos[phase]) || (window.videos && window.videos[phase]) || [];
    for (var i = 0; i < vids.length; i++) {
      if (matchMediaPath(vids[i], phase, audioIdx)) return vids[i];
    }
    return null;
  }

  function resolveImage(phase, audioIdx) {
    if (audioIdx === undefined || audioIdx === null || audioIdx < 0) return null;
    var key = phase + ':' + audioIdx;
    if (packImageUrls[key]) return packImageUrls[key];
    var imgs = (MSG.images && MSG.images[phase]) || [];
    for (var i = 0; i < imgs.length; i++) {
      if (matchMediaPath(imgs[i], phase, audioIdx)) return imgs[i];
    }
    return null;
  }

  /** phase + audioIdx：只加载该语句编号对应的视频/图片 */
  function showBg(phase, audioIdx) {
    var $mw = $('#mainwrapper');
    var v = document.getElementById('bgVideo');
    var vidUrl = resolveVideo(phase, audioIdx);
    var imgUrl = resolveImage(phase, audioIdx);

    if (vidUrl && v) {
      $mw.css('background-image', 'none').addClass('has-bg-media');
      if (v.getAttribute('data-src') !== vidUrl) {
        v.setAttribute('data-src', vidUrl);
        v.src = vidUrl;
        try { v.load(); } catch (e) {}
      }
      v.style.display = 'block';
      var playP = v.play();
      if (playP && playP.catch) playP.catch(function () {});
      return;
    }

    // 无对应视频：停视频
    if (v) {
      try { v.pause(); } catch (e) {}
      if (v.getAttribute('data-src')) {
        v.removeAttribute('src');
        v.removeAttribute('data-src');
        try { v.load(); } catch (e2) {}
      }
      v.style.display = 'none';
    }

    if (imgUrl) {
      $mw.addClass('has-bg-media').css({
        'background-image': 'url(' + imgUrl + ')',
        'background-size': 'cover',
        'background-position': 'center center'
      });
    } else {
      $mw.removeClass('has-bg-media').css('background-image', 'none');
    }
  }

  function updateTimerUI() {
    if (!session || !session.running) return;
    var elapsed = (Date.now() - session.startMs) / 1000;
    var remain = Math.max(0, session.targetSec - elapsed);
    $('#elapsed').text(fmt(elapsed));
    $('#remain').text(fmt(remain));
    $('#targetTime').text(fmt(session.targetSec));
  }

  function stripHtml(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim();
  }

  var defaultMSG = null; // website default snapshot

  function cellStr(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }
  function cellNum(v, fallback) {
    if (v === null || v === undefined || v === '') return fallback;
    var n = Number(v);
    return isNaN(n) ? fallback : n;
  }
  function parseTags(s) {
    s = cellStr(s);
    if (!s) return ['base'];
    return s.split(/[,，;；\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  /** SheetJS workbook → messages-like object */
  function messagesFromWorkbook(wb) {
    function sheetRows(name) {
      var sheet = wb.Sheets[name];
      if (!sheet) return null;
      return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    }
    function col(row, keys) {
      for (var i = 0; i < keys.length; i++) {
        if (row[keys[i]] !== undefined && row[keys[i]] !== '') return row[keys[i]];
      }
      // fuzzy: first matching key substring
      var rk = Object.keys(row);
      for (var k = 0; k < keys.length; k++) {
        for (var j = 0; j < rk.length; j++) {
          if (rk[j].indexOf(keys[k]) >= 0) return row[rk[j]];
        }
      }
      return '';
    }

    var errors = [];
    var firstRows = sheetRows('开场');
    var goRows = sheetRows('go');
    var stopRows = sheetRows('stop');
    var finishRows = sheetRows('finish');
    if (!goRows || !stopRows || !finishRows) {
      errors.push('缺少工作表：需要「开场」「go」「stop」「finish」（开场可空，其余必有）');
    }
    if (errors.length) return { ok: false, errors: errors };

    var out = {
      version: (defaultMSG && defaultMSG.version) || 'excel',
      phases: (defaultMSG && defaultMSG.phases) ? JSON.parse(JSON.stringify(defaultMSG.phases)) : {
        phase2: '第二阶段', phase3: '最后阶段'
      },
      gameover: (defaultMSG && defaultMSG.gameover) ? JSON.parse(JSON.stringify(defaultMSG.gameover)) : {},
      first: [],
      go: [],
      stop: [],
      finish: [],
      tags: { go: [], stop: [], finish: [] },
      images: { go: [], stop: [], finish: [] },
      audioCounts: {}
    };

    // 开场
    (firstRows || []).forEach(function (row) {
      var text = cellStr(col(row, ['文案', 'text']));
      if (!text) return;
      var idx = cellNum(col(row, ['编号audioIdx', '编号', 'audioIdx']), 0);
      var sec = cellNum(col(row, ['秒数', 'duration']), 45);
      var fps = cellNum(col(row, ['fps']), 2);
      out.first.push([text, sec, fps, idx]);
      var img = cellStr(col(row, ['图片路径', '图片']));
      if (img) out.images.go.push(img);
    });
    if (!out.first.length && defaultMSG && defaultMSG.first) {
      out.first = JSON.parse(JSON.stringify(defaultMSG.first));
    }

    (goRows || []).forEach(function (row) {
      var text = cellStr(col(row, ['文案', 'text']));
      if (!text) return;
      var idx = cellNum(col(row, ['编号audioIdx', '编号', 'audioIdx']), out.go.length);
      var sec = cellNum(col(row, ['秒数', 'duration']), 20);
      var fps = cellNum(col(row, ['fps']), 3);
      out.go.push([text, sec, fps, idx]);
      out.tags.go.push(parseTags(col(row, ['标签tags', '标签', 'tags'])));
      var img = cellStr(col(row, ['图片路径', '图片']));
      if (img) out.images.go.push(img);
    });

    (stopRows || []).forEach(function (row) {
      var text = cellStr(col(row, ['文案', 'text']));
      if (!text) return;
      var idx = cellNum(col(row, ['编号audioIdx', '编号', 'audioIdx']), out.stop.length);
      var sec = cellNum(col(row, ['秒数', 'duration']), 20);
      out.stop.push([text, sec, idx]);
      out.tags.stop.push(parseTags(col(row, ['标签tags', '标签', 'tags'])));
      var img = cellStr(col(row, ['图片路径', '图片']));
      if (img) out.images.stop.push(img);
    });

    (finishRows || []).forEach(function (row) {
      var text = cellStr(col(row, ['文案', 'text']));
      if (!text) return;
      var idx = cellNum(col(row, ['编号audioIdx', '编号', 'audioIdx']), out.finish.length);
      var sec = cellNum(col(row, ['秒数', 'duration']), 25);
      var color = cellStr(col(row, ['颜色green或red', '颜色', 'color'])).toLowerCase();
      if (color !== 'green' && color !== 'red') {
        errors.push('finish 编号 ' + idx + ' 颜色必须是 green 或 red，当前：' + color);
        color = 'red';
      }
      var fps = cellNum(col(row, ['fps']), 2);
      out.finish.push([text, sec, color, fps, idx]);
      out.tags.finish.push(parseTags(col(row, ['标签tags', '标签', 'tags'])));
      var img = cellStr(col(row, ['图片路径', '图片']));
      if (img) out.images.finish.push(img);
    });

    if (!out.go.length) errors.push('go 表没有有效文案行');
    if (!out.stop.length) errors.push('stop 表没有有效文案行');
    if (!out.finish.length) errors.push('finish 表没有有效文案行');
    var hasRed = out.finish.some(function (r) { return r[2] === 'red'; });
    var hasGreen = out.finish.some(function (r) { return r[2] === 'green'; });
    if (!hasRed) errors.push('finish 至少需要 1 条 red（不允许）');
    if (!hasGreen) errors.push('警告：finish 没有 green（允许）行，有概率允许的选项将无法抽到允许结局');

    out.audioCounts = {
      go: out.go.length,
      stop: out.stop.length,
      finish: out.finish.length
    };

    if (errors.length && (errors.some(function (e) { return e.indexOf('警告') !== 0; }))) {
      // hard errors only
      var hard = errors.filter(function (e) { return e.indexOf('警告') !== 0; });
      if (hard.length) return { ok: false, errors: errors };
    }
    return { ok: true, data: out, warnings: errors.filter(function (e) { return e.indexOf('警告') === 0; }) };
  }

  function applyMessages(data, label) {
    MSG = data;
    window.messages = data;
    window.images = data.images || { go: [], stop: [], finish: [] };
        window.videos = data.videos || { first: [], go: [], stop: [], finish: [] };
    preloadAudio();
    buildVoiceLibrary();
    var $st = $('#packStatus');
    $st.removeClass('err def').text(label || '已加载自定义表格（仅本局）');
  }

  function resetToDefault() {
    if (!defaultMSG) return;
    clearPackMedia();
    applyMessages(JSON.parse(JSON.stringify(defaultMSG)), '');
    $('#packStatus').removeClass('err').addClass('def').text('当前：网站默认内容');
    $('#packFile').val('');
  }


  function handlePackFile(file) {
    if (!file) return;
    var name = (file.name || '').toLowerCase();
    if (name.endsWith('.zip')) {
      loadPackZip(file);
    } else {
      $('#packStatus').addClass('err').text('请选择 .zip，或使用「本地文件夹」导入');
    }
  }

  function normalizeZipPath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
  }

  /**
   * 从 path→File/Blob 映射加载资料包（zip 解压或本地文件夹共用）
   * entries: { 'messages.json': File, 'audio/go/go_0.wav': File, ... }
   */
  function loadPackFromEntries(entries, label) {
    var keys = Object.keys(entries || {});
    if (!keys.length) {
      $('#packStatus').addClass('err').text('文件夹为空或未包含文件');
      return Promise.resolve();
    }

    clearPackMedia();
    $('#packStatus').removeClass('err').text('正在读取资料包…');

    // 去掉统一顶层目录前缀 EDGE-Pack/
    var prefix = '';
    var firstKey = keys[0];
    var parts0 = firstKey.split('/');
    if (parts0.length > 1) {
      var maybe = parts0[0] + '/';
      var share = keys.filter(function (k) { return k.indexOf(maybe) === 0; }).length;
      if (share >= keys.length * 0.8) prefix = maybe;
    }
    function relOf(k) {
      return prefix ? k.slice(prefix.length) : k;
    }

    var filesByRel = {};
    keys.forEach(function (k) {
      filesByRel[relOf(k)] = entries[k];
    });
    var relKeys = Object.keys(filesByRel);

    var jsonFile = null;
    var xlsxFile = null;
    relKeys.forEach(function (rel) {
      var low = rel.toLowerCase();
      if (low === 'messages.json') jsonFile = filesByRel[rel];
      if (low.endsWith('.xlsx')) {
        if (!xlsxFile || low.indexOf('content') >= 0 || low.indexOf('内容') >= 0) xlsxFile = filesByRel[rel];
      }
    });

    function readAsArrayBuffer(file) {
      return file.arrayBuffer ? file.arrayBuffer() : new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = reject;
        fr.readAsArrayBuffer(file);
      });
    }
    function readAsText(file) {
      return file.text ? file.text() : new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = reject;
        fr.readAsText(file);
      });
    }

    var audioJobs = [];
    relKeys.forEach(function (rel) {
      var low = rel.toLowerCase();
      var m = low.match(/^audio\/(first|go|stop|finish)\/(first|go|stop|finish)_(\d+)\.(wav|mp3|ogg)$/);
      if (m && m[1] === m[2]) {
        audioJobs.push(
          Promise.resolve(filesByRel[rel]).then(function (f) {
            return f instanceof Blob ? f : readAsArrayBuffer(f).then(function (buf) {
              return new Blob([buf]);
            });
          }).then(function (blob) {
            var url = URL.createObjectURL(blob);
            packObjectUrls.push(url);
            packAudioUrls[m[1] + ':' + m[3]] = url;
          })
        );
      }
    });

    return Promise.all(audioJobs).then(function () {
      if (jsonFile) {
        return readAsText(jsonFile).then(function (s) {
          return { data: JSON.parse(s), warnings: [] };
        });
      }
      if (xlsxFile && typeof XLSX !== 'undefined') {
        return readAsArrayBuffer(xlsxFile).then(function (buf) {
          var wb = XLSX.read(buf, { type: 'array' });
          var result = messagesFromWorkbook(wb);
          if (!result.ok) throw new Error(result.errors.join('；'));
          return { data: result.data, warnings: result.warnings || [] };
        });
      }
      throw new Error('未找到 messages.json 或 .xlsx（请选中资料包根目录）');
    }).then(function (parsed) {
      var data = parsed.data;
      var pathWarns = [];
      var origImages = (data.images && typeof data.images === 'object') ? data.images : {};
      var packRelSet = {};
      relKeys.forEach(function (k) { packRelSet[k.toLowerCase()] = true; });
      ['first', 'go', 'stop', 'finish'].forEach(function (ph) {
        (origImages[ph] || []).forEach(function (imgPath) {
          if (!imgPath || String(imgPath).indexOf('blob:') === 0) return;
          var want = String(imgPath).replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
          var found = packRelSet[want] || Object.keys(packRelSet).some(function (k) {
            return k === want || k.endsWith('/' + want);
          });
          if (!found) pathWarns.push('包内不存在图片路径: ' + imgPath);
        });
      });

      data.images = { first: [], go: [], stop: [], finish: [] };
      data.videos = data.videos || { first: [], go: [], stop: [], finish: [] };
      // 收集包内视频为 blob URL，并写入 data.videos
      var mediaJobs = [];
      var videoAcc = { first: [], go: [], stop: [], finish: [] };
      relKeys.forEach(function (rel) {
        var low = rel.toLowerCase();
        var im = low.match(/^images\/(first|go|stop|finish)\/(first|go|stop|finish)_(\d+)\.(webp|jpg|jpeg|png|gif)$/);
        if (im && im[1] === im[2]) {
          (function (phase, idx, file) {
            mediaJobs.push(Promise.resolve(file).then(function (f) {
              var blob = (f instanceof Blob) ? f : new Blob([f]);
              var url = URL.createObjectURL(blob);
              packObjectUrls.push(url);
              packImageUrls[phase + ':' + idx] = url;
              data.images[phase].push(url);
            }));
          })(im[1], im[3], filesByRel[rel]);
        }
        var vm = low.match(/^video\/(first|go|stop|finish)\/(first|go|stop|finish)_(\d+)\.(mp4|webm|mov)$/);
        if (vm && vm[1] === vm[2]) {
          (function (phase, idx, file) {
            mediaJobs.push(Promise.resolve(file).then(function (f) {
              var blob = (f instanceof Blob) ? f : new Blob([f]);
              var url = URL.createObjectURL(blob);
              packObjectUrls.push(url);
              packVideoUrls[phase + ':' + idx] = url;
              videoAcc[phase].push(url);
            }));
          })(vm[1], vm[3], filesByRel[rel]);
        }
      });
      return Promise.all(mediaJobs).then(function () {
        ['first', 'go', 'stop', 'finish'].forEach(function (ph) {
          if (videoAcc[ph].length) data.videos[ph] = videoAcc[ph];
        });
        return { data: data, warnings: (parsed.warnings || []).concat(pathWarns) };
      });
    }).then(function (ctx) {
      var nAudio = Object.keys(packAudioUrls).length;
      var warns = (ctx.warnings || []).slice();
      if (nAudio > 0) {
        ['first', 'go', 'stop', 'finish'].forEach(function (ph) {
          (ctx.data[ph] || []).forEach(function (row) {
            var id = getAudioIdx(ph, row);
            if (id >= 0 && !packAudioUrls[ph + ':' + id]) {
              warns.push('缺少语音 audio/' + ph + '/' + ph + '_' + id + '.wav');
            }
          });
        });
      }
      audioPools = { first: [], go: [], stop: [], finish: [] };
      applyMessages(ctx.data, '已加载：' + (label || '本地资料包') + '（语音 ' + nAudio + ' 条，仅本局）');
      if (warns.length) {
        var show = warns.slice(0, 8).join('；');
        if (warns.length > 8) show += '；…共' + warns.length + '条';
        $('#packStatus').append(' · 警告：' + show);
      }
    }).catch(function (err) {
      console.error(err);
      $('#packStatus').removeClass('def').addClass('err').text('资料包失败：' + (err.message || err));
    });
  }

  function loadPackZip(file) {
    if (typeof JSZip === 'undefined') {
      $('#packStatus').addClass('err').text('JSZip 未加载，请检查网络后刷新');
      return;
    }
    $('#packStatus').removeClass('err').text('正在解压 zip…');
    JSZip.loadAsync(file).then(function (zip) {
      var entries = {};
      var jobs = [];
      zip.forEach(function (relPath, entry) {
        if (entry.dir) return;
        var p = normalizeZipPath(relPath);
        jobs.push(entry.async('blob').then(function (blob) {
          entries[p] = blob;
        }));
      });
      return Promise.all(jobs).then(function () {
        return loadPackFromEntries(entries, file.name);
      });
    }).catch(function (err) {
      console.error(err);
      $('#packStatus').removeClass('def').addClass('err').text('zip 失败：' + (err.message || err));
    });
  }

  /** input[webkitdirectory] 的 FileList */
  function loadPackFromFileList(fileList) {
    var entries = {};
    Array.prototype.forEach.call(fileList, function (f) {
      var rel = normalizeZipPath(f.webkitRelativePath || f.name);
      // 去掉用户选中文件夹名这一层以外已在 webkitRelativePath 中
      entries[rel] = f;
    });
    return loadPackFromEntries(entries, '本地文件夹');
  }

  /** Chrome/Edge：showDirectoryPicker */
  function loadPackFromDirectoryHandle(dirHandle) {
    var entries = {};
    function walk(handle, prefix) {
      return handle.values().then(function (iter) {
        // async iterator polyfill via recursive
        return (async function () {
          for await (var entry of handle.values()) {
            var path = prefix ? prefix + '/' + entry.name : entry.name;
            if (entry.kind === 'file') {
              var file = await entry.getFile();
              entries[normalizeZipPath(path)] = file;
            } else if (entry.kind === 'directory') {
              await walk(entry, path);
            }
          }
        })();
      });
    }
    // handle.values() returns async iterator — use async IIFE from promise
    return (async function () {
      for await (var entry of dirHandle.values()) {
        var path = entry.name;
        if (entry.kind === 'file') {
          entries[normalizeZipPath(path)] = await entry.getFile();
        } else if (entry.kind === 'directory') {
          await (async function walk2(h, pref) {
            for await (var e of h.values()) {
              var p2 = pref + '/' + e.name;
              if (e.kind === 'file') entries[normalizeZipPath(p2)] = await e.getFile();
              else if (e.kind === 'directory') await walk2(e, p2);
            }
          })(entry, path);
        }
      }
      return loadPackFromEntries(entries, dirHandle.name || '本地文件夹');
    })().catch(function (err) {
      console.error(err);
      $('#packStatus').removeClass('def').addClass('err').text('读取文件夹失败：' + (err.message || err));
    });
  }

  function buildVoiceLibrary() {
    var $body = $('#voiceLibBody');
    $body.empty();

    function mediaFor(phase, audioIdx) {
      var out = { video: null, image: null };
      var vids = (MSG.videos && MSG.videos[phase]) || [];
      var imgs = (MSG.images && MSG.images[phase]) || [];
      var i, u, needle;
      needle = phase + '_' + audioIdx;
      for (i = 0; i < vids.length; i++) {
        u = String(vids[i]);
        if (u.indexOf(needle) >= 0 || u.indexOf('_' + audioIdx + '.') >= 0) {
          out.video = u;
          break;
        }
      }
      if (!out.video && vids.length === 1 && audioIdx === 0) out.video = vids[0];
      for (i = 0; i < imgs.length; i++) {
        u = String(imgs[i]);
        if (u.indexOf(needle) >= 0 || u.indexOf('_' + audioIdx + '.') >= 0) {
          out.image = u;
          break;
        }
      }
      if (!out.image && imgs.length && audioIdx >= 0 && audioIdx < imgs.length) {
        out.image = imgs[audioIdx];
      }
      return out;
    }

    function section(title, phase, list) {
      var $table = $('<table class="vl-table"/>');
      $table.append($('<caption/>').text(title));
      $table.append($('<thead><tr><th>编号</th><th>语句</th><th>语音</th><th>媒体</th></tr></thead>'));
      var $tbody = $('<tbody/>');
      (list || []).forEach(function (row) {
        var idx = getAudioIdx(phase, row);
        var full = stripHtml(row[0]);
        var $tr = $('<tr/>');
        $tr.append($('<td class="vl-idx"/>').text(idx >= 0 ? idx : '—'));
        $tr.append($('<td class="vl-text"/>').text(full));

        var $btn = $('<button type="button" class="vl-play" title="播放语音">▶</button>');
        $btn.attr('data-phase', phase);
        $btn.attr('data-idx', idx);
        $btn.on('click', function () {
          unlockAudio();
          var ph = $(this).attr('data-phase');
          var id = parseInt($(this).attr('data-idx'), 10);
          stopAllAudio();
          $(this).addClass('playing');
          playVoice(ph, id);
          var a = ensureAudio(ph, id);
          if (a) {
            a.onended = function () { $btn.removeClass('playing'); };
          }
        });
        $tr.append($('<td class="vl-act"/>').append($btn));

        var med = mediaFor(phase, idx);
        var $med = $('<td class="vl-media"/>');
        if (med.video) {
          var $vb = $('<button type="button" class="vl-media-btn" title="看视频">🎬</button>');
          $vb.on('click', function () { openMediaModal('video', med.video); });
          $med.append($vb);
        }
        if (med.image) {
          var $ib = $('<button type="button" class="vl-media-btn" title="看图片">🖼</button>');
          $ib.on('click', function () { openMediaModal('image', med.image); });
          $med.append($ib);
        }
        if (!med.video && !med.image) {
          $med.append($('<span class="vl-na">—</span>'));
        }
        $tr.append($med);
        $tbody.append($tr);
      });
      $table.append($tbody);
      $body.append($table);
    }

    if (MSG.first && MSG.first.length) section('开场 First（独立阶段）', 'first', MSG.first);
    section('进行中 Go', 'go', MSG.go || []);
    section('停止 Stop', 'stop', MSG.stop || []);
    section('最终 Finish', 'finish', MSG.finish || []);
  }

  function openMediaModal(kind, url) {
    var $m = $('#mediaModal');
    var $c = $('#mediaModalContent');
    $c.empty();
    if (kind === 'video') {
      var v = document.createElement('video');
      v.src = url;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.style.maxWidth = '100%';
      v.style.maxHeight = '70vh';
      $c.append(v);
    } else {
      var img = document.createElement('img');
      img.src = url;
      img.alt = 'preview';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '70vh';
      $c.append(img);
    }
    $m.addClass('open').show();
  }

  function closeMediaModal() {
    var $m = $('#mediaModal');
    var $c = $('#mediaModalContent');
    $c.find('video').each(function () {
      try { this.pause(); this.removeAttribute('src'); this.load(); } catch (e) {}
    });
    $c.empty();
    $m.removeClass('open').hide();
  }


  function showHome() {
    stopBgVideo();
    $('#voiceLibPage').removeClass('open').hide();
    $('#packPage').removeClass('open').hide();
    $('#gamewrapper').hide();
    $('#choose').show();
    $('#btnAbortSession').hide();
  }

  function abortSession() {
    if (!session || !session.running) {
      showHome();
      return;
    }
    session.running = false;
    window.__edgeTimerRunning = false;
    clearInterval(window.flashInterval);
    stopAllAudio();
    stopBgVideo();
    try { if (noSleep) noSleep.disable(); } catch (e) {}
    $('#mainwrapper').removeClass('go stop finish cancel');
    showHome();
  }

  function showVoiceLib() {
    unlockAudio();
    stopAllAudio();
    $('#choose').hide();
    $('#packPage').removeClass('open').hide();
    $('#gamewrapper').hide();
    $('#voiceLibPage').addClass('open').show();
  }

  function showPackPage() {
    stopAllAudio();
    $('#choose').hide();
    $('#voiceLibPage').removeClass('open').hide();
    $('#gamewrapper').hide();
    $('#packPage').addClass('open').show();
  }

  /** Export current MSG to xlsx (SheetJS CE) */
  function exportMessagesXlsx() {
    if (typeof XLSX === 'undefined' || !MSG) {
      $('#packStatus').addClass('err').text('无法导出：表格库或内容未就绪');
      return;
    }
    var wb = XLSX.utils.book_new();
    function aoa_sheet(name, header, rows) {
      var aoa = [header].concat(rows);
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    aoa_sheet('说明', ['说明'], [
      ['EDGE-Infinity 导出内容（可再导入「我有主人」）'],
      ['green=允许释放；red=不允许释放'],
      ['语音编号对应站点 audio/{阶段}/{阶段}_{编号}.wav']
    ]);
    var firstRows = (MSG.first || []).map(function (r) {
      return [r[3], r[0], r[1], r[2], '', ''];
    });
    aoa_sheet('开场', ['编号audioIdx', '文案', '秒数', 'fps', '图片路径', '备注'], firstRows);
    var goRows = (MSG.go || []).map(function (r, i) {
      var tags = (MSG.tags && MSG.tags.go && MSG.tags.go[i]) ? MSG.tags.go[i].join(',') : '';
      return [r[3], r[0], r[1], r[2], tags, '', ''];
    });
    aoa_sheet('go', ['编号audioIdx', '文案', '秒数', 'fps', '标签tags', '图片路径', '备注'], goRows);
    var stopRows = (MSG.stop || []).map(function (r, i) {
      var tags = (MSG.tags && MSG.tags.stop && MSG.tags.stop[i]) ? MSG.tags.stop[i].join(',') : '';
      return [r[2], r[0], r[1], tags, '', ''];
    });
    aoa_sheet('stop', ['编号audioIdx', '文案', '秒数', '标签tags', '图片路径', '备注'], stopRows);
    var finRows = (MSG.finish || []).map(function (r, i) {
      var tags = (MSG.tags && MSG.tags.finish && MSG.tags.finish[i]) ? MSG.tags.finish[i].join(',') : '';
      return [r[4], r[0], r[1], r[2], r[3], tags, '', ''];
    });
    aoa_sheet('finish', ['编号audioIdx', '文案', '秒数', '颜色green或red', 'fps', '标签tags', '图片路径', '备注'], finRows);
    XLSX.writeFile(wb, 'EDGE-我的内容.xlsx');
    $('#packStatus').removeClass('err').text('已导出当前内容（浏览器下载）');
  }

  
  function packReadmeText() {
    return [
      'EDGE-Infinity 本地资料包',
      '目录：messages.json + audio/{first,go,stop,finish}/ + images/ + video/',
      '语音命名：go_0.wav 对应编号 0；导入网站「我有主人」使用。',
      'green=允许 red=不允许'
    ].join('\n');
  }

  function exportPackZip() {
    if (typeof JSZip === 'undefined' || !MSG) {
      $('#packStatus').addClass('err').text('无法导出 zip：库或内容未就绪');
      return;
    }
    var zip = new JSZip();
    zip.file('README.txt', packReadmeText());
    zip.file('messages.json', JSON.stringify(MSG, null, 2));
    // folder placeholders
    ['first', 'go', 'stop', 'finish'].forEach(function (ph) {
      zip.folder('audio/' + ph);
      zip.folder('images/' + ph);
      zip.folder('video/' + ph);
    });
    // include pack audio blobs if any
    Object.keys(packAudioUrls).forEach(function (key) {
      var parts = key.split(':');
      var phase = parts[0];
      var idx = parts[1];
      var url = packAudioUrls[key];
      // fetch blob from object url sync not possible — use async
    });
    // Also try write xlsx into zip if SheetJS available
    var finish = function () {
      zip.generateAsync({ type: 'blob' }).then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'EDGE-Pack-导出.zip';
        a.click();
        $('#packStatus').removeClass('err').text('已导出 zip 资料包（含 messages.json 与文件夹结构；语音请自行放入 audio/）');
      });
    };
    if (typeof XLSX !== 'undefined') {
      try {
        var wb = XLSX.utils.book_new();
        function aoa_sheet(name, header, rows) {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header].concat(rows)), name);
        }
        aoa_sheet('开场', ['编号audioIdx', '文案', '秒数', 'fps', '图片路径', '备注'],
          (MSG.first || []).map(function (r) { return [r[3], r[0], r[1], r[2], '', '']; }));
        aoa_sheet('go', ['编号audioIdx', '文案', '秒数', 'fps', '标签tags', '图片路径', '备注'],
          (MSG.go || []).map(function (r, i) {
            var tags = (MSG.tags && MSG.tags.go && MSG.tags.go[i]) ? MSG.tags.go[i].join(',') : '';
            return [r[3], r[0], r[1], r[2], tags, '', ''];
          }));
        aoa_sheet('stop', ['编号audioIdx', '文案', '秒数', '标签tags', '图片路径', '备注'],
          (MSG.stop || []).map(function (r, i) {
            var tags = (MSG.tags && MSG.tags.stop && MSG.tags.stop[i]) ? MSG.tags.stop[i].join(',') : '';
            return [r[2], r[0], r[1], tags, '', ''];
          }));
        aoa_sheet('finish', ['编号audioIdx', '文案', '秒数', '颜色green或red', 'fps', '标签tags', '图片路径', '备注'],
          (MSG.finish || []).map(function (r, i) {
            var tags = (MSG.tags && MSG.tags.finish && MSG.tags.finish[i]) ? MSG.tags.finish[i].join(',') : '';
            return [r[4], r[0], r[1], r[2], r[3], tags, '', ''];
          }));
        var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        zip.file('EDGE-内容.xlsx', out);
      } catch (e) { console.warn(e); }
    }
    // async pull pack audio into zip
    var mediaJobs = Object.keys(packAudioUrls).map(function (key) {
      var parts = key.split(':');
      return fetch(packAudioUrls[key]).then(function (r) { return r.blob(); }).then(function (blob) {
        zip.file('audio/' + parts[0] + '/' + parts[0] + '_' + parts[1] + '.wav', blob);
      }).catch(function () {});
    });
    Promise.all(mediaJobs).then(finish).catch(finish);
  }

function applyScale(scale) {
    scale = Math.max(0.8, Math.min(1.6, scale));
    document.documentElement.style.setProperty('--ui-scale', String(scale));
    $('#scaleValue').text(Math.round(scale * 100) + '%');
    try { localStorage.setItem('edge_ui_scale', String(scale)); } catch (e) {}
    return scale;
  }

  function pickMessage(phase, modeKey, useFleshlight, lastPick, recentTags) {
    var list = MSG[phase] || [];
    var tags = (MSG.tags && MSG.tags[phase]) || [];
    var candidates = [];
    for (var i = 0; i < list.length; i++) {
      var t = tags[i] || ['base'];
      if (!useFleshlight && t.indexOf('fleshlight') >= 0) continue;
      if (modeKey <= 1 && t.indexOf('prostate') >= 0 && Math.random() < 0.55) continue;
      candidates.push(i);
    }
    if (!candidates.length) {
      for (var j = 0; j < list.length; j++) candidates.push(j);
    }
    var filtered = candidates.filter(function (idx) { return idx !== lastPick[phase]; });
    if (filtered.length) candidates = filtered;

    var weights = candidates.map(function (idx) {
      var t = tags[idx] || ['base'];
      var w = 1;
      if (modeKey >= 3) {
        if (t.indexOf('edge') >= 0) w += 1.5;
        if (t.indexOf('prostate') >= 0) w += 1.2;
        if (t.indexOf('pain') >= 0) w += 0.8;
        if (t.indexOf('fast') >= 0) w += 0.6;
      } else if (modeKey <= 1) {
        if (t.indexOf('slow') >= 0) w += 1.5;
        if (t.indexOf('base') >= 0) w += 0.8;
      } else {
        if (t.indexOf('edge') >= 0) w += 0.7;
        if (t.indexOf('humiliate') >= 0) w += 0.5;
      }
      if (useFleshlight && t.indexOf('fleshlight') >= 0) w += 2;
      for (var r = 0; r < recentTags.length; r++) {
        if (t.indexOf(recentTags[r]) >= 0) w *= 0.55;
      }
      return Math.max(w, 0.15);
    });

    var chosen = weightedPick(candidates, weights);
    lastPick[phase] = chosen;
    return { index: chosen, msg: list[chosen], tags: tags[chosen] || [] };
  }

  function nextPassType(passNum, duration, targetSec, modeKey) {
    if (passNum === 1) return 'go';
    var progress = duration / targetSec;
    var goBias = modeKey >= 3 ? 0.58 : modeKey <= 1 ? 0.48 : 0.5;
    if (progress > 0.75) goBias += 0.08;
    var preferGo = (passNum % 2 !== 0);
    if (Math.random() < 0.22) preferGo = !preferGo;
    return preferGo ? 'go' : 'stop';
  }

  function startSession(opts) {
    var modeKey = parseInt(opts.modeKey, 10);
    var mode = modes[String(modeKey)] || modes['2'];
    var baseMultiplier = mode[0];
    var pauseMultiplier = mode[1];
    var cumFactor = opts.cumFactor;
    var useFleshlight = !!opts.fleshlight;
    var controlStroke = true;

    var variance = 0.35 + (1 - modeKey / 4) * 0.3;
    var factor = (1 - variance / 2) + Math.random() * variance;
    var targetSec = opts.durationMin * 60 * factor;

    session = {
      running: true,
      startMs: Date.now(),
      targetSec: targetSec,
      modeKey: modeKey,
      pass: 0,
      lastPick: { go: -1, stop: -1, finish: -1 },
      recentTags: []
    };

    window.__edgeGameStart = session.startMs;
    window.__edgeTargetDuration = targetSec;
    window.__edgeTimerRunning = true;

    $('#choose').hide();
    $('#voiceLibPage').hide();
    $('#packPage').hide();
    $('#gamewrapper').show();
    $('#btnAbortSession').show();
    try { if (noSleep) noSleep.enable(); } catch (e) {}

    var $mw = $('#mainwrapper');
    var startTime = session.startMs;

    function end() {
      session.running = false;
      window.__edgeTimerRunning = false;
      // 结束文案保持 Finish 本句，不再替换为 gameover.postcum
      $mw.removeClass('cancel go stop');
      try { if (noSleep) noSleep.disable(); } catch (e) {}
      $('#btnAbortSession').hide();
    }

    function showProgressAndGoOn(timeout, callback, bar) {
      if (!timeout || timeout < 200 || isNaN(timeout)) timeout = 1000;
      var t0 = Date.now();
      (function tick() {
        if (!session || !session.running) return;
        var percent = ((Date.now() - t0) / timeout) * 100;
        $('#progress .' + bar + ' div.bar').css('width', Math.min(percent, 100) + '%');
        if (percent > 100) callback();
        else setTimeout(tick, 100);
      })();
    }

    function updateFlash(fps) {
      clearInterval(window.flashInterval);
      if (fps === undefined || !controlStroke) return;
      var i = 0;
      window.flashInterval = setInterval(function () {
        $('#flash').removeClass('on off').addClass(i % 2 === 0 ? 'on' : 'off');
        i++;
      }, (1000 / fps / 2) * baseMultiplier);
    }

    function goOn() {
      if (!session || !session.running) return;
      session.pass++;
      var duration = (Date.now() - startTime) / 1000;
      var multiplier = baseMultiplier;
      var progress = duration / targetSec;

      if (progress > 0.75) {
        multiplier = multiplier / 4;
        $('#speed').html(MSG.phases.phase3);
      } else if (progress > 0.5) {
        multiplier = multiplier / 2;
        $('#speed').html(MSG.phases.phase2);
      }

      var passType = nextPassType(session.pass, duration, targetSec, modeKey);
      if (passType === 'stop') multiplier = multiplier * pauseMultiplier;

      try { if (noSleep) { noSleep.disable(); noSleep.enable(); } } catch (e) {}

      if (duration < targetSec || passType === 'go') {
        if (session.pass === 1) {
          var first = (MSG.first && MSG.first[0]) ? MSG.first[0] : null;
          if (first) {
            $mw.removeClass('go stop finish cancel').addClass('go');
            showBg('first', getAudioIdx('first', first));
            $('#message').html(first[0]);
            playVoice('first', getAudioIdx('first', first));
            updateFlash(typeof first[2] === 'number' ? first[2] : 2);
            var firstMs = (typeof first[1] === 'number' ? first[1] : 30) * 1000 * multiplier;
            showProgressAndGoOn(firstMs, goOn, 'jerkbar');
            return;
          }
        }

        var picked = pickMessage(passType, modeKey, useFleshlight, session.lastPick, session.recentTags);
        session.recentTags = session.recentTags.concat(picked.tags).slice(-6);
        $mw.removeClass('go stop finish cancel').addClass(passType);
        showBg(passType, getAudioIdx(passType, picked.msg));
        $('#message').html(picked.msg[0]);
        playVoice(passType, getAudioIdx(passType, picked.msg));
        updateFlash(getFps(passType, picked.msg));
        showProgressAndGoOn(picked.msg[1] * 1000 * multiplier, goOn, 'jerkbar');
      } else {
        /* ===== 最终阶段 Finish =====
         * 颜色规则（与现有文案一致）：
         *   green = 允许释放
         *   red   = 不允许释放
         * cumFactor === 0（极品…不被允许）：固定只走 red 池，随机优先
         * 其他：以 cumFactor 为「允许」概率，再在对应颜色池内随机
         * 不再拼接 gameover.nocum1/2/3
         */
        function finishPool(color) {
          var pool = [];
          for (var i = 0; i < (MSG.finish || []).length; i++) {
            if (MSG.finish[i][2] === color) pool.push(MSG.finish[i]);
          }
          return pool;
        }
        function pickFromPool(pool, fallbackColor) {
          if (pool && pool.length) {
            return pool[Math.floor(Math.random() * pool.length)];
          }
          var fb = finishPool(fallbackColor);
          if (fb.length) return fb[Math.floor(Math.random() * fb.length)];
          return (MSG.finish && MSG.finish[0]) || ['结束', 10, 'red', 1, 0];
        }

        var allow = false;
        if (cumFactor === 0) {
          allow = false;
        } else {
          // 随机优先：每次独立掷骰；cum 越大越容易允许
          allow = Math.random() < cumFactor;
        }

        var randomMessage = allow
          ? pickFromPool(finishPool('green'), 'green')
          : pickFromPool(finishPool('red'), 'red');

        $('#message').html(randomMessage[0]);
        playVoice('finish', getAudioIdx('finish', randomMessage));

        if (randomMessage[2] === 'green') {
          showBg('finish', getAudioIdx('finish', randomMessage));
          $mw.removeClass('go stop cancel').addClass('finish');
          showProgressAndGoOn(randomMessage[1] * 1000, end, 'cumbar');
        } else {
          // red = 不允许：只显示该 finish 句 + 语音，结束后停住（不 reload、不拼 nocum）
          $mw.removeClass('go stop finish').addClass('cancel');
          showProgressAndGoOn(randomMessage[1] * 1000, function () {
            session.running = false;
            window.__edgeTimerRunning = false;
            try { if (noSleep) noSleep.disable(); } catch (e) {}
            $('#btnAbortSession').hide();
          }, 'jerkbar');
        }
      }
    }

    goOn();
  }

  function bindUI() {
    $('#packFile').on('change', function () {
      var f = this.files && this.files[0];
      if (f) handlePackFile(f);
    });
    $('#packDir').on('change', function () {
      if (this.files && this.files.length) loadPackFromFileList(this.files);
    });
    $('#btnPickDir').on('click', function () {
      if (window.showDirectoryPicker) {
        window.showDirectoryPicker().then(function (handle) {
          return loadPackFromDirectoryHandle(handle);
        }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          // fallback: trigger hidden directory input
          $('#packDir').trigger('click');
        });
      } else {
        $('#packDir').trigger('click');
      }
    });
    $('#btnPackReset').on('click', function () {
      resetToDefault();
    });

    $('#submit').on('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!MSG) return;
      unlockAudio();
      startSession({
        modeKey: $('#choose select[name=mode]').val(),
        durationMin: parseInt($('#choose select[name=duration]').val(), 10),
        cumFactor: parseFloat($('#choose select[name=cum]').val()),
        fleshlight: $('#choose select[name=fleshlight]').val() === '1'
      });
    });

    $('#btnVoiceLib').on('click', function () {
      showVoiceLib();
    });
    $('#btnMasterPack').on('click', function () {
      showPackPage();
    });
    $('#btnBackHome, #btnBackHomePack').on('click', function () {
      stopAllAudio();
      showHome();
    });
    $('#btnPackExport').on('click', function () {
      exportPackZip();
    });
    $('#btnAbortSession').on('click', function () {
      abortSession();
    });
    $('#mediaModalClose, #mediaModalBackdrop').on('click', function () {
      closeMediaModal();
    });

    var scale = 1;
    try {
      var saved = parseFloat(localStorage.getItem('edge_ui_scale'));
      if (!isNaN(saved)) scale = saved;
    } catch (e) {}
    applyScale(scale);
    $('#scaleUp').on('click', function () {
      applyScale((parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1) + 0.1);
    });
    $('#scaleDown').on('click', function () {
      applyScale((parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1) - 0.1);
    });

    setInterval(updateTimerUI, 250);
  }

  function boot() {
    $('#gamewrapper').hide();
    $('#voiceLibPage').hide();
    $('#packPage').hide();
    $('#choose').show();

    fetch('messages.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        MSG = data;
        defaultMSG = JSON.parse(JSON.stringify(data));
        window.messages = data;
        window.images = data.images || { go: [], stop: [], finish: [] };
        window.videos = data.videos || { first: [], go: [], stop: [], finish: [] };
        preloadAudio();
        buildVoiceLibrary();
        bindUI();
        $('#bootStatus').text('就绪 v' + (data.version || '') + ' · 语音已预载');
        $('#packStatus').removeClass('err').addClass('def').text('当前：网站默认内容');
      })
      .catch(function (err) {
        console.error(err);
        $('#bootStatus').text('文案加载失败，请刷新');
      });
  }

  $(boot);
})(window, jQuery);
