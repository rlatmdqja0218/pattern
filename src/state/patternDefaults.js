/**
 * 패턴 파라미터 기본값 및 Leva 컨트롤 스키마
 *
 * 사이드바(Leva)의 조절값 정의를 한곳에 모아,
 * 컴포넌트와 알고리즘 양쪽에서 동일한 파라미터 이름을 공유한다.
 * render 조건으로 현재 mode와 관련 있는 컨트롤만 노출한다.
 */

const isHalftone = (get) => get('mode') === 'halftone';
const isTiling = (get) => ['standard', 'mirror'].includes(get('mode'));
const isVector = (get) => get('mode') === 'vector';

/** Leva useControls에 그대로 전달하는 스키마 */
export const patternControlSchema = {
  mode: {
    value: 'halftone',
    options: ['halftone', 'standard', 'mirror', 'vector'],
    label: '패턴 모드',
  },

  // — Halftone(망점) 전용 —
  dotSpacing: {
    value: 10, min: 3, max: 60, step: 1,
    label: '점 간격', render: isHalftone,
  },
  minRadius: {
    value: 0.4, min: 0, max: 10, step: 0.1,
    label: '최소 반지름', render: isHalftone,
  },
  maxRadius: {
    value: 5.5, min: 0.5, max: 30, step: 0.5,
    label: '최대 반지름', render: isHalftone,
  },
  threshold: {
    value: 0.04, min: 0, max: 1, step: 0.01,
    label: '명도 기준값', render: isHalftone,
  },
  invert: { value: false, label: '명도 반전', render: isHalftone },
  angle: {
    value: 0, min: 0, max: 90, step: 1,
    label: '그리드 각도', render: isHalftone,
  },
  foregroundColor: { value: '#16181d', label: '점 색상', render: isHalftone },
  useSourceColor: { value: false, label: '원본 색상 사용', render: isHalftone },

  // — Standard / Mirror(타일링) 전용 —
  tileScale: {
    value: 0.5, min: 0.05, max: 3, step: 0.05,
    label: '타일 배율', render: isTiling,
  },
  tileSpacing: {
    value: 0, min: 0, max: 200, step: 1,
    label: '타일 간격', render: isTiling,
  },

  // — Vector(편집 경로 모티프) 전용 —
  motifScale: {
    value: 0.55, min: 0.05, max: 3, step: 0.05,
    label: '모티프 크기', render: isVector,
  },
  motifSpacingX: {
    value: 56, min: 0, max: 300, step: 1,
    label: '모티프 가로 간격', render: isVector,
  },
  motifSpacingY: {
    value: 48, min: 0, max: 300, step: 1,
    label: '모티프 세로 간격', render: isVector,
  },
  motifRotation: {
    value: 0, min: -180, max: 180, step: 1,
    label: '모티프 회전', render: isVector,
  },
  motifStrokeWidth: {
    value: 2, min: 0.25, max: 20, step: 0.25,
    label: '모티프 선 두께', render: isVector,
  },
  motifStrokeColor: {
    value: '#1f8fff',
    label: '모티프 선 색상',
    render: isVector,
  },
  motifFillEnabled: {
    value: false,
    label: '모티프 내부 채움',
    render: isVector,
  },
  motifFillColor: {
    value: '#1f8fff',
    label: '모티프 내부 색상',
    render: isVector,
  },
  motifOpacity: {
    value: 1, min: 0.05, max: 1, step: 0.05,
    label: '모티프 투명도', render: isVector,
  },
  traceMode: {
    value: 'auto',
    options: ['auto', 'manual'],
    label: '윤곽 추출 모드',
    render: isVector,
  },
  traceThreshold: {
    value: 0.52, min: 0, max: 1, step: 0.01,
    label: '윤곽 기준값',
    render: isVector,
  },
  traceSimplify: {
    value: 10, min: 1, max: 40, step: 1,
    label: '윤곽 단순화',
    render: isVector,
  },
  traceInvert: {
    value: false,
    label: '윤곽 반전',
    render: isVector,
  },
  traceMaxSegments: {
    value: 96, min: 8, max: 240, step: 1,
    label: '최대 앵커 수',
    render: isVector,
  },
  curveMode: {
    value: 'straight',
    options: ['straight', 'smooth'],
    label: '곡선화 방식',
    render: isVector,
  },
  curveSmoothness: {
    value: 0.45, min: 0, max: 1, step: 0.05,
    label: '곡선 부드러움',
    render: isVector,
  },
  curveSimplifyTolerance: {
    value: 2, min: 0, max: 20, step: 0.5,
    label: '곡선 단순화',
    render: isVector,
  },

  // — 공통 —
  backgroundColor: { value: '#f5f1e8', label: '배경 색상' },
};

/** 스키마에서 순수 기본값 객체를 추출 (테스트/워커 등 비-Leva 환경용) */
export const patternDefaults = Object.fromEntries(
  Object.entries(patternControlSchema).map(([key, def]) => [key, def.value]),
);
