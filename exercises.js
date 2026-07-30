// 운동 라이브러리 — 자세 가이드, 핵심 포인트, 흔한 실수, 대체 운동
// 자세 그림은 두 자세(시작/끝)를 번갈아 보여 주는 스틱 피겨 SMIL 애니메이션으로 만든다.
// 좌표계는 100×100, 사람은 화면 왼쪽을 바라본다(측면).

const JOINTS = ['head', 'sh', 'el', 'hand', 'hip', 'knee', 'ankle', 'toe'];

function pointsOf(pose, keys) {
  return keys.map((k) => pose[k].join(',')).join(' ');
}

function segment(a, b, keys, cls, dur) {
  const from = pointsOf(a, keys);
  const to = pointsOf(b, keys);
  return `<polyline class="${cls}" points="${from}" fill="none">
    <animate attributeName="points" dur="${dur}s" repeatCount="indefinite"
      keyTimes="0;0.5;1" values="${from};${to};${from}"
      calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />
  </polyline>`;
}

function headCircle(a, b, dur) {
  const anim = (attr, i) => `<animate attributeName="${attr}" dur="${dur}s" repeatCount="indefinite"
      keyTimes="0;0.5;1" values="${a.head[i]};${b.head[i]};${a.head[i]}"
      calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />`;
  return `<circle class="pose-head" cx="${a.head[0]}" cy="${a.head[1]}" r="6">
    ${anim('cx', 0)}${anim('cy', 1)}
  </circle>`;
}

// 두 자세로 움직이는 사람 그림을 만든다.
export function poseFigure(patternKey, dur = 2.8) {
  const pattern = PATTERNS[patternKey] || PATTERNS.squat;
  const [a, b] = pattern.poses;
  for (const key of JOINTS) {
    if (!a[key] || !b[key]) throw new Error(`pose ${patternKey} 관절 누락: ${key}`);
  }
  return `<svg viewBox="0 0 100 100" class="pose-figure" aria-hidden="true">
    ${pattern.props || ''}
    ${segment(a, b, ['sh', 'hip'], 'pose-spine', dur)}
    ${segment(a, b, ['hip', 'knee', 'ankle', 'toe'], 'pose-leg', dur)}
    ${segment(a, b, ['sh', 'el', 'hand'], 'pose-arm', dur)}
    ${headCircle(a, b, dur)}
  </svg>`;
}

const GROUND = '<line class="pose-ground" x1="4" y1="96" x2="96" y2="96" />';
const BENCH = '<rect class="pose-gear" x="30" y="66" width="46" height="5" rx="2" /><line class="pose-ground" x1="4" y1="96" x2="96" y2="96" />';
const SEAT = '<rect class="pose-gear" x="52" y="60" width="26" height="5" rx="2" /><rect class="pose-gear" x="70" y="30" width="5" height="32" rx="2" /><line class="pose-ground" x1="4" y1="96" x2="96" y2="96" />';

