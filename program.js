// 4주 운동 프로그램 — 배포된 운동표(1~4주차, 월~금)를 그대로 옮긴 데이터
// 월·수·금은 A루틴(스쿼트/데드리프트 중심), 화·목은 B루틴(머신·유산소 중심)이다.

const S = (ex, sets, repsMin, repsMax, note) => ({
  type: 'strength',
  ex,
  sets,
  repsMin,
  repsMax,
  note: note || '',
});

const STRETCH = { type: 'stretch', ex: 'stretch' };

const WALK = (minutes, incline, speed) => ({
  type: 'cardio',
  ex: 'treadmillWalk',
  minutes,
  incline,
  speed,
});

const RUN = (minutes, speedMin, speedMax) => ({
  type: 'cardio',
  ex: 'treadmillRun',
  minutes,
  speedMin,
  speedMax,
});

const INTERVAL = (rounds, workSec, workMin, workMax, easySec, easyMin, easyMax) => ({
  type: 'interval',
  ex: 'treadmillRun',
  rounds,
  work: { sec: workSec, speedMin: workMin, speedMax: workMax },
  easy: { sec: easySec, speedMin: easyMin, speedMax: easyMax },
});

export const WEEKS = [
  {
    week: 1,
    title: '적응기',
    goals: [
      '몸이 적응하는 시간 — 무리하지 않기',
      '운동 동작 익히기',
      '매일 운동하는 습관 들이기',
      '물, 단백질 충분히 섭취하기',
    ],
    routines: {
      A: {
        code: 'A',
        name: '전신 A',
        summary: '스쿼트·데드리프트 + 경사 걷기',
        items: [
          STRETCH,
          S('squat', 3, 10, 15, '맨몸OK'),
          S('chestPress', 3, 10, 15),
          S('deadlift', 3, 10, 15),
          S('shoulderPress', 2, 10, 15),
          S('crunch', 2, 15, 15),
          WALK(10, 5, 4),
        ],
      },
      B: {
        code: 'B',
        name: '전신 B',
        summary: '머신 중심 + 달리기',
        items: [
          STRETCH,
          S('legPress', 3, 10, 15),
          S('chestPress', 3, 10, 15),
          S('latPulldown', 3, 10, 15),
          S('lateralRaise', 3, 10, 15),
          RUN(10, 6, 7),
        ],
      },
    },
  },
  {
    week: 2,
    title: '과부하 시작',
    goals: [
      '과부하의 원리가 핵심 — 근육통에 익숙해지기',
      '[운동 시간 / 세트 수 / 반복 횟수 / 무게] 중 최소 한 가지 이상 반드시 높이기',
      '물, 단백질 충분히 섭취하기',
      '매일 운동하는 것이 힘들다면 중간에 휴식일 투입하기',
    ],
    routines: {
      A: {
        code: 'A',
        name: '전신 A',
        summary: '스쿼트(덤벨)·데드리프트 + 경사 걷기',
        items: [
          STRETCH,
          S('squat', 3, 10, 15, '덤벨OK'),
          S('chestPress', 3, 10, 15),
          S('deadlift', 3, 10, 15),
          S('shoulderPress', 2, 10, 15),
          S('crunch', 2, 20, 20),
          WALK(10, 8, 4),
        ],
      },
      B: {
        code: 'B',
        name: '전신 B',
        summary: '머신 중심 + 달리기 15분',
        items: [
          STRETCH,
          S('legPress', 3, 10, 15),
          S('chestPress', 3, 10, 15),
          S('latPulldown', 3, 10, 15),
          S('lateralRaise', 3, 10, 15),
          RUN(15, 6, 8),
        ],
      },
    },
  },
  {
    week: 3,
    title: '강도 점검',
    goals: [
      '[운동 시간 / 세트 수 / 반복 횟수 / 무게] 중 최소 한 가지 이상 높이기',
      '급격한 강도 변화는 동기부여에 독. 강도 요소를 바꾸기 어렵다면 휴식시간을 줄여 보기',
      '물, 단백질 충분히 섭취하기',
    ],
    checks: [
      '관절에 무리가 없는지',
      '운동하고자 하는 근육에 자극을 느끼는지',
      '본인의 자세를 촬영하고 YouTube 영상과 비교',
    ],
    routines: {
      A: {
        code: 'A',
        name: '전신 A',
        summary: '스쿼트·데드리프트 + 경사 걷기 6km/h',
        items: [
          STRETCH,
          S('squat', 3, 10, 15),
          S('chestPress', 3, 10, 15),
          S('deadlift', 3, 10, 15),
          S('shoulderPress', 2, 10, 15),
          S('crunch', 2, 20, 20),
          WALK(10, 5, 6),
        ],
      },
      B: {
        code: 'B',
        name: '전신 B',
        summary: '머신 중심 + 인터벌 달리기',
        items: [
          STRETCH,
          S('legPress', 3, 10, 15),
          S('chestPress', 3, 10, 15),
          S('latPulldown', 3, 10, 15),
          S('lateralRaise', 3, 10, 15),
          INTERVAL(4, 120, 9, 10, 120, 6, 7),
        ],
      },
    },
  },
  {
    week: 4,
    title: '확장기',
    goals: [
      '[운동 시간 / 세트 수 / 반복 횟수 / 무게] 중 최소 한 가지 이상 반드시 높이기',
      '물, 단백질 충분히 섭취하기',
      '새로운 동작 학습하기 — 근육별 2가지 이상',
      '다음 달 운동계획 수립',
    ],
    routines: {
      A: {
        code: 'A',
        name: '전신 A',
        summary: '벤치프레스·데드리프트 + 경사 걷기',
        items: [
          STRETCH,
          S('squat', 3, 10, 15),
          S('benchPress', 3, 10, 15),
          S('deadlift', 3, 10, 15),
          S('dumbbellShoulderPress', 2, 10, 15),
          S('legRaise', 2, 20, 20),
          WALK(10, 8, 6),
        ],
      },
      B: {
        code: 'B',
        name: '전신 B',
        summary: '분할 머신 + 인터벌 달리기',
        items: [
          STRETCH,
          S('legExtension', 2, 10, 15),
          S('legCurl', 2, 10, 15),
          S('pushup', 3, 10, 15),
          S('row', 3, 10, 15),
          S('lateralRaise', 3, 10, 15),
          INTERVAL(4, 180, 9, 10, 120, 6, 7),
        ],
      },
    },
  },
];

