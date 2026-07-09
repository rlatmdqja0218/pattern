import { PATTERN_RENDERERS } from './index';

const DEFAULT_TEXTURE_SIZE = 2048;
const SUPPORTED_TEXTURE_SIZES = new Set([1024, 2048, 4096]);
const PIXEL_SCALED_PARAM_KEYS = [
  'motifSpacingX',
  'motifSpacingY',
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

function scalePatternParams(params, resolution) {
  const resolutionScale = resolution / DEFAULT_TEXTURE_SIZE;
  if (resolutionScale === 1) return params;

  const scaledParams = { ...params };
  if (params.mode === 'vector') {
    scaledParams.motifScale = (params.motifScale ?? 0.55) * resolutionScale;
  }
  if (params.mode === 'standard' || params.mode === 'mirror') {
    scaledParams.tileScale = (params.tileScale ?? 0.5) * resolutionScale;
  }
  PIXEL_SCALED_PARAM_KEYS.forEach((key) => {
    if (typeof params[key] === 'number') {
      scaledParams[key] = params[key] * resolutionScale;
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
