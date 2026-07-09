/**
 * Standard(격자 반복) 패턴 엔진
 *
 * 원본 이미지를 tileScale 배율로 축소/확대한 타일을
 * tileSpacing 간격의 격자(Grid)로 캔버스 전체에 반복 배치한다.
 */

import { getSourceCanvas } from './sourceCanvas';

const MIN_TILE_SIZE = 8;

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

  const tileWidth = Math.max(MIN_TILE_SIZE, imageData.width * params.tileScale);
  const tileHeight = Math.max(MIN_TILE_SIZE, imageData.height * params.tileScale);
  const strideX = Math.max(MIN_TILE_SIZE, tileWidth + params.tileSpacing);
  const strideY = Math.max(MIN_TILE_SIZE, tileHeight + params.tileSpacing);

  for (let y = -strideY; y < ch + strideY; y += strideY) {
    for (let x = -strideX; x < cw + strideX; x += strideX) {
      ctx.drawImage(source, x, y, tileWidth, tileHeight);
    }
  }
}
