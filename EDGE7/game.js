/**
 * EDGE-Infinity game logic (v1.3.0)
 * Messages & tags load from messages.json
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
  var audioGo = [];
  var audioStop = [];
  var audioFinish = [];
  var session = null;

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

  function loadAudio(counts) {
    audioGo = [];
    audioStop = [];
    audioFinish = [];
    var i;
    for (i = 0; i < (counts.go || 0); i++) audioGo.push(new Audio('audio/go/go_' + i + '.wav'));
    for (i = 0; i < (counts.stop || 0); i++) audioStop.push(new Audio('audio/stop/stop_' + i + '.wav'));
    for (i = 0; i < (counts.finish || 0); i++) audioFinish.push(new Audio('audio/finish/finish_' + i + '.wav'));
  }

  function playVoice(type, index) {
    var list = type === 'go' ? audioGo : type === 'stop' ? audioStop : type === 'finish' ? audioFinish : [];
    if (index < 0 || index >= list.length) return;
    list.forEach(function (a) { try { a.pause(); a.currentTime = 0; } catch (e) {} });
    var a = list[index];
    a.currentTime = 0;
    a.play().catch(function () {});
  }

  function stopAllAudio() {
    [audioGo, audioStop, audioFinish].forEach(function (list) {
      list.forEach(function (a) { try { a.pause(); a.currentTime = 0; } catch (e) {} });
    });
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

  function setPhaseUI(phaseKey, label) {
    $('#phaseLabel').text(label || phaseKey);
    $('#phaseDots .dot').removeClass('active done');
    var order = ['warmup', 'mid', 'final', 'end'];
    var idx = order.indexOf(phaseKey);
    order.forEach(function (k, i) {
      var $d = $('#phaseDots .dot[data-phase="' + k + '"]');
      if (i < idx) $d.addClass('done');
      if (i === idx) $d.addClass('active');
    });
  }

  function updateTimerUI() {
    if (!session || !session.running) return;
    var elapsed = (Date.now() - session.startMs) / 1000;
    var remain = Math.max(0, session.targetSec - elapsed);
    $('#elapsed').text(fmt(elapsed));
    $('#remain').text(fmt(remain));
    $('#targetTime').text(fmt(session.targetSec));
    var pct = Math.min(100, (elapsed / session.targetSec) * 100);
    $('#sessionBar .bar').css('width', pct + '%');
  }

  function emergencyStop(reason) {
    if (!session) return;
    session.running = false;
    window.__edgeTimerRunning = false;
    clearInterval(window.flashInterval);
    stopAllAudio();
    try { if (noSleep) noSleep.disable(); } catch (e) {}
    $('#progress .jerkbar .bar, #progress .cumbar .bar').css('width', '0%');
    $('#message').html(
      '<strong>已紧急停止</strong><br />' +
      (reason || '你按下了紧急停止。') +
      '<br /><br /><small>休息一下。需要时刷新页面重新开始。</small>'
    );
    $('#cooldownTip').show().text('冷却建议：至少休息 10–15 分钟，补充水分。');
    setPhaseUI('end', '已停止');
    $('#btnEmergency').prop('disabled', true);
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
    var chosenTags = tags[chosen] || [];
    return { index: chosen, msg: list[chosen], tags: chosenTags };
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
      cumFactor: cumFactor,
      fleshlight: useFleshlight,
      pass: 0,
      lastPick: { go: -1, stop: -1, finish: -1 },
      recentTags: []
    };

    window.__edgeGameStart = session.startMs;
    window.__edgeTargetDuration = targetSec;
    window.__edgeTimerRunning = true;

    $('#choose').hide();
    $('#ageGate').hide();
    $('#gamewrapper').show();
    $('#btnEmergency').prop('disabled', false).show();
    $('#cooldownTip').hide();
    setPhaseUI('warmup', '热身阶段');

    try { if (noSleep) noSleep.enable(); } catch (e) {}

    var $mw = $('#mainwrapper');
    var startTime = session.startMs;

    function end() {
      session.running = false;
      window.__edgeTimerRunning = false;
      $('#message').html(MSG.gameover.postcum);
      $mw.removeClass('cancel finish go stop');
      setPhaseUI('end', '结束');
      $('#cooldownTip').show().text('冷却建议：结束后休息，不要连续开下一局。');
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
        setPhaseUI('final', '最终阶段');
      } else if (progress > 0.5) {
        multiplier = multiplier / 2;
        $('#speed').html(MSG.phases.phase2);
        setPhaseUI('mid', '加速阶段');
      } else {
        setPhaseUI('warmup', '热身阶段');
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
          updateFlash(first[2]);
          showProgressAndGoOn(first[1] * 1000 * multiplier, goOn, 'jerkbar');
          return;
        }

        var picked = pickMessage(passType, modeKey, useFleshlight, session.lastPick, session.recentTags);
        session.recentTags = session.recentTags.concat(picked.tags).slice(-6);
        $mw.removeClass('go stop finish cancel').addClass(passType);
        showBg(passType);
        $('#message').html(picked.msg[0]);
        playVoice(passType, picked.index);
        updateFlash(picked.msg[2]);
        showProgressAndGoOn(picked.msg[1] * 1000 * multiplier, goOn, 'jerkbar');
      } else {
        var finishPick = pickMessage('finish', modeKey, useFleshlight, session.lastPick, session.recentTags);
        var randomMessage = finishPick.msg;

        if (Math.random() >= cumFactor) {
          randomMessage = MSG.finish[0];
          finishPick.index = 0;
        }

        if (cumFactor === 0) {
          $mw.removeClass('go stop finish');
          session.running = false;
          window.__edgeTimerRunning = false;
          try { if (noSleep) noSleep.disable(); } catch (e) {}
          $('#message').html(
            MSG.gameover.nocum1 + '<br />' + MSG.gameover.nocum2 +
            '<br /><br /><small>' + MSG.gameover.nocum3 + '</small>'
          );
          setPhaseUI('end', '边缘结束');
          $('#cooldownTip').show().text('冷却建议：本轮未释放，注意休息与补水。');
          return;
        }

        $('#message').html(randomMessage[0]);
        if (randomMessage[2] !== 'red') {
          showBg('finish');
          $mw.removeClass('go stop').addClass('finish');
          playVoice('finish', finishPick.index);
          setPhaseUI('end', '允许释放');
          showProgressAndGoOn(randomMessage[1] * 1000, end, 'cumbar');
        } else {
          $mw.removeClass('go stop').addClass('cancel');
          playVoice('finish', finishPick.index);
          setPhaseUI('end', '拒绝释放');
          showProgressAndGoOn(randomMessage[1] * 1000, function () {
            try { if (noSleep) noSleep.disable(); } catch (e) {}
            window.location.reload();
          }, 'jerkbar');
        }
      }
    }

    goOn();
  }

  function bindUI() {
    $('#btnAgeYes').on('click', function () {
      try { localStorage.setItem('edge_age_ok', '1'); } catch (e) {}
      $('#ageGate').hide();
      $('#choose').show();
    });
    $('#btnAgeNo').on('click', function () {
      $('#ageGate .age-body').html('<p>已取消。本站仅供成年人使用。</p>');
    });

    $('#btnEmergency').on('click', function () {
      emergencyStop('紧急停止已触发。');
    });

    $(document).on('keydown', function (e) {
      if (e.key === 'Escape' && session && session.running) {
        emergencyStop('快捷键 Esc 触发紧急停止。');
      }
    });

    $('#submit').on('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var modeKey = $('#choose select[name=mode]').val();
      var durationMin = parseInt($('#choose select[name=duration]').val(), 10);
      var cum = parseFloat($('#choose select[name=cum]').val());
      var fleshlight = $('#choose select[name=fleshlight]').val() === '1';
      window.hasFleshlight = fleshlight;
      startSession({
        modeKey: modeKey,
        durationMin: durationMin,
        cumFactor: cum,
        fleshlight: fleshlight
      });
    });

    setInterval(updateTimerUI, 250);
  }

  function boot() {
    var ageOk = false;
    try { ageOk = localStorage.getItem('edge_age_ok') === '1'; } catch (e) {}
    if (ageOk) {
      $('#ageGate').hide();
      $('#choose').show();
    } else {
      $('#ageGate').show();
      $('#choose').hide();
    }
    $('#gamewrapper').hide();
    $('#btnEmergency').hide();

    fetch('messages.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        MSG = data;
        window.messages = data;
        window.images = data.images || { go: [], stop: [], finish: [] };
        loadAudio(data.audioCounts || { go: 21, stop: 11, finish: 9 });
        bindUI();
        $('#bootStatus').text('就绪 v' + (data.version || ''));
      })
      .catch(function (err) {
        console.error(err);
        $('#bootStatus').text('文案加载失败，请刷新');
        $('#message').text('无法加载 messages.json');
      });
  }

  $(boot);

  window.EDGE = {
    emergencyStop: emergencyStop,
    getMessages: function () { return MSG; }
  };
})(window, jQuery);
