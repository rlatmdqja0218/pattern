import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import { useHtmlImage } from '../hooks/useHtmlImage';
import { useElementSize } from '../hooks/useElementSize';

/**
 * 2D Canvas 프리뷰 (react-konva 기반).
 * 현재는 업로드된 이미지를 Scale 값에 맞춰 중앙에 렌더링하는 껍데기 단계.
 * 추후 이 Layer 위에 타일링(격자/미러링/육각) 패턴 알고리즘이 올라간다.
 */
export default function Preview2D({ imageUrl, scale, spacing }) {
  const image = useHtmlImage(imageUrl);
  const [containerRef, { width, height }] = useElementSize();

  return (
    <section className="preview-panel">
      <header className="preview-panel__header">
        <h2>2D 패턴 프리뷰</h2>
        <span className="preview-panel__meta">
          scale {scale.toFixed(2)} · spacing {spacing}px
        </span>
      </header>
      <div className="preview-panel__body" ref={containerRef}>
        {width > 0 && height > 0 && (
          <Stage width={width} height={height}>
            <Layer>
              {image && (
                <KonvaImage
                  image={image}
                  x={width / 2}
                  y={height / 2}
                  offsetX={image.width / 2}
                  offsetY={image.height / 2}
                  scaleX={scale}
                  scaleY={scale}
                />
              )}
            </Layer>
          </Stage>
        )}
        {!image && (
          <p className="preview-panel__placeholder">
            사이드바에서 이미지를 업로드하면 여기에 표시됩니다.
          </p>
        )}
      </div>
    </section>
  );
}
