import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeImage, renderPattern } from '../core/patternEngine';
import { useHtmlImage } from '../hooks/useHtmlImage';
import { useElementSize } from '../hooks/useElementSize';

/**
 * 2D Canvas 프리뷰.
 * 업로드 이미지를 오프스크린 캔버스에서 분석한 뒤, 파라미터 변경마다 RAF로 재렌더링한다.
 */
export default function Preview2D({
  imageUrl,
  scale,
  spacingX,
  spacingY,
  threshold,
  symmetryType,
}) {
  const image = useHtmlImage(imageUrl);
  const [containerRef, { width, height }] = useElementSize();
  const canvasRef = useRef(null);
  const [renderStats, setRenderStats] = useState(null);

  const source = useMemo(() => {
    if (!image) return null;
    return analyzeImage(image);
  }, [image]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return undefined;

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (!source) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      return undefined;
    }

    const frameId = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const stats = renderPattern(
        canvas,
        source,
        {
          scale,
          spacingX,
          spacingY,
          threshold,
          symmetryType,
        },
        width,
        height,
      );
      setRenderStats(stats);
    });

    return () => cancelAnimationFrame(frameId);
  }, [source, width, height, scale, spacingX, spacingY, threshold, symmetryType]);

  return (
    <section className="preview-panel">
      <header className="preview-panel__header">
        <h2>2D 패턴 프리뷰</h2>
        <span className="preview-panel__meta">
          {symmetryType} · scale {scale.toFixed(2)} · {spacingX}/{spacingY}px
          {renderStats?.mode === 'Halftone' ? ` · threshold ${threshold}` : ''}
        </span>
      </header>
      <div className="preview-panel__body" ref={containerRef}>
        <canvas ref={canvasRef} className="preview-panel__canvas" />
        {!image && (
          <p className="preview-panel__placeholder">
            사이드바에서 이미지를 업로드하면 여기에 표시됩니다.
          </p>
        )}
      </div>
    </section>
  );
}
