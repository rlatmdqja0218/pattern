/**
 * Halftone(망점) 패턴 엔진
 *
 * "데이터 → 조형 규칙" 단계를 담당한다.
 * ImageData의 명도 정보를 회전 가능한 샘플링 그리드로 순회하며
 * 각 지점의 명도를 점의 반지름으로 매핑해 점 데이터 배열을 만들고,
 * 이를 캔버스에 렌더링한다.
 *
 * generateHalftoneDots는 순수 함수이므로 추후 Web Worker로 분리 가능하다.
 */

import { getAverageColor } from './imageAnalysis';

const DEG_TO_RAD = Math.PI / 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function positiveNumber(value, fallback, min = 0.0001) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(min, numericValue);
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}

function getFitScale(mode, canvasWidth, canvasHeight, sourceWidth, sourceHeight) {
  const containScale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const coverScale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  if (mode === 'contain') return containScale;
  return coverScale;
}

function getHalftoneTransform(canvas, imageData, params) {
  const { width: canvasWidth, height: canvasHeight } = canvas;
  const fitMode = params.patternFitMode ?? 'cover';
  const patternScale = positiveNumber(params.patternScale, 1, 0.05);
  const repeatX = positiveNumber(params.patternRepeatX, 1, 0.05);
  const repeatY = positiveNumber(params.patternRepeatY, 1, 0.05);
  const fitScale = getFitScale(
    fitMode,
    canvasWidth,
    canvasHeight,
    imageData.width,
    imageData.height,
  );
  const tileWidth = Math.max(1, (imageData.width * fitScale * patternScale) / repeatX);
  const tileHeight = Math.max(1, (imageData.height * fitScale * patternScale) / repeatY);

  return {
    fitMode,
    tileWidth,
    tileHeight,
    scaleX: tileWidth / imageData.width,
    scaleY: tileHeight / imageData.height,
    centerX: canvasWidth / 2,
    centerY: canvasHeight / 2,
    offsetX: (params.patternOffsetX ?? 0) * canvasWidth,
    offsetY: (params.patternOffsetY ?? 0) * canvasHeight,
    rotation: (params.patternRotation ?? 0) * DEG_TO_RAD,
    shouldTile: fitMode === 'tile'
      || Math.abs(repeatX - 1) > 0.001
      || Math.abs(repeatY - 1) > 0.001,
  };
}

function sampleHalftoneSource(imageData, canvasX, canvasY, sampleRadius, transform) {
  const translatedX = canvasX - transform.centerX - transform.offsetX;
  const translatedY = canvasY - transform.centerY - transform.offsetY;
  const cos = Math.cos(-transform.rotation);
  const sin = Math.sin(-transform.rotation);
  const localX = (translatedX * cos) - (translatedY * sin);
  const localY = (translatedX * sin) + (translatedY * cos);
  const sourceX = ((localX + (transform.tileWidth / 2)) / transform.scaleX);
  const sourceY = ((localY + (transform.tileHeight / 2)) / transform.scaleY);

  let sx = sourceX;
  let sy = sourceY;
  if (transform.shouldTile) {
    sx = wrap(sx, imageData.width);
    sy = wrap(sy, imageData.height);
  } else if (sx < 0 || sx >= imageData.width || sy < 0 || sy >= imageData.height) {
    return null;
  }

  const sourceRadius = sampleRadius / Math.max(0.0001, (transform.scaleX + transform.scaleY) / 2);
  return getAverageColor(imageData, sx, sy, sourceRadius);
}

/**
 * ImageData와 파라미터로부터 망점 점 데이터 배열을 생성한다.
 *
 * 그리드 회전은 캔버스 자체를 돌리는 것이 아니라 샘플링 그리드를
 * 이미지 중심 기준으로 회전시킨다: 회전된 그리드 좌표를 이미지 좌표계로
 * 역변환해 명도를 추출하고, 점은 이미지 좌표에 그대로 찍는다.
 *
 * @param {ImageData} imageData 분석용 픽셀 데이터
 * @param {object} params
 * @param {number}  params.dotSpacing      샘플링 그리드 간격(px)
 * @param {number}  params.minRadius       최소 점 반지름
 * @param {number}  params.maxRadius       최대 점 반지름
 * @param {number}  params.threshold       이 값 이하의 강도는 점을 찍지 않음 (0~1)
 * @param {boolean} params.invert          명도 반전 (기본: 어두울수록 큰 점)
 * @param {number}  params.angle           그리드 회전 각도 (deg)
 * @param {boolean} params.useSourceColor  원본 이미지 평균색으로 점을 칠할지
 * @returns {Array<{x: number, y: number, radius: number, color: string | null}>}
 */
