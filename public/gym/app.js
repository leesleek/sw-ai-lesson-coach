// 4주 헬스 코치 — 화면 구성과 운동 진행 엔진
import { SESSIONS, sessionById, weekOf, itemSpec, estimateSeconds, WEEKDAYS } from './program.js';
import { EXERCISES, exerciseOf, poseFigure, stretchSequence, youtubeSearchUrl } from './exercises.js';
import * as store from './store.js';
import * as sp from './speech.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function minutesText(sec) {
  return Math.round(sec / 60);
}

let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ── 바텀 시트 ─────────────────────────────────────────────── */

function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false;
  document.body.classList.add('sheet-open');
}

function closeSheet() {
  $('#sheet').hidden = true;
  document.body.classList.remove('sheet-open');
}

$('#sheet').addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-close-sheet')) closeSheet();
});

/* ── 테마 ──────────────────────────────────────────────────── */

function applyTheme() {
  const { theme, bigText } = store.settings();
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.classList.toggle('big-text', Boolean(bigText));
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0f1420' : '#f4f6fb';
}

/* ── 화면 전환 ─────────────────────────────────────────────── */

function goto(screen) {
  $$('.screen').forEach((el) => { el.hidden = el.dataset.screen !== screen; });
  $$('.tab').forEach((el) => el.classList.toggle('active', el.dataset.goto === screen));
  window.scrollTo({ top: 0 });
  if (screen === 'stats') renderStats();
  if (screen === 'guide') renderGuide();
  if (screen === 'settings') renderSettings();
}

$$('.tab').forEach((tab) => tab.addEventListener('click', () => goto(tab.dataset.goto)));

/* ── 오늘 화면 ─────────────────────────────────────────────── */

function currentSession() {
  return SESSIONS[store.pointer()];
}

function activeItems(session) {
  const custom = store.customOf(session.id);
  return session.items
    .map((item, idx) => ({ ...item, idx, ex: custom.swap[idx] || item.ex, swapped: Boolean(custom.swap[idx]) }))
    .filter((item) => !custom.skipped.includes(item.idx));
}

let editMode = false;

function renderToday() {
  const session = currentSession();
  const s = store.settings();
  const week = weekOf(session.week);
  const items = activeItems(session);

  $('#appbar-sub').textContent = `${session.week}주차 · ${session.weekday}요일 · ${session.routine}루틴`;
  $('#today-chip').textContent = `${session.week}주차 — ${week.title}`;
  $('#today-name').textContent = session.name;
  $('#today-summary').textContent = session.summary;
  $('#today-count').textContent = items.length;
  $('#today-minutes').textContent = minutesText(estimateSeconds(session, s, store.customOf(session.id)));

  const record = store.sessionRecord(session.id);
  $('#today-status').textContent = record ? `${record.date} 완료` : '아직 안 함';
  $('#start-workout').textContent = record ? '다시 하기' : '운동 시작';

  $('#week-goals').innerHTML = week.goals
    .map((goal, i) => `<li><label><input type="checkbox" data-goal="${i}" ${store.goalChecked(week.week, i) ? 'checked' : ''} /><span>${esc(goal)}</span></label></li>`)
    .join('');

  const checks = week.checks || [];
  $('#week-checks-wrap').hidden = checks.length === 0;
  $('#week-checks').innerHTML = checks
    .map((c, i) => `<li><label><input type="checkbox" data-goal="${100 + i}" ${store.goalChecked(week.week, 100 + i) ? 'checked' : ''} /><span>${esc(c)}</span></label></li>`)
    .join('');

  const custom = store.customOf(session.id);
  $('#today-items').innerHTML = session.items
    .map((item, idx) => {
      const key = custom.swap[idx] || item.ex;
      const ex = exerciseOf(key);
      const skipped = custom.skipped.includes(idx);
      const spec = item.type === 'stretch'
        ? (s.stretchLevel === 'short' ? '약 3분' : '약 5분')
        : itemSpec(item);
      const swapNote = custom.swap[idx] ? `<em class="swap-note">${esc(exerciseOf(item.ex).name)} 대신</em>` : '';
      const controls = editMode
        ? `<div class="item-edit">
             ${ex.alt && ex.alt.length ? `<button class="mini" data-swap="${idx}" type="button">대체</button>` : ''}
             <button class="mini" data-skip="${idx}" type="button">${skipped ? '되살리기' : '제외'}</button>
           </div>`
        : '';
      return `<li class="item ${skipped ? 'skipped' : ''}">
        <button class="item-main" data-guide="${key}" type="button">
          <span class="item-index">${idx + 1}</span>
          <span class="item-text"><b>${esc(ex.name)}</b>${swapNote}<small>${esc(spec)}</small></span>
          <span class="item-arrow">›</span>
        </button>
        ${controls}
      </li>`;
    })
    .join('');
  $('#edit-hint').hidden = !editMode;
  $('#toggle-edit').textContent = editMode ? '완료' : '편집';

  renderTracker();
}

function renderTracker() {
  const s = store.settings();
  const d = store.daily();
  $('#water-count').textContent = d.water;
  $('#water-goal').textContent = s.waterGoal;
  $('#water-bar').style.width = `${Math.min(100, (d.water / s.waterGoal) * 100)}%`;
  $('#protein-count').textContent = d.protein;
  $('#protein-goal').textContent = s.proteinGoal;
  $('#protein-bar').style.width = `${Math.min(100, (d.protein / s.proteinGoal) * 100)}%`;
}

$('#screen-today').addEventListener('click', (e) => {
  const goalBox = e.target.closest('[data-goal]');
  if (goalBox) {
    store.toggleGoalCheck(currentSession().week, Number(goalBox.dataset.goal));
    return;
  }
  const track = e.target.closest('[data-track]');
  if (track) {
    store.bumpDaily(track.dataset.track, Number(track.dataset.delta));
    renderTracker();
    return;
  }
  const guide = e.target.closest('[data-guide]');
  if (guide) {
    openGuide(guide.dataset.guide);
    return;
  }
  const skip = e.target.closest('[data-skip]');
  if (skip) {
    store.toggleSkip(currentSession().id, Number(skip.dataset.skip));
    renderToday();
    return;
  }
  const swap = e.target.closest('[data-swap]');
  if (swap) openSwapSheet(Number(swap.dataset.swap));
});

$('#toggle-edit').addEventListener('click', () => {
  editMode = !editMode;
  renderToday();
});

