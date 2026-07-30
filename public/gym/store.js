// 로컬 저장소 — 설정, 진행 상황, 세트 기록, 하루 체크(물·단백질)를 모두 기기 안에 저장한다.
// 서버로 전송하지 않으므로 오프라인에서도 그대로 동작한다.

const KEY = 'gym4w.v1';

export const DEFAULT_SETTINGS = {
  // 음성
  voice: true,
  voiceURI: '',
  rate: 1,
  pitch: 1,
  volume: 1,
  terse: false, // 짧은 안내(이어폰 배려)
  countdownVoice: true,
  cheer: 'normal', // off | low | normal | high
  // 소리·진동
  beep: true,
  vibrate: true,
  // 시간
  prepare: 5,
  restSet: 60,
  restEx: 90,
  autoAdvance: true,
  halfwayAlert: true,
  // 템포 가이드
  tempo: false,
  tempoDown: 2,
  tempoHold: 1,
  tempoUp: 2,
  // 기타
  stretchLevel: 'full', // short | full
  keepAwake: true,
  unit: 'kg',
  theme: 'auto', // auto | dark | light
  waterGoal: 8,
  proteinGoal: 100,
  bigText: false,
};

const DEFAULT_STATE = {
  settings: { ...DEFAULT_SETTINGS },
  pointer: 0, // 다음에 할 세션 인덱스(0~19)
  sessions: {}, // sessionId -> { date, seconds, volume, rpe, soreness, memo, bodyWeight }
  logs: {}, // exerciseKey -> [{ date, sessionId, sets:[{ weight, reps }] }]
  custom: {}, // sessionId -> { skipped:[idx], swap:{ idx: exerciseKey } }
  goalChecks: {}, // `${week}:${i}` -> true
  daily: {}, // YYYY-MM-DD -> { water, protein }
  media: {}, // exerciseKey -> { url, shots:[dataURL] }
  startedAt: null,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...clone(DEFAULT_STATE),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };
  } catch (err) {
    console.warn('저장된 데이터를 읽지 못해 기본값으로 시작한다', err);
    return clone(DEFAULT_STATE);
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('저장 실패(용량 초과 가능)', err);
  }
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export const settings = () => state.settings;

export function setSetting(key, value) {
  state.settings[key] = value;
  persist();
}

export function todayKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ── 진행 상황 ─────────────────────────────────────────────── */

export function pointer() {
  return Math.min(state.pointer, 19);
}

export function setPointer(index) {
  state.pointer = Math.max(0, Math.min(19, index));
  persist();
}

export function isDone(sessionId) {
  return Boolean(state.sessions[sessionId]);
}

export function sessionRecord(sessionId) {
  return state.sessions[sessionId] || null;
}

export function completeSession(sessionId, record) {
  state.sessions[sessionId] = {
    date: todayKey(),
    ...record,
  };
  if (!state.startedAt) state.startedAt = todayKey();
  persist();
}

export function updateSessionRecord(sessionId, patch) {
  if (!state.sessions[sessionId]) return;
  state.sessions[sessionId] = { ...state.sessions[sessionId], ...patch };
  persist();
}

export function clearSession(sessionId) {
  delete state.sessions[sessionId];
  persist();
}

export function doneCount() {
  return Object.keys(state.sessions).length;
}

// 연속 운동일수 — 오늘(또는 어제)부터 거꾸로 세어 끊기는 날까지
export function streak() {
  const dates = new Set(Object.values(state.sessions).map((s) => s.date));
  if (!dates.size) return 0;
  const day = 86400000;
  let cursor = new Date();
  if (!dates.has(todayKey(cursor))) cursor = new Date(cursor.getTime() - day);
  let count = 0;
  while (dates.has(todayKey(cursor))) {
    count += 1;
    cursor = new Date(cursor.getTime() - day);
  }
  return count;
}

/* ── 세트 기록 ─────────────────────────────────────────────── */

export function logSets(exerciseKey, sessionId, sets) {
  if (!sets.length) return;
  const list = state.logs[exerciseKey] || (state.logs[exerciseKey] = []);
  const existing = list.find((e) => e.sessionId === sessionId && e.date === todayKey());
  if (existing) existing.sets = sets;
  else list.push({ date: todayKey(), sessionId, sets });
  if (list.length > 60) list.splice(0, list.length - 60);
  persist();
}

