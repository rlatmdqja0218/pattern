# 패턴 제너레이터 & 3D 목업 (Pattern Generator)

사용자가 업로드한 이미지를 기반으로 패턴을 생성하고, 생성된 패턴을 가전제품 등
실물 제품의 3D 목업 표면에 적용해 보는 웹 애플리케이션입니다.
(기획 근거: "사용자 업로드 이미지 기반 패턴 제너레이터 웹 애플리케이션" 최종 기획 보고서)

이 프로젝트는 단순히 이미지를 반복 배치하는 도구가 아니라, 업로드된 이미지를
**픽셀 데이터로 해체하고 명도·색상 정보를 새로운 조형 규칙으로 재구성**하는
디자인 도구입니다. 데이터 흐름: `이미지 → ImageData → 조형 규칙(엔진) → 조절 가능한 패턴`

## 기술 스택

| 영역 | 라이브러리 |
| --- | --- |
| 프레임워크 | React 19 + Vite |
| 사이드바 컨트롤 패널 | [Leva](https://github.com/pmndrs/leva) |
| 2D 캔버스 프리뷰 | [Konva](https://konvajs.org/) + react-konva |
| 3D 목업 뷰어 | [Three.js](https://threejs.org/) + @react-three/fiber |

## 실행 방법

```bash
npm install
npm run dev     # 개발 서버 (http://localhost:5173)
npm run build   # 프로덕션 빌드
```

## 현재 구현된 것

- **이미지 분석 엔진** (`engines/imageAnalysis.js`)
  - 업로드 이미지를 최대 1000px로 축소해 오프스크린 캔버스에서 ImageData 추출
  - 좌표별 RGB / 명도(Rec.709) / 셀 영역 평균색 계산
- **Halftone(망점) 패턴 엔진** (`engines/patternHalftone.js`)
  - 회전 가능한 샘플링 그리드 순회 → 명도를 점 반지름으로 매핑 → 점 데이터 배열 생성 → 캔버스 렌더링
  - 순수 함수 구조 (추후 Web Worker 분리 용이)
- **사이드바 컨트롤 패널** (Leva)
  - 이미지 업로드, 패턴 모드(halftone / standard / mirror),
    점 간격 · 최소/최대 반지름 · 명도 기준값 · 명도 반전 · 그리드 각도 ·
    점/배경 색상 · 원본 색상 사용
  - 값 변경 시 2D 캔버스 즉시 재렌더링
- **3D 목업 프리뷰** (@react-three/fiber) — 회전 박스 플레이스홀더 (다음 단계에서 패턴 텍스처 연결)

## 프로젝트 구조

```
src/
├── App.jsx                    # 레이아웃 + Leva 컨트롤(단일 상태 소스)
├── components/
│   ├── PatternCanvas.jsx      # 2D 패턴 캔버스 — canvas ref 관리 + 재렌더링 타이밍만 담당
│   └── MockupViewer.jsx       # 3D Mockup 프리뷰 (r3f) — 임시 박스
├── engines/                   # 알고리즘 (컴포넌트와 분리, 순수 함수 지향)
│   ├── index.js               # mode → 렌더러 레지스트리
│   ├── imageAnalysis.js       # 이미지 → ImageData, 명도/평균색 계산
│   ├── patternHalftone.js     # 망점: 그리드 샘플링 → 반지름 매핑 → 렌더링
│   ├── patternStandard.js     # 격자 반복 (스텁, 다음 단계)
│   └── patternMirror.js       # 심리스 미러링 (스텁, 다음 단계)
├── state/
│   └── patternDefaults.js     # Leva 컨트롤 스키마 + 파라미터 기본값
└── hooks/
    └── useElementSize.js      # ResizeObserver 기반 컨테이너 크기 추적
```

## 다음 단계 (로드맵)

1. Standard(격자 반복) / Mirror(심리스 메타 타일) 렌더러 구현 — 레지스트리에 등록만 하면 연결됨
2. 3D 목업에 PatternCanvas 결과를 `THREE.CanvasTexture`로 래핑
3. 픽셀 순회 연산 Web Worker 분리 (엔진이 이미 DOM 독립적이라 이전 용이)
4. OffscreenCanvas 기반 고해상도 익스포트 파이프라인
