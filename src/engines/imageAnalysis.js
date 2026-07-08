/**
 * 이미지 분석 엔진
 *
 * "이미지 → 데이터" 단계를 담당한다.
 * 업로드된 이미지를 오프스크린 캔버스에 그려 ImageData(픽셀 배열)로 해체하고,
 * 좌표별 RGB / 명도(Luminance) / 영역 평균색을 계산하는 순수 함수들을 제공한다.
 *
 * 이 모듈은 DOM 컴포넌트에 의존하지 않으므로, 추후 Web Worker로
 * 그대로 옮길 수 있다 (loadImage만 메인 스레드에 남기면 됨).
 */

/** 분석용 캔버스 최대 크기 — 큰 이미지도 프리뷰 렌더링이 느려지지 않도록 축소 */
export const MAX_ANALYSIS_SIZE = 1000;

/**
 * 이미지 URL(object URL 포함)을 HTMLImageElement로 로드한다.
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    // 외부 이미지 사용 시 캔버스 오염(tainted canvas) 방지
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러올 수 없습니다: ${url}`));
    image.src = url;
  });
}

/**
 * 이미지를 분석용 캔버스에 축소해 그리고 ImageData를 추출한다.
 *
 * @param {HTMLImageElement} image 로드가 끝난 이미지
 * @param {number} [maxSize] 긴 변 기준 최대 픽셀 (기본 1000)
 * @returns {{ imageData: ImageData, width: number, height: number,
 *             sourceWidth: number, sourceHeight: number } | null}
 *          context를 얻지 못하면 null
 */
export function analyzeImage(image, maxSize = MAX_ANALYSIS_SIZE) {
  if (!image || !image.width || !image.height) return null;

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);

  return {
    imageData,
    width,
    height,
    sourceWidth: image.width,
    sourceHeight: image.height,
  };
}

/**
 * RGB 값을 인간의 시각 인지를 반영한 명도(0~1)로 변환한다. (Rec.709 가중치)
 */
export function luminanceOf(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * 특정 좌표의 픽셀 RGBA를 읽는다. 범위를 벗어나면 null.
 */
export function getPixel(imageData, x, y) {
  const { data, width, height } = imageData;
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || px >= width || py < 0 || py >= height) return null;
  const i = (py * width + px) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

/**
 * 특정 좌표의 명도(0~1)를 읽는다. 범위 밖이면 null.
 */
export function getLuminance(imageData, x, y) {
  const pixel = getPixel(imageData, x, y);
  return pixel ? luminanceOf(pixel.r, pixel.g, pixel.b) : null;
}

/**
 * (cx, cy)를 중심으로 radius 반경 사각 영역의 평균색과 평균 명도를 구한다.
 * 샘플링 셀 하나를 대표하는 값으로 사용된다. 성능을 위해 영역이 크면
 * 픽셀을 듬성듬성 건너뛰며 샘플링한다.
 *
 * @returns {{ r: number, g: number, b: number, luminance: number } | null}
 */
export function getAverageColor(imageData, cx, cy, radius) {
  const { data, width, height } = imageData;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  if (x1 < x0 || y1 < y0) return null;

  // 영역이 넓어도 한 셀당 최대 ~8x8 지점만 읽도록 건너뛰기 간격을 조절
  const step = Math.max(1, Math.floor((x1 - x0 + 1) / 8));

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  }
  if (count === 0) return null;

  r /= count;
  g /= count;
  b /= count;
  return { r, g, b, luminance: luminanceOf(r, g, b) };
}
