/**
 * Mirror(심리스 미러링) 패턴 엔진
 *
 * 원본 타일을 [원본 | 좌우반전 / 상하반전 | 상하좌우반전] 2x2로 결합한
 * 메타 타일(Meta-tile)을 만들어 반복 배치한다. 원본의 가장자리와
 * 반전된 가장자리가 항상 만나므로 이음새 없는(Seamless) 패턴이 된다.
 */

import { getSourceCanvas } from './sourceCanvas';

const MIN_TILE_SIZE = 8;

function positiveNumber(value, fallback, min = 0.0001) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(min, numericValue);
}

function drawFlippedImage(ctx, source, x, y, width, height, flipX, flipY) {
  ctx.save();
  ctx.translate(x + (flipX < 0 ? width : 0), y + (flipY < 0 ? height : 0));
  ctx.scale(flipX, flipY);
  ctx.drawImage(source, 0, 0, width, height);
  ctx.restore();
}

function drawMirrorMetaTile(ctx, source, x, y, width, height) {
  drawFlippedImage(ctx, source, x, y, width, height, 1, 1);
  drawFlippedImage(ctx, source, x + width, y, width, height, -1, 1);
  drawFlippedImage(ctx, source, x, y + height, width, height, 1, -1);
  drawFlippedImage(ctx, source, x + width, y + height, width, height, -1, -1);
}

/**
 * @param {HTMLCanvasElement} canvas 출력 대상 캔버스
 * @param {ImageData} imageData 분석용 픽셀 데이터
 * @param {object} params
 * @param {number} params.tileScale   타일 배율
 * @param {number} params.tileSpacing 메타 타일 간 여백(px)
 * @param {string} params.backgroundColor 배경 색상
 */
export function renderMirror(canvas, imageData, params, extras = {}) {
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
  // 메타 타일은 원본 타일의 2x2 크기
  const strideX = Math.max(MIN_TILE_SIZE, (tileWidth * 2 + params.tileSpacing) / repeatX);
  const strideY = Math.max(MIN_TILE_SIZE, (tileHeight * 2 + params.tileSpacing) / repeatY);
  const diagonal = Math.hypot(cw, ch);
  const offsetX = (params.patternOffsetX ?? 0) * cw;
  const offsetY = (params.patternOffsetY ?? 0) * ch;

  ctx.save();
  ctx.translate((cw / 2) + offsetX, (ch / 2) + offsetY);
  ctx.rotate(((params.patternRotation ?? 0) * Math.PI) / 180);
  for (let y = -diagonal - strideY; y < diagonal + strideY; y += strideY) {
    for (let x = -diagonal - strideX; x < diagonal + strideX; x += strideX) {
      drawMirrorMetaTile(ctx, source, x, y, tileWidth, tileHeight);
    }
  }
  ctx.restore();
}
