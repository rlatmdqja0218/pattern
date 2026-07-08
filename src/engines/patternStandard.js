/**
 * Standard(격자 반복) 패턴 엔진 — 스텁
 *
 * 다음 단계에서 구현 예정: 원본 이미지를 dotSpacing/scale 파라미터에 따라
 * 격자(Grid)로 반복 배치하는 타일링 렌더러.
 * 시그니처는 renderHalftone과 동일하게 유지해 mode 레지스트리에서
 * 교체 가능하도록 한다.
 */
export function renderStandard(canvas, imageData, params) {
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
    'Standard(격자 반복) 모드는 다음 단계에서 구현됩니다.',
    canvas.width / 2,
    canvas.height / 2,
  );
}