function openSwapSheet(itemIndex) {
  const session = currentSession();
  const item = session.items[itemIndex];
  const ex = exerciseOf(item.ex);
  const current = store.customOf(session.id).swap[itemIndex];
  const options = [item.ex, ...(ex.alt || []).map(findKeyByName).filter(Boolean)];
  const uniq = Array.from(new Set(options));
  const custom = (ex.alt || []).filter((name) => !findKeyByName(name));
  openSheet(`
    <h3>${esc(ex.name)} 대체</h3>
    <p class="muted">기구가 없거나 몸이 불편하면 같은 근육을 쓰는 다른 동작으로 바꿉니다.</p>
    <div class="option-list">
      ${uniq.map((key) => `<button class="option ${(!current && key === item.ex) || current === key ? 'on' : ''}" data-pick-swap="${itemIndex}" data-key="${key}" type="button">
        <b>${esc(exerciseOf(key).name)}</b><small>${esc(exerciseOf(key).equipment || '')}</small></button>`).join('')}
    </div>
    ${custom.length ? `<p class="hint">앱에 자세 가이드가 없는 대체 동작: ${custom.map(esc).join(', ')}</p>` : ''}
  `);
}

function findKeyByName(name) {
  const clean = String(name).replace(/\(.*?\)/g, '').trim();
  return Object.keys(EXERCISES).find((key) => EXERCISES[key].name.replace(/\(.*?\)/g, '').trim() === clean) || null;
}

$('#sheet').addEventListener('click', (e) => {
  const pick = e.target.closest('[data-pick-swap]');
  if (pick) {
    const idx = Number(pick.dataset.pickSwap);
    const session = currentSession();
    const key = pick.dataset.key;
    store.setSwap(session.id, idx, key === session.items[idx].ex ? '' : key);
    closeSheet();
    renderToday();
  }
});

$('#pick-session').addEventListener('click', () => {
  openSheet(`
    <h3>세션 선택</h3>
    <p class="muted">프로그램은 날짜가 아니라 순서대로 진행됩니다. 힘든 날은 쉬고 다음 순서부터 이어서 하면 됩니다.</p>
    <div class="session-picker">
      ${SESSIONS.map((s, i) => `<button class="picker-item ${store.isDone(s.id) ? 'done' : ''} ${i === store.pointer() ? 'current' : ''}" data-pick-session="${i}" type="button">
        <b>${s.week}주차 ${s.weekday}</b><small>${s.routine}루틴 · ${esc(s.summary)}</small>
        <span>${store.isDone(s.id) ? '✓' : ''}</span></button>`).join('')}
    </div>
  `);
});

$('#sheet').addEventListener('click', (e) => {
  const pick = e.target.closest('[data-pick-session]');
  if (pick) {
    store.setPointer(Number(pick.dataset.pickSession));
    closeSheet();
    renderToday();
  }
});

/* ── 자세 가이드 ───────────────────────────────────────────── */

function renderGuide() {
  const query = $('#guide-search').value.trim();
  const keys = Object.keys(EXERCISES).filter((key) => {
    if (!query) return true;
    const ex = EXERCISES[key];
    return `${ex.name} ${ex.en} ${ex.group} ${ex.target}`.includes(query);
  });
  $('#guide-grid').innerHTML = keys
    .map((key) => {
      const ex = EXERCISES[key];
      return `<button class="guide-card" data-guide="${key}" type="button">
        <div class="guide-figure">${poseFigure(ex.pattern)}</div>
        <b>${esc(ex.name)}</b>
        <small>${esc(ex.group)} · ${esc(ex.target)}</small>
      </button>`;
    })
    .join('');
}

$('#guide-search').addEventListener('input', renderGuide);
$('#guide-grid').addEventListener('click', (e) => {
  const card = e.target.closest('[data-guide]');
  if (card) openGuide(card.dataset.guide);
});

function openGuide(key) {
  const ex = exerciseOf(key);
  const my = store.media(key);
  const best = store.bestOf(key);
  const last = store.lastLog(key);
  openSheet(`
    <div class="guide-detail">
      <div class="guide-hero">${poseFigure(ex.pattern, 3.2)}</div>
      <h3>${esc(ex.name)} <small class="muted">${esc(ex.en || '')}</small></h3>
      <ul class="meta-row">
        <li>${esc(ex.group || '')}</li>
        <li>${esc(ex.target || '')}</li>
        <li>${esc(ex.equipment || '')}</li>
      </ul>
      ${best ? `<p class="muted">내 최고 무게 ${best}${store.settings().unit}${last ? ` · 최근 ${last.date}` : ''}</p>` : ''}
      <h4>핵심 포인트</h4>
      <ul class="bullet">${(ex.cues || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      ${ex.breathing ? `<p class="callout">🫁 호흡 — ${esc(ex.breathing)}</p>` : ''}
      <h4>흔한 실수</h4>
      <ul class="bullet warn">${(ex.mistakes || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      ${(ex.alt || []).length ? `<p class="muted">대체 동작 — ${ex.alt.map(esc).join(', ')}</p>` : ''}
      <div class="btn-row">
        <a class="ghost as-btn" href="${youtubeSearchUrl(key)}" target="_blank" rel="noopener">유튜브 영상 보기</a>
        ${my.url ? `<a class="ghost as-btn" href="${esc(my.url)}" target="_blank" rel="noopener">내가 저장한 영상</a>` : ''}
      </div>
      <h4>내 자세 기록</h4>
      <p class="hint">3주차 지침대로 본인 자세를 찍어 영상과 비교해 보세요. 사진은 이 기기에만 저장됩니다(최대 3장).</p>
      <div class="btn-row">
        <button class="ghost" data-shot="${key}" type="button">📷 자세 사진 추가</button>
        <button class="ghost" data-myurl="${key}" type="button">🔗 참고 영상 주소 저장</button>
      </div>
      <div class="shot-row">
        ${my.shots.map((shot, i) => `<figure><img src="${shot.dataUrl}" alt="자세 사진 ${shot.date}" /><figcaption>${shot.date}<button class="mini" data-delshot="${key}" data-index="${i}" type="button">삭제</button></figcaption></figure>`).join('')}
      </div>
      <input type="file" accept="image/*" capture="environment" id="shot-input" hidden />
    </div>
  `);
}

