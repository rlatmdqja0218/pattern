import { PATTERN_RENDERERS } from './index';

const DEFAULT_TEXTURE_SIZE = 2048;
const DEFAULT_STL_DENSITY = 2.5;
const MIN_TEXTURE_DIMENSION = 512;
const MAX_TEXTURE_DIMENSION = 4096;
const SUPPORTED_TEXTURE_SIZES = new Set([1024, 2048, 4096]);
const PIXEL_SCALED_PARAM_KEYS = [
  'dotSpacing',
  'minRadius',
  'maxRadius',
  'motifStrokeWidth',
  'secondaryStrokeWidth',
  'accentStrokeWidth',
  'flowStrength',
  'randomJitter',
  'tileSpacing',
];

function normalizeTextureSize(value) {
  const numericValue = Number(value);
  return SUPPORTED_TEXTURE_SIZES.has(numericValue)
    ? numericValue
    : DEFAULT_TEXTURE_SIZE;
}

function normalizeCanvasDimension(value, fallback = DEFAULT_TEXTURE_SIZE) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : fallback;
  const clampedValue = Math.min(
    MAX_TEXTURE_DIMENSION,
    Math.max(MIN_TEXTURE_DIMENSION, safeValue),
  );
  return Math.max(1, Math.round(clampedValue / 2) * 2);
}

function clampDensity(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_STL_DENSITY;
  return Math.min(12, Math.max(0.2, numericValue));
}

function clampSurfaceAspect(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 1;
  return Math.min(8, Math.max(0.125, numericValue));
}

function getTextureMappingMode(params = {}) {
  return params.stlTextureMappingMode === 'tileRepeat'
    ? 'tileRepeat'
    : 'bakedSurface';
}

function getBakedDensity(params = {}) {
  const scale = Math.max(0.1, params.stlPatternScale ?? 1);
  return {
    densityX: clampDensity(params.stlPatternRepeatX ?? DEFAULT_STL_DENSITY) / scale,
    densityY: clampDensity(params.stlPatternRepeatY ?? DEFAULT_STL_DENSITY) / scale,
  };
}

function mergeStlHalftonePatternParams(params = {}) {
  if (params.mode !== 'halftone') return params;

  return {
    ...params,
    patternScale: (params.patternScale ?? 1) * (params.stlPatternScale ?? 1),
    patternRepeatX: (params.patternRepeatX ?? 1)
      * clampDensity(params.stlPatternRepeatX ?? DEFAULT_STL_DENSITY),
    patternRepeatY: (params.patternRepeatY ?? 1)
      * clampDensity(params.stlPatternRepeatY ?? DEFAULT_STL_DENSITY),
    patternOffsetX: (params.patternOffsetX ?? 0) + (params.stlPatternOffsetX ?? 0),
    patternOffsetY: (params.patternOffsetY ?? 0) + (params.stlPatternOffsetY ?? 0),
    patternRotation: (params.patternRotation ?? 0) + (params.stlPatternRotation ?? 0),
  };
}

function getTextureCanvasSize({
  params = {},
  width,
  height,
  surfaceAspect = 1,
}) {
  const baseResolution = normalizeTextureSize(params?.stlTextureResolution);
  const mappingMode = getTextureMappingMode(params);
  const aspectMode = params?.stlTextureAspectMode ?? 'preserveMotif';
  const shouldMatchSurface = params?.stlPreservePatternAspect !== false
    && mappingMode === 'bakedSurface'
    && aspectMode !== 'square';

  if (!shouldMatchSurface) {
    const resolvedWidth = normalizeCanvasDimension(width ?? baseResolution, baseResolution);
    const resolvedHeight = normalizeCanvasDimension(height ?? baseResolution, baseResolution);
    return { width: resolvedWidth, height: resolvedHeight };
  }

  const aspect = clampSurfaceAspect(surfaceAspect);
  if (aspect >= 1) {
    return {
      width: normalizeCanvasDimension(baseResolution, baseResolution),
      height: normalizeCanvasDimension(baseResolution / aspect, baseResolution),
    };
  }

  return {
    width: normalizeCanvasDimension(baseResolution * aspect, baseResolution),
    height: normalizeCanvasDimension(baseResolution, baseResolution),
  };
}

function scalePatternParams(params, referenceResolution) {
  const resolution = Math.max(1, referenceResolution);
  const resolutionScale = resolution / DEFAULT_TEXTURE_SIZE;
  const mappingMode = getTextureMappingMode(params);
  const isBakedSurface = mappingMode === 'bakedSurface';
  const { densityX, densityY } = isBakedSurface
    ? getBakedDensity(params)
    : { densityX: 1, densityY: 1 };
  const averageDensity = Math.max(0.1, Math.sqrt(densityX * densityY));

  const scaledParams = { ...params };
  if (params.mode === 'vector') {
    scaledParams.motifScale = (params.motifScale ?? 0.55)
      * resolutionScale
      / averageDensity;
    scaledParams.motifSpacingX = ((params.motifSpacingX ?? 56) * resolutionScale) / densityX;
    scaledParams.motifSpacingY = ((params.motifSpacingY ?? 48) * resolutionScale) / densityY;
  }
  if (params.mode === 'standard' || params.mode === 'mirror') {
    scaledParams.tileScale = (params.tileScale ?? 0.5)
      * resolutionScale
      / averageDensity;
  }
  const pixelScale = params.mode === 'halftone'
    ? resolutionScale
    : resolutionScale / averageDensity;

  PIXEL_SCALED_PARAM_KEYS.forEach((key) => {
    if (typeof params[key] === 'number') {
      scaledParams[key] = params[key] * pixelScale;
    }
  });
  return scaledParams;
}

export function createStlPatternTextureCanvas({
  params,
  editablePath,
  selectedMotifs = [],
  imageData = null,
  width,
  height,
  surfaceAspect = 1,
}) {
  const textureSize = getTextureCanvasSize({
    params,
    width,
    height,
    surfaceAspect,
  });
  const canvas = document.createElement('canvas');
  canvas.width = textureSize.width;
  canvas.height = textureSize.height;

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return canvas;

  const transparentBackground = params?.stlTextureBackgroundMode === 'transparentPattern';
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!transparentBackground) {
    context.fillStyle = params?.stlBaseColor ?? '#f2f2f2';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const renderParams = scalePatternParams(mergeStlHalftonePatternParams({
    ...params,
    backgroundColor: params?.stlBaseColor ?? '#f2f2f2',
  }), Math.max(canvas.width, canvas.height));
  const render = PATTERN_RENDERERS[params?.mode] ?? PATTERN_RENDERERS.vector;
  render(
    canvas,
    imageData,
    renderParams,
    {
      editablePath,
      selectedMotifs,
      transparentBackground,
    },
  );

  return canvas;
}
