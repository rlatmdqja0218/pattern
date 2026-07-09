import paper from 'paper';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applySerializedPath,
  createDefaultEditablePath,
  serializePaperPath,
} from '../engines/editablePath';
import { analyzeImage, loadImage } from '../engines/imageAnalysis';
import {
  clonePathData,
  fitPathDataToView,
  unfitPathDataFromView,
} from '../engines/pathTransform';
import { traceImageDataToPathCandidates } from '../engines/vectorTrace';
import { useElementSize } from '../hooks/useElementSize';
import { useUndoRedo } from '../hooks/useUndoRedo';
import PreviewPanel from './PreviewPanel';

const HIT_OPTIONS = {
  segments: true,
  handles: true,
  stroke: false,
  fill: false,
  tolerance: 18,
};

const TRACE_ANALYSIS_SIZE = 640;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const CANDIDATE_ROLES = ['primary', 'secondary', 'accent', 'ignore'];
const INITIAL_EDITOR_STATE = {
  pathCandidates: [],
  selectedCandidateIds: [],
  candidateRoles: {},
  editingCandidateId: null,
  editablePath: null,
};

function getStatusLabel(hitType) {
  if (hitType === 'segment') return '앵커 드래그 중';
  if (hitType === 'handle-in') return 'handleIn 드래그 중';
  if (hitType === 'handle-out') return 'handleOut 드래그 중';
  return '앵커 또는 핸들을 직접 드래그하세요';
}

function fitRasterToView(scope, raster) {
  const { width, height } = scope.view.size;
  const rasterWidth = raster.width || raster.bounds.width;
  const rasterHeight = raster.height || raster.bounds.height;
  if (!rasterWidth || !rasterHeight) return;

  const scale = Math.min(width / rasterWidth, height / rasterHeight);
  raster.scaling = new scope.Point(scale, scale);
  raster.position = scope.view.center;
}

function getViewSize(scope) {
  const { width, height } = scope.view.size;
  return { width, height };
}

function getCandidateImageSize(candidate) {
  const trace = candidate?.editablePath?.trace;
  if (!trace?.width || !trace?.height) return null;
  return { width: trace.width, height: trace.height };
}

function getViewPathData(candidate, scope) {
  const imageSize = getCandidateImageSize(candidate);
  const pathData = clonePathData(candidate?.editablePath);
  if (!imageSize) return pathData;
  return fitPathDataToView(pathData, imageSize, getViewSize(scope));
}

function getOriginalPathData(viewPathData, candidate, scope) {
  const imageSize = getCandidateImageSize(candidate);
  const trace = candidate?.editablePath?.trace;
  const pathData = imageSize
    ? unfitPathDataFromView(viewPathData, imageSize, getViewSize(scope))
    : clonePathData(viewPathData);

  return trace ? { ...pathData, trace: { ...trace } } : pathData;
}

function getCandidateLabel(candidate, index) {
  const area = Math.round(candidate.area);
  const length = Math.round(candidate.length);
  const shapeHint = length > Math.sqrt(Math.max(1, area)) * 8 ? '긴 선' : '큰 면';
  return `후보 ${index + 1} · ${shapeHint} · ${area}/${length}`;
}

// 최초 추출된 모든 후보의 기본 role은 primary다.
// secondary/accent/ignore는 사용자가 직접 선택했을 때만 적용된다.
function getDefaultCandidateRole() {
  return 'primary';
}

function createDefaultCandidateRoles(candidates) {
  return Object.fromEntries(
    candidates.map((candidate) => [candidate.id, getDefaultCandidateRole()]),
  );
}

function cloneEditorState(editorState) {
  return {
    ...editorState,
    pathCandidates: editorState.pathCandidates.map((candidate) => ({
      ...candidate,
      editablePath: clonePathData(candidate.editablePath),
    })),
    selectedCandidateIds: [...editorState.selectedCandidateIds],
    candidateRoles: { ...editorState.candidateRoles },
    editablePath: clonePathData(editorState.editablePath),
  };
}

function getSelectedMotifs(pathCandidates, selectedCandidateIds, candidateRoles) {
  return selectedCandidateIds
    .map((candidateId) => pathCandidates.find((candidate) => candidate.id === candidateId))
    .filter(Boolean)
    .map(({ id, area, length, editablePath }) => {
      const role = candidateRoles[id] ?? 'primary';
      if (role === 'ignore') return null;

      return {
        id,
        area,
        length,
        role,
        editablePath: clonePathData(editablePath),
      };
    })
    .filter(Boolean);
}