$('#sheet').addEventListener('click', (e) => {
  const shot = e.target.closest('[data-shot]');
  if (shot) {
    const input = $('#shot-input');
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        store.addShot(shot.dataset.shot, await shrinkImage(file));
        openGuide(shot.dataset.shot);
        toast('자세 사진을 저장했습니다');
      } catch (err) {
        toast('사진을 저장하지 못했습니다');
      }
    };
    input.click();
    return;
  }
  const myUrl = e.target.closest('[data-myurl]');
  if (myUrl) {
    const key = myUrl.dataset.myurl;
    const url = window.prompt('참고할 영상 주소(유튜브 등)를 붙여 넣으세요', store.media(key).url || '');
    if (url !== null) {
      store.setMediaUrl(key, url.trim());
      openGuide(key);
    }
    return;
  }
  const del = e.target.closest('[data-delshot]');
  if (del) {
    store.removeShot(del.dataset.delshot, Number(del.dataset.index));
    openGuide(del.dataset.delshot);
  }
});

// 저장 용량을 위해 사진을 640px JPEG로 줄인다.
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, 640 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ── 기록 화면 ─────────────────────────────────────────────── */

function renderStats() {
  const sessions = store.getState().sessions;
  $('#stat-done').textContent = store.doneCount();
  $('#stat-streak').textContent = store.streak();
  $('#stat-volume').textContent = Math.round(store.totalVolume()).toLocaleString('ko-KR');
  $('#stat-time').textContent = Math.round(Object.values(sessions).reduce((sum, s) => sum + (s.seconds || 0), 0) / 60);

  $('#calendar').innerHTML = `
    <div class="cal-head"><span></span>${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
    ${[1, 2, 3, 4].map((week) => `<div class="cal-row"><span class="cal-week">${week}주</span>${WEEKDAYS.map((d, i) => {
      const id = `w${week}d${i + 1}`;
      const rec = sessions[id];
      const index = SESSIONS.findIndex((s) => s.id === id);
      return `<button class="cal-cell ${rec ? 'done' : ''} ${index === store.pointer() ? 'current' : ''}" data-pick-session="${index}" type="button" title="${rec ? `${rec.date} 완료` : '예정'}">${rec ? '✓' : ''}</button>`;
    }).join('')}</div>`).join('')}
  `;

  const weekly = store.weeklyVolume();
  const max = Math.max(1, ...weekly);
  $('#volume-chart').innerHTML = weekly
    .map((v, i) => `<div class="vc-col"><div class="vc-bar" style="height:${Math.max(3, (v / max) * 100)}%"></div><span>${i + 1}주</span><small>${Math.round(v).toLocaleString('ko-KR')}</small></div>`)
    .join('');

  const rows = Object.keys(EXERCISES)
    .map((key) => ({ key, best: store.bestOf(key), last: store.lastLog(key) }))
    .filter((r) => r.best > 0 || r.last);
  $('#record-rows').innerHTML = rows.length
    ? rows.map((r) => `<tr><td>${esc(EXERCISES[r.key].name)}</td><td>${r.best ? `${r.best}${store.settings().unit}` : '—'}</td><td class="muted">${r.last ? `${r.last.date} · ${r.last.sets.map((s) => `${s.reps}회`).join('/')}` : ''}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">아직 기록이 없습니다. 첫 운동을 완료하면 여기에 쌓입니다.</td></tr>';
}

$('#screen-stats').addEventListener('click', (e) => {
  const cell = e.target.closest('[data-pick-session]');
  if (cell) {
    store.setPointer(Number(cell.dataset.pickSession));
    renderToday();
    renderStats();
    toast(`${currentSession().name} 선택`);
  }
});

$('#export-data').addEventListener('click', () => {
  download(`gym4w-backup-${store.todayKey()}.json`, store.exportJSON(), 'application/json');
});

$('#import-data').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    store.importJSON(await file.text());
    applyTheme();
    renderToday();
    renderStats();
    toast('기록을 불러왔습니다');
  } catch (err) {
    toast(`불러오기 실패: ${err.message}`);
  }
  e.target.value = '';
});

$('#reset-data').addEventListener('click', () => {
  if (!window.confirm('모든 기록과 설정을 지웁니다. 계속할까요?')) return;
  store.resetAll();
  applyTheme();
  renderToday();
  renderStats();
  toast('초기화했습니다');
});

$('#export-ics').addEventListener('click', () => {
  download(`gym4w-schedule.ics`, buildICS(), 'text/calendar');
  toast('캘린더 앱에서 열면 4주 일정이 등록됩니다');
});

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 다음 월요일부터 4주간 월~금 저녁 7시 일정
function buildICS() {
  const pad = (n) => String(n).padStart(2, '0');
  const start = new Date();
  start.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//gym4w//KO', 'CALSCALE:GREGORIAN'];
  SESSIONS.forEach((session, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + Math.floor(i / 5) * 7 + (i % 5));
    const stamp = (h, m) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(h)}${pad(m)}00`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:gym4w-${session.id}@local`,
      `DTSTAMP:${stamp(19, 0)}`,
      `DTSTART:${stamp(19, 0)}`,
      `DTEND:${stamp(20, 15)}`,
      `SUMMARY:${session.name}`,
      `DESCRIPTION:${session.items.map((it) => `${exerciseOf(it.ex).name} ${itemSpec(it)}`).join(' / ').replace(/[,;]/g, ' ')}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      'DESCRIPTION:운동 30분 전',
      'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/* ── 설정 화면 ─────────────────────────────────────────────── */

const SETTINGS_SCHEMA = [
  {
    title: '음성 안내',
    items: [
      { key: 'voice', type: 'switch', label: '음성 안내 사용', hint: '순서·세트·휴식을 말로 알려 줍니다' },
      { key: 'voiceURI', type: 'voice', label: '목소리' },
      { key: 'rate', type: 'range', label: '말하기 속도', min: 0.6, max: 1.6, step: 0.05, fmt: (v) => `${Number(v).toFixed(2)}배` },
      { key: 'pitch', type: 'range', label: '음높이', min: 0.6, max: 1.6, step: 0.05, fmt: (v) => Number(v).toFixed(2) },
      { key: 'volume', type: 'range', label: '음성 크기', min: 0.1, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
      { key: 'terse', type: 'switch', label: '짧은 안내 모드', hint: '부가 설명을 줄여 꼭 필요한 말만 합니다' },
      { key: 'countdownVoice', type: 'switch', label: '남은 시간 음성 알림', hint: '휴식·유산소에서 60·30·10초를 알려 줍니다' },
      {
        key: 'cheer',
        type: 'select',
        label: '격려 멘트',
        options: [['off', '끄기'], ['low', '적게'], ['normal', '보통'], ['high', '많이']],
      },
      { type: 'action', label: '음성 테스트', action: 'test-voice', button: '들어 보기' },
    ],
  },
  {
    title: '소리 · 진동',
    items: [
      { key: 'beep', type: 'switch', label: '신호음', hint: '세트 시작·종료 카운트다운 비프' },
      { key: 'vibrate', type: 'switch', label: '진동', hint: '지원하는 기기에서만 동작합니다' },
    ],
  },
  {
    title: '시간',
    items: [
      { key: 'prepare', type: 'number', label: '시작 전 준비 시간', min: 0, max: 30, step: 1, unit: '초' },
      { key: 'restSet', type: 'number', label: '세트 간 휴식', min: 15, max: 240, step: 5, unit: '초' },
      { key: 'restEx', type: 'number', label: '동작 간 휴식', min: 15, max: 300, step: 5, unit: '초' },
      { key: 'autoAdvance', type: 'switch', label: '자동으로 다음 단계', hint: '끄면 시간이 끝난 뒤 직접 눌러 넘깁니다' },
      { key: 'halfwayAlert', type: 'switch', label: '유산소 절반 알림' },
      { key: 'stretchLevel', type: 'select', label: '스트레칭 길이', options: [['short', '짧게 (약 3분)'], ['full', '기본 (약 5분)']] },
    ],
  },
  {
    title: '템포 가이드',
    items: [
      { key: 'tempo', type: 'switch', label: '반복 템포 신호음', hint: '내리고-멈추고-올리는 리듬을 소리로 맞춰 줍니다' },
      { key: 'tempoDown', type: 'number', label: '내리기', min: 1, max: 6, step: 1, unit: '초' },
      { key: 'tempoHold', type: 'number', label: '멈추기', min: 0, max: 4, step: 1, unit: '초' },
      { key: 'tempoUp', type: 'number', label: '올리기', min: 1, max: 6, step: 1, unit: '초' },
    ],
  },
  {
    title: '화면 · 표시',
    items: [
      { key: 'keepAwake', type: 'switch', label: '운동 중 화면 항상 켜기' },
      { key: 'bigText', type: 'switch', label: '큰 글씨' },
      { key: 'theme', type: 'select', label: '테마', options: [['auto', '기기 설정'], ['dark', '어둡게'], ['light', '밝게']] },
      { key: 'unit', type: 'select', label: '무게 단위', options: [['kg', 'kg'], ['lb', 'lb']] },
    ],
  },
  {
    title: '영양 목표',
    items: [
      { key: 'waterGoal', type: 'number', label: '하루 물', min: 1, max: 20, step: 1, unit: '컵' },
      { key: 'proteinGoal', type: 'number', label: '하루 단백질', min: 20, max: 300, step: 10, unit: 'g' },
    ],
  },
];

function renderSettings() {
  const s = store.settings();
  $('#settings-body').innerHTML = SETTINGS_SCHEMA.map((group) => `
    <article class="card">
      <h3>${esc(group.title)}</h3>
      ${group.items.map((item) => settingRow(item, s)).join('')}
    </article>
  `).join('');
}

function settingRow(item, s) {
  const value = item.key ? s[item.key] : null;
  const hint = item.hint ? `<small class="muted">${esc(item.hint)}</small>` : '';
  if (item.type === 'switch') {
    return `<label class="set-row"><span>${esc(item.label)}${hint}</span>
      <input type="checkbox" class="switch" data-set="${item.key}" ${value ? 'checked' : ''} /></label>`;
  }
  if (item.type === 'range') {
    return `<label class="set-row column"><span>${esc(item.label)} <b data-out="${item.key}">${item.fmt ? item.fmt(value) : value}</b>${hint}</span>
      <input type="range" data-set="${item.key}" min="${item.min}" max="${item.max}" step="${item.step}" value="${value}" /></label>`;
  }
  if (item.type === 'number') {
    return `<label class="set-row"><span>${esc(item.label)}${hint}</span>
      <span class="num-wrap"><input type="number" class="num-input" data-set="${item.key}" min="${item.min}" max="${item.max}" step="${item.step}" value="${value}" inputmode="numeric" />${item.unit ? `<small>${esc(item.unit)}</small>` : ''}</span></label>`;
  }
  if (item.type === 'select') {
    return `<label class="set-row"><span>${esc(item.label)}${hint}</span>
      <select data-set="${item.key}">${item.options.map(([v, l]) => `<option value="${v}" ${String(value) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  }
  if (item.type === 'voice') {
    const list = sp.voiceList();
    return `<label class="set-row"><span>${esc(item.label)}${list.length ? '' : '<small class="muted">이 기기에서 사용 가능한 목소리를 찾지 못했습니다</small>'}</span>
      <select data-set="voiceURI"><option value="">자동 선택</option>${list.map((v) => `<option value="${esc(v.voiceURI)}" ${s.voiceURI === v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select></label>`;
  }
  if (item.type === 'action') {
    return `<div class="set-row"><span>${esc(item.label)}${hint}</span><button class="ghost" data-action="${item.action}" type="button">${esc(item.button)}</button></div>`;
  }
  return '';
}

$('#settings-body').addEventListener('input', (e) => {
  const field = e.target.closest('[data-set]');
  if (!field) return;
  const key = field.dataset.set;
  let value;
  if (field.type === 'checkbox') value = field.checked;
  else if (field.type === 'range' || field.type === 'number') value = Number(field.value);
  else value = field.value;
  store.setSetting(key, value);

  const out = $(`[data-out="${key}"]`);
  if (out) {
    const schema = SETTINGS_SCHEMA.flatMap((g) => g.items).find((i) => i.key === key);
    out.textContent = schema && schema.fmt ? schema.fmt(value) : value;
  }
  if (key === 'theme' || key === 'bigText') applyTheme();
  if (key === 'voice') updateMuteButton();
  if (['stretchLevel', 'restSet', 'restEx', 'waterGoal', 'proteinGoal', 'unit'].includes(key)) renderToday();
});

$('#settings-body').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]');
  if (!action) return;
  if (action.dataset.action === 'test-voice') {
    sp.unlockAudio();
    sp.beep.go();
    sp.speak('안녕하세요. 지금 이 크기와 속도로 운동을 안내합니다.', { urgent: true, force: true });
  }
});

/* ── 상단 버튼 ─────────────────────────────────────────────── */

function updateMuteButton() {
  const on = store.settings().voice;
  const btn = $('#mute-toggle');
  btn.textContent = on ? '🔊' : '🔇';
  btn.setAttribute('aria-pressed', String(!on));
}

$('#mute-toggle').addEventListener('click', () => {
  store.setSetting('voice', !store.settings().voice);
  if (!store.settings().voice) sp.stopSpeech();
  updateMuteButton();
  renderSettings();
  toast(store.settings().voice ? '음성 안내 켜짐' : '음성 안내 꺼짐');
});

$('#theme-toggle').addEventListener('click', () => {
  const order = ['auto', 'dark', 'light'];
  const next = order[(order.indexOf(store.settings().theme) + 1) % order.length];
  store.setSetting('theme', next);
  applyTheme();
  renderSettings();
  toast(`테마: ${{ auto: '기기 설정', dark: '어둡게', light: '밝게' }[next]}`);
});

/* ── 운동 진행 엔진 ────────────────────────────────────────── */

const run = {
  active: false,
  session: null,
  steps: [],
  index: 0,
  paused: false,
  waiting: false, // 시간이 끝났지만 자동 진행이 꺼져 있어 대기 중
  endsAt: 0,
  remaining: 0,
  stepStart: 0,
  marks: new Set(),
  logs: {},
  startedAt: 0,
  timer: null,
  wakeLock: null,
};

function buildSteps(session) {
  const s = store.settings();
  const items = activeItems(session);
  const steps = [];
  if (s.prepare > 0) steps.push({ kind: 'timed', phase: 'prepare', sec: s.prepare, item: items[0] || null });
  items.forEach((item, i) => {
    const lastItem = i === items.length - 1;
    if (item.type === 'stretch') {
      const seq = stretchSequence(s.stretchLevel);
      seq.forEach((move, j) => steps.push({
        kind: 'timed', phase: 'stretch', item, sec: move.sec, move, moveNo: j + 1, moveCount: seq.length,
      }));
      if (!lastItem) steps.push({ kind: 'timed', phase: 'rest', item, sec: 30, newExercise: true });
    } else if (item.type === 'strength') {
      for (let set = 1; set <= item.sets; set += 1) {
        steps.push({ kind: 'set', phase: 'set', item, setNo: set });
        const lastSet = set === item.sets;
        if (!(lastSet && lastItem)) {
          steps.push({ kind: 'timed', phase: 'rest', item, sec: lastSet ? s.restEx : s.restSet, newExercise: lastSet });
        }
      }
    } else if (item.type === 'cardio') {
      steps.push({ kind: 'timed', phase: 'cardio', item, sec: item.minutes * 60 });
    } else if (item.type === 'interval') {
      for (let round = 1; round <= item.rounds; round += 1) {
        steps.push({ kind: 'timed', phase: 'interval', item, sec: item.work.sec, mode: 'work', round });
        steps.push({ kind: 'timed', phase: 'interval', item, sec: item.easy.sec, mode: 'easy', round });
      }
    }
  });
  // 다음 단계 안내에 쓰기 위해 각 단계에 뒤 단계를 참조할 수 있게 인덱스를 붙인다.
  return steps.map((step, i) => ({ ...step, i }));
}

async function startWorkout() {
  const session = currentSession();
  const steps = buildSteps(session);
  if (!steps.length) {
    toast('모든 동작이 제외되어 있습니다. 편집에서 되살려 주세요.');
    return;
  }
  sp.unlockAudio();
  Object.assign(run, {
    active: true,
    session,
    steps,
    index: 0,
    paused: false,
    waiting: false,
    marks: new Set(),
    logs: {},
    startedAt: Date.now(),
  });
  $('#runner').hidden = false;
  document.body.classList.add('running');
  await requestWakeLock();
  sp.speak(`${session.week}주차 ${session.weekday}요일, ${session.summary} 시작합니다.`, { urgent: true });
  enterStep(0);
  if (!run.timer) run.timer = setInterval(tick, 200);
}

function endWorkout({ save }) {
  run.active = false;
  clearInterval(run.timer);
  run.timer = null;
  sp.stopSpeech();
  releaseWakeLock();
  $('#runner').hidden = true;
  document.body.classList.remove('running');
  if (save) saveLogs();
  renderToday();
}

function saveLogs() {
  Object.entries(run.logs).forEach(([key, sets]) => {
    const filled = sets.filter((set) => Number(set.reps) > 0);
    if (filled.length) store.logSets(key, run.session.id, filled);
  });
}

function currentStep() {
  return run.steps[run.index] || null;
}

function stepTitle(step) {
  if (!step) return '';
  if (step.phase === 'prepare') return '준비';
  if (step.phase === 'stretch') return step.move.name;
  if (step.phase === 'rest') return '휴식';
  if (step.phase === 'interval') return step.mode === 'work' ? '빠르게 달리기' : '회복 조깅';
  return exerciseOf(step.item.ex).name;
}

function enterStep(index) {
  if (index >= run.steps.length) {
    finishWorkout();
    return;
  }
  run.index = Math.max(0, index);
  run.marks = new Set();
  run.waiting = false;
  const step = currentStep();
  run.stepStart = Date.now();
  if (step.kind === 'timed') {
    run.remaining = step.sec;
    run.endsAt = Date.now() + step.sec * 1000;
  }
  announceStep(step);
  prepareLogInputs(step);
  renderRunner();
}

function announceStep(step) {
  const s = store.settings();
  const nextStep = run.steps[step.i + 1];
  if (step.phase === 'prepare') {
    sp.beep.go();
    sp.vibrate(80);
    const first = step.item ? exerciseOf(step.item.ex).name : '';
    sp.speak(`${s.prepare}초 후 시작합니다. 첫 순서는 ${first}입니다.`, { urgent: true });
    return;
  }
  if (step.phase === 'stretch') {
    sp.beep.tick();
    sp.speak(`${step.move.name}. ${step.sec}초.`, { urgent: true });
    sp.speakDetail(step.move.tip);
    return;
  }
  if (step.phase === 'set') {
    const ex = exerciseOf(step.item.ex);
    const isLast = step.setNo === step.item.sets;
    sp.beep.go();
    sp.vibrate([60, 40, 60]);
    sp.speak(`${ex.name} ${step.setNo}세트. ${sp.sayReps(step.item.repsMin, step.item.repsMax)}.`, { urgent: true });
    const prev = store.lastLogBefore(step.item.ex, run.session.id);
    if (prev && prev.sets.length) {
      const best = prev.sets.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a));
      sp.speakDetail(`지난 기록은 ${best.weight}${s.unit === 'kg' ? '킬로그램' : '파운드'} ${best.reps}회입니다.`);
    }
    if (isLast) {
      const line = sp.cheer('last', { always: s.cheer !== 'off' });
      if (line) sp.speak(line);
    } else {
      sp.speakCheer('set');
    }
    return;
  }
  if (step.phase === 'rest') {
    sp.beep.rest();
    sp.vibrate(40);
    sp.speak(`휴식 ${sp.sayDuration(step.sec)}.`, { urgent: true });
    sp.speakCheer('rest');
    if (step.newExercise && nextStep) {
      const label = nextStep.phase === 'set' ? exerciseOf(nextStep.item.ex).name : stepTitle(nextStep);
      sp.speakDetail(`다음 동작은 ${label}입니다.`);
    }
    return;
  }
  if (step.phase === 'cardio') {
    const item = step.item;
    sp.beep.go();
    const incline = item.incline ? `경사 ${item.incline}퍼센트, ` : '';
    sp.speak(`${exerciseOf(item.ex).name}. ${incline}${sp.saySpeed(item)}, ${item.minutes}분.`, { urgent: true });
    return;
  }
  if (step.phase === 'interval') {
    const spec = step.mode === 'work' ? step.item.work : step.item.easy;
    sp.beep.go();
    sp.vibrate(step.mode === 'work' ? [80, 50, 80] : 50);
    sp.speak(`${step.round}세트 ${step.mode === 'work' ? '빠르게' : '회복'}. ${sp.saySpeed(spec)}, ${sp.sayDuration(spec.sec)}.`, { urgent: true });
  }
}

function prepareLogInputs(step) {
  if (!step || step.phase !== 'set') return;
  const key = step.item.ex;
  const done = run.logs[key] || [];
  const prevInSession = done[done.length - 1];
  const prev = store.lastLogBefore(key, run.session.id);
  const prevBest = prev && prev.sets.length ? prev.sets[prev.sets.length - 1] : null;
  const weight = prevInSession ? prevInSession.weight : (prevBest ? prevBest.weight : 0);
  const reps = prevInSession ? prevInSession.reps : step.item.repsMin;
  $('#log-weight').value = weight;
  $('#log-reps').value = reps;
  const hint = prevBest
    ? `지난 기록 ${prevBest.weight}${store.settings().unit} × ${prevBest.reps}회 — 과부하 원리에 따라 무게나 횟수를 조금 올려 보세요.`
    : '오늘 기록을 남기면 다음 주에 얼마나 올렸는지 볼 수 있습니다.';
  $('#log-hint').textContent = hint;
}

function renderRunner() {
  const step = currentStep();
  if (!step) return;
  const total = run.steps.length;
  $('#runner-step').textContent = `${run.index + 1} / ${total}`;
  $('#runner-progress-fill').style.width = `${((run.index) / total) * 100}%`;

  const phaseNames = { prepare: '준비', stretch: `스트레칭 ${step.moveNo}/${step.moveCount}`, set: '세트', rest: '휴식', cardio: '유산소', interval: `인터벌 ${step.round}/${step.item ? step.item.rounds : ''}` };
  $('#phase-label').textContent = phaseNames[step.phase] || '';
  $('#phase-label').dataset.phase = step.phase;
  $('#runner-title').textContent = stepTitle(step);

  const ex = step.item && step.item.ex ? exerciseOf(step.item.ex) : null;
  const figureKey = step.phase === 'rest' || step.phase === 'prepare' ? null : (ex ? ex.pattern : null);
  $('#runner-figure').innerHTML = figureKey ? poseFigure(figureKey, step.phase === 'set' ? 2.6 : 2.2) : '';

  $('#runner-value').classList.toggle('text-mode', step.kind === 'set');
  if (step.kind === 'set') {
    const { repsMin, repsMax } = step.item;
    $('#runner-value').textContent = repsMin === repsMax ? `${repsMin}회` : `${repsMin}~${repsMax}회`;
    $('#runner-spec').textContent = `${step.item.sets}세트 중 ${step.setNo}세트${step.item.note ? ` · ${step.item.note}` : ''}`;
    $('#runner-sub').textContent = `경과 ${mmss((Date.now() - run.stepStart) / 1000)}`;
    $('#log-box').hidden = false;
    $('#ctl-next').textContent = '세트 완료';
    $('#ctl-minus').hidden = true;
    $('#ctl-plus').hidden = true;
  } else {
    $('#runner-value').textContent = mmss(run.remaining);
    $('#log-box').hidden = true;
    $('#ctl-minus').hidden = false;
    $('#ctl-plus').hidden = false;
    $('#ctl-next').textContent = run.waiting ? '다음 →' : '건너뛰고 다음';
    if (step.phase === 'stretch') {
      $('#runner-spec').textContent = step.move.tip || '';
      $('#runner-sub').textContent = `준비운동 ${step.moveNo}/${step.moveCount}`;
    } else if (step.phase === 'rest') {
      const next = run.steps[step.i + 1];
      $('#runner-spec').textContent = next ? `다음: ${nextLabel(next)}` : '마지막 휴식';
      $('#runner-sub').textContent = '숨을 고르고 물을 한 모금';
    } else if (step.phase === 'cardio') {
      $('#runner-spec').textContent = itemSpec(step.item);
      $('#runner-sub').textContent = ex ? ex.target : '';
    } else if (step.phase === 'interval') {
      const spec = step.mode === 'work' ? step.item.work : step.item.easy;
      const dur = spec.sec % 60 === 0 ? `${spec.sec / 60}분` : `${spec.sec}초`;
      $('#runner-spec').textContent = `${spec.speedMin}~${spec.speedMax}km/h · ${dur}`;
      $('#runner-sub').textContent = `${step.round}세트 / ${step.item.rounds}세트`;
    } else {
      $('#runner-spec').textContent = '';
      $('#runner-sub').textContent = '';
    }
  }

  // 세트 진행 점
  if (step.item && step.item.type === 'strength') {
    $('#set-dots').innerHTML = Array.from({ length: step.item.sets }, (_, i) => {
      const n = i + 1;
      const state = step.phase === 'set'
        ? (n < step.setNo ? 'done' : n === step.setNo ? 'on' : '')
        : (n <= (step.newExercise ? step.item.sets : setsDone(step)) ? 'done' : '');
      return `<i class="${state}"></i>`;
    }).join('');
  } else if (step.phase === 'interval') {
    $('#set-dots').innerHTML = Array.from({ length: step.item.rounds }, (_, i) => `<i class="${i + 1 < step.round ? 'done' : i + 1 === step.round ? 'on' : ''}"></i>`).join('');
  } else {
    $('#set-dots').innerHTML = '';
  }

  const cues = (ex && ex.cues) || [];
  $('#runner-cue').textContent = step.phase === 'set' && cues.length ? `💡 ${cues[(step.setNo - 1) % cues.length]}` : (step.phase === 'cardio' && cues.length ? `💡 ${cues[0]}` : '');
  $('#ctl-guide').hidden = !ex;
  $('#ctl-skip').hidden = !step.item;

  const next = run.steps[step.i + 1];
  $('#runner-next').textContent = next ? `다음 · ${nextLabel(next)}` : '마지막 순서입니다';
  $('#ctl-pause').textContent = run.paused ? '재개' : '일시정지';
  $('#runner').classList.toggle('paused', run.paused);
}

function setsDone(step) {
  const logs = run.logs[step.item.ex] || [];
  return logs.length;
}

function nextLabel(step) {
  if (step.phase === 'rest') return `휴식 ${step.sec}초`;
  if (step.phase === 'set') return `${exerciseOf(step.item.ex).name} ${step.setNo}세트`;
  if (step.phase === 'stretch') return step.move.name;
  if (step.phase === 'interval') return step.mode === 'work' ? '빠르게 달리기' : '회복 조깅';
  return exerciseOf(step.item.ex).name;
}

/* 타이머 루프 — 남은 시간은 종료 시각 기준으로 계산해 화면이 꺼져 있어도 어긋나지 않는다. */
function tick() {
  if (!run.active) return;
  const step = currentStep();
  if (!step) return;
  if (run.paused) return;

  if (step.kind === 'set') {
    $('#runner-sub').textContent = `경과 ${mmss((Date.now() - run.stepStart) / 1000)}`;
    tempoGuide(step);
    return;
  }

  const left = Math.max(0, (run.endsAt - Date.now()) / 1000);
  const shown = Math.ceil(left);
  if (shown !== Math.ceil(run.remaining)) {
    run.remaining = left;
    $('#runner-value').textContent = mmss(left);
  }
  run.remaining = left;

  timedAlerts(step, left);

  if (left <= 0 && !run.waiting) {
    if (store.settings().autoAdvance) {
      enterStep(run.index + 1);
    } else {
      run.waiting = true;
      sp.beep.done();
      sp.speak('시간이 끝났습니다. 준비되면 다음을 누르세요.', { urgent: true });
      renderRunner();
    }
  }
}

function mark(name) {
  if (run.marks.has(name)) return false;
  run.marks.add(name);
  return true;
}

function timedAlerts(step, left) {
  const s = store.settings();
  const total = step.sec;

  if (s.halfwayAlert && (step.phase === 'cardio') && total >= 300 && left <= total / 2 && mark('half')) {
    sp.speak('절반 지났습니다.');
    sp.speakCheer('cardio');
  }
  if (step.phase === 'cardio' && total >= 480 && left <= total * 0.25 && mark('quarter')) {
    sp.speakCheer('cardio');
  }
  if (s.countdownVoice) {
    if (total > 90 && left <= 60 && mark('s60')) sp.speak('1분 남았습니다.');
    if (total > 45 && left <= 30 && mark('s30')) sp.speak('30초 남았습니다.');
    if (total > 20 && left <= 10 && mark('s10')) sp.speak('10초 남았습니다.');
  }
  [3, 2, 1].forEach((n) => {
    if (left <= n && left > n - 1 && mark(`b${n}`)) sp.beep.tick();
  });
  if (left <= 0.4 && mark('go')) {
    sp.vibrate([70, 50, 70]);
    if (step.phase === 'rest' || step.phase === 'prepare') sp.beep.go();
  }
}

function tempoGuide(step) {
  const s = store.settings();
  if (!s.tempo || step.phase !== 'set') return;
  const cycle = s.tempoDown + s.tempoHold + s.tempoUp;
  if (cycle <= 0) return;
  const elapsed = (Date.now() - run.stepStart) / 1000;
  const rep = Math.floor(elapsed / cycle);
  const inCycle = elapsed - rep * cycle;
  if (inCycle < 0.25 && mark(`down${rep}`)) sp.beep.tempoDown();
  if (inCycle >= s.tempoDown + s.tempoHold && inCycle < s.tempoDown + s.tempoHold + 0.25 && mark(`up${rep}`)) sp.beep.tempoUp();
}

/* ── 진행 화면 조작 ────────────────────────────────────────── */

$('#start-workout').addEventListener('click', startWorkout);

$('#ctl-pause').addEventListener('click', () => {
  const step = currentStep();
  run.paused = !run.paused;
  if (run.paused) {
    sp.stopSpeech();
    if (step && step.kind === 'timed') run.remaining = Math.max(0, (run.endsAt - Date.now()) / 1000);
    releaseWakeLock();
    sp.speak('일시정지합니다.', { urgent: true });
  } else {
    if (step && step.kind === 'timed') run.endsAt = Date.now() + run.remaining * 1000;
    if (step && step.kind === 'set') run.stepStart = Date.now();
    requestWakeLock();
    sp.speak('다시 시작합니다.', { urgent: true });
  }
  renderRunner();
});

$('#ctl-next').addEventListener('click', () => {
  const step = currentStep();
  if (!step) return;
  if (step.kind === 'set') {
    const key = step.item.ex;
    const sets = run.logs[key] || (run.logs[key] = []);
    sets[step.setNo - 1] = {
      weight: Number($('#log-weight').value) || 0,
      reps: Number($('#log-reps').value) || 0,
    };
  }
  enterStep(run.index + 1);
});

$('#ctl-prev').addEventListener('click', () => enterStep(Math.max(0, run.index - 1)));

$('#ctl-plus').addEventListener('click', () => adjustTime(15));
$('#ctl-minus').addEventListener('click', () => adjustTime(-15));

function adjustTime(delta) {
  const step = currentStep();
  if (!step || step.kind !== 'timed') return;
  run.remaining = Math.max(1, run.remaining + delta);
  if (!run.paused) run.endsAt = Date.now() + run.remaining * 1000;
  run.waiting = false;
  ['s60', 's30', 's10', 'b3', 'b2', 'b1', 'go'].forEach((m) => run.marks.delete(m));
  $('#runner-value').textContent = mmss(run.remaining);
  toast(`${delta > 0 ? '+' : ''}${delta}초`);
}

$('#ctl-skip').addEventListener('click', () => {
  const step = currentStep();
  if (!step || !step.item) return;
  const idx = step.item.idx;
  let next = run.index + 1;
  while (next < run.steps.length && run.steps[next].item && run.steps[next].item.idx === idx) next += 1;
  sp.speak('이 동작을 건너뜁니다.', { urgent: true });
  enterStep(next);
});

$('#ctl-guide').addEventListener('click', () => {
  const step = currentStep();
  if (step && step.item) openGuide(step.item.ex);
});

$('#runner-close').addEventListener('click', () => {
  if (!window.confirm('운동을 종료할까요? 지금까지 입력한 세트 기록은 저장됩니다.')) return;
  endWorkout({ save: true });
  toast('운동을 중단했습니다');
});

// 화면 잠금 방지
async function requestWakeLock() {
  if (!store.settings().keepAwake || !('wakeLock' in navigator)) return;
  try {
    run.wakeLock = await navigator.wakeLock.request('screen');
  } catch (err) {
    /* 배터리 절약 모드 등에서는 실패할 수 있다 */
  }
}

function releaseWakeLock() {
  if (run.wakeLock) {
    run.wakeLock.release().catch(() => {});
    run.wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (run.active && !run.paused) requestWakeLock();
    if (run.active) renderRunner();
  }
});

/* ── 운동 종료 · 마무리 기록 ───────────────────────────────── */

function finishWorkout() {
  const seconds = Math.round((Date.now() - run.startedAt) / 1000);
  const volume = Object.values(run.logs).reduce((sum, sets) => sum + store.volumeOf(sets), 0);
  const setCount = Object.values(run.logs).reduce((sum, sets) => sum + sets.filter((s) => s.reps > 0).length, 0);
  sp.beep.done();
  sp.vibrate([100, 60, 100, 60, 160]);
  const finishLine = sp.cheer('finish', { always: true });
  sp.speak(`${finishLine} 총 ${Math.round(seconds / 60)}분 운동했습니다.`, { urgent: true, force: true });

  saveLogs();
  clearInterval(run.timer);
  run.timer = null;
  run.active = false;
  releaseWakeLock();
  $('#runner').hidden = true;
  document.body.classList.remove('running');

  const session = run.session;
  openSheet(`
    <h3>운동 완료 🎉</h3>
    <ul class="meta-row">
      <li>${Math.round(seconds / 60)}분</li>
      <li>${setCount}세트</li>
      <li>볼륨 ${Math.round(volume).toLocaleString('ko-KR')}${store.settings().unit}</li>
    </ul>
    <label class="set-row column"><span>체감 강도(RPE) <b id="rpe-out">7</b> / 10</span>
      <input id="rpe" type="range" min="1" max="10" step="1" value="7" /></label>
    <p class="muted">근육통·불편한 부위가 있나요? (여러 개 선택)</p>
    <div class="chip-row">
      ${['없음', '허리', '무릎', '어깨', '손목', '목', '햄스트링'].map((p) => `<button class="chip-btn" data-sore="${p}" type="button">${p}</button>`).join('')}
    </div>
    <label class="set-row column"><span>메모</span>
      <textarea id="finish-memo" class="text-input" rows="2" placeholder="예: 스쿼트 무게 2.5kg 올림"></textarea></label>
    <label class="set-row"><span>오늘 체중 (선택)</span>
      <span class="num-wrap"><input id="finish-weight" class="num-input" type="number" step="0.1" inputmode="decimal" placeholder="0" /><small>${store.settings().unit}</small></span></label>
    <button id="finish-save" class="primary big" type="button" data-session="${session.id}" data-seconds="${seconds}" data-volume="${volume}">저장하고 마치기</button>
    <p class="hint" id="next-advice"></p>
  `);

  $('#rpe').addEventListener('input', (e) => {
    $('#rpe-out').textContent = e.target.value;
    $('#next-advice').textContent = advice(Number(e.target.value));
  });
  $('#next-advice').textContent = advice(7);
}

function advice(rpe) {
  if (rpe <= 5) return '다음 세션에서는 무게를 2.5kg 정도 올리거나 반복을 2회 늘려 보세요. (과부하의 원리)';
  if (rpe <= 8) return '지금 강도가 적당합니다. 다음엔 한 가지 요소(무게·횟수·세트·휴식시간)만 조금 바꿔 보세요.';
  return '강도가 높았습니다. 다음 날은 휴식일을 넣거나 무게를 유지한 채 자세에 집중하세요.';
}

$('#sheet').addEventListener('click', (e) => {
  const sore = e.target.closest('[data-sore]');
  if (sore) {
    sore.classList.toggle('on');
    return;
  }
  const save = e.target.closest('#finish-save');
  if (!save) return;
  const soreness = $$('[data-sore].on').map((b) => b.dataset.sore);
  store.completeSession(save.dataset.session, {
    seconds: Number(save.dataset.seconds),
    volume: Number(save.dataset.volume),
    rpe: Number($('#rpe').value),
    soreness,
    memo: $('#finish-memo').value.trim(),
    bodyWeight: Number($('#finish-weight').value) || null,
  });
  const at = SESSIONS.findIndex((s) => s.id === save.dataset.session);
  if (at === store.pointer() && at < SESSIONS.length - 1) store.setPointer(at + 1);
  closeSheet();
  renderToday();
  goto('stats');
  toast('기록을 저장했습니다');
});

/* ── 시작 ──────────────────────────────────────────────────── */

function boot() {
  applyTheme();
  updateMuteButton();
  renderToday();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  document.addEventListener('click', () => sp.unlockAudio(), { once: true });
  $$('.step-btn[data-log]').forEach((btn) => btn.addEventListener('click', () => {
    const input = $(btn.dataset.log === 'weight' ? '#log-weight' : '#log-reps');
    const next = (Number(input.value) || 0) + Number(btn.dataset.delta);
    input.value = Math.max(0, Math.round(next * 10) / 10);
  }));
  $$('.unit-label').forEach((el) => { el.textContent = store.settings().unit; });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (!sp.supportsSpeech()) {
    toast('이 브라우저는 음성 안내를 지원하지 않습니다. 신호음과 화면 안내로 진행됩니다.');
  }
}

boot();