// 동작 패턴별 시작/끝 자세
const PATTERNS = {
  // 무릎을 굽혀 앉았다 일어나는 스쿼트 패턴
  squat: {
    props: GROUND,
    poses: [
      { head: [50, 14], sh: [50, 25], el: [43, 34], hand: [38, 42], hip: [50, 51], knee: [50, 72], ankle: [50, 92], toe: [40, 94] },
      { head: [45, 27], sh: [46, 37], el: [38, 44], hand: [33, 50], hip: [53, 62], knee: [39, 74], ankle: [50, 92], toe: [40, 94] },
    ],
  },
  // 엉덩이를 뒤로 접는 힌지(데드리프트) 패턴
  hinge: {
    props: GROUND,
    poses: [
      { head: [50, 14], sh: [50, 25], el: [49, 40], hand: [48, 55], hip: [50, 51], knee: [50, 72], ankle: [50, 92], toe: [40, 94] },
      { head: [31, 39], sh: [39, 42], el: [42, 60], hand: [44, 80], hip: [55, 54], knee: [51, 73], ankle: [50, 92], toe: [40, 94] },
    ],
  },
  // 누워서 앞으로 미는 수평 프레스(체스트프레스·벤치프레스)
  horizPress: {
    props: BENCH,
    poses: [
      { head: [26, 62], sh: [38, 64], el: [38, 50], hand: [38, 36], hip: [62, 66], knee: [76, 60], ankle: [80, 78], toe: [72, 80] },
      { head: [26, 62], sh: [38, 64], el: [30, 58], hand: [38, 52], hip: [62, 66], knee: [76, 60], ankle: [80, 78], toe: [72, 80] },
    ],
  },
  // 머리 위로 미는 수직 프레스(숄더프레스)
  vertPress: {
    props: GROUND,
    poses: [
      { head: [50, 16], sh: [50, 30], el: [40, 38], hand: [43, 26], hip: [51, 55], knee: [51, 74], ankle: [51, 92], toe: [41, 94] },
      { head: [50, 16], sh: [50, 30], el: [45, 22], hand: [47, 7], hip: [51, 55], knee: [51, 74], ankle: [51, 92], toe: [41, 94] },
    ],
  },
  // 위에서 아래로 당기는 수직 풀(랫풀다운)
  vertPull: {
    props: SEAT,
    poses: [
      { head: [50, 26], sh: [51, 39], el: [43, 24], hand: [38, 9], hip: [56, 58], knee: [40, 62], ankle: [36, 80], toe: [27, 82] },
      { head: [50, 26], sh: [51, 39], el: [42, 45], hand: [44, 28], hip: [56, 58], knee: [40, 62], ankle: [36, 80], toe: [27, 82] },
    ],
  },
  // 상체를 숙이고 뒤로 당기는 수평 풀(로우)
  horizPull: {
    props: GROUND,
    poses: [
      { head: [30, 40], sh: [38, 43], el: [40, 60], hand: [41, 78], hip: [55, 54], knee: [52, 73], ankle: [51, 92], toe: [41, 94] },
      { head: [30, 40], sh: [38, 43], el: [50, 52], hand: [46, 58], hip: [55, 54], knee: [52, 73], ankle: [51, 92], toe: [41, 94] },
    ],
  },
  // 팔을 옆으로 드는 레이즈(래터럴레이즈)
  raise: {
    props: GROUND,
    poses: [
      { head: [50, 16], sh: [50, 30], el: [50, 44], hand: [50, 58], hip: [51, 55], knee: [51, 74], ankle: [51, 92], toe: [41, 94] },
      { head: [50, 16], sh: [50, 30], el: [37, 32], hand: [24, 30], hip: [51, 55], knee: [51, 74], ankle: [51, 92], toe: [41, 94] },
    ],
  },
  // 상체를 말아 올리는 크런치
  crunch: {
    props: GROUND,
    poses: [
      { head: [24, 84], sh: [36, 86], el: [30, 76], hand: [26, 80], hip: [60, 88], knee: [74, 70], ankle: [78, 90], toe: [68, 92] },
      { head: [32, 68], sh: [42, 76], el: [34, 66], hand: [30, 70], hip: [60, 88], knee: [74, 70], ankle: [78, 90], toe: [68, 92] },
    ],
  },
  // 다리를 들어 올리는 레그레이즈
  legRaise: {
    props: GROUND,
    poses: [
      { head: [24, 84], sh: [36, 86], el: [44, 90], hand: [52, 92], hip: [60, 88], knee: [74, 88], ankle: [88, 88], toe: [90, 80] },
      { head: [24, 84], sh: [36, 86], el: [44, 90], hand: [52, 92], hip: [60, 88], knee: [68, 66], ankle: [74, 46], toe: [66, 42] },
    ],
  },
  // 앉아서 무릎을 펴는 레그익스텐션
  legExtend: {
    props: SEAT,
    poses: [
      { head: [50, 26], sh: [51, 39], el: [56, 50], hand: [62, 58], hip: [56, 58], knee: [40, 62], ankle: [36, 80], toe: [27, 82] },
      { head: [50, 26], sh: [51, 39], el: [56, 50], hand: [62, 58], hip: [56, 58], knee: [40, 62], ankle: [18, 58], toe: [12, 52] },
    ],
  },
  // 앉아서 무릎을 접는 레그컬
  legCurl: {
    props: SEAT,
    poses: [
      { head: [50, 26], sh: [51, 39], el: [56, 50], hand: [62, 58], hip: [56, 58], knee: [40, 62], ankle: [18, 58], toe: [12, 52] },
      { head: [50, 26], sh: [51, 39], el: [56, 50], hand: [62, 58], hip: [56, 58], knee: [40, 62], ankle: [30, 82], toe: [22, 86] },
    ],
  },
  // 엎드려 몸으로 미는 푸쉬업
  pushup: {
    props: GROUND,
    poses: [
      { head: [22, 58], sh: [34, 62], el: [34, 76], hand: [34, 90], hip: [58, 70], knee: [74, 78], ankle: [88, 88], toe: [92, 80] },
      { head: [22, 74], sh: [34, 78], el: [46, 82], hand: [34, 90], hip: [58, 82], knee: [74, 86], ankle: [88, 90], toe: [92, 82] },
    ],
  },
  // 경사 걷기
  walk: {
    props: '<line class="pose-ground" x1="4" y1="96" x2="96" y2="76" />',
    poses: [
      { head: [50, 16], sh: [50, 28], el: [43, 40], hand: [36, 46], hip: [52, 54], knee: [44, 70], ankle: [38, 86], toe: [28, 88] },
      { head: [50, 16], sh: [50, 28], el: [57, 38], hand: [62, 44], hip: [52, 54], knee: [62, 68], ankle: [70, 82], toe: [60, 84] },
    ],
  },
  // 달리기
  run: {
    props: GROUND,
    poses: [
      { head: [48, 14], sh: [50, 26], el: [40, 34], hand: [32, 28], hip: [53, 52], knee: [40, 62], ankle: [30, 76], toe: [20, 78] },
      { head: [48, 14], sh: [50, 26], el: [60, 32], hand: [66, 26], hip: [53, 52], knee: [66, 64], ankle: [76, 80], toe: [66, 84] },
    ],
  },
  // 스트레칭(전신 늘이기)
  stretch: {
    props: GROUND,
    poses: [
      { head: [50, 16], sh: [50, 28], el: [44, 18], hand: [42, 6], hip: [51, 55], knee: [51, 74], ankle: [51, 92], toe: [41, 94] },
      { head: [38, 34], sh: [44, 40], el: [38, 56], hand: [34, 72], hip: [54, 56], knee: [52, 74], ankle: [51, 92], toe: [41, 94] },
    ],
  },
};

