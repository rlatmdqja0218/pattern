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

function scaleAround(point, center, scale) {
  return {
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  };
}

function getScaledAbsoluteSegment(segment, pathBounds, pathScale) {
  const absolute = getAbsoluteSegment(segment);
  const center = { x: pathBounds.centerX, y: pathBounds.centerY };

  return {
    point: scaleAround(absolute.point, center, pathScale),
    handleIn: scaleAround(absolute.handleIn, center, pathScale),
    handleOut: scaleAround(absolute.handleOut, center, pathScale),
  };
}

function traceEditablePath(ctx, editablePath, bounds, pathBounds = bounds, pathScale = 1) {
  const { segments, closed } = editablePath;
  if (!segments?.length) return;

  const first = getScaledAbsoluteSegment(segments[0], pathBounds, pathScale);
  ctx.beginPath();
  ctx.moveTo(first.point.x - bounds.centerX, first.point.y - bounds.centerY);

  for (let index = 1; index < segments.length; index += 1) {
    const previous = getScaledAbsoluteSegment(segments[index - 1], pathBounds, pathScale);
    const current = getScaledAbsoluteSegment(segments[index], pathBounds, pathScale);
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
    const previous = getScaledAbsoluteSegment(segments.at(-1), pathBounds, pathScale);
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
  const selectedEntries = Array.isArray(selectedMotifs)
    ? selectedMotifs
      .filter((motif) => motif.role !== 'ignore' && hasRenderablePath(motif.editablePath))
      .map((motif, index) => ({
        path: motif.editablePath,
        role: normalizeRole(motif.role),
        bounds: getPathBounds(motif.editablePath.segments),
        index,
      }))
    : [];
  if (selectedEntries.length) return selectedEntries;
  if (!hasRenderablePath(editablePath)) return [];

  return [{
    path: editablePath,
    role: 'primary',
    bounds: getPathBounds(editablePath.segments),
    index: 0,
  }];
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
    && selectedMotifs.some((motif) => motif.role !== 'ignore' && hasRenderablePath(motif.editablePath));
}

function normalizeRole(role) {
  return ['primary', 'secondary', 'accent'].includes(role) ? role : 'accent';
}

function hexToRgb(hexColor) {
  const normalized = String(hexColor || '#000000').replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const number = Number.parseInt(value, 16);
  if (Number.isNaN(number)) return { r: 0, g: 0, b: 0 };

  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (value) => Math.round(clamp(value, 0, 255))
    .toString(16)
    .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixColor(colorA, colorB, amount) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const t = clamp(amount, 0, 1);

  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

function getColorBrightness(color) {
  const { r, g, b } = hexToRgb(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function getEngraveColor(backgroundColor) {
  return getColorBrightness(backgroundColor) > 0.5
    ? mixColor(backgroundColor, '#000000', 0.22)
    : mixColor(backgroundColor, '#ffffff', 0.28);
}

function getPalette(params) {
  const background = params.backgroundColor ?? '#f5f1e8';
  const stroke = params.motifStrokeColor ?? '#1f8fff';
  const fill = params.motifFillColor ?? stroke;

  if (params.invertPattern) {
    return {
      background: stroke,
      stroke: background,
      fill: background,
    };
  }

  return { background, stroke, fill };
}

function getRoleStyle(role, params) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'primary') {
    return {
      role: normalizedRole,
      opacity: clamp(params.primaryOpacity ?? 0.9, 0, 1),
      scale: Math.max(0.01, params.primaryScale ?? 1),
      strokeWidth: Math.max(0.1, params.motifStrokeWidth ?? 2),
    };
  }
  if (normalizedRole === 'secondary') {
    return {
      role: normalizedRole,
      opacity: clamp(params.secondaryOpacity ?? 0.35, 0, 1),
      scale: Math.max(0.01, params.secondaryScale ?? 0.72),
      strokeWidth: Math.max(0.1, params.secondaryStrokeWidth ?? 1),
    };
  }

  return {
    role: normalizedRole,
    opacity: clamp(params.accentOpacity ?? 0.65, 0, 1),
    scale: Math.max(0.01, params.accentScale ?? 0.48),
    strokeWidth: Math.max(0.1, params.accentStrokeWidth ?? 1.5),
  };
}

function getPatternTreatment(params, editablePath) {
  const style = params.patternStyle ?? 'hybrid';
  const canFill = Boolean(editablePath.closed);

  if (style === 'outline') {
    return {
      shouldFill: false,
      shouldStroke: true,
      fillAlpha: 0,
      strokeAlpha: 1,
      strokeWidthMultiplier: 1,
      alphaMultiplier: 1,
    };
  }
  if (style === 'solid') {
    const isFragment = (params.motifAssemblyMode ?? 'fragment') === 'fragment';
    return {
      shouldFill: canFill,
      shouldStroke: !canFill,
      fillAlpha: isFragment ? 0.62 : 1,
      strokeAlpha: canFill ? 0 : 1,
      strokeWidthMultiplier: 0.6,
      alphaMultiplier: 1,
    };
  }
  if (style === 'engrave') {
    return {
      shouldFill: canFill,
      shouldStroke: true,
      fillAlpha: 0.34,
      strokeAlpha: 0.92,
      strokeWidthMultiplier: 0.82,
      alphaMultiplier: 0.5,
    };
  }
  if (style === 'ghost') {
    return {
      shouldFill: canFill,
      shouldStroke: true,
      fillAlpha: 0.24,
      strokeAlpha: 0.72,
      strokeWidthMultiplier: 0.72,
      alphaMultiplier: 0.28,
    };
  }

  return {
    shouldFill: canFill,
    shouldStroke: true,
    fillAlpha: 0.48,
    strokeAlpha: 1,
    strokeWidthMultiplier: 1,
    alphaMultiplier: 1,
  };
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
  role = 'primary',
  motifIndex = 0,
  cellTransform = {},
  options = {},
) {
  const useIndexVariation = options.useIndexVariation ?? true;
  const pathBounds = options.pathBounds ?? bounds;
  const roleStyle = getRoleStyle(role, params);
  const pathScale = options.applyRoleScale === false ? 1 : roleStyle.scale;
  const scaleOriginBounds = options.scaleOriginBounds ?? pathBounds;
  const treatment = getPatternTreatment(params, editablePath);
  const palette = getPalette(params);
  const isEngrave = (params.patternStyle ?? 'hybrid') === 'engrave';
  const motifStrokeColor = isEngrave ? getEngraveColor(palette.background) : palette.stroke;
  const motifFillColor = isEngrave ? getEngraveColor(palette.background) : palette.fill;
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
  traceEditablePath(ctx, editablePath, bounds, scaleOriginBounds, pathScale);

  const baseOpacity = clamp(
    (params.motifOpacity ?? 1)
      * roleStyle.opacity
      * treatment.alphaMultiplier
      * (cellTransform.extraOpacity ?? 1),
    0,
    1,
  );

  if (treatment.shouldFill) {
    ctx.globalAlpha = clamp(baseOpacity * treatment.fillAlpha, 0, 1);
    ctx.fillStyle = motifFillColor;
    ctx.fill();
  }

  if (treatment.shouldStroke) {
    ctx.globalAlpha = clamp(baseOpacity * treatment.strokeAlpha, 0, 1);
    ctx.strokeStyle = motifStrokeColor;
    ctx.lineWidth = Math.max(
      0.25,
      (roleStyle.strokeWidth * treatment.strokeWidthMultiplier) / scale,
    );
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

function drawMotifGroup(
  ctx,
  motifEntries,
  groupBounds,
  x,
  y,
  params,
  cellTransform,
  groupOptions,
) {
  const applyRoleScale = groupOptions.preserveRoleScale;
  const scaleWholeGroup = groupOptions.groupScaleMode === 'wholeGroup';

  motifEntries.forEach(({
    path, bounds, role, index,
  }) => {
    drawMotif(
      ctx,
      path,
      groupBounds,
      x,
      y,
      params,
      role,
      index,
      cellTransform,
      {
        pathBounds: bounds,
        applyRoleScale,
        scaleOriginBounds: scaleWholeGroup ? groupBounds : bounds,
        useIndexVariation: false,
      },
    );
  });
}

export function renderVectorPattern(canvas, _imageData, params, extras = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { editablePath, selectedMotifs = [] } = extras;
  const { width: cw, height: ch } = canvas;
  const palette = getPalette(params);
  const backgroundColor = (params.patternStyle === 'engrave' && params.engraveBackground)
    ? mixColor(palette.background, getEngraveColor(palette.background), 0.12)
    : palette.background;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, cw, ch);

  const motifEntries = getMotifEntries(editablePath, selectedMotifs);
  if (!motifEntries.length) return;

  const scale = Math.max(0.01, params.motifScale);
  const assemblyMode = params.motifAssemblyMode ?? 'fragment';
  const preserveLayout = hasSelectedMotifPaths(selectedMotifs)
    && (
      assemblyMode === 'reconstruct'
      || (params.motifLayoutMode ?? 'preserveLayout') === 'preserveLayout'
    );
  const preserveRoleScale = preserveLayout && params.preserveRoleScale === true;
  const groupScaleMode = params.groupScaleMode ?? 'wholeGroup';
  const maxRoleScale = preserveRoleScale
    ? Math.max(...motifEntries.map(({ role }) => getRoleStyle(role, params).scale))
    : 1;
  const groupBounds = preserveLayout ? getCombinedBounds(motifEntries) : null;
  const motifWidth = preserveLayout
    ? groupBounds.width * scale * maxRoleScale
    : Math.max(
      ...motifEntries.map(({ bounds, role, index }) => (
        bounds.width * scale * getRoleStyle(role, params).scale
      ) + (index * 12)),
    );
  const motifHeight = preserveLayout
    ? groupBounds.height * scale * maxRoleScale
    : Math.max(
      ...motifEntries.map(({ bounds, role, index }) => (
        bounds.height * scale * getRoleStyle(role, params).scale
      ) + (index * 6)),
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
          { preserveRoleScale, groupScaleMode },
        );
        continue;
      }

      motifEntries.forEach(({
        path, bounds, role, index,
      }) => {
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
          role,
          index,
          cellTransform,
          { pathBounds: bounds },
        );
      });
    }
  }

  ctx.globalAlpha = 1;
}
