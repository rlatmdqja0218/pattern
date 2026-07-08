import { useEffect, useState } from 'react';

/**
 * 이미지 URL(blob/object URL 포함)을 받아 로드가 끝난
 * HTMLImageElement를 돌려주는 훅. Konva/three 양쪽에서 재사용한다.
 */
export function useHtmlImage(url) {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    const el = new window.Image();
    // 외부 이미지 사용 시 캔버스 오염(tainted canvas) 방지
    el.crossOrigin = 'anonymous';
    el.onload = () => setImage(el);
    el.src = url;
    return () => {
      el.onload = null;
    };
  }, [url]);

  return image;
}
