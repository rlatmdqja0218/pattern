/**
 * ImageData → 소스 캔버스 변환 헬퍼
 *
 * 타일링 계열 렌더러(standard, mirror)는 픽셀 배열이 아니라
 * drawImage 가능한 비트맵이 필요하다. 같은 ImageData로 매 프레임
 * 캔버스를 다시 만들지 않도록 WeakMap으로 캐싱한다.
 */

const cache = new WeakMap();

/**
 * @param {ImageData} imageData
 * @returns {HTMLCanvasElement | OffscreenCanvas | null}
 */
export function getSourceCanvas(imageData) {
  if (!imageData) return null;

  const cached = cache.get(imageData);
  if (cached) return cached;

  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(imageData.width, imageData.height)
      : Object.assign(document.createElement('canvas'), {
          width: imageData.width,
          height: imageData.height,
        });
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.putImageData(imageData, 0, 0);
  cache.set(imageData, canvas);
  return canvas;
}
