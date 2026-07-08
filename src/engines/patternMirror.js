/**
 * Mirror(미러링 대칭) 패턴 엔진 — 스텁
 *
 * 다음 단계에서 구현 예정: 원본을 상하/좌우로 뒤집은 4개의 사본을 결합해
 * 이음새 없는 메타 타일(Meta-tile)을 만들고 이를 반복 배치하는
 * 심리스(Seamless) 렌더러.
 * 시그니처는 renderHalftone과 동일하게 유지한다.
 */
export function renderMirror(canvas, imageData, params) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = params.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = params.foregroundColor;
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    'Mirror(심리스 대칭) 모드는 다음 단계에서 구현됩니다.',
    canvas.width / 2,
    canvas.height / 2,
  );
}
