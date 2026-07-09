import { LevaPanel, useControls, useCreateStore } from 'leva';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PatternCanvas from './components/PatternCanvas';
import MockupViewer from './components/MockupViewer';
import VectorEditorCanvas from './components/VectorEditorCanvas';
import { patternControlSchema } from './state/patternDefaults';
import { PATTERN_PRESETS } from './state/patternPresets';
import { getStlMappingPresetValues } from './engines/stlMapping';
import { usePersistentLayout } from './hooks/usePersistentLayout';
import { useSplitterDrag } from './hooks/useResizablePanels';
import './App.css';

const controlSchema = {
  image: { image: undefined, label: '이미지 업로드' },
  ...patternControlSchema,
};

// splitter 드래그 시 패널 최소 크기(px)
const MIN_LEFT_STACK_WIDTH = 420;
const MIN_MOCKUP_WIDTH = 360;
const MIN_PATTERN_HEIGHT = 180;
const MIN_VECTOR_HEIGHT = 260;

function doesPresetMatchParams(preset, params) {
  return Object.entries(preset).every(([key, value]) => params[key] === value);
}

function didParamsChange(previousParams, nextParams, preset) {
  if (!previousParams) return false;
  return Object.keys(preset).some((key) => previousParams[key] !== nextParams[key]);
}