// 월~금 5일 × 4주 = 20개 세션
export const WEEKDAYS = ['월', '화', '수', '목', '금'];
const DAY_ROUTINE = ['A', 'B', 'A', 'B', 'A'];

export const SESSIONS = WEEKS.flatMap((w) =>
  WEEKDAYS.map((day, i) => {
    const routine = w.routines[DAY_ROUTINE[i]];
    return {
      id: `w${w.week}d${i + 1}`,
      week: w.week,
      weekTitle: w.title,
      dayIndex: i + 1,
      weekday: day,
      routine: routine.code,
      name: `${w.week}주차 ${day} · ${routine.name}`,
      summary: routine.summary,
      goals: w.goals,
      checks: w.checks || [],
      items: routine.items,
    };
  })
);

export function sessionById(id) {
  return SESSIONS.find((s) => s.id === id) || SESSIONS[0];
}

export function sessionIndex(id) {
  const i = SESSIONS.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}

export function weekOf(week) {
  return WEEKS.find((w) => w.week === week) || WEEKS[0];
}

// 항목 한 줄 설명 (표에 적힌 형식 그대로)
export function itemSpec(item) {
  if (item.type === 'strength') {
    const reps = item.repsMin === item.repsMax ? `${item.repsMin}회` : `${item.repsMin}~${item.repsMax}회`;
    return `${item.sets}세트 × ${reps}${item.note ? ` (${item.note})` : ''}`;
  }
  if (item.type === 'cardio') {
    const speed = item.speed ? `${item.speed}km/h` : `${item.speedMin}~${item.speedMax}km/h`;
    const incline = item.incline ? `경사 +${item.incline}% · ` : '';
    return `${incline}${speed} · ${item.minutes}분`;
  }
  if (item.type === 'interval') {
    const w = item.work;
    const e = item.easy;
    return `${w.speedMin}~${w.speedMax}km/h ${w.sec / 60}분 + ${e.speedMin}~${e.speedMax}km/h ${e.sec / 60}분 · ${item.rounds}세트 반복`;
  }
  return '5~7분';
}

// 예상 소요 시간(초). 세트당 작업시간은 대략 45초로 본다.
export function estimateSeconds(session, settings, custom) {
  const skipped = new Set((custom && custom.skipped) || []);
  let total = 0;
  session.items.forEach((item, idx) => {
    if (skipped.has(idx)) return;
    if (item.type === 'stretch') {
      total += settings.stretchLevel === 'short' ? 160 : 330;
    } else if (item.type === 'strength') {
      total += item.sets * (45 + settings.restSet) + settings.restEx;
    } else if (item.type === 'cardio') {
      total += item.minutes * 60;
    } else if (item.type === 'interval') {
      total += item.rounds * (item.work.sec + item.easy.sec);
    }
  });
  return total;
}
