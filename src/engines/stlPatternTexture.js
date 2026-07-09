import { PATTERN_RENDERERS } from './index';

const DEFAULT_TEXTURE_SIZE = 2048;
const DEFAULT_STL_DENSITY = 2.5;
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

function clampDensity(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_STL_DENSITY;
  return Math.min(12, Math.max(0.2, numericValue));
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

function scalePatternParams(params, resolution) {
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
  PIXEL_SCALED_PARAM_KEYS.forEach((key) => {
    if (typeof params[key] === 'number') {
      scaledParams[key] = (params[key] * resolutionScale) / averageDensity;
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
}) {
  const resolution = normalizeTextureSize(params?.stlTextureResolution);
  const canvas = document.createElement('canvas');
  canvas.width = normalizeTextureSize(width ?? resolution);
  canvas.height = normalizeTextureSize(height ?? resolution);

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return canvas;

  const transparentBackground = params?.stlTextureBackgroundMode === 'transparentPattern';
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!transparentBackground) {
    context.fillStyle = params?.stlBaseColor ?? '#f2f2f2';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const renderParams = scalePatternParams({
    ...params,
    backgroundColor: params?.stlBaseColor ?? '#f2f2f2',
  }, canvas.width);
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