export default function App() {
  const store = useCreateStore();
  const applyingPresetRef = useRef(false);
  const previousPresetRef = useRef('custom');
  const previousParamsRef = useRef(null);
  const previousStlMappingPresetRef = useRef('frontPanel');
  const [editablePath, setEditablePath] = useState(null);
  const [selectedMotifs, setSelectedMotifs] = useState([]);
  const [patternCanvas, setPatternCanvas] = useState(null);
  const [patternVersion, setPatternVersion] = useState(0);
  const [patternImageData, setPatternImageData] = useState(null);
  // 업로드된 STL의 object URL — customStl 목업 모드에서 사용
  const [stlUrl, setStlUrl] = useState(null);
  const stlUrlRef = useRef(null);

  // 워크스페이스 레이아웃: 분할 비율 + 패널 접힘 상태 (localStorage 유지)
  const { layout, setRatio, togglePanel } = usePersistentLayout();
  const { workspaceLeftRatio, leftStackTopRatio, collapsedPanels } = layout;
  const patternCollapsed = collapsedPanels.pattern2d;
  const vectorCollapsed = collapsedPanels.vectorEditor;
  const mockupCollapsed = collapsedPanels.mockup3d;

  const workspaceRef = useRef(null);
  const leftStackRef = useRef(null);

  const handleWorkspaceSplit = useSplitterDrag({
    containerRef: workspaceRef,
    direction: 'horizontal',
    minStart: MIN_LEFT_STACK_WIDTH,
    minEnd: MIN_MOCKUP_WIDTH,
    onRatioChange: useCallback(
      (ratio) => setRatio('workspaceLeftRatio', ratio),
      [setRatio],
    ),
  });
  const handleLeftStackSplit = useSplitterDrag({
    containerRef: leftStackRef,
    direction: 'vertical',
    minStart: MIN_PATTERN_HEIGHT,
    minEnd: MIN_VECTOR_HEIGHT,
    onRatioChange: useCallback(
      (ratio) => setRatio('leftStackTopRatio', ratio),
      [setRatio],
    ),
  });

  // Leva 사이드바 컨트롤 — 이 값들이 앱의 단일 상태 소스(state)가 된다.
  // image: 업로드 시 object URL 문자열이 상태로 저장된다.
  // 나머지 패턴 파라미터 스키마는 state/patternDefaults.js에서 관리한다.
  const [controlValues, setControls] = useControls(
    () => controlSchema,
    { store },
  );
  const { image, ...rawParams } = controlValues;
  const paramsKey = JSON.stringify(rawParams);
  const params = useMemo(() => JSON.parse(paramsKey), [paramsKey]);

  useEffect(() => {
    const presetKey = rawParams.patternPreset;
    const preset = PATTERN_PRESETS[presetKey];
    const rememberParams = () => {
      previousParamsRef.current = rawParams;
    };

    if (rawParams.mode !== 'vector' || !preset) {
      applyingPresetRef.current = false;
      previousPresetRef.current = presetKey;
      rememberParams();
      return;
    }

    const presetChanged = previousPresetRef.current !== presetKey;
    const matchesPreset = doesPresetMatchParams(preset, rawParams);
    const userChangedParams = previousParamsRef.current?.patternPreset === presetKey
      && didParamsChange(previousParamsRef.current, rawParams, preset);

    if (presetChanged) {
      applyingPresetRef.current = !matchesPreset;
      previousPresetRef.current = presetKey;
      if (!matchesPreset) {
        setControls(preset);
      }
      rememberParams();
      return;
    }

    if (applyingPresetRef.current) {
      if (matchesPreset) {
        applyingPresetRef.current = false;
      } else {
        setControls(preset);
      }
      rememberParams();
      return;
    }

    if (userChangedParams || !matchesPreset) {
      previousPresetRef.current = 'custom';
      setControls({ patternPreset: 'custom' });
      rememberParams();
      return;
    }

    rememberParams();
  }, [rawParams, setControls]);

  useEffect(() => {
    const preset = rawParams.stlMappingPreset ?? 'frontPanel';
    if (previousStlMappingPresetRef.current === preset) return;
    previousStlMappingPresetRef.current = preset;
    setControls(getStlMappingPresetValues(preset));
  }, [rawParams.stlMappingPreset, setControls]);

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

  const handlePatternSourceUpdate = useCallback((imageData) => {
    setPatternImageData(imageData);
  }, []);

  const handleStlUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (stlUrlRef.current) URL.revokeObjectURL(stlUrlRef.current);
    const url = URL.createObjectURL(file);
    stlUrlRef.current = url;
    setStlUrl(url);
    // customStl 모드로 자동 전환해 업로드 결과가 바로 보이게 한다
    setControls({ mockupMode: 'customStl' });
  }, [setControls]);

  const handleResetStlMapping = useCallback(() => {
    setControls(getStlMappingPresetValues(rawParams.stlMappingPreset));
  }, [rawParams.stlMappingPreset, setControls]);

  // 접힘 상태에 따른 컬럼/셀 크기: 접힌 쪽은 최소만 남기고
  // 나머지 패널이 flexGrow로 남은 공간을 차지한다.
  const leftColumnStyle = mockupCollapsed
    ? { flexGrow: 1, flexBasis: 0, minWidth: MIN_LEFT_STACK_WIDTH }
    : {
        flexGrow: workspaceLeftRatio,
        flexBasis: 0,
        minWidth: MIN_LEFT_STACK_WIDTH,
      };
  const rightColumnStyle = mockupCollapsed
    ? { flex: '0 0 240px', minWidth: 0 }
    : {
        flexGrow: 1 - workspaceLeftRatio,
        flexBasis: 0,
        minWidth: MIN_MOCKUP_WIDTH,
      };
  const patternCellStyle = patternCollapsed
    ? { flex: '0 0 auto' }
    : vectorCollapsed
      ? { flexGrow: 1, flexBasis: 0, minHeight: 0 }
      : {
          flexGrow: leftStackTopRatio,
          flexBasis: 0,
          minHeight: MIN_PATTERN_HEIGHT,
        };
  const vectorCellStyle = vectorCollapsed
    ? { flex: '0 0 auto' }
    : patternCollapsed
      ? { flexGrow: 1, flexBasis: 0, minHeight: 0 }
      : {
          flexGrow: 1 - leftStackTopRatio,
          flexBasis: 0,
          minHeight: MIN_VECTOR_HEIGHT,
        };

  return (
    <div className="app">
      <aside className="app__sidebar">
        <h1 className="app__title">패턴 제너레이터</h1>
        <p className="app__subtitle">이미지 기반 패턴 생성 & 3D 목업</p>
        <LevaPanel store={store} fill flat titleBar={false} />
        <label className="app__stl-upload">
          <span>STL 모델 업로드</span>
          <input type="file" accept=".stl" onChange={handleStlUpload} />
          <span className="app__stl-upload-hint">
            {stlUrl ? 'STL 로드됨 · customStl 모드' : '.stl 파일 선택'}
          </span>
        </label>
      </aside>
      <main className="app__workspace" ref={workspaceRef}>
        <div
          className="workspace__column workspace__column--left"
          ref={leftStackRef}
          style={leftColumnStyle}
        >
          <div className="workspace__cell" style={patternCellStyle}>
            <PatternCanvas
              imageUrl={image}
              params={params}
              editablePath={editablePath}
              selectedMotifs={selectedMotifs}
              onPatternCanvasUpdate={handlePatternCanvasUpdate}
              onPatternSourceUpdate={handlePatternSourceUpdate}
              panelCollapsed={patternCollapsed}
              onTogglePanel={() => togglePanel('pattern2d')}
            />
          </div>
          {!patternCollapsed && !vectorCollapsed && (
            <div
              className="workspace__splitter workspace__splitter--horizontal"
              role="separator"
              aria-orientation="horizontal"
              aria-label="2D 프리뷰 / 벡터 편집 크기 조절"
              onPointerDown={handleLeftStackSplit}
            />
          )}
          <div className="workspace__cell" style={vectorCellStyle}>
            <VectorEditorCanvas
              imageUrl={image}
              params={params}
              onPathChange={handlePathChange}
              onMotifsChange={handleMotifsChange}
              panelCollapsed={vectorCollapsed}
              onTogglePanel={() => togglePanel('vectorEditor')}
            />
          </div>
        </div>
        {!mockupCollapsed && (
          <div
            className="workspace__splitter workspace__splitter--vertical"
            role="separator"
            aria-orientation="vertical"
            aria-label="작업 영역 / 3D 목업 크기 조절"
            onPointerDown={handleWorkspaceSplit}
          />
        )}
        <div
          className="workspace__column workspace__column--right"
          style={rightColumnStyle}
        >
          <MockupViewer
            patternCanvas={patternCanvas}
            patternVersion={patternVersion}
            patternImageData={patternImageData}
            editablePath={editablePath}
            selectedMotifs={selectedMotifs}
            params={params}
            stlUrl={stlUrl}
            panelCollapsed={mockupCollapsed}
            onTogglePanel={() => togglePanel('mockup3d')}
            onResetStlMapping={handleResetStlMapping}
          />
        </div>
      </main>
    </div>
  );
}