export function generateHalftoneDots(imageData, params) {
  if (!imageData) return [];
  const {
    dotSpacing,
    minRadius,
    maxRadius,
    threshold,
    invert,
    angle,
    useSourceColor,
  } = params;

  const { width, height } = imageData;
  const spacing = Math.max(1, dotSpacing);
  const centerX = width / 2;
  const centerY = height / 2;

  const rad = angle * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // 회전된 그리드가 이미지 전체를 빈틈없이 덮도록 대각선 반경만큼 순회
  const halfDiagonal = Math.hypot(width, height) / 2;
  const start = -Math.ceil(halfDiagonal / spacing) * spacing;

  // threshold가 1에 가까울 때 0으로 나누는 것을 방지
  const range = Math.max(1e-6, 1 - threshold);

  const dots = [];
  for (let gy = start; gy <= halfDiagonal; gy += spacing) {
    for (let gx = start; gx <= halfDiagonal; gx += spacing) {
      // 그리드 좌표 → 이미지 좌표 (중심 기준 회전)
      const x = centerX + gx * cos - gy * sin;
      const y = centerY + gx * sin + gy * cos;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const sample = getAverageColor(imageData, x, y, spacing / 2);
      if (!sample) continue;

      // 기본: 어두운 곳(명도 낮음)일수록 강도가 커져 점이 커진다
      const intensity = invert ? sample.luminance : 1 - sample.luminance;
      const normalized = (intensity - threshold) / range;
      if (normalized <= 0) continue;

      const radius = minRadius + (maxRadius - minRadius) * Math.min(1, normalized);
      if (radius <= 0) continue;

      dots.push({
        x,
        y,
        radius,
        color: useSourceColor
          ? `rgb(${Math.round(sample.r)}, ${Math.round(sample.g)}, ${Math.round(sample.b)})`
          : null,
      });
    }
  }
  return dots;
}

/**
 * 점 데이터를 생성해 캔버스에 렌더링한다.
 * 캔버스 전체를 점 그리드로 순회하고, 각 점 위치를 공통 pattern transform의
 * 역변환으로 source image에 매핑해 샘플링한다.
 *
 * @param {HTMLCanvasElement} canvas 출력 대상 캔버스
 * @param {ImageData} imageData 분석용 픽셀 데이터
 * @param {object} params generateHalftoneDots 파라미터 + foregroundColor/backgroundColor
 */
export function renderHalftone(canvas, imageData, params, extras = {}) {
  if (!canvas || !imageData) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width: cw, height: ch } = canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (!extras.transparentBackground) {
    ctx.fillStyle = params.backgroundColor;
    ctx.fillRect(0, 0, cw, ch);
  }

  const spacing = Math.max(1, params.dotSpacing ?? 10);
  const minRadius = Math.max(0, params.minRadius ?? 0.4);
  const maxRadius = Math.max(minRadius, params.maxRadius ?? 5.5);
  const threshold = clamp(params.threshold ?? 0.04, 0, 1);
  const range = Math.max(1e-6, 1 - threshold);
  const gridAngle = (params.angle ?? 0) * DEG_TO_RAD;
  const gridCos = Math.cos(gridAngle);
  const gridSin = Math.sin(gridAngle);
  const centerX = cw / 2;
  const centerY = ch / 2;
  const halfDiagonal = Math.hypot(cw, ch) / 2;
  const start = -Math.ceil(halfDiagonal / spacing) * spacing;
  const transform = getHalftoneTransform(canvas, imageData, params);

  for (let gy = start; gy <= halfDiagonal; gy += spacing) {
    for (let gx = start; gx <= halfDiagonal; gx += spacing) {
      const x = centerX + (gx * gridCos) - (gy * gridSin);
      const y = centerY + (gx * gridSin) + (gy * gridCos);
      if (x < 0 || x >= cw || y < 0 || y >= ch) continue;

      const sample = sampleHalftoneSource(imageData, x, y, spacing / 2, transform);
      if (!sample) continue;

      const intensity = params.invert ? sample.luminance : 1 - sample.luminance;
      const normalized = (intensity - threshold) / range;
      if (normalized <= 0) continue;

      const radius = minRadius + ((maxRadius - minRadius) * Math.min(1, normalized));
      if (radius <= 0) continue;

      ctx.fillStyle = params.useSourceColor
        ? `rgb(${Math.round(sample.r)}, ${Math.round(sample.g)}, ${Math.round(sample.b)})`
        : params.foregroundColor;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
