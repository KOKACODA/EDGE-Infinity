/**
 * EDGE-Infinity game logic (v1.7.1)
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
    var a = audioPools[phase][audioIdx];
    if (!a) {
      a = new Audio('audio/' + phase + '/' + phase + '_' + audioIdx + '.wav');
      a.preload = 'auto';
      try { a.load(); } catch (e) {}
      audioPools[phase][audioIdx] = a;
    }
    return a;
  }

  function preloadAudio() {
    ['go', 'stop', 'finish'].forEach(function (phase) {
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

  function playVoice(phase, audioIdx) {
    if (audioIdx === undefined || audioIdx === null || audioIdx < 0) return;
    // first intro reuses go pool
    var poolPhase = phase === 'first' ? 'go' : phase;
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

  function showBg(phase) {
    var imgs = (MSG.images && MSG.images[phase]) || [];
    if (imgs.length > 0) {
      var url = imgs[Math.floor(Math.random() * imgs.length)];
      $('#mainwrapper').css('background-image', 'url(' + url + ')');
    } else {
      $('#mainwrapper').css('background-image', 'none');
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

  function buildVoiceLibrary() {
    var $body = $('#voiceLibBody');
    $body.empty();
    function section(title, phase, list) {
      var $table = $('<table class="vl-table"/>');
      $table.append($('<caption/>').text(title));
      var $thead = $('<thead><tr><th>编号</th><th>语句</th><th>试听</th></tr></thead>');
      $table.append($thead);
      var $tbody = $('<tbody/>');
      list.forEach(function (row) {
        var idx = getAudioIdx(phase, row);
        var full = stripHtml(row[0]);
        var $tr = $('<tr/>');
        $tr.append($('<td class="vl-idx"/>').text(idx >= 0 ? idx : '—'));
        $tr.append($('<td class="vl-text"/>').text(full));
        var $btn = $('<button type="button" class="vl-play" title="播放">▶</button>');
        $btn.attr('data-phase', phase === 'first' ? 'go' : phase);
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
        $tbody.append($tr);
      });
      $table.append($tbody);
      $body.append($table);
    }
    if (MSG.first && MSG.first.length) section('开场', 'first', MSG.first);
    section('进行中 Go', 'go', MSG.go || []);
    section('停止 Stop', 'stop', MSG.stop || []);
    section('最终 Finish', 'finish', MSG.finish || []);
  }

  function showHome() {
    $('#voiceLibPage').removeClass('open').hide();
    $('#gamewrapper').hide();
    $('#choose').show();
  }

  function showVoiceLib() {
    unlockAudio();
    stopAllAudio();
    $('#choose').hide();
    $('#gamewrapper').hide();
    $('#voiceLibPage').addClass('open').show();
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
    $('#gamewrapper').show();
    try { if (noSleep) noSleep.enable(); } catch (e) {}

    var $mw = $('#mainwrapper');
    var startTime = session.startMs;

    function end() {
      session.running = false;
      window.__edgeTimerRunning = false;
      $('#message').html(MSG.gameover.postcum);
      $mw.removeClass('cancel finish go stop');
      try { if (noSleep) noSleep.disable(); } catch (e) {}
    }

    function showProgressAndGoOn(timeout, callback, bar) {
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
          var first = MSG.first[0];
          $mw.removeClass('go stop finish cancel').addClass('go');
          showBg('go');
          $('#message').html(first[0]);
          // 开场也播语音：first 最后一项 audioIdx → go_{n}.wav
          playVoice('first', getAudioIdx('first', first));
          updateFlash(first[2]);
          showProgressAndGoOn(first[1] * 1000 * multiplier, goOn, 'jerkbar');
          return;
        }

        var picked = pickMessage(passType, modeKey, useFleshlight, session.lastPick, session.recentTags);
        session.recentTags = session.recentTags.concat(picked.tags).slice(-6);
        $mw.removeClass('go stop finish cancel').addClass(passType);
        showBg(passType);
        $('#message').html(picked.msg[0]);
        playVoice(passType, getAudioIdx(passType, picked.msg));
        updateFlash(getFps(passType, picked.msg));
        showProgressAndGoOn(picked.msg[1] * 1000 * multiplier, goOn, 'jerkbar');
      } else {
        /* ===== 最终阶段 Finish =====
         * cumFactor === 0：只从「拒绝/红色」类 finish 里抽，仍播语音
         * 否则按 cumFactor 概率允许；未允许时强制 finish[0]（拒绝稿）
         */
        var finishPick = pickMessage('finish', modeKey, useFleshlight, session.lastPick, session.recentTags);
        var randomMessage = finishPick.msg;

        if (cumFactor === 0) {
          var denyPool = [];
          for (var di = 0; di < (MSG.finish || []).length; di++) {
            if (MSG.finish[di][2] === 'red') denyPool.push(MSG.finish[di]);
          }
          if (!denyPool.length) denyPool = [MSG.finish[0]];
          randomMessage = denyPool[Math.floor(Math.random() * denyPool.length)];
        } else if (Math.random() >= cumFactor) {
          randomMessage = MSG.finish[0];
        }

        $('#message').html(randomMessage[0]);
        playVoice('finish', getAudioIdx('finish', randomMessage));

        if (randomMessage[2] !== 'red') {
          // 允许释放
          showBg('finish');
          $mw.removeClass('go stop').addClass('finish');
          showProgressAndGoOn(randomMessage[1] * 1000, end, 'cumbar');
        } else {
          // 拒绝释放：播完拒绝语音与进度后，再显示结束说明（可选）
          $mw.removeClass('go stop').addClass('cancel');
          showProgressAndGoOn(randomMessage[1] * 1000, function () {
            session.running = false;
            window.__edgeTimerRunning = false;
            try { if (noSleep) noSleep.disable(); } catch (e) {}
            $('#message').html(
              randomMessage[0] + '<br /><br />' +
              MSG.gameover.nocum1 + '<br />' + MSG.gameover.nocum2 +
              '<br /><br /><small>' + MSG.gameover.nocum3 + '</small>'
            );
          }, 'jerkbar');
        }
      }
    }

    goOn();
  }

  function bindUI() {
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
    $('#btnBackHome').on('click', function () {
      stopAllAudio();
      showHome();
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
    $('#choose').show();

    fetch('messages.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        MSG = data;
        window.messages = data;
        window.images = data.images || { go: [], stop: [], finish: [] };
        preloadAudio();
        buildVoiceLibrary();
        bindUI();
        $('#bootStatus').text('就绪 v' + (data.version || '') + ' · 语音已预载');
      })
      .catch(function (err) {
        console.error(err);
        $('#bootStatus').text('文案加载失败，请刷新');
      });
  }

  $(boot);
})(window, jQuery);
