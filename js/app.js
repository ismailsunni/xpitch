/*
 * app.js — UI orchestration: file handling, option controls, tab navigation
 * and rendering of every analytics panel.
 */
(function () {
  'use strict';

  const KMH = 3.6;
  let currentFit = null;
  let currentName = '';
  let A = null; // latest analytics result

  // ---------- formatting helpers ----------
  function fmtDur(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h) return `${h}h ${m}m`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  function fmtClock(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }
  function fmtDist(m) {
    if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
    return Math.round(m) + ' m';
  }
  function kmh(ms) {
    return (ms * KMH).toFixed(1);
  }
  function card(label, value, unit, sub, cls) {
    return `<div class="card ${cls || ''}">
      <div class="label">${label}</div>
      <div class="value">${value}${unit ? ' <small>' + unit + '</small>' : ''}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
    </div>`;
  }

  // ---------- options ----------
  function readOptions() {
    const age = parseInt(document.getElementById('ageInput').value, 10);
    const maxHR = parseInt(document.getElementById('maxHRInput').value, 10);
    const sprint = parseFloat(document.getElementById('sprintInput').value);
    return {
      age: isFinite(age) ? age : null,
      maxHR: isFinite(maxHR) ? maxHR : null,
      sprintKmh: isFinite(sprint) ? sprint : 19.8,
      attackingDir: window.__attackDir || 1,
    };
  }

  // ---------- load & compute ----------
  function loadFit(fit, name) {
    currentFit = fit;
    currentName = name;
    window.__attackDir = 1;
    document.getElementById('parseError').hidden = true;
    recompute();
    document.getElementById('dropzone').hidden = true;
    document.getElementById('dashboard').hidden = false;
    document.getElementById('fileName').textContent = name;
    activateTab('overview');
  }

  function recompute() {
    if (!currentFit) return;
    A = Analytics.compute(currentFit, readOptions());
    if (!A.ok) {
      showError(A.error);
      return;
    }
    renderAll();
  }

  function showError(msg) {
    const el = document.getElementById('parseError');
    el.textContent = msg;
    el.hidden = false;
    document.getElementById('dropzone').hidden = false;
    document.getElementById('dashboard').hidden = true;
  }

  // ---------- render everything ----------
  function renderAll() {
    renderOverview();
    renderRunning();
    renderPhysio();
    renderFootball();
    Charts.speedProfile('chartSpeedProfile', A.samples);
    // Positional canvases render lazily when their tab is shown.
    renderPositionalIfVisible();
    renderDataNote();
  }

  // FIT sport enum -> label (device stores a number; demo stores a string).
  const SPORTS = {
    0: 'Generic', 1: 'Running', 2: 'Cycling', 4: 'Fitness equipment',
    5: 'Swimming', 6: 'Basketball', 7: 'Soccer', 8: 'Tennis',
    9: 'American football', 10: 'Training', 11: 'Walking', 15: 'Rowing',
    18: 'Hiking', 19: 'Multisport',
  };
  function sportName(sport) {
    if (sport == null) return null;
    if (typeof sport === 'number') return SPORTS[sport] || 'Sport ' + sport;
    return sport.charAt(0).toUpperCase() + sport.slice(1);
  }

  function renderDataNote() {
    const m = A.meta;
    const bits = [];
    bits.push(`${m.sampleCount.toLocaleString()} samples`);
    bits.push(m.hasGPS ? 'GPS ✓' : 'no GPS');
    bits.push(m.hasHR ? 'HR ✓' : 'no HR');
    if (m.startDate) bits.push('recorded ' + m.startDate.toLocaleString());
    const sport = sportName(m.sport);
    document.getElementById('dataNote').innerHTML =
      (sport ? `Sport: <strong>${sport}</strong> · ` : '') + bits.join(' · ');
  }

  // ---- Overview ----
  function renderOverview() {
    const s = A.summary;
    const cards = [];
    cards.push(card('Duration', fmtDur(s.durationS), '', A.meta.startDate ? A.meta.startDate.toLocaleDateString() : '', 'accent'));
    cards.push(card('Total distance', fmtDist(s.totalDistance)));
    cards.push(card('Top speed', kmh(s.topSpeed), 'km/h', 'smoothed'));
    cards.push(card('Avg speed (moving)', kmh(s.avgSpeedMoving), 'km/h'));
    cards.push(card('Moving time', fmtDur(s.movingTime), '', pct(s.movingTime, s.durationS) + '% of match'));
    cards.push(card('Standing time', fmtDur(s.standingTime), '', pct(s.standingTime, s.durationS) + '% of match'));
    if (A.physio) {
      cards.push(card('Avg heart rate', A.physio.avgHR, 'bpm'));
      cards.push(card('Max heart rate', A.physio.maxHR, 'bpm'));
    }
    cards.push(card('Sprints', A.running.sprints.length, '', 'high-speed efforts'));
    document.getElementById('overviewCards').innerHTML = cards.join('');

    // Role hero on overview too.
    document.getElementById('roleCard').innerHTML = A.football.role
      ? `<div class="panel">${roleHtml(A.football.role)}</div>`
      : '';
  }
  function pct(a, b) {
    return b ? Math.round((a / b) * 100) : 0;
  }

  // ---- Positional ----
  let positionalDrawn = false;
  function renderPositionalIfVisible() {
    const pane = document.querySelector('[data-pane="positional"]');
    if (!A.positional) {
      pane.innerHTML =
        '<p class="empty">No GPS data in this file — positional analysis is unavailable.</p>';
      return;
    }
    if (pane.hidden) {
      positionalDrawn = false;
      return;
    }
    drawPitches();
    renderPositionBreakdown();
    positionalDrawn = true;
  }

  function drawPitches() {
    if (!A.positional) return;
    Pitch.drawHeatmap(document.getElementById('pitchHeatmap'), A.positional);
    Pitch.drawTrail(document.getElementById('pitchTrail'), A.positional);
    Pitch.drawZones(document.getElementById('pitchZones'), A.positional);
  }

  function renderPositionBreakdown() {
    const p = A.positional;
    const thirdsTot = p.thirds.reduce((a, b) => a + b, 0) || 1;
    const sidesTot = p.sides.reduce((a, b) => a + b, 0) || 1;
    const thirdLabels = ['Defensive third', 'Middle third', 'Attacking third'];
    const thirdColors = ['#3b82f6', '#22c55e', '#ef4444'];
    const sideLabels = ['Left flank', 'Central', 'Right flank'];
    const sideColors = ['#a78bfa', '#22c55e', '#fb923c'];

    let html = '<h4 style="margin:2px 0 12px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px">Along the pitch (length)</h4>';
    p.thirds.forEach((t, i) => {
      html += bar(thirdLabels[i], t / thirdsTot, thirdColors[i]);
    });
    html += '<h4 style="margin:16px 0 12px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px">Across the pitch (width)</h4>';
    p.sides.forEach((t, i) => {
      html += bar(sideLabels[i], t / sidesTot, sideColors[i]);
    });

    const preferredSide = ['Left flank', 'Central', 'Right flank'][
      p.sides.indexOf(Math.max(...p.sides))
    ];
    html += `<p class="hint">Pitch span sampled from GPS: ~${Math.round(p.lengthM)} m long × ${Math.round(p.widthM)} m wide. Preferred side: <strong style="color:var(--text)">${preferredSide}</strong>.</p>`;
    document.getElementById('positionBreakdown').innerHTML = html;
  }
  function bar(label, frac, color) {
    const w = Math.round(frac * 100);
    return `<div class="bar-row">
      <div class="bl"><span>${label}</span><span>${w}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>
    </div>`;
  }

  // ---- Running ----
  function renderRunning() {
    const r = A.running;
    const s = A.summary;
    const totalHiDist = r.zones.slice(2).reduce((a, z) => a + z.distance, 0);
    const cards = [];
    cards.push(card('Total distance', fmtDist(s.totalDistance), '', '', 'accent'));
    cards.push(card('Sprints', r.sprints.length, '', '≥ ' + A.options.sprintKmh + ' km/h'));
    cards.push(card('High-intensity runs', r.highIntensityRuns.length, '', '≥ ' + A.options.highIntensityKmh + ' km/h'));
    cards.push(card('High-speed distance', fmtDist(totalHiDist), '', 'running + faster'));
    cards.push(card('Top speed', kmh(s.topSpeed), 'km/h'));
    cards.push(card('Accelerations', r.accelEvents.accelerations.length, '', '≥ 2 m/s²'));
    cards.push(card('Decelerations', r.accelEvents.decelerations.length, '', '≤ -2 m/s²'));
    document.getElementById('runningCards').innerHTML = cards.join('');

    Charts.speedZones('chartSpeedZones', r.zones);

    // Sprint list.
    const list = document.getElementById('sprintList');
    if (!r.sprints.length) {
      list.innerHTML = '<p class="empty">No sprints detected above the threshold. Try lowering the sprint speed.</p>';
    } else {
      list.innerHTML = r.sprints
        .map(
          (sp, i) => `<div class="list-row">
            <span class="lead">Sprint ${i + 1} <span class="meta">@ ${fmtClock(sp.start)}</span></span>
            <span class="meta">${sp.duration.toFixed(0)}s · ${Math.round(sp.distance)} m · top ${kmh(sp.maxSpeed)} km/h</span>
          </div>`
        )
        .join('');
    }
  }

  // ---- Physiological ----
  function renderPhysio() {
    const pane = document.querySelector('[data-pane="physio"]');
    if (!A.physio) {
      document.getElementById('physioCards').innerHTML = '';
      pane.querySelectorAll('.panel, .grid2').forEach((n) => (n.style.display = 'none'));
      if (!pane.querySelector('.empty'))
        pane.insertAdjacentHTML('afterbegin', '<p class="empty">No heart-rate data in this file — physiological analysis is unavailable.</p>');
      return;
    }
    pane.querySelectorAll('.panel, .grid2').forEach((n) => (n.style.display = ''));
    const ph = A.physio;
    const cards = [];
    cards.push(card('Average HR', ph.avgHR, 'bpm', '', 'accent'));
    cards.push(card('Max HR', ph.maxHR, 'bpm'));
    cards.push(card('Reference max', ph.refMax, 'bpm', A.options.maxHR ? 'entered' : A.options.age ? '220 − age' : 'observed'));
    const topZone = ph.hrZones.reduce((a, b) => (b.time > a.time ? b : a));
    cards.push(card('Most time in', topZone.name.replace(/^Z\d /, ''), '', fmtDur(topZone.time)));
    cards.push(card('Recovery periods', ph.recoveries.length, '', 'HR drops while resting'));
    document.getElementById('physioCards').innerHTML = cards.join('');

    Charts.hrGraph('chartHR', ph.series, ph.hrZones, ph.refMax);
    Charts.hrZones('chartHRZones', ph.hrZones);

    const list = document.getElementById('recoveryList');
    if (!ph.recoveries.length) {
      list.innerHTML = '<p class="empty">No clear recovery periods detected.</p>';
    } else {
      list.innerHTML = ph.recoveries
        .map(
          (r) => `<div class="list-row">
            <span class="lead">@ ${fmtClock(r.start)}</span>
            <span class="meta">−${r.drop} bpm (${r.startHR}→${r.endHR}) over ${r.duration.toFixed(0)}s</span>
          </div>`
        )
        .join('');
    }
  }

  // ---- Football ----
  function renderFootball() {
    const f = A.football;
    const cards = [];
    const fa = f.fatigue;
    cards.push(card('High-intensity runs', A.running.highIntensityRuns.length, '', '≥ ' + A.options.highIntensityKmh + ' km/h', 'accent'));
    cards.push(card('Repeated-sprint bouts', f.rse.length, '', '≥3 sprints in quick succession'));
    const dropCls = fa.distanceDropPct < -8 ? 'warn' : '';
    cards.push(
      card(
        '2nd-half work rate',
        (fa.distanceDropPct >= 0 ? '+' : '') + fa.distanceDropPct.toFixed(0) + '%',
        '',
        `vs 1st half (m/min)`,
        ''
      )
    );
    cards.push(card('Sprints 1st / 2nd', fa.sprintsFirst + ' / ' + fa.sprintsSecond));
    document.getElementById('footballCards').innerHTML = cards.join('');

    Charts.workRate('chartWorkRate', f.workRate);
    Charts.fatigueSegments('chartFatigue', fa.segments);

    const verdict =
      fa.distanceDropPct < -12
        ? `<span class="warn">Noticeable fatigue</span> — output dropped ${Math.abs(fa.distanceDropPct).toFixed(0)}% in the second half.`
        : fa.distanceDropPct < -4
        ? `Mild fatigue — output eased ${Math.abs(fa.distanceDropPct).toFixed(0)}% after half-time.`
        : `Strong endurance — work rate held up (${fa.distanceDropPct >= 0 ? '+' : ''}${fa.distanceDropPct.toFixed(0)}%).`;
    document.getElementById('fatigueSummary').innerHTML = `<p class="hint">
      1st half: <strong>${fa.firstHalf.ratePerMin.toFixed(0)} m/min</strong> ·
      2nd half: <strong>${fa.secondHalf.ratePerMin.toFixed(0)} m/min</strong>.<br>${verdict}</p>`;

    document.getElementById('footballRole').innerHTML = f.role
      ? roleHtml(f.role)
      : '<p class="empty">Role estimate needs GPS data.</p>';
  }

  function roleHtml(role) {
    const ranked = role.ranked
      .slice(0, 5)
      .map(
        (r, i) =>
          `<span class="pill">${i === 0 ? '★ ' : ''}${r.role}</span>`
      )
      .join('');
    return `<div class="role-hero">
      <div class="role-badge">${role.top}</div>
      <div>
        <div class="role-conf">Estimate confidence: <strong style="color:var(--text)">${role.confidence}%</strong></div>
        <ul class="role-notes">${role.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
      </div>
    </div>
    <div class="role-rank"><div class="ctl-label" style="margin-bottom:6px">Ranked candidates</div>${ranked}</div>
    <p class="hint">Heuristic estimate from position, movement spread and sprint activity. Use “Flip attack direction” if defensive/attacking looks reversed.</p>`;
  }

  // ---------- tabs ----------
  function activateTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tabpane').forEach((p) => {
      const on = p.dataset.pane === name;
      p.hidden = !on;
      p.classList.toggle('active', on);
    });
    if (name === 'positional') renderPositionalIfVisible();
    // Charts built while their pane was hidden need a resize once shown.
    if (window.Charts) Charts.resizeAll();
  }

  // ---------- file handling ----------
  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const fit = FitParser.parse(e.target.result);
        if (!fit.records.length) throw new Error('No record messages found in this FIT file.');
        loadFit(fit, file.name);
      } catch (err) {
        showError('Could not parse this file: ' + err.message);
        console.error(err);
      }
    };
    reader.onerror = () => showError('Failed to read the file.');
    reader.readAsArrayBuffer(file);
  }

  // ---------- wiring ----------
  function init() {
    document.getElementById('fileInput').addEventListener('change', (e) => handleFile(e.target.files[0]));
    document.getElementById('btnDemo').addEventListener('click', () => loadFit(Demo.generate(), 'demo-minisoccer.fit'));
    document.getElementById('btnDemo2').addEventListener('click', () => loadFit(Demo.generate(), 'demo-minisoccer.fit'));

    document.getElementById('tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (btn) activateTab(btn.dataset.tab);
    });

    ['ageInput', 'maxHRInput', 'sprintInput'].forEach((id) => {
      document.getElementById(id).addEventListener('change', recompute);
    });
    document.getElementById('btnFlip').addEventListener('click', () => {
      window.__attackDir = (window.__attackDir || 1) * -1;
      recompute();
    });

    // Drag & drop.
    const dz = document.getElementById('dropzone');
    ['dragenter', 'dragover'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add('drag');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove('drag');
      })
    );
    dz.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
    // Allow dropping anywhere on the window too.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (document.getElementById('dashboard').hidden && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    // Dev aid: #autodemo auto-loads the demo match on page load;
    // #autodemo/<tab> also opens that tab (e.g. #autodemo/positional).
    // #autoload=<url>[/<tab>] fetches and parses a .fit from a URL.
    if (location.hash.indexOf('autodemo') !== -1) {
      loadFit(Demo.generate(), 'demo-minisoccer.fit');
      const tab = location.hash.split('/')[1];
      if (tab) activateTab(tab);
    } else if (location.hash.indexOf('autoload=') !== -1) {
      const rest = location.hash.split('autoload=')[1];
      const [url, tab] = rest.split('/');
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((ab) => {
          loadFit(FitParser.parse(ab), url.split('/').pop());
          if (tab) activateTab(tab);
        })
        .catch((e) => showError('autoload failed: ' + e.message));
    }

    // Redraw pitches on resize.
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (A && A.positional && !document.querySelector('[data-pane="positional"]').hidden) drawPitches();
      }, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
