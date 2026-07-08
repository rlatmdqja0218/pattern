const MIN_TILE_SIZE = 8;
const HALFTONE_STEP = 8;

function createWorkCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getCanvasContext(canvas, options) {
  return canvas.getContext('2d', options);
}

export function analyzeImage(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = createWorkCanvas(width, height);
  const ctx = getCanvasContext(canvas, { willReadFrequently: true });

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return {
    canvas,
    imageData: ctx.getImageData(0, 0, width, height),
    width,
    height,
  };
}

export function renderPattern(
  canvas,
  source,
  params,
  viewportWidth = canvas.width,
  viewportHeight = canvas.height,
) {
  const ctx = getCanvasContext(canvas);
  if (!ctx || !source) return;

  const { symmetryType, threshold } = params;

  ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (symmetryType === 'Halftone') {
    drawHalftone(ctx, source, params, viewportWidth, viewportHeight);
  } else {
    drawTiledPattern(ctx, source.canvas, params, viewportWidth, viewportHeight);
  }

  ctx.restore();

  return {
    mode: symmetryType,
    threshold,
    sourcePixels: source.imageData.data.length,
  };
}

function drawTiledPattern(ctx, sourceCanvas, params, canvasWidth, canvasHeight) {
  const scaledWidth = Math.max(MIN_TILE_SIZE, sourceCanvas.width * params.scale);
  const scaledHeight = Math.max(MIN_TILE_SIZE, sourceCanvas.height * params.scale);
  const metaWidth = params.symmetryType === 'Mirror' ? scaledWidth * 2 : scaledWidth;
  const metaHeight = params.symmetryType === 'Mirror' ? scaledHeight * 2 : scaledHeight;
  const strideX = Math.max(MIN_TILE_SIZE, metaWidth + params.spacingX);
  const strideY = Math.max(MIN_TILE_SIZE, metaHeight + params.spacingY);
  const startX = -strideX;
  const startY = -strideY;
  const endX = canvasWidth + strideX;
  const endY = canvasHeight + strideY;

  for (let y = startY; y < endY; y += strideY) {
    for (let x = startX; x < endX; x += strideX) {
      if (params.symmetryType === 'Mirror') {
        drawMirrorMetaTile(ctx, sourceCanvas, x, y, scaledWidth, scaledHeight);
      } else {
        ctx.drawImage(sourceCanvas, x, y, scaledWidth, scaledHeight);
      }
    }
  }
}

function drawMirrorMetaTile(ctx, sourceCanvas, x, y, width, height) {
  drawFlippedImage(ctx, sourceCanvas, x, y, width, height, 1, 1);
  drawFlippedImage(ctx, sourceCanvas, x + width, y, width, height, -1, 1);
  drawFlippedImage(ctx, sourceCanvas, x, y + height, width, height, 1, -1);
  drawFlippedImage(ctx, sourceCanvas, x + width, y + height, width, height, -1, -1);
}

function drawFlippedImage(ctx, sourceCanvas, x, y, width, height, flipX, flipY) {
  ctx.save();
  ctx.translate(x + (flipX < 0 ? width : 0), y + (flipY < 0 ? height : 0));
  ctx.scale(flipX, flipY);
  ctx.drawImage(sourceCanvas, 0, 0, width, height);
  ctx.restore();
}

function drawHalftone(ctx, source, params, canvasWidth, canvasHeight) {
  const { data, width, height } = source.imageData;
  const scaledWidth = Math.max(MIN_TILE_SIZE, width * params.scale);
  const scaledHeight = Math.max(MIN_TILE_SIZE, height * params.scale);
  const strideX = Math.max(MIN_TILE_SIZE, scaledWidth + params.spacingX);
  const strideY = Math.max(MIN_TILE_SIZE, scaledHeight + params.spacingY);
  const sampleStep = Math.max(4, Math.round(HALFTONE_STEP / params.scale));

  ctx.fillStyle = '#f5f7fa';

  for (let tileY = -strideY; tileY < canvasHeight + strideY; tileY += strideY) {
    for (let tileX = -strideX; tileX < canvasWidth + strideX; tileX += strideX) {
      drawHalftoneTile(ctx, data, width, height, tileX, tileY, params, sampleStep);
    }
  }
}

function drawHalftoneTile(ctx, data, width, height, tileX, tileY, params, sampleStep) {
  const scaledStep = sampleStep * params.scale;
  const maxRadius = Math.max(0.75, scaledStep * 0.5);

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const pixelIndex = (y * width + x) * 4;
      const alpha = data[pixelIndex + 3] / 255;
      if (alpha <= 0) continue;

      const red = data[pixelIndex];
      const green = data[pixelIndex + 1];
      const blue = data[pixelIndex + 2];
      const brightness = (red + green + blue) / 3;
      if (brightness < params.threshold) continue;

      const radius =
        ((brightness - params.threshold) / (255 - params.threshold || 1)) * maxRadius;
      const centerX = tileX + x * params.scale;
      const centerY = tileY + y * params.scale;

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
}
