// 음성 안내 · 신호음 · 진동 · 격려 멘트
// 이어폰 착용을 전제로 하되, 볼륨/속도/짧은 안내 모드로 소리 양을 조절할 수 있게 한다.

import { settings } from './store.js';

let voices = [];
let audioCtx = null;
let muted = false;

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;

export function supportsSpeech() {
  return Boolean(synth);
}

export function loadVoices() {
  if (!synth) return [];
  voices = synth.getVoices().filter((v) => /^ko/i.test(v.lang));
  if (!voices.length) voices = synth.getVoices();
  return voices;
}

if (synth) {
  loadVoices();
  synth.addEventListener('voiceschanged', loadVoices);
}

export function voiceList() {
  return voices.length ? voices : loadVoices();
}

// 첫 사용자 조작에서 오디오와 음성을 깨운다(모바일 브라우저 정책).
export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !audioCtx) audioCtx = new Ctx();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (err) {
    console.warn('오디오 초기화 실패', err);
  }
  if (synth) {
    const warm = new SpeechSynthesisUtterance(' ');
    warm.volume = 0;
    try {
      synth.speak(warm);
    } catch (err) {
      /* 무시 */
    }
  }
}

export function setMuted(value) {
  muted = value;
  if (value) stopSpeech();
}

export function stopSpeech() {
  if (synth) synth.cancel();
}

function pickVoice() {
  const list = voiceList();
  const wanted = settings().voiceURI;
  return list.find((v) => v.voiceURI === wanted) || list.find((v) => /^ko/i.test(v.lang)) || list[0] || null;
}

// urgent=true면 진행 중인 안내를 끊고 바로 말한다(카운트다운·전환 신호).
export function speak(text, { urgent = false, force = false } = {}) {
  if (!text || !synth || muted) return;
  const s = settings();
  if (!s.voice && !force) return;
  if (urgent) synth.cancel();
  const utter = new SpeechSynthesisUtterance(String(text));
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  utter.lang = (voice && voice.lang) || 'ko-KR';
  utter.rate = s.rate;
  utter.pitch = s.pitch;
  utter.volume = s.volume;
  try {
    synth.speak(utter);
  } catch (err) {
    console.warn('음성 안내 실패', err);
  }
}

// 짧은 안내 모드에서는 부가 설명을 생략한다.
export function speakDetail(text, options) {
  if (settings().terse) return;
  speak(text, options);
}

/* ── 신호음 ────────────────────────────────────────────────── */

function tone(freq, duration, when = 0, gainValue = 0.18) {
  if (!audioCtx || muted || !settings().beep) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const start = audioCtx.currentTime + when;
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue * settings().volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const beep = {
  tick: () => tone(880, 0.08),
  go: () => {
    tone(660, 0.12);
    tone(990, 0.18, 0.14);
  },
  rest: () => {
    tone(520, 0.14);
    tone(390, 0.2, 0.16);
  },
  done: () => {
    tone(660, 0.12);
    tone(880, 0.12, 0.13);
    tone(1180, 0.24, 0.26);
  },
  tempoDown: () => tone(520, 0.06, 0, 0.12),
  tempoUp: () => tone(780, 0.06, 0, 0.12),
};

export function vibrate(pattern) {
  if (!settings().vibrate || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch (err) {
    /* 무시 */
  }
}

/* ── 격려 멘트 ─────────────────────────────────────────────── */

const CHEER_SET = [
  '좋습니다, 자세 그대로 유지하세요.',
  '호흡 놓치지 말고 한 번 더.',
  '지금 그 속도가 딱 좋습니다.',
  '반동 없이, 근육으로 버티세요.',
  '어제보다 확실히 나아지고 있습니다.',
  '마지막 두 번이 근육을 만듭니다.',
  '천천히 내리는 구간에 집중하세요.',
  '잘하고 있어요, 조금만 더.',
  '숨을 내쉬면서 밀어 올리세요.',
  '자극이 느껴지는 근육에 집중하세요.',
];

const CHEER_REST = [
  '잘했습니다. 숨을 고르세요.',
  '물 한 모금 마셔 두면 좋습니다.',
  '어깨를 내리고 편하게 쉬세요.',
  '심호흡 세 번, 다음 세트 준비합니다.',
  '이 페이스면 오늘 완주는 확실합니다.',
];

const CHEER_LAST = [
  '마지막 세트입니다. 남김없이 갑니다.',
  '이번 세트만 끝내면 이 운동은 끝입니다.',
  '마지막입니다. 자세부터 다시 잡고 시작하세요.',
];

const CHEER_CARDIO = [
  '호흡 리듬을 유지하세요.',
  '시선은 정면, 어깨는 편하게.',
  '절반 넘었습니다. 잘 버티고 있어요.',
  '팔 흔들기를 크게, 상체는 세우고.',
  '조금만 더, 여기서 심장이 강해집니다.',
];

const CHEER_FINISH = [
  '오늘 운동 완료. 정말 잘했습니다.',
  '완주했습니다. 단백질과 물 잊지 마세요.',
  '오늘도 습관을 하나 쌓았습니다. 훌륭합니다.',
];

const POOLS = {
  set: CHEER_SET,
  rest: CHEER_REST,
  last: CHEER_LAST,
  cardio: CHEER_CARDIO,
  finish: CHEER_FINISH,
};

const CHANCE = { off: 0, low: 0.3, normal: 0.6, high: 1 };

export function cheer(kind = 'set', { always = false } = {}) {
  const level = settings().cheer;
  if (!always && Math.random() > (CHANCE[level] ?? 0.6)) return null;
  if (level === 'off' && !always) return null;
  const pool = POOLS[kind] || CHEER_SET;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function speakCheer(kind, options) {
  const line = cheer(kind, options);
  if (line) speak(line);
  return line;
}

/* ── 숫자를 말로 읽기 쉽게 다듬기 ──────────────────────────── */

export function sayReps(min, max) {
  return min === max ? `${min}회` : `${min}에서 ${max}회`;
}

export function saySpeed(item) {
  if (item.speed) return `시속 ${item.speed}킬로미터`;
  return `시속 ${item.speedMin}에서 ${item.speedMax}킬로미터`;
}

export function sayDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m && s) return `${m}분 ${s}초`;
  if (m) return `${m}분`;
  return `${s}초`;
}
