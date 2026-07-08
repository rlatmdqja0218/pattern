import { useEffect, useRef, useState } from 'react';

/**
 * ResizeObserver로 요소의 실제 크기를 추적하는 훅.
 * 캔버스(Stage) 크기를 컨테이너에 맞추는 데 사용한다.
 */
export function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
