/**
 * 패턴 렌더러 레지스트리
 *
 * mode 문자열 → 렌더 함수 매핑. 모든 렌더러는
 * (canvas, imageData, params, extras) 시그니처를 공유하므로,
 * 새 조형 규칙(halftone 외 standard, mirror, 향후 cross-stitch 등)을
 * 여기에 등록하기만 하면 PatternCanvas가 그대로 사용한다.
 */
import { renderHalftone } from './patternHalftone';
import { renderStandard } from './patternStandard';
import { renderMirror } from './patternMirror';
import { renderVectorPattern } from './patternVector';

export const PATTERN_RENDERERS = {
  halftone: renderHalftone,
  standard: renderStandard,
  mirror: renderMirror,
  vector: renderVectorPattern,
};

export { loadImage, analyzeImage } from './imageAnalysis';