// 표에 나오는 모든 운동
export const EXERCISES = {
  stretch: {
    name: '스트레칭',
    en: 'Stretching',
    pattern: 'stretch',
    group: '준비운동',
    target: '전신',
    equipment: '없음',
    breathing: '숨을 참지 말고 길게 내쉬면서 늘인다',
    cues: [
      '통증이 아니라 "시원한 당김"이 느껴지는 지점까지만 늘인다',
      '한 자세를 20~30초 유지하고 반동을 주지 않는다',
      '오늘 쓸 근육(하체·가슴·어깨·등) 순서로 훑는다',
    ],
    mistakes: ['튕기듯 반동을 주는 동작', '숨을 참고 버티기', '아픈 부위를 억지로 늘이기'],
    alt: [],
    yt: '헬스 전 준비운동 스트레칭 루틴',
  },
  squat: {
    name: '스쿼트',
    en: 'Squat',
    pattern: 'squat',
    group: '하체',
    target: '허벅지 앞·엉덩이',
    equipment: '맨몸 / 덤벨 / 바벨',
    breathing: '내려갈 때 들이마시고, 올라올 때 내쉰다',
    cues: [
      '발은 어깨너비, 발끝은 살짝 바깥쪽으로',
      '엉덩이를 뒤로 빼면서 무릎과 엉덩이를 동시에 접는다',
      '무릎이 발끝 방향과 같은 선으로 움직이게 한다',
      '허벅지가 바닥과 평행해질 때까지, 통증 없는 범위에서',
    ],
    mistakes: ['무릎이 안쪽으로 모이는 자세', '허리가 둥글게 말리는 자세', '발뒤꿈치가 들리는 자세'],
    alt: ['레그프레스', '의자 스쿼트(맨몸)', '고블릿 스쿼트'],
    yt: '스쿼트 정확한 자세',
  },
  chestPress: {
    name: '체스트프레스',
    en: 'Chest Press (machine)',
    pattern: 'horizPress',
    group: '가슴',
    target: '가슴·삼두',
    equipment: '머신',
    breathing: '밀 때 내쉬고, 돌아올 때 들이마신다',
    cues: [
      '손잡이가 가슴 중간 높이에 오도록 시트를 맞춘다',
      '등과 어깨를 등판에 붙이고 가슴을 살짝 편다',
      '팔꿈치를 어깨보다 약간 아래(45~60도)로 유지한다',
      '끝에서 팔꿈치를 완전히 잠그지 않는다',
    ],
    mistakes: ['어깨가 앞으로 솟는 자세', '너무 빠르게 반동으로 밀기', '가동범위를 반만 쓰기'],
    alt: ['푸쉬업', '덤벨 벤치프레스'],
    yt: '체스트프레스 머신 자세',
  },
  benchPress: {
    name: '벤치프레스',
    en: 'Bench Press',
    pattern: 'horizPress',
    group: '가슴',
    target: '가슴·삼두·어깨앞',
    equipment: '바벨 / 벤치',
    breathing: '내릴 때 들이마시고, 밀 때 내쉰다',
    cues: [
      '눈이 바 아래에 오도록 눕고, 어깨를 뒤로 모아 고정한다',
      '바는 젖꼭지 선 근처, 팔꿈치는 몸통과 45~60도',
      '발로 바닥을 밀어 몸을 안정시킨다',
      '처음에는 반드시 가벼운 무게와 안전바(또는 보조자)와 함께',
    ],
    mistakes: ['바를 목 쪽으로 내리기', '엉덩이가 벤치에서 들리기', '손목이 뒤로 꺾인 그립'],
    alt: ['체스트프레스', '덤벨프레스', '푸쉬업'],
    yt: '벤치프레스 자세',
  },
  deadlift: {
    name: '데드리프트',
    en: 'Deadlift',
    pattern: 'hinge',
    group: '전신(후면)',
    target: '엉덩이·햄스트링·등',
    equipment: '바벨 / 덤벨',
    breathing: '들기 전 숨을 채워 복압을 만들고, 세운 뒤 내쉰다',
    cues: [
      '바는 발등 중앙 위, 정강이에 가깝게 둔다',
      '허리는 곧게, 가슴은 들고 엉덩이를 뒤로 접는다',
      '바닥을 발로 밀며 무릎과 엉덩이를 동시에 펴 세운다',
      '내릴 때도 엉덩이를 뒤로 빼며 몸에 가깝게 붙여 내린다',
    ],
    mistakes: ['허리가 말린 상태로 들기', '바가 몸에서 멀어지기', '맨 위에서 허리를 과하게 젖히기'],
    alt: ['루마니안 데드리프트(덤벨)', '힙 힌지 연습(맨몸)', '케틀벨 데드리프트'],
    yt: '데드리프트 정확한 자세',
  },
  shoulderPress: {
    name: '숄더프레스',
    en: 'Shoulder Press',
    pattern: 'vertPress',
    group: '어깨',
    target: '어깨·삼두',
    equipment: '머신 / 덤벨',
    breathing: '밀 때 내쉬고, 내릴 때 들이마신다',
    cues: [
      '손은 어깨 바로 위, 손목은 팔꿈치 위에 세운다',
      '갈비뼈가 앞으로 벌어지지 않게 복부를 가볍게 조인다',
      '귀 옆으로 밀어 올리고, 귀 높이까지 천천히 내린다',
    ],
    mistakes: ['허리를 젖혀 밀기', '팔꿈치를 너무 앞으로 모으기', '목과 승모근에 힘 주기'],
    alt: ['덤벨프레스(어깨)', '아놀드프레스'],
    yt: '숄더프레스 자세',
  },
  dumbbellShoulderPress: {
    name: '덤벨프레스(어깨)',
    en: 'Dumbbell Shoulder Press',
    pattern: 'vertPress',
    group: '어깨',
    target: '어깨·삼두',
    equipment: '덤벨',
    breathing: '밀 때 내쉬고, 내릴 때 들이마신다',
    cues: [
      '덤벨은 어깨높이에서 시작해 손바닥이 앞을 보게 한다',
      '팔꿈치를 몸통보다 약간 앞에 두어 어깨를 보호한다',
      '위에서 덤벨을 살짝 모으듯 밀어 올린다',
    ],
    mistakes: ['무게에 밀려 허리가 젖혀지기', '덤벨을 부딪히며 반동 쓰기'],
    alt: ['숄더프레스 머신', '아놀드프레스'],
    yt: '덤벨 숄더프레스 자세',
  },
  legPress: {
    name: '레그프레스',
    en: 'Leg Press',
    pattern: 'legExtend',
    group: '하체',
    target: '허벅지·엉덩이',
    equipment: '머신',
    breathing: '밀 때 내쉬고, 내릴 때 들이마신다',
    cues: [
      '발은 발판 중앙에 어깨너비로, 발 전체로 민다',
      '무릎이 90도 근처까지 오도록 내린다',
      '엉덩이와 허리가 등판에서 떨어지지 않게 유지한다',
      '무릎을 완전히 펴 잠그지 않는다',
    ],
    mistakes: ['너무 깊이 내려 골반이 말리기', '무릎이 안쪽으로 무너지기', '발뒤꿈치가 들리기'],
    alt: ['스쿼트', '핵스쿼트'],
    yt: '레그프레스 자세',
  },
  legExtension: {
    name: '레그익스텐션',
    en: 'Leg Extension',
    pattern: 'legExtend',
    group: '하체',
    target: '허벅지 앞(대퇴사두)',
    equipment: '머신',
    breathing: '펼 때 내쉬고, 내릴 때 들이마신다',
    cues: [
      '무릎 관절이 머신 회전축과 일치하게 시트를 맞춘다',
      '패드는 발목 위쪽에 걸고 발끝을 몸쪽으로 당긴다',
      '끝에서 1초 멈추고 허벅지 앞을 조인다',
    ],
    mistakes: ['반동으로 차올리기', '엉덩이가 시트에서 들리기', '너무 무거워 무릎이 아픈 상태로 진행'],
    alt: ['스쿼트', '레그프레스'],
    yt: '레그익스텐션 자세',
  },
  legCurl: {
    name: '레그컬',
    en: 'Leg Curl',
    pattern: 'legCurl',
    group: '하체',
    target: '허벅지 뒤(햄스트링)',
    equipment: '머신',
    breathing: '접을 때 내쉬고, 펼 때 들이마신다',
    cues: [
      '무릎이 패드 끝에서 살짝 벗어나게 눕거나 앉는다',
      '골반을 고정하고 무릎만 접는다',
      '돌아올 때 천천히 버티며 늘인다',
    ],
    mistakes: ['엉덩이를 들어 반동 쓰기', '가동범위 반만 쓰기'],
    alt: ['루마니안 데드리프트', '힙 브릿지'],
    yt: '레그컬 자세',
  },
  latPulldown: {
    name: '랫풀다운',
    en: 'Lat Pulldown',
    pattern: 'vertPull',
    group: '등',
    target: '등(광배)·이두',
    equipment: '머신',
    breathing: '당길 때 내쉬고, 올릴 때 들이마신다',
    cues: [
      '손은 어깨너비보다 조금 넓게, 무릎 패드로 몸을 고정한다',
      '팔로 당기기 전에 어깨를 아래로 내린다',
      '바를 가슴 위쪽까지 당기고 등을 조인다',
      '상체는 10~20도만 뒤로 기울인다',
    ],
    mistakes: ['목 뒤로 당기기', '몸을 크게 흔들어 반동 쓰기', '팔만 써서 등 자극이 없는 상태'],
    alt: ['풀업(보조밴드)', '어시스트 풀업 머신', '시티드 로우'],
    yt: '랫풀다운 자세',
  },
  row: {
    name: '로우(바벨·케이블)',
    en: 'Row',
    pattern: 'horizPull',
    group: '등',
    target: '등 중간·이두',
    equipment: '바벨 / 케이블',
    breathing: '당길 때 내쉬고, 보낼 때 들이마신다',
    cues: [
      '엉덩이를 뒤로 접어 상체를 45도 정도 숙인다(케이블은 앉아서 곧게)',
      '팔꿈치를 몸통 옆으로 스치듯 뒤로 당긴다',
      '배꼽 근처로 당기고 어깨날개를 모은다',
    ],
    mistakes: ['허리를 말고 당기기', '상체를 크게 세우며 반동 쓰기', '어깨가 앞으로 말린 상태로 당기기'],
    alt: ['시티드 케이블 로우', '덤벨 원암 로우', '머신 로우'],
    yt: '바벨로우 자세',
  },
  lateralRaise: {
    name: '래터럴레이즈',
    en: 'Lateral Raise',
    pattern: 'raise',
    group: '어깨',
    target: '어깨 측면',
    equipment: '덤벨 / 머신',
    breathing: '들어 올릴 때 내쉰다',
    cues: [
      '가벼운 무게로 시작한다(반동이 나오면 무게가 무거운 것)',
      '팔꿈치를 살짝 굽힌 채 어깨높이까지만 올린다',
      '새끼손가락이 살짝 위를 향하도록 든다',
      '내릴 때 3초 정도 천천히 버틴다',
    ],
    mistakes: ['무릎·허리 반동으로 올리기', '어깨보다 높이 들어 승모근이 개입하기', '손목으로 들어 올리기'],
    alt: ['케이블 래터럴레이즈', '머신 래터럴레이즈'],
    yt: '래터럴레이즈 자세',
  },
  crunch: {
    name: '크런치',
    en: 'Crunch',
    pattern: 'crunch',
    group: '코어',
    target: '복근 상부',
    equipment: '맨몸 / 매트',
    breathing: '올라올 때 후- 내쉬고, 내려갈 때 들이마신다',
    cues: [
      '허리는 바닥에 붙인 채 갈비뼈를 골반 쪽으로 말아 올린다',
      '어깨날개가 바닥에서 떨어질 정도만 올린다',
      '손으로 목을 당기지 않고 손은 귀 옆에 가볍게 둔다',
    ],
    mistakes: ['목을 손으로 당기기', '반동으로 튕겨 올라오기', '허리를 띄운 채 진행'],
    alt: ['플랭크', '데드버그', '케이블 크런치'],
    yt: '크런치 정확한 자세',
  },
  legRaise: {
    name: '레그레이즈',
    en: 'Leg Raise',
    pattern: 'legRaise',
    group: '코어',
    target: '복근 하부',
    equipment: '맨몸 / 매트',
    breathing: '다리를 올릴 때 내쉰다',
    cues: [
      '손은 엉덩이 옆 바닥을 눌러 허리를 지지한다',
      '허리가 뜨지 않는 범위까지만 다리를 내린다',
      '다리를 곧게 두기 어려우면 무릎을 살짝 굽힌다',
    ],
    mistakes: ['허리가 활처럼 뜨는 자세', '반동으로 다리 던지기'],
    alt: ['리버스 크런치', '행잉 니레이즈', '데드버그'],
    yt: '레그레이즈 자세',
  },
  pushup: {
    name: '푸쉬업',
    en: 'Push-up',
    pattern: 'pushup',
    group: '가슴',
    target: '가슴·삼두·코어',
    equipment: '맨몸',
    breathing: '내릴 때 들이마시고, 밀 때 내쉰다',
    cues: [
      '손은 어깨보다 약간 넓게, 손목은 어깨 아래',
      '머리-엉덩이-발목이 한 줄이 되게 유지한다',
      '가슴이 주먹 하나 높이까지 내려온다',
      '힘들면 무릎을 대거나 벤치에 손을 올려 각도를 낮춘다',
    ],
    mistakes: ['엉덩이가 처지거나 솟는 자세', '팔꿈치를 90도로 옆으로 벌리기', '목만 먼저 내려가기'],
    alt: ['무릎 푸쉬업', '인클라인 푸쉬업', '체스트프레스'],
    yt: '푸쉬업 정확한 자세',
  },
  treadmillWalk: {
    name: '러닝머신 걷기(경사)',
    en: 'Incline Treadmill Walk',
    pattern: 'walk',
    group: '유산소',
    target: '심장·엉덩이·종아리',
    equipment: '러닝머신',
    breathing: '코로 들이마시고 입으로 길게 내쉬기',
    cues: [
      '손잡이를 잡지 않고 팔을 자연스럽게 흔든다',
      '상체를 세우고 발 전체로 딛는다',
      '대화가 겨우 가능한 정도의 숨이면 적정 강도',
    ],
    mistakes: ['손잡이에 체중을 싣기', '상체를 앞으로 기울이기', '발끝만 딛기'],
    alt: ['실외 언덕 걷기', '스텝밀', '사이클'],
    yt: '경사 걷기 러닝머신 자세',
  },
  treadmillRun: {
    name: '러닝머신 달리기',
    en: 'Treadmill Run',
    pattern: 'run',
    group: '유산소',
    target: '심장·하체',
    equipment: '러닝머신',
    breathing: '리듬을 정해 규칙적으로(2보 들이마시고 2보 내쉬기)',
    cues: [
      '시선은 정면, 어깨는 편하게 내린다',
      '발은 몸 아래쪽에 착지시켜 보폭을 과하게 늘리지 않는다',
      '분당 170~180보 정도의 가벼운 리듬을 유지한다',
    ],
    mistakes: ['보폭을 너무 크게 벌리기', '발뒤꿈치로 강하게 찍기', '주먹과 어깨에 힘 주기'],
    alt: ['사이클', '일립티컬', '빠르게 걷기'],
    yt: '러닝머신 달리기 자세',
  },
};

