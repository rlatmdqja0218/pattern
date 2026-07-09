import { useCallback } from 'react';

/**
 * 패널 사이 splitter 드래그 훅.
 * pointerdown 시 pointer capture를 잡고, 컨테이너 기준 포인터 위치를
 * 0~1 비율로 환산해 onRatioChange로 올린다. 양쪽 최소 픽셀(minStart /
 * minEnd)을 보장해 패널이 너무 작아져 UI가 깨지는 것을 막는다.
 *
 * @param {object} options
 * @param {React.RefObject<HTMLElement>} options.containerRef 분할 대상 컨테이너
 * @param {'horizontal'|'vertical'} options.direction 분할 방향
 *        (horizontal = 좌/우 분할 → X 좌표 사용)
 * @param {number} options.minStart 앞쪽 패널 최소 크기(px)
 * @param {number} options.minEnd 뒤쪽 패널 최소 크기(px)
 * @param {(ratio: number) => void} options.onRatioChange
 * @returns {(event: React.PointerEvent) => void} splitter의 onPointerDown 핸들러
 */
export function useSplitterDrag({
  containerRef,
  direction,
  minStart,
  minEnd,
  onRatioChange,
}) {
  return useCallback(
    (event) => {
      const container = containerRef.current;
      if (!container) return;
      event.preventDefault();

      const splitter = event.currentTarget;
      splitter.setPointerCapture(event.pointerId);
      splitter.classList.add('is-dragging');

      const handleMove = (moveEvent) => {
        const rect = container.getBoundingClientRect();
        const total = direction === 'horizontal' ? rect.width : rect.height;
        if (total <= minStart + minEnd) return;
        const position = direction === 'horizontal'
          ? moveEvent.clientX - rect.left
          : moveEvent.clientY - rect.top;
        const clamped = Math.min(total - minEnd, Math.max(minStart, position));
        onRatioChange(clamped / total);
      };

      const handleUp = () => {
        splitter.classList.remove('is-dragging');
        splitter.removeEventListener('pointermove', handleMove);
        splitter.removeEventListener('pointerup', handleUp);
        splitter.removeEventListener('pointercancel', handleUp);
      };

      splitter.addEventListener('pointermove', handleMove);
      splitter.addEventListener('pointerup', handleUp);
      splitter.addEventListener('pointercancel', handleUp);
    },
    [containerRef, direction, minStart, minEnd, onRatioChange],
  );
}