function shouldIgnoreEditorShortcut(event) {
  const tagName = event.target?.tagName;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName) || event.target?.isContentEditable;
}

function shouldIgnoreSpaceShortcut(event) {
  return event.target?.tagName === 'BUTTON' || shouldIgnoreEditorShortcut(event);
}

export default function VectorEditorCanvas({
  imageUrl,
  params = {},
  onPathChange,
  onMotifsChange,
  panelCollapsed,
  onTogglePanel,
}) {
  const canvasRef = useRef(null);
  const scopeRef = useRef(null);
  const pathRef = useRef(null);
  const rasterRef = useRef(null);
  const dragTargetRef = useRef(null);
  const dragStartSnapshotRef = useRef(null);
  const dragChangedRef = useRef(false);
  const spacePressedRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const onPathChangeRef = useRef(onPathChange);
  const onMotifsChangeRef = useRef(onMotifsChange);
  const editingCandidateIdRef = useRef(null);
  const pathCandidatesRef = useRef([]);
  const editorStateRef = useRef(INITIAL_EDITOR_STATE);
  const [containerRef, { width, height }] = useElementSize();
  const [status, setStatus] = useState('앵커 또는 핸들을 직접 드래그하세요');
  const [zoomPercent, setZoomPercent] = useState(100);
  const {
    present: editorState,
    set: setEditorState,
    replace: replaceEditorState,
    commit: commitEditorState,
    undo,
    redo,
    reset: resetEditorState,
    canUndo,
    canRedo,
    lastAction,
  } = useUndoRedo(INITIAL_EDITOR_STATE, { limit: 80 });
  const {
    pathCandidates,
    selectedCandidateIds,
    candidateRoles,
    editingCandidateId,
  } = editorState;
  const hasCanvasSize = width > 0 && height > 0;
  const {
    traceMode = 'auto',
    traceThreshold = 0.52,
    traceSimplify = 10,
    traceInvert = false,
    traceMaxSegments = 96,
    curveMode = 'straight',
    curveSmoothness = 0.45,
    curveSimplifyTolerance = 2,
  } = params;

  useEffect(() => {
    sizeRef.current = { width, height };
  }, [height, width]);

  useEffect(() => {
    onPathChangeRef.current = onPathChange;
  }, [onPathChange]);

  useEffect(() => {
    onMotifsChangeRef.current = onMotifsChange;
  }, [onMotifsChange]);

  useEffect(() => {
    editorStateRef.current = editorState;
    editingCandidateIdRef.current = editingCandidateId;
    pathCandidatesRef.current = pathCandidates;
  }, [editingCandidateId, editorState, pathCandidates]);

  useEffect(() => {
    onMotifsChangeRef.current?.(
      getSelectedMotifs(pathCandidates, selectedCandidateIds, candidateRoles),
    );
  }, [candidateRoles, pathCandidates, selectedCandidateIds]);

  const syncPaperPath = useCallback((pathData, candidate = null) => {
    const scope = scopeRef.current;
    const editablePath = pathRef.current;
    if (!scope || !editablePath || !pathData?.segments?.length) return;

    const viewPathData = candidate
      ? getViewPathData({ ...candidate, editablePath: pathData }, scope)
      : clonePathData(pathData);
    applySerializedPath(editablePath, viewPathData);
    editablePath.selected = true;
    editablePath.fullySelected = true;
    scope.view.update();
  }, []);

  const applyCandidate = useCallback((candidate) => {
    if (!candidate?.editablePath?.segments?.length) return;
    syncPaperPath(candidate.editablePath, candidate);
    replaceEditorState((currentState) => ({
      ...currentState,
      editingCandidateId: candidate.id,
      editablePath: clonePathData(candidate.editablePath),
    }));
    onPathChangeRef.current?.(clonePathData(candidate.editablePath));
  }, [replaceEditorState, syncPaperPath]);

  useEffect(() => {
    if (lastAction !== 'undo' && lastAction !== 'redo') return;
    const currentPath = editorState.editablePath;
    if (!currentPath?.segments?.length) return;
    const editingCandidate = editorState.pathCandidates.find(
      (candidate) => candidate.id === editorState.editingCandidateId,
    );

    syncPaperPath(currentPath, editingCandidate);
    onPathChangeRef.current?.(clonePathData(currentPath));
    setStatus(lastAction === 'undo' ? '이전 편집 상태로 되돌렸습니다' : '다음 편집 상태를 복원했습니다');
  }, [editorState, lastAction, syncPaperPath]);

  const handleCandidateEdit = useCallback((candidate, index) => {
    applyCandidate(candidate);
    setStatus(`후보 ${index + 1} 편집 중`);
  }, [applyCandidate]);

  const handleCandidateToggle = useCallback((event, candidate, index) => {
    event.stopPropagation();
    const role = candidateRoles[candidate.id] ?? getDefaultCandidateRole();
    setEditorState((currentState) => {
      const isSelected = currentState.selectedCandidateIds.includes(candidate.id);
      return {
        ...currentState,
        candidateRoles: role === 'ignore'
          ? {
            ...currentState.candidateRoles,
            [candidate.id]: getDefaultCandidateRole(),
          }
          : currentState.candidateRoles,
        selectedCandidateIds: role === 'ignore'
          ? currentState.selectedCandidateIds.includes(candidate.id)
            ? currentState.selectedCandidateIds
            : [...currentState.selectedCandidateIds, candidate.id]
          : isSelected
            ? currentState.selectedCandidateIds.filter((candidateId) => candidateId !== candidate.id)
            : [...currentState.selectedCandidateIds, candidate.id],
      };
    });
    setStatus(`후보 ${index + 1} 패턴 포함 상태 변경`);
  }, [candidateRoles, setEditorState]);

  const handleCandidateRoleChange = useCallback((event, candidate, index) => {
    event.stopPropagation();
    const role = event.target.value;

    setEditorState((currentState) => {
      const currentIds = currentState.selectedCandidateIds;
      return {
        ...currentState,
        candidateRoles: {
          ...currentState.candidateRoles,
          [candidate.id]: role,
        },
        selectedCandidateIds: role === 'ignore'
          ? currentIds.filter((candidateId) => candidateId !== candidate.id)
          : currentIds.includes(candidate.id)
            ? currentIds
            : [...currentIds, candidate.id],
      };
    });
    setStatus(`후보 ${index + 1} 역할: ${role}`);
  }, [setEditorState]);

  // 모든 후보 role을 primary로 되돌린다. setEditorState를 거치므로
  // undo/redo 히스토리에 포함된다. ignore였던 후보는 다시 패턴에 포함시킨다.
  const handleResetRoles = useCallback(() => {
    setEditorState((currentState) => {
      const ignoredIds = currentState.pathCandidates
        .filter((candidate) => (
          (currentState.candidateRoles[candidate.id] ?? 'primary') === 'ignore'
        ))
        .map((candidate) => candidate.id);
      return {
        ...currentState,
        candidateRoles: Object.fromEntries(
          currentState.pathCandidates.map((candidate) => [candidate.id, 'primary']),
        ),
        selectedCandidateIds: [
          ...currentState.selectedCandidateIds,
          ...ignoredIds.filter(
            (id) => !currentState.selectedCandidateIds.includes(id),
          ),
        ],
      };
    });
    setStatus('모든 후보 역할을 primary로 초기화');
  }, [setEditorState]);

  const syncZoomState = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    setZoomPercent(Math.round(scope.view.zoom * 100));
  }, []);

  const setZoomAtViewPoint = useCallback((viewPoint, nextZoom) => {
    const scope = scopeRef.current;
    if (!scope) return;

    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const oldZoom = scope.view.zoom;
    const projectPoint = scope.view.viewToProject(viewPoint);
    const centerToPoint = projectPoint.subtract(scope.view.center);
    scope.view.zoom = clampedZoom;
    scope.view.center = projectPoint.subtract(centerToPoint.multiply(oldZoom / clampedZoom));
    scope.view.update();
    syncZoomState();
  }, [syncZoomState]);

  const zoomBy = useCallback((factor) => {
    const scope = scopeRef.current;
    if (!scope) return;

    setZoomAtViewPoint(
      new scope.Point(scope.view.viewSize.width / 2, scope.view.viewSize.height / 2),
      scope.view.zoom * factor,
    );
  }, [setZoomAtViewPoint]);

  const setZoomToActualSize = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    scope.view.zoom = 1;
    scope.view.update();
    syncZoomState();
  }, [syncZoomState]);

  const fitView = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    scope.view.zoom = 1;
    scope.view.center = new scope.Point(
      scope.view.viewSize.width / 2,
      scope.view.viewSize.height / 2,
    );
    scope.view.update();
    syncZoomState();
  }, [syncZoomState]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Space') {
        if (shouldIgnoreSpaceShortcut(event)) return;
        spacePressedRef.current = true;
        event.preventDefault();
        return;
      }

      if (shouldIgnoreEditorShortcut(event)) return;
      const modifierPressed = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const isRedo = modifierPressed && (
        (key === 'z' && event.shiftKey)
        || key === 'y'
      );
      const isUndo = modifierPressed && key === 'z' && !event.shiftKey;

      if (isRedo && canRedo) {
        event.preventDefault();
        redo();
      } else if (isUndo && canUndo) {
        event.preventDefault();
        undo();
      }
    };
    const handleKeyUp = (event) => {
      if (event.code !== 'Space') return;
      spacePressedRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      spacePressedRef.current = false;
    };
  }, [canRedo, canUndo, redo, undo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const handleWheel = (event) => {
      const scope = scopeRef.current;
      if (!scope) return;

      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const viewPoint = new scope.Point(
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      const factor = event.deltaY < 0 ? 1.12 : 0.88;
      setZoomAtViewPoint(viewPoint, scope.view.zoom * factor);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [setZoomAtViewPoint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasCanvasSize) return undefined;
    let disposed = false;
    const { width: setupWidth, height: setupHeight } = sizeRef.current;

    canvas.width = Math.round(setupWidth);
    canvas.height = Math.round(setupHeight);
    canvas.style.width = `${setupWidth}px`;
    canvas.style.height = `${setupHeight}px`;

    const scope = new paper.PaperScope();
    scope.setup(canvas);
    scope.activate();
    scope.view.viewSize = new scope.Size(setupWidth, setupHeight);
    scopeRef.current = scope;
    setZoomPercent(100);
    setStatus(
      imageUrl
        ? '참고 이미지 로딩 중'
        : '앵커 또는 핸들을 직접 드래그하세요',
    );

    const referenceLayer = new scope.Layer({ name: 'reference' });
    referenceLayer.activate();
    referenceLayer.locked = true;

    if (imageUrl) {
      const raster = new scope.Raster({
        source: imageUrl,
        crossOrigin: 'Anonymous',
      });
      rasterRef.current = raster;
      raster.locked = true;
      raster.opacity = 0.42;
      raster.onLoad = () => {
        if (disposed) return;
        fitRasterToView(scope, raster);
        scope.view.update();
      };
    }

    const editLayer = new scope.Layer({ name: 'edit' });
    editLayer.activate();
    const editablePath = createDefaultEditablePath(scope);
    pathRef.current = editablePath;
    const defaultPathData = serializePaperPath(editablePath);
    replaceEditorState((currentState) => ({
      ...currentState,
      editablePath: defaultPathData,
    }));
    onPathChangeRef.current?.(defaultPathData);

    const tool = new scope.Tool();

    tool.onMouseDown = (event) => {
      scope.activate();
      if (event.event?.button === 1 || spacePressedRef.current) {
        event.event?.preventDefault?.();
        dragTargetRef.current = { type: 'pan' };
        setStatus('화면 이동 중');
        return;
      }

      const hit = scope.project.hitTest(event.point, HIT_OPTIONS);
      if (!hit || hit.item !== editablePath) {
        dragTargetRef.current = null;
        setStatus('선택된 점이 없습니다');
        return;
      }

      dragTargetRef.current = {
        type: hit.type,
        segment: hit.segment,
      };
      dragStartSnapshotRef.current = cloneEditorState(editorStateRef.current);
      dragChangedRef.current = false;
      setStatus(getStatusLabel(hit.type));
    };

    tool.onMouseDrag = (event) => {
      const dragTarget = dragTargetRef.current;
      if (!dragTarget) return;

      if (dragTarget.type === 'pan') {
        scope.view.center = scope.view.center.subtract(event.delta);
        scope.view.update();
        return;
      }

      if (!dragTarget.segment) return;

      if (dragTarget.type === 'segment') {
        dragTarget.segment.point = dragTarget.segment.point.add(event.delta);
      }

      if (dragTarget.type === 'handle-in') {
        dragTarget.segment.handleIn = dragTarget.segment.handleIn.add(event.delta);
      }

      if (dragTarget.type === 'handle-out') {
        dragTarget.segment.handleOut = dragTarget.segment.handleOut.add(event.delta);
      }
      dragChangedRef.current = true;

      editablePath.selected = true;
      editablePath.fullySelected = true;
      scope.view.update();
      const serializedPath = serializePaperPath(editablePath);

      const editingCandidateId = editingCandidateIdRef.current;
      const editingCandidate = pathCandidatesRef.current.find(
        (candidate) => candidate.id === editingCandidateId,
      );
      const nextPathData = editingCandidate
        ? getOriginalPathData(serializedPath, editingCandidate, scope)
        : serializedPath;

      onPathChangeRef.current?.(nextPathData);

      replaceEditorState((currentState) => ({
        ...currentState,
        editablePath: clonePathData(nextPathData),
        pathCandidates: editingCandidateId && editingCandidate
          ? currentState.pathCandidates.map((candidate) => (
            candidate.id === editingCandidateId
              ? { ...candidate, editablePath: clonePathData(nextPathData) }
              : candidate
          ))
          : currentState.pathCandidates,
      }));
    };

    tool.onMouseUp = () => {
      if (dragChangedRef.current && dragStartSnapshotRef.current) {
        commitEditorState(dragStartSnapshotRef.current);
        setStatus('경로가 변경되었습니다');
      }
      dragTargetRef.current = null;
      dragStartSnapshotRef.current = null;
      dragChangedRef.current = false;
    };

    return () => {
      disposed = true;
      dragTargetRef.current = null;
      dragStartSnapshotRef.current = null;
      dragChangedRef.current = false;
      tool.remove();
      rasterRef.current?.remove();
      scope.project.remove();
      scopeRef.current = null;
      pathRef.current = null;
      rasterRef.current = null;
    };
  }, [commitEditorState, hasCanvasSize, imageUrl, replaceEditorState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scope = scopeRef.current;
    if (!canvas || !scope || !hasCanvasSize) return;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    scope.view.viewSize = new scope.Size(width, height);
    if (rasterRef.current) {
      fitRasterToView(scope, rasterRef.current);
    }
    const editingCandidate = pathCandidatesRef.current.find(
      (candidate) => candidate.id === editingCandidateIdRef.current,
    );
    if (editingCandidate) {
      syncPaperPath(editingCandidate.editablePath, editingCandidate);
    }
    scope.view.update();
  }, [hasCanvasSize, height, syncPaperPath, width]);

  useEffect(() => {
    const scope = scopeRef.current;
    const editablePath = pathRef.current;
    if (!scope || !editablePath || !hasCanvasSize) return undefined;

    if (!imageUrl) {
      const defaultPathData = serializePaperPath(editablePath);
      resetEditorState({
        ...INITIAL_EDITOR_STATE,
        editablePath: defaultPathData,
      });
      onPathChangeRef.current?.(defaultPathData);
      setStatus('앵커 또는 핸들을 직접 드래그하세요');
      return undefined;
    }

    if (traceMode === 'manual') {
      setStatus('수동 모드 · 현재 경로를 유지합니다');
      return undefined;
    }

    let disposed = false;
    resetEditorState({
      ...INITIAL_EDITOR_STATE,
      editablePath: serializePaperPath(editablePath),
    });
    setStatus('자동 윤곽 추출 중');

    loadImage(imageUrl)
      .then((image) => {
        if (disposed) return null;
        return analyzeImage(image, TRACE_ANALYSIS_SIZE);
      })
      .then((analysis) => {
        if (disposed || !analysis) return;

        const candidates = traceImageDataToPathCandidates(analysis.imageData, {
          traceMode,
          traceThreshold,
          traceSimplify,
          traceInvert,
          maxSegments: traceMaxSegments,
          curveMode,
          curveSmoothness,
          curveSimplifyTolerance,
        });
        if (!candidates.length) {
          const fallbackPath = serializePaperPath(editablePath);
          resetEditorState({
            ...INITIAL_EDITOR_STATE,
            editablePath: fallbackPath,
          });
          onPathChangeRef.current?.(fallbackPath);
          setStatus('윤곽 추출 실패 · 현재 경로로 편집하세요');
          return;
        }

        const firstCandidate = candidates[0];
        resetEditorState({
          pathCandidates: candidates,
          selectedCandidateIds: [firstCandidate.id],
          candidateRoles: createDefaultCandidateRoles(candidates),
          editingCandidateId: firstCandidate.id,
          editablePath: clonePathData(firstCandidate.editablePath),
        });
        syncPaperPath(firstCandidate.editablePath, firstCandidate);
        onPathChangeRef.current?.(clonePathData(firstCandidate.editablePath));
        setStatus(`자동 윤곽 추출 완료 · 후보 ${candidates.length}개`);
      })
      .catch(() => {
        if (!disposed) setStatus('윤곽 추출 실패 · 현재 경로로 편집하세요');
      });

    return () => {
      disposed = true;
    };
  }, [
    curveMode,
    curveSimplifyTolerance,
    curveSmoothness,
    hasCanvasSize,
    imageUrl,
    resetEditorState,
    syncPaperPath,
    traceInvert,
    traceMaxSegments,
    traceMode,
    traceSimplify,
    traceThreshold,
  ]);

  const editorActions = (
    <div className="vector-editor__header-actions">
      <div className="vector-editor__history-controls" aria-label="편집 기록 조절">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label="되돌리기"
          title="되돌리기 (Ctrl/Cmd+Z)"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label="다시 실행"
          title="다시 실행 (Ctrl/Cmd+Shift+Z)"
        >
          ↷
        </button>
        <button
          type="button"
          onClick={handleResetRoles}
          disabled={pathCandidates.length === 0}
          title="모든 후보 역할을 primary로 초기화 (undo 가능)"
        >
          역할 초기화
        </button>
      </div>
      <div className="vector-editor__zoom-controls" aria-label="벡터 편집 화면 조절">
        <button type="button" onClick={() => zoomBy(1.2)} title="확대">
          +
        </button>
        <button type="button" onClick={() => zoomBy(0.8)} title="축소">
          -
        </button>
        <button type="button" onClick={fitView} title="화면 맞춤">
          맞춤
        </button>
        <button type="button" onClick={setZoomToActualSize} title="100%">
          100%
        </button>
      </div>
    </div>
  );

  return (
    <PreviewPanel
      title="벡터 편집 레이어"
      meta={`${status} · ${zoomPercent}%`}
      className="vector-editor"
      actions={editorActions}
      collapsed={panelCollapsed}
      onToggleCollapsed={onTogglePanel}
    >
      {pathCandidates.length > 0 && (
        <div className="vector-editor__candidates" aria-label="윤곽 후보 선택">
          {pathCandidates.map((candidate, index) => {
            const role = candidateRoles[candidate.id] ?? getDefaultCandidateRole();
            const isSelected = role !== 'ignore' && selectedCandidateIds.includes(candidate.id);
            const isEditing = candidate.id === editingCandidateId;
            const className = [
              'vector-editor__candidate',
              isSelected ? 'is-selected' : '',
              isEditing ? 'is-editing' : '',
              `role-${role}`,
            ].filter(Boolean).join(' ');

            return (
              <div
                key={candidate.id}
                role="button"
                tabIndex={0}
                className={className}
                aria-label={`${getCandidateLabel(candidate, index)} 편집`}
                title={`${isSelected ? '패턴 포함' : '패턴 제외'} · ${
                  isEditing ? '현재 편집 중' : '행을 클릭하면 편집 대상'
                }`}
                onClick={() => handleCandidateEdit(candidate, index)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  handleCandidateEdit(candidate, index);
                }}
              >
                <label
                  className="vector-editor__candidate-toggle"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(event) => handleCandidateToggle(event, candidate, index)}
                  />
                  <span>패턴 포함</span>
                </label>
                <span className="vector-editor__candidate-label">
                  {getCandidateLabel(candidate, index)}
                </span>
                <select
                  className="vector-editor__candidate-role"
                  value={role}
                  aria-label={`후보 ${index + 1} 역할`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  onChange={(event) => handleCandidateRoleChange(event, candidate, index)}
                >
                  {CANDIDATE_ROLES.map((candidateRole) => (
                    <option key={candidateRole} value={candidateRole}>
                      {candidateRole}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="vector-editor__candidate-edit"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCandidateEdit(candidate, index);
                  }}
                >
                  편집
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="preview-panel__body vector-editor__body" ref={containerRef}>
        <canvas ref={canvasRef} className="vector-editor__canvas" />
      </div>
    </PreviewPanel>
  );
}
