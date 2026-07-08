import { LevaPanel, useControls, useCreateStore } from 'leva';
import Preview2D from './components/Preview2D';
import Preview3D from './components/Preview3D';
import './App.css';

export default function App() {
  const store = useCreateStore();

  // Leva 사이드바 컨트롤 — 이 값들이 앱의 단일 상태 소스(state)가 된다.
  // image: 업로드 시 object URL 문자열이 상태로 저장된다.
  const { image, scale, spacingX, spacingY, threshold, symmetryType } =
    useControls(
      {
        image: { image: undefined, label: '이미지 업로드' },
        scale: { value: 1, min: 0.1, max: 3, step: 0.05, label: '크기 (Scale)' },
        spacingX: { value: 0, min: 0, max: 200, step: 1, label: '가로 간격' },
        spacingY: { value: 0, min: 0, max: 200, step: 1, label: '세로 간격' },
        threshold: { value: 96, min: 0, max: 254, step: 1, label: '망점 임계값' },
        symmetryType: {
          value: 'Standard',
          options: ['Standard', 'Mirror', 'Halftone'],
          label: '패턴 방식',
        },
      },
      { store },
    );

  return (
    <div className="app">
      <aside className="app__sidebar">
        <h1 className="app__title">패턴 제너레이터</h1>
        <p className="app__subtitle">이미지 기반 패턴 생성 & 3D 목업</p>
        <LevaPanel store={store} fill flat titleBar={false} />
      </aside>
      <main className="app__previews">
        <Preview2D
          imageUrl={image}
          scale={scale}
          spacingX={spacingX}
          spacingY={spacingY}
          threshold={threshold}
          symmetryType={symmetryType}
        />
        <Preview3D imageUrl={image} />
      </main>
    </div>
  );
}