// 스트레칭 시퀀스 — 타이머가 순서대로 안내한다.
export const STRETCH_SEQUENCE = {
  short: [
    { name: '목·어깨 돌리기', sec: 30, tip: '천천히 크게 원을 그린다' },
    { name: '팔 벌려 가슴 열기', sec: 30, tip: '가슴 앞이 시원하게 열리는 느낌' },
    { name: '허리 좌우 비틀기', sec: 30, tip: '골반은 고정하고 상체만' },
    { name: '햄스트링 늘이기', sec: 30, tip: '무릎을 살짝 굽혀도 좋다' },
    { name: '무릎 굽혀 앉기(맨몸 스쿼트)', sec: 40, tip: '가동범위를 넓혀 가며 10회' },
  ],
  full: [
    { name: '제자리 걷기·팔 흔들기', sec: 60, tip: '체온을 먼저 올린다' },
    { name: '목·어깨 돌리기', sec: 30, tip: '천천히 크게 원을 그린다' },
    { name: '팔 벌려 가슴 열기', sec: 30, tip: '가슴 앞이 시원하게 열리는 느낌' },
    { name: '어깨 회전(팔 크게 돌리기)', sec: 30, tip: '앞으로 15초, 뒤로 15초' },
    { name: '허리 좌우 비틀기', sec: 30, tip: '골반은 고정하고 상체만' },
    { name: '엉덩이·고관절 늘이기', sec: 40, tip: '좌우 각 20초' },
    { name: '햄스트링 늘이기', sec: 40, tip: '좌우 각 20초, 무릎 살짝 굽혀도 좋다' },
    { name: '종아리 늘이기', sec: 30, tip: '뒤꿈치를 바닥에 붙인다' },
    { name: '맨몸 스쿼트 10회', sec: 40, tip: '가동범위를 넓혀 가며' },
  ],
};

export function stretchSequence(level) {
  return STRETCH_SEQUENCE[level] || STRETCH_SEQUENCE.full;
}

export function exerciseOf(key) {
  return EXERCISES[key] || { name: key, cues: [], mistakes: [], alt: [], pattern: 'squat' };
}

export function youtubeSearchUrl(key) {
  const ex = exerciseOf(key);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.yt || ex.name)}`;
}
