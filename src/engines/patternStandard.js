/**
 * Standard(격자 반복) 패턴 엔진
 *
 * 원본 이미지를 tileScale 배율로 축소/확대한 타일을
 * tileSpacing 간격의 격자(Grid)로 캔버스 전체에 반복 배치한다.
 */

import { getSourceCanvas } from './sourceCanvas';

const MIN_TILE_SIZE = 8;

function positiveNumber(value, fallback, min = 0.0001) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(min, numericValue);
}

/**
 * @param {HTMLCanvasElement} canvas 출력 대상 캔버스
 * @param {ImageData} imageData 분석용 픽셀 데이터
 * @param {object} params
 * @param {number} params.tileScale   타일 배율
 * @param {number} params.tileSpacing 타일 간 여백(px)
 * @param {string} params.backgroundColor 배경 색상
 */
export function renderStandard(canvas, imageData, params, extras = {}) {
  if (!canvas || !imageData) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const source = getSourceCanvas(imageData);
  if (!source) return;

  const { width: cw, height: ch } = canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (!extras.transparentBackground) {
    ctx.fillStyle = params.backgroundColor;
    ctx.fillRect(0, 0, cw, ch);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const patternScale = positiveNumber(params.patternScale, 1, 0.05);
  const repeatX = positiveNumber(params.patternRepeatX, 1, 0.05);
  const repeatY = positiveNumber(params.patternRepeatY, 1, 0.05);
  const tileWidth = Math.max(MIN_TILE_SIZE, imageData.width * params.tileScale * patternScale);
  const tileHeight = Math.max(MIN_TILE_SIZE, imageData.height * params.tileScale * patternScale);
  const strideX = Math.max(MIN_TILE_SIZE, (tileWidth + params.tileSpacing) / repeatX);
  const strideY = Math.max(MIN_TILE_SIZE, (tileHeight + params.tileSpacing) / repeatY);
  const diagonal = Math.hypot(cw, ch);
  const offsetX = (params.patternOffsetX ?? 0) * cw;
  const offsetY = (params.patternOffsetY ?? 0) * ch;

  ctx.save();
  ctx.translate((cw / 2) + offsetX, (ch / 2) + offsetY);
  ctx.rotate(((params.patternRotation ?? 0) * Math.PI) / 180);
  for (let y = -diagonal - strideY; y < diagonal + strideY; y += strideY) {
    for (let x = -diagonal - strideX; x < diagonal + strideX; x += strideX) {
      ctx.drawImage(source, x, y, tileWidth, tileHeight);
    }
  }
  ctx.restore();
}
