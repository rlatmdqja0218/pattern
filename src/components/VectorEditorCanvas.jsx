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

function getSelectedMotifs(pathCandidates, selectedCandidateIds) {
  return selectedCandidateIds
    .map((candidateId) => pathCandidates.find((candidate) => candidate.id === candidateId))
    .filter(Boolean)
    .map(({ id, area, length, editablePath }) => ({
      id,
      area,
      length,
      editablePath: clonePathData(editablePath),
    }));
}

function shouldIgnoreSpaceShortcut(event) {
  const tagName = event.target?.tagName;
  return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tagName) || event.target?.isContentEditable;
}

export default function VectorEditorCanvas({
  imageUrl,
  params = {},
  onPathChange,
  onMotifsChange,
}) {
  const canvasRef = useRef(null);
  const scopeRef = useRef(null);
  const pathRef = useRef(null);
  const rasterRef = useRef(null);
  const dragTargetRef = useRef(null);
  const spacePressedRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const onPathChangeRef = useRef(onPathChange);
  const onMotifsChangeRef = useRef(onMotifsChange);
  const editingCandidateIdRef = useRef(null);
  const pathCandidatesRef = useRef([]);
  const [containerRef, { width, height }] = useElementSize();
  const [status, setStatus] = useState('앵커 또는 핸들을 직접 드래그하세요');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [pathCandidates, setPathCandidates] = useState([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const [editingCandidateId, setEditingCandidateId] = useState(null);
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
    editingCandidateIdRef.current = editingCandidateId;
  }, [editingCandidateId]);

  useEffect(() => {
    pathCandidatesRef.current = pathCandidates;
  }, [pathCandidates]);

  useEffect(() => {
    onMotifsChangeRef.current?.(
      getSelectedMotifs(pathCandidates, selectedCandidateIds),
    );
  }, [pathCandidates, selectedCandidateIds]);

  const applyCandidate = useCallback((candidate) => {
    const scope = scopeRef.current;
    const editablePath = pathRef.current;
    if (!scope || !editablePath || !candidate?.editablePath?.segments?.length) return;

    const pathData = getViewPathData(candidate, scope);
    applySerializedPath(editablePath, pathData);
    editablePath.selected = true;
    editablePath.fullySelected = true;
    scope.view.update();
    setEditingCandidateId(candidate.id);
    onPathChangeRef.current?.(clonePathData(candidate.editablePath));
  }, []);

  const handleCandidateEdit = useCallback((candidate, index) => {
    applyCandidate(candidate);
    setStatus(`후보 ${index + 1} 편집 중`);
  }, [applyCandidate]);

  const handleCandidateToggle = useCallback((event, candidate, index) => {
    event.stopPropagation();
    setSelectedCandidateIds((currentIds) => (
      currentIds.includes(candidate.id)
        ? currentIds.filter((candidateId) => candidateId !== candidate.id)
        : [...currentIds, candidate.id]
    ));
    setStatus(`후보 ${index + 1} 패턴 포함 상태 변경`);
  }, []);

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
      if (event.code !== 'Space' || shouldIgnoreSpaceShortcut(event)) return;
      spacePressedRef.current = true;
      event.preventDefault();
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
  }, []);

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
    onPathChangeRef.current?.(serializePaperPath(editablePath));

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

      if (editingCandidateId && editingCandidate) {
        setPathCandidates((currentCandidates) => currentCandidates.map((candidate) => (
          candidate.id === editingCandidateId
            ? { ...candidate, editablePath: clonePathData(nextPathData) }
            : candidate
        )));
      }
    };

    tool.onMouseUp = () => {
      if (dragTargetRef.current) {
        setStatus('경로가 변경되었습니다');
      }
      dragTargetRef.current = null;
    };

    return () => {
      disposed = true;
      dragTargetRef.current = null;
      tool.remove();
      rasterRef.current?.remove();
      scope.project.remove();
      scopeRef.current = null;
      pathRef.current = null;
      rasterRef.current = null;
    };
  }, [hasCanvasSize, imageUrl]);

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
      applyCandidate(editingCandidate);
    }
    scope.view.update();
  }, [applyCandidate, hasCanvasSize, height, width]);

  useEffect(() => {
    const scope = scopeRef.current;
    const editablePath = pathRef.current;
    if (!scope || !editablePath || !hasCanvasSize) return undefined;

    if (!imageUrl) {
      setPathCandidates([]);
      setSelectedCandidateIds([]);
      setEditingCandidateId(null);
      setStatus('앵커 또는 핸들을 직접 드래그하세요');
      return undefined;
    }

    if (traceMode === 'manual') {
      setStatus('수동 모드 · 현재 경로를 유지합니다');
      return undefined;
    }

    let disposed = false;
    setPathCandidates([]);
    setSelectedCandidateIds([]);
    setEditingCandidateId(null);
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
          setPathCandidates([]);
          setSelectedCandidateIds([]);
          setEditingCandidateId(null);
          setStatus('윤곽 추출 실패 · 현재 경로로 편집하세요');
          return;
        }

        setPathCandidates(candidates);
        setSelectedCandidateIds([candidates[0].id]);
        applyCandidate(candidates[0]);
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
    applyCandidate,
    traceInvert,
    traceMaxSegments,
    traceMode,
    traceSimplify,
    traceThreshold,
  ]);

  const zoomActions = (
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
  );

  return (
    <PreviewPanel
      title="벡터 편집 레이어"
      meta={`${status} · ${zoomPercent}%`}
      className="vector-editor"
      actions={zoomActions}
    >
      {pathCandidates.length > 0 && (
        <div className="vector-editor__candidates" aria-label="윤곽 후보 선택">
          {pathCandidates.map((candidate, index) => {
            const isSelected = selectedCandidateIds.includes(candidate.id);
            const isEditing = candidate.id === editingCandidateId;
            const className = [
              'vector-editor__candidate',
              isSelected ? 'is-selected' : '',
              isEditing ? 'is-editing' : '',
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
