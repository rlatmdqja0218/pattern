import { useEffect, useRef, useState } from 'react';
import { PATTERN_RENDERERS, loadImage, analyzeImage } from '../engines';
import { useElementSize } from '../hooks/useElementSize';

/**
 * 2D 패턴 캔버스
 *
 * 데이터 흐름: 이미지 URL → (engines/imageAnalysis) ImageData 분석 →
 * (engines/pattern*) mode에 맞는 렌더러가 캔버스에 패턴을 그린다.
 * 렌더링 알고리즘은 전부 engines/ 폴더에 있고, 이 컴포넌트는
 * canvas ref 관리와 "언제 다시 그릴지"만 담당한다.
 */
export default function PatternCanvas({ imageUrl, params }) {
  const canvasRef = useRef(null);
  const [containerRef, { width, height }] = useElementSize();
  const [analysis, setAnalysis] = useState(null); // { imageData, width, height }
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error

  // 1단계: 이미지 URL이 바뀌면 로드 → 축소 → ImageData 추출
  useEffect(() => {
    if (!imageUrl) {
      setAnalysis(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    loadImage(imageUrl)
      .then((image) => {
        if (cancelled) return;
        const result = analyzeImage(image);
        setAnalysis(result);
        setStatus(result ? 'ready' : 'error');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // 2단계: 분석 데이터·파라미터·캔버스 크기가 바뀔 때마다 즉시 재렌더링
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis || width === 0 || height === 0) return;

    const render = PATTERN_RENDERERS[params.mode] ?? PATTERN_RENDERERS.halftone;
    render(canvas, analysis.imageData, params);
  }, [analysis, params, width, height]);

  // 캔버스 백킹 스토어는 devicePixelRatio를 반영해 선명하게 유지
  const dpr = window.devicePixelRatio || 1;

  return (
    <section className="preview-panel">
      <header className="preview-panel__header">
        <h2>2D 패턴 프리뷰</h2>
        <span className="preview-panel__meta">
          {params.mode} · 간격 {params.dotSpacing}px · 각도 {params.angle}°
        </span>
      </header>
      <div className="preview-panel__body" ref={containerRef}>
        {analysis && (
          <canvas
            ref={canvasRef}
            width={Math.round(width * dpr)}
            height={Math.round(height * dpr)}
            style={{ width: '100%', height: '100%' }}
          />
        )}
        {status === 'idle' && (
          <p className="preview-panel__placeholder">
            사이드바에서 이미지를 업로드하면 명도 기반 패턴으로 재구성됩니다.
          </p>
        )}
        {status === 'loading' && (
          <p className="preview-panel__placeholder">이미지 분석 중…</p>
        )}
        {status === 'error' && (
          <p className="preview-panel__placeholder">
            이미지를 분석할 수 없습니다. 다른 파일로 시도해 주세요.
          </p>
        )}
      </div>
    </section>
  );
}
