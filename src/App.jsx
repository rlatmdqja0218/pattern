import { LevaPanel, useControls, useCreateStore } from 'leva';
import { useCallback, useState } from 'react';
import PatternCanvas from './components/PatternCanvas';
import MockupViewer from './components/MockupViewer';
import VectorEditorCanvas from './components/VectorEditorCanvas';
import { patternControlSchema } from './state/patternDefaults';
import './App.css';

export default function App() {
  const store = useCreateStore();
  const [, setEditablePath] = useState(null);

  // Leva 사이드바 컨트롤 — 이 값들이 앱의 단일 상태 소스(state)가 된다.
  // image: 업로드 시 object URL 문자열이 상태로 저장된다.
  // 나머지 패턴 파라미터 스키마는 state/patternDefaults.js에서 관리한다.
  const { image, ...params } = useControls(
    {
      image: { image: undefined, label: '이미지 업로드' },
      ...patternControlSchema,
    },
    { store },
  );

  const handlePathChange = useCallback((pathData) => {
    setEditablePath(pathData);
  }, []);

  return (
    <div className="app">
      <aside className="app__sidebar">
        <h1 className="app__title">패턴 제너레이터</h1>
        <p className="app__subtitle">이미지 기반 패턴 생성 & 3D 목업</p>
        <LevaPanel store={store} fill flat titleBar={false} />
      </aside>
      <main className="app__previews">
        <PatternCanvas imageUrl={image} params={params} />
        <VectorEditorCanvas imageUrl={image} onPathChange={handlePathChange} />
        <MockupViewer imageUrl={image} />
      </main>
    </div>
  );
}