export function lastLog(exerciseKey) {
  const list = state.logs[exerciseKey];
  return list && list.length ? list[list.length - 1] : null;
}

export function lastLogBefore(exerciseKey, sessionId) {
  const list = state.logs[exerciseKey] || [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].sessionId !== sessionId) return list[i];
  }
  return null;
}

export function bestOf(exerciseKey) {
  const list = state.logs[exerciseKey] || [];
  let best = 0;
  list.forEach((e) => e.sets.forEach((s) => {
    if (Number(s.weight) > best) best = Number(s.weight);
  }));
  return best;
}

export function volumeOf(sets) {
  return sets.reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
}

export function totalVolume() {
  return Object.values(state.sessions).reduce((sum, s) => sum + (Number(s.volume) || 0), 0);
}

export function weeklyVolume() {
  const byWeek = [0, 0, 0, 0];
  Object.entries(state.sessions).forEach(([id, rec]) => {
    const week = Number(id.slice(1, 2));
    if (week >= 1 && week <= 4) byWeek[week - 1] += Number(rec.volume) || 0;
  });
  return byWeek;
}

/* ── 세션 커스터마이징 ─────────────────────────────────────── */

export function customOf(sessionId) {
  return state.custom[sessionId] || { skipped: [], swap: {} };
}

export function toggleSkip(sessionId, itemIndex) {
  const custom = state.custom[sessionId] || (state.custom[sessionId] = { skipped: [], swap: {} });
  const at = custom.skipped.indexOf(itemIndex);
  if (at >= 0) custom.skipped.splice(at, 1);
  else custom.skipped.push(itemIndex);
  persist();
}

export function setSwap(sessionId, itemIndex, exerciseKey) {
  const custom = state.custom[sessionId] || (state.custom[sessionId] = { skipped: [], swap: {} });
  if (exerciseKey) custom.swap[itemIndex] = exerciseKey;
  else delete custom.swap[itemIndex];
  persist();
}

/* ── 주차 지침 체크 ─────────────────────────────────────────── */

export function goalChecked(week, index) {
  return Boolean(state.goalChecks[`${week}:${index}`]);
}

export function toggleGoalCheck(week, index) {
  const key = `${week}:${index}`;
  if (state.goalChecks[key]) delete state.goalChecks[key];
  else state.goalChecks[key] = true;
  persist();
}

/* ── 하루 체크(물·단백질) ──────────────────────────────────── */

export function daily(dateKey = todayKey()) {
  return state.daily[dateKey] || { water: 0, protein: 0 };
}

export function bumpDaily(field, delta, dateKey = todayKey()) {
  const entry = state.daily[dateKey] || (state.daily[dateKey] = { water: 0, protein: 0 });
  entry[field] = Math.max(0, (entry[field] || 0) + delta);
  persist();
}

/* ── 내 자세 자료 ──────────────────────────────────────────── */

export function media(exerciseKey) {
  return state.media[exerciseKey] || { url: '', shots: [] };
}

export function setMediaUrl(exerciseKey, url) {
  const entry = state.media[exerciseKey] || (state.media[exerciseKey] = { url: '', shots: [] });
  entry.url = url;
  persist();
}

export function addShot(exerciseKey, dataUrl) {
  const entry = state.media[exerciseKey] || (state.media[exerciseKey] = { url: '', shots: [] });
  entry.shots.unshift({ date: todayKey(), dataUrl });
  if (entry.shots.length > 3) entry.shots.length = 3; // 용량 보호
  persist();
}

export function removeShot(exerciseKey, index) {
  const entry = state.media[exerciseKey];
  if (!entry) return;
  entry.shots.splice(index, 1);
  persist();
}

/* ── 백업 ──────────────────────────────────────────────────── */

export function exportJSON() {
  return JSON.stringify({ app: 'gym4w', version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const incoming = parsed.state || parsed;
  if (!incoming || typeof incoming !== 'object') throw new Error('형식이 올바르지 않습니다');
  state = {
    ...clone(DEFAULT_STATE),
    ...incoming,
    settings: { ...DEFAULT_SETTINGS, ...(incoming.settings || {}) },
  };
  persist();
}

export function resetAll() {
  state = clone(DEFAULT_STATE);
  persist();
}
