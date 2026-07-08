import paper from 'paper';
import { useEffect, useRef, useState } from 'react';
import {
  applySerializedPath,
  createDefaultEditablePath,
  serializePaperPath,
} from '../engines/editablePath';
import { analyzeImage, loadImage } from '../engines/imageAnalysis';
import { traceImageDataToEditablePathData } from '../engines/vectorTrace';
import { useElementSize } from '../hooks/useElementSize';

const HIT_OPTIONS = {
  segments: true,
  handles: true,
  stroke: false,
  fill: false,
  tolerance: 18,
};

const TRACE_ANALYSIS_SIZE = 640;

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

function fitPathDataToView(pathData, imageSize, scope) {
  const { width, height } = scope.view.size;
  const scale = Math.min(width / imageSize.width, height / imageSize.height);
  const offsetX = (width - imageSize.width * scale) / 2;
  const offsetY = (height - imageSize.height * scale) / 2;

  return {
    ...pathData,
    segments: pathData.segments.map((segment) => ({
      point: {
        x: offsetX + segment.point.x * scale,
        y: offsetY + segment.point.y * scale,
      },
      handleIn: {
        x: segment.handleIn.x * scale,
        y: segment.handleIn.y * scale,
      },
      handleOut: {
        x: segment.handleOut.x * scale,
        y: segment.handleOut.y * scale,
      },
    })),
  };
}

export default function VectorEditorCanvas({ imageUrl, params = {}, onPathChange }) {
  const canvasRef = useRef(null);
  const scopeRef = useRef(null);
  const pathRef = useRef(null);
  const rasterRef = useRef(null);
  const dragTargetRef = useRef(null);
  const onPathChangeRef = useRef(onPathChange);
  const [containerRef, { width, height }] = useElementSize();
  const [status, setStatus] = useState('앵커 또는 핸들을 직접 드래그하세요');
  const {
    traceMode = 'auto',
    traceThreshold = 0.52,
    traceSimplify = 10,
    traceInvert = false,
    traceMaxSegments = 96,
  } = params;

  useEffect(() => {
    onPathChangeRef.current = onPathChange;
  }, [onPathChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return undefined;
    let disposed = false;

    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const scope = new paper.PaperScope();
    scope.setup(canvas);
    scope.activate();
    scope.view.viewSize = new scope.Size(width, height);
    scopeRef.current = scope;
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
      if (!dragTarget?.segment) return;

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
      onPathChangeRef.current?.(serializePaperPath(editablePath));
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
  }, [imageUrl, width, height]);

  useEffect(() => {
    const scope = scopeRef.current;
    const editablePath = pathRef.current;
    if (!scope || !editablePath || width <= 0 || height <= 0) return undefined;

    if (!imageUrl) {
      setStatus('앵커 또는 핸들을 직접 드래그하세요');
      return undefined;
    }

    if (traceMode === 'manual') {
      setStatus('수동 모드 · 현재 경로를 유지합니다');
      return undefined;
    }

    let disposed = false;
    setStatus('자동 윤곽 추출 중');

    loadImage(imageUrl)
      .then((image) => {
        if (disposed) return null;
        return analyzeImage(image, TRACE_ANALYSIS_SIZE);
      })
      .then((analysis) => {
        if (disposed || !analysis) return;

        const tracedPathData = traceImageDataToEditablePathData(analysis.imageData, {
          traceMode,
          traceThreshold,
          traceSimplify,
          traceInvert,
          maxSegments: traceMaxSegments,
        });
        if (!tracedPathData?.segments?.length) {
          setStatus('윤곽 추출 실패 · 현재 경로로 편집하세요');
          return;
        }

        const fittedPathData = fitPathDataToView(
          tracedPathData,
          analysis.imageData,
          scope,
        );
        applySerializedPath(editablePath, fittedPathData);
        editablePath.selected = true;
        editablePath.fullySelected = true;
        scope.view.update();
        onPathChangeRef.current?.(serializePaperPath(editablePath));
        setStatus('자동 윤곽 추출 완료 · 앵커 또는 핸들을 드래그하세요');
      })
      .catch(() => {
        if (!disposed) setStatus('윤곽 추출 실패 · 현재 경로로 편집하세요');
      });

    return () => {
      disposed = true;
    };
  }, [
    imageUrl,
    traceInvert,
    traceMaxSegments,
    traceMode,
    traceSimplify,
    traceThreshold,
    width,
    height,
  ]);

  return (
    <section className="preview-panel vector-editor">
      <header className="preview-panel__header">
        <h2>벡터 편집 레이어</h2>
        <span className="preview-panel__meta">{status}</span>
      </header>
      <div className="preview-panel__body vector-editor__body" ref={containerRef}>
        <canvas ref={canvasRef} className="vector-editor__canvas" />
      </div>
    </section>
  );
}
