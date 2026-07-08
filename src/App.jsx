import { LevaPanel, useControls, useCreateStore } from 'leva';
import { useCallback, useMemo, useState } from 'react';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels';
import PatternCanvas from './components/PatternCanvas';
import MockupViewer from './components/MockupViewer';
import VectorEditorCanvas from './components/VectorEditorCanvas';
import { patternControlSchema } from './state/patternDefaults';
import './App.css';

export default function App() {
  const store = useCreateStore();
  const [editablePath, setEditablePath] = useState(null);
  const [selectedMotifs, setSelectedMotifs] = useState([]);
  const [patternCanvas, setPatternCanvas] = useState(null);
  const [patternVersion, setPatternVersion] = useState(0);

  // Leva 사이드바 컨트롤 — 이 값들이 앱의 단일 상태 소스(state)가 된다.
  // image: 업로드 시 object URL 문자열이 상태로 저장된다.
  // 나머지 패턴 파라미터 스키마는 state/patternDefaults.js에서 관리한다.
  const { image, ...rawParams } = useControls(
    {
      image: { image: undefined, label: '이미지 업로드' },
      ...patternControlSchema,
    },
    { store },
  );
  const paramsKey = JSON.stringify(rawParams);
  const params = useMemo(() => JSON.parse(paramsKey), [paramsKey]);

  const handlePathChange = useCallback((pathData) => {
    setEditablePath(pathData);
  }, []);

  const handleMotifsChange = useCallback((motifs) => {
    setSelectedMotifs(motifs);
  }, []);

  const handlePatternCanvasUpdate = useCallback((canvas) => {
    setPatternCanvas((currentCanvas) => (
      currentCanvas === canvas ? currentCanvas : canvas
    ));
    setPatternVersion((currentVersion) => currentVersion + 1);
  }, []);

  return (
    <div className="app">
      <aside className="app__sidebar">
        <h1 className="app__title">패턴 제너레이터</h1>
        <p className="app__subtitle">이미지 기반 패턴 생성 & 3D 목업</p>
        <LevaPanel store={store} fill flat titleBar={false} />
      </aside>
      <main className="app__previews">
        <PanelGroup
          orientation="vertical"
          defaultLayout={{ pattern: 30, vector: 45, mockup: 25 }}
          className="app__panel-group"
        >
          <Panel id="pattern" defaultSize="30%" minSize="12%" className="app__panel">
            <PatternCanvas
              imageUrl={image}
              params={params}
              editablePath={editablePath}
              selectedMotifs={selectedMotifs}
              onPatternCanvasUpdate={handlePatternCanvasUpdate}
            />
          </Panel>
          <PanelResizeHandle className="app__resize-handle" />
          <Panel id="vector" defaultSize="45%" minSize="15%" className="app__panel">
            <VectorEditorCanvas
              imageUrl={image}
              params={params}
              onPathChange={handlePathChange}
              onMotifsChange={handleMotifsChange}
            />
          </Panel>
          <PanelResizeHandle className="app__resize-handle" />
          <Panel id="mockup" defaultSize="25%" minSize="12%" className="app__panel">
            <MockupViewer patternCanvas={patternCanvas} patternVersion={patternVersion} />
          </Panel>
        </PanelGroup>
      </main>
    </div>
  );
}
