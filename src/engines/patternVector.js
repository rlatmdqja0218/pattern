const MIN_STRIDE = 12;

function getAbsoluteSegment(segment) {
  return {
    point: segment.point,
    handleIn: {
      x: segment.point.x + segment.handleIn.x,
      y: segment.point.y + segment.handleIn.y,
    },
    handleOut: {
      x: segment.point.x + segment.handleOut.x,
      y: segment.point.y + segment.handleOut.y,
    },
  };
}

function getPathBounds(segments) {
  const points = segments.flatMap((segment) => {
    const absolute = getAbsoluteSegment(segment);
    return [absolute.point, absolute.handleIn, absolute.handleOut];
  });

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function traceEditablePath(ctx, editablePath, bounds) {
  const { segments, closed } = editablePath;
  if (!segments?.length) return;

  const first = getAbsoluteSegment(segments[0]);
  ctx.beginPath();
  ctx.moveTo(first.point.x - bounds.centerX, first.point.y - bounds.centerY);

  for (let index = 1; index < segments.length; index += 1) {
    const previous = getAbsoluteSegment(segments[index - 1]);
    const current = getAbsoluteSegment(segments[index]);
    ctx.bezierCurveTo(
      previous.handleOut.x - bounds.centerX,
      previous.handleOut.y - bounds.centerY,
      current.handleIn.x - bounds.centerX,
      current.handleIn.y - bounds.centerY,
      current.point.x - bounds.centerX,
      current.point.y - bounds.centerY,
    );
  }

  if (closed) {
    const previous = getAbsoluteSegment(segments.at(-1));
    ctx.bezierCurveTo(
      previous.handleOut.x - bounds.centerX,
      previous.handleOut.y - bounds.centerY,
      first.handleIn.x - bounds.centerX,
      first.handleIn.y - bounds.centerY,
      first.point.x - bounds.centerX,
      first.point.y - bounds.centerY,
    );
    ctx.closePath();
  }
}

function hasRenderablePath(editablePath) {
  return Boolean(editablePath?.segments?.length);
}

function getMotifEntries(editablePath, selectedMotifs = []) {
  const selectedPaths = Array.isArray(selectedMotifs)
    ? selectedMotifs
      .map((motif) => motif.editablePath)
      .filter(hasRenderablePath)
    : [];
  const paths = selectedPaths.length
    ? selectedPaths
    : hasRenderablePath(editablePath)
      ? [editablePath]
      : [];

  return paths.map((path, index) => ({
    path,
    bounds: getPathBounds(path.segments),
    index,
  }));
}

function drawMotif(ctx, editablePath, bounds, x, y, params, motifIndex = 0) {
  const scale = Math.max(0.01, params.motifScale);
  const rotation = ((params.motifRotation + motifIndex * 8) * Math.PI) / 180;
  const offset = motifIndex * 12;

  ctx.save();
  ctx.translate(x + offset, y + offset * 0.5);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  traceEditablePath(ctx, editablePath, bounds);

  ctx.globalAlpha = params.motifOpacity;
  if (params.motifFillEnabled && editablePath.closed) {
    ctx.fillStyle = params.motifFillColor;
    ctx.fill();
  }
  ctx.strokeStyle = params.motifStrokeColor;
  ctx.lineWidth = Math.max(0.25, params.motifStrokeWidth / scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

export function renderVectorPattern(canvas, _imageData, params, extras = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { editablePath, selectedMotifs = [] } = extras;
  const { width: cw, height: ch } = canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = params.backgroundColor;
  ctx.fillRect(0, 0, cw, ch);

  const motifEntries = getMotifEntries(editablePath, selectedMotifs);
  if (!motifEntries.length) return;

  const scale = Math.max(0.01, params.motifScale);
  const motifWidth = Math.max(
    ...motifEntries.map(({ bounds, index }) => (bounds.width * scale) + (index * 12)),
  );
  const motifHeight = Math.max(
    ...motifEntries.map(({ bounds, index }) => (bounds.height * scale) + (index * 6)),
  );
  const strideX = Math.max(MIN_STRIDE, motifWidth + params.motifSpacingX);
  const strideY = Math.max(MIN_STRIDE, motifHeight + params.motifSpacingY);
  const startX = -strideX;
  const startY = -strideY;

  for (let y = startY; y < ch + strideY; y += strideY) {
    for (let x = startX; x < cw + strideX; x += strideX) {
      motifEntries.forEach(({ path, bounds, index }) => {
        drawMotif(
          ctx,
          path,
          bounds,
          x + strideX / 2,
          y + strideY / 2,
          params,
          index,
        );
      });
    }
  }

  ctx.globalAlpha = 1;
}
