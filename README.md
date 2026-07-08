# 패턴 제너레이터 & 3D 목업 (Pattern Generator)

사용자가 업로드한 이미지를 기반으로 패턴을 생성하고, 생성된 패턴을 가전제품 등
실물 제품의 3D 목업 표면에 적용해 보는 웹 애플리케이션입니다.
(기획 근거: "사용자 업로드 이미지 기반 패턴 제너레이터 웹 애플리케이션" 최종 기획 보고서)

현재는 업로드 이미지 기반 **실시간 2D 패턴 엔진**과 3D 목업 연결을 갖춘
프로토타입 단계입니다. Standard 타일링, Mirror 심리스 타일링, Halftone 픽셀
재해석을 사이드바 파라미터로 조정할 수 있습니다.

## 기술 스택

| 영역 | 라이브러리 |
| --- | --- |
| 프레임워크 | React 19 + Vite |
| 사이드바 컨트롤 패널 | [Leva](https://github.com/pmndrs/leva) |
| 2D 캔버스 프리뷰 | HTML5 Canvas API + OffscreenCanvas |
| 3D 목업 뷰어 | [Three.js](https://threejs.org/) + @react-three/fiber |

## 실행 방법

```bash
npm install
npm run dev     # 개발 서버 (http://localhost:5173)
npm run build   # 프로덕션 빌드
```

## 현재 구현된 것

- **사이드바 컨트롤 패널** (Leva, 좌측 320px)
  - 이미지 업로드 (클릭 또는 드래그 앤 드롭 → object URL이 상태로 저장)
  - 크기 (Scale) 슬라이더: 0.1 ~ 3
  - 가로/세로 간격 슬라이더: 0 ~ 200px
  - 망점 임계값(Threshold): 0 ~ 254
  - 패턴 방식: Standard / Mirror / Halftone
- **2D 패턴 프리뷰** (HTML5 Canvas)
  - 업로드 이미지를 오프스크린 캔버스에 그리고 `getImageData()`로 RGBA 픽셀 배열 확보
  - `requestAnimationFrame` 기반으로 파라미터 변경 시 재렌더링
  - Standard: 2중 루프 기반 그리드 타일링
  - Mirror: 원본/좌우반전/상하반전/상하좌우반전 2x2 메타 타일 반복
  - Halftone: 픽셀 명도를 원 반지름으로 매핑해 망점 렌더링
- **3D 목업 프리뷰** (@react-three/fiber Canvas)
  - 회전하는 박스 플레이스홀더. 업로드 이미지가 표면 텍스처로 적용되어
    상태 연결을 확인할 수 있음

## 프로젝트 구조

```
src/
├── App.jsx                  # 레이아웃 + Leva 컨트롤(상태 소스)
├── components/
│   ├── Preview2D.jsx        # 2D Canvas 프리뷰
│   └── Preview3D.jsx        # 3D Mockup 프리뷰 (r3f) — 임시 박스
├── core/
│   └── patternEngine.js     # 타일링/미러링/망점 렌더링 엔진
└── hooks/
    ├── useHtmlImage.js      # URL → HTMLImageElement 로더
    └── useElementSize.js    # ResizeObserver 기반 컨테이너 크기 추적
```

## 다음 단계 (로드맵)

1. 2D 렌더 결과를 3D 목업 텍스처로 직접 연결
2. 벽돌/육각/회전 등 추가 타일링 방식
3. Web Worker 기반 픽셀 연산 분리
4. 3D 목업을 실제 가전제품 형태 모델 + 심리스 텍스처 래핑으로 교체
5. OffscreenCanvas 기반 고해상도 익스포트 파이프라인
