function roundPoint(point) {
  return {
    x: Number(point.x.toFixed(2)),
    y: Number(point.y.toFixed(2)),
  };
}

function getContainTransform(imageSize, viewSize) {
  const scale = Math.min(
    viewSize.width / imageSize.width,
    viewSize.height / imageSize.height,
  );

  return {
    scale,
    offsetX: (viewSize.width - imageSize.width * scale) / 2,
    offsetY: (viewSize.height - imageSize.height * scale) / 2,
  };
}

function isUsableSize(size) {
  return Boolean(size?.width && size?.height);
}

function transformPathData(pathData, transformSegment) {
  if (!pathData?.segments?.length) return clonePathData(pathData);

  return {
    ...pathData,
    trace: pathData.trace ? { ...pathData.trace } : undefined,
    segments: pathData.segments.map(transformSegment),
  };
}

export function clonePathData(pathData) {
  if (!pathData) return null;

  return {
    ...pathData,
    trace: pathData.trace ? { ...pathData.trace } : undefined,
    segments: Array.isArray(pathData.segments)
      ? pathData.segments.map((segment) => ({
        point: { ...segment.point },
        handleIn: { ...segment.handleIn },
        handleOut: { ...segment.handleOut },
      }))
      : [],
  };
}

export function fitPathDataToView(pathData, imageSize, viewSize) {
  if (!pathData?.segments?.length || !isUsableSize(imageSize) || !isUsableSize(viewSize)) {
    return clonePathData(pathData);
  }

  const { scale, offsetX, offsetY } = getContainTransform(imageSize, viewSize);

  return transformPathData(pathData, (segment) => ({
    point: roundPoint({
      x: offsetX + segment.point.x * scale,
      y: offsetY + segment.point.y * scale,
    }),
    handleIn: roundPoint({
      x: segment.handleIn.x * scale,
      y: segment.handleIn.y * scale,
    }),
    handleOut: roundPoint({
      x: segment.handleOut.x * scale,
      y: segment.handleOut.y * scale,
    }),
  }));
}

export function unfitPathDataFromView(pathData, imageSize, viewSize) {
  if (!pathData?.segments?.length || !isUsableSize(imageSize) || !isUsableSize(viewSize)) {
    return clonePathData(pathData);
  }

  const { scale, offsetX, offsetY } = getContainTransform(imageSize, viewSize);
  if (!scale) return clonePathData(pathData);

  return transformPathData(pathData, (segment) => ({
    point: roundPoint({
      x: (segment.point.x - offsetX) / scale,
      y: (segment.point.y - offsetY) / scale,
    }),
    handleIn: roundPoint({
      x: segment.handleIn.x / scale,
      y: segment.handleIn.y / scale,
    }),
    handleOut: roundPoint({
      x: segment.handleOut.x / scale,
      y: segment.handleOut.y / scale,
    }),
  }));
}

export function getPathDataBounds(pathData) {
  if (!pathData?.segments?.length) return null;

  const points = pathData.segments.flatMap((segment) => [
    segment.point,
    {
      x: segment.point.x + segment.handleIn.x,
      y: segment.point.y + segment.handleIn.y,
    },
    {
      x: segment.point.x + segment.handleOut.x,
      y: segment.point.y + segment.handleOut.y,
    },
  ]);

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

export function normalizePathDataToBounds(pathData) {
  const bounds = getPathDataBounds(pathData);
  if (!bounds) return clonePathData(pathData);

  return transformPathData(pathData, (segment) => ({
    point: roundPoint({
      x: segment.point.x - bounds.centerX,
      y: segment.point.y - bounds.centerY,
    }),
    handleIn: { ...segment.handleIn },
    handleOut: { ...segment.handleOut },
  }));
}
