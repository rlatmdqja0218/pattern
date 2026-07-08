# 패턴 제너레이터 & 3D 목업 (Pattern Generator)

사용자가 업로드한 이미지를 기반으로 패턴을 생성하고, 생성된 패턴을 가전제품 등
실물 제품의 3D 목업 표면에 적용해 보는 웹 애플리케이션입니다.
(기획 근거: "사용자 업로드 이미지 기반 패턴 제너레이터 웹 애플리케이션" 최종 기획 보고서)

현재는 **프론트엔드 기초 뼈대(scaffold) 단계**이며, 패턴 알고리즘(심리스 타일링,
망점 등)은 아직 구현되지 않았습니다.

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

- **사이드바 컨트롤 패널** (Leva, 좌측 320px)
  - 이미지 업로드 (클릭 또는 드래그 앤 드롭 → object URL이 상태로 저장)
  - 크기 (Scale) 슬라이더: 0.1 ~ 3
  - 간격 (Spacing) 슬라이더: 0 ~ 200px (타일링 구현 시 사용 예정)
- **2D 패턴 프리뷰** (react-konva Stage)
  - 업로드된 이미지를 Scale 값에 맞춰 중앙에 렌더링
- **3D 목업 프리뷰** (@react-three/fiber Canvas)
  - 회전하는 박스 플레이스홀더. 업로드 이미지가 표면 텍스처로 적용되어
    상태 연결을 확인할 수 있음

## 프로젝트 구조

```
src/
├── App.jsx                  # 레이아웃 + Leva 컨트롤(상태 소스)
├── components/
│   ├── Preview2D.jsx        # 2D Canvas 프리뷰 (react-konva)
│   └── Preview3D.jsx        # 3D Mockup 프리뷰 (r3f) — 임시 박스
└── hooks/
    ├── useHtmlImage.js      # URL → HTMLImageElement 로더
    └── useElementSize.js    # ResizeObserver 기반 컨테이너 크기 추적
```

## 다음 단계 (로드맵)

1. 2D 프리뷰에 타일링(격자/벽돌/미러링) 렌더링 — Spacing 파라미터 연결
2. 심리스(Seamless) 메타 타일 생성 알고리즘 (미러링 대칭)
3. 망점(Halftone) 등 픽셀 재해석 애드온
4. 3D 목업을 실제 가전제품 형태 모델 + 심리스 텍스처 래핑으로 교체
5. OffscreenCanvas 기반 고해상도 익스포트 파이프라인
