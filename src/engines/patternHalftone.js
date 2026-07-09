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

  const rad = (angle * Math.PI) / 180;
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
 * 이미지 좌표계의 점들을 캔버스 크기에 맞춰 contain 방식으로 스케일링한다.
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

  // 이미지 좌표계 → 캔버스 좌표계 (contain, 중앙 정렬)
  const scale = Math.min(cw / imageData.width, ch / imageData.height);
  const offsetX = (cw - imageData.width * scale) / 2;
  const offsetY = (ch - imageData.height * scale) / 2;
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

  const dots = generateHalftoneDots(imageData, params);
  ctx.fillStyle = params.foregroundColor;
  for (const dot of dots) {
    if (dot.color) ctx.fillStyle = dot.color;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
