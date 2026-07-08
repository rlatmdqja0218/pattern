const MIN_STRIDE = 12;
const DEG_TO_RAD = Math.PI / 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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

function getCombinedBounds(motifEntries) {
  const minX = Math.min(...motifEntries.map(({ bounds }) => bounds.minX));
  const minY = Math.min(...motifEntries.map(({ bounds }) => bounds.minY));
  const maxX = Math.max(...motifEntries.map(({ bounds }) => bounds.maxX));
  const maxY = Math.max(...motifEntries.map(({ bounds }) => bounds.maxY));

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

function hasSelectedMotifPaths(selectedMotifs) {
  return Array.isArray(selectedMotifs)
    && selectedMotifs.some((motif) => hasRenderablePath(motif.editablePath));
}

function seededRandom(rowIndex, columnIndex, motifIndex, salt = 0) {
  let seed = Math.imul(rowIndex + 101, 374761393)
    ^ Math.imul(columnIndex + 503, 668265263)
    ^ Math.imul(motifIndex + 907, 2246822519)
    ^ Math.imul(salt + 37, 3266489917);
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
  return ((seed ^ (seed >>> 16)) >>> 0) / 4294967295;
}

function getDensityVisibility(x, y, canvasWidth, canvasHeight, params) {
  const strength = clamp(params.densityStrength ?? 0.35, 0, 1);
  const nx = canvasWidth > 0 ? clamp(x / canvasWidth, 0, 1) : 0;
  const ny = canvasHeight > 0 ? clamp(y / canvasHeight, 0, 1) : 0;

  if (params.densityDirection === 'rightToLeft') {
    return clamp(1 - ((1 - nx) * strength), 0.04, 1);
  }
  if (params.densityDirection === 'topToBottom') {
    return clamp(1 - (ny * strength), 0.04, 1);
  }
  if (params.densityDirection === 'bottomToTop') {
    return clamp(1 - ((1 - ny) * strength), 0.04, 1);
  }
  if (params.densityDirection === 'centerOut') {
    const dx = Math.abs(nx - 0.5) * 2;
    const dy = Math.abs(ny - 0.5) * 2;
    const distance = clamp(Math.hypot(dx, dy) / Math.SQRT2, 0, 1);
    return clamp((1 - strength) + (distance * strength), 0.04, 1);
  }

  return clamp(1 - (nx * strength), 0.04, 1);
}

function getCellTransform({
  x,
  y,
  rowIndex,
  columnIndex,
  motifIndex,
  strideX,
  canvasWidth,
  canvasHeight,
  params,
}) {
  const transform = {
    extraX: 0,
    extraY: 0,
    extraRotation: 0,
    extraScale: 1,
    extraOpacity: 1,
  };
  const grammar = params.patternGrammar ?? 'grid';

  if (grammar === 'stagger') {
    transform.extraX += (rowIndex % 2) * clamp(params.rowOffset ?? 0.5, 0, 1) * strideX;
  }

  if (grammar === 'diagonalFlow') {
    const angle = (params.flowAngle ?? -18) * DEG_TO_RAD;
    const strength = Math.max(0, params.flowStrength ?? 40);
    const rowShift = rowIndex + (motifIndex * 0.18);
    transform.extraX += Math.cos(angle) * strength * rowShift;
    transform.extraY += Math.sin(angle) * strength * rowShift;
    transform.extraRotation += (params.flowAngle ?? -18) * 0.35;
  }

  if (grammar === 'denseFade') {
    const visibility = getDensityVisibility(x, y, canvasWidth, canvasHeight, params);
    transform.extraOpacity *= visibility;
    transform.extraScale *= 0.72 + (visibility * 0.28);
  }

  if (grammar === 'randomScatter') {
    const randomJitter = Math.max(0, params.randomJitter ?? 0);
    const rotationJitter = Math.max(0, params.rotationJitter ?? 0);
    const scaleJitter = Math.max(0, params.scaleJitter ?? 0);
    const randomX = (seededRandom(rowIndex, columnIndex, motifIndex, 1) * 2) - 1;
    const randomY = (seededRandom(rowIndex, columnIndex, motifIndex, 2) * 2) - 1;
    const randomRotation = (seededRandom(rowIndex, columnIndex, motifIndex, 3) * 2) - 1;
    const randomScale = (seededRandom(rowIndex, columnIndex, motifIndex, 4) * 2) - 1;

    transform.extraX += randomX * randomJitter;
    transform.extraY += randomY * randomJitter;
    transform.extraRotation += randomRotation * rotationJitter;
    transform.extraScale *= clamp(1 + (randomScale * scaleJitter), 0.2, 2.4);
  }

  return transform;
}

function getGrammarPadding(params, canvasHeight, strideY) {
  const grammar = params.patternGrammar ?? 'grid';
  if (grammar === 'diagonalFlow') {
    const rows = Math.ceil(canvasHeight / Math.max(MIN_STRIDE, strideY)) + 4;
    return Math.max(0, params.flowStrength ?? 40) * rows;
  }
  if (grammar === 'randomScatter') {
    return Math.max(0, params.randomJitter ?? 0) + 24;
  }
  if (grammar === 'stagger') {
    return Math.max(0, params.rowOffset ?? 0.5) * MIN_STRIDE;
  }
  return 0;
}

function drawMotif(
  ctx,
  editablePath,
  bounds,
  x,
  y,
  params,
  motifIndex = 0,
  cellTransform = {},
  options = {},
) {
  const useIndexVariation = options.useIndexVariation ?? true;
  const scale = Math.max(0.01, params.motifScale) * (cellTransform.extraScale ?? 1);
  const rotation = (
    (params.motifRotation ?? 0)
    + (useIndexVariation ? motifIndex * 8 : 0)
    + (cellTransform.extraRotation ?? 0)
  ) * DEG_TO_RAD;
  const offset = useIndexVariation ? motifIndex * 12 : 0;

  ctx.save();
  ctx.translate(
    x + offset + (cellTransform.extraX ?? 0),
    y + (offset * 0.5) + (cellTransform.extraY ?? 0),
  );
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  traceEditablePath(ctx, editablePath, bounds);

  ctx.globalAlpha = clamp(
    (params.motifOpacity ?? 1) * (cellTransform.extraOpacity ?? 1),
    0,
    1,
  );
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

function drawMotifGroup(ctx, motifEntries, groupBounds, x, y, params, cellTransform) {
  motifEntries.forEach(({ path, index }) => {
    drawMotif(
      ctx,
      path,
      groupBounds,
      x,
      y,
      params,
      index,
      cellTransform,
      { useIndexVariation: false },
    );
  });
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
  const preserveLayout = (params.motifLayoutMode ?? 'preserveLayout') === 'preserveLayout'
    && hasSelectedMotifPaths(selectedMotifs);
  const groupBounds = preserveLayout ? getCombinedBounds(motifEntries) : null;
  const motifWidth = preserveLayout
    ? groupBounds.width * scale
    : Math.max(
      ...motifEntries.map(({ bounds, index }) => (bounds.width * scale) + (index * 12)),
    );
  const motifHeight = preserveLayout
    ? groupBounds.height * scale
    : Math.max(
      ...motifEntries.map(({ bounds, index }) => (bounds.height * scale) + (index * 6)),
    );
  const strideX = Math.max(MIN_STRIDE, motifWidth + params.motifSpacingX);
  const strideY = Math.max(MIN_STRIDE, motifHeight + params.motifSpacingY);
  const grammarPadding = getGrammarPadding(params, ch, strideY);
  const startX = -strideX - grammarPadding;
  const startY = -strideY - grammarPadding;
  const endX = cw + strideX + grammarPadding;
  const endY = ch + strideY + grammarPadding;

  for (let rowIndex = 0, y = startY; y < endY; rowIndex += 1, y += strideY) {
    for (let columnIndex = 0, x = startX; x < endX; columnIndex += 1, x += strideX) {
      if (preserveLayout) {
        const cellTransform = getCellTransform({
          x: x + strideX / 2,
          y: y + strideY / 2,
          rowIndex,
          columnIndex,
          motifIndex: 0,
          strideX,
          canvasWidth: cw,
          canvasHeight: ch,
          params,
        });

        drawMotifGroup(
          ctx,
          motifEntries,
          groupBounds,
          x + strideX / 2,
          y + strideY / 2,
          params,
          cellTransform,
        );
        continue;
      }

      motifEntries.forEach(({ path, bounds, index }) => {
        const cellTransform = getCellTransform({
          x: x + strideX / 2,
          y: y + strideY / 2,
          rowIndex,
          columnIndex,
          motifIndex: index,
          strideX,
          canvasWidth: cw,
          canvasHeight: ch,
          params,
        });

        drawMotif(
          ctx,
          path,
          bounds,
          x + strideX / 2,
          y + strideY / 2,
          params,
          index,
          cellTransform,
        );
      });
    }
  }

  ctx.globalAlpha = 1;
}
