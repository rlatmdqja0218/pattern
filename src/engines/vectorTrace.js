import ImageTracer from 'imagetracerjs';

export const DEFAULT_TRACE_OPTIONS = {
  traceMode: 'auto',
  traceThreshold: 0.52,
  traceSimplify: 10,
  traceInvert: false,
  maxSegments: 96,
  maxCandidates: 8,
  minCandidateArea: 24,
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function luminanceOf(red, green, blue) {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_TRACE_OPTIONS,
    ...options,
  };
}

function createThresholdImageData(imageData, options) {
  const tracedData = new ImageData(imageData.width, imageData.height);
  const source = imageData.data;
  const target = tracedData.data;
  const threshold = Math.min(1, Math.max(0, options.traceThreshold));

  for (let index = 0; index < source.length; index += 4) {
    const alpha = source[index + 3] / 255;
    const luminance = luminanceOf(source[index], source[index + 1], source[index + 2]);
    const isForeground = options.traceInvert
      ? luminance >= threshold
      : luminance <= threshold;
    const value = isForeground && alpha > 0.05 ? 0 : 255;

    target[index] = value;
    target[index + 1] = value;
    target[index + 2] = value;
    target[index + 3] = 255;
  }

  return tracedData;
}

function isForegroundPath(path) {
  const fill = (path.getAttribute('fill') || '').replace(/\s+/g, '').toLowerCase();
  return fill === '#000' || fill === '#000000' || fill === 'black' || fill === 'rgb(0,0,0)';
}

function makeHiddenSvg(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const parsedSvg = doc.querySelector('svg');
  if (!parsedSvg) return null;

  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-10000px';
  host.style.top = '-10000px';
  host.style.width = '0';
  host.style.height = '0';
  host.style.overflow = 'hidden';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', parsedSvg.getAttribute('viewBox') || '');
  svg.innerHTML = parsedSvg.innerHTML;
  host.append(svg);
  document.body.append(host);

  return { host, svg };
}

function sampleSvgPath(path, options) {
  const length = path.getTotalLength();
  if (!Number.isFinite(length) || length <= 0) return null;

  const bounds = path.getBBox();
  const area = Math.max(1, bounds.width * bounds.height);
  const sampleStep = Math.max(3, options.traceSimplify);
  const sampleCount = Math.max(4, Math.min(240, Math.ceil(length / sampleStep)));
  const points = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const point = path.getPointAtLength((length * index) / sampleCount);
    points.push({ x: point.x, y: point.y });
  }

  return {
    area,
    length,
    points,
    pathData: path.getAttribute('d') || '',
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  const projectedX = start.x + t * dx;
  const projectedY = start.y + t * dy;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

function simplifyPoints(points, epsilon) {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points.at(-1);

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance <= epsilon) return [first, last];

  const left = simplifyPoints(points.slice(0, maxIndex + 1), epsilon);
  const right = simplifyPoints(points.slice(maxIndex), epsilon);
  return [...left.slice(0, -1), ...right];
}

function decimatePoints(points, maxSegments) {
  if (points.length <= maxSegments) return points;
  const step = points.length / maxSegments;
  return Array.from({ length: maxSegments }, (_, index) => points[Math.floor(index * step)]);
}

function pointsToEditablePathData(points) {
  if (points.length < 3) return null;

  return {
    closed: true,
    segments: points.map((point) => ({
      point: {
        x: Number(point.x.toFixed(2)),
        y: Number(point.y.toFixed(2)),
      },
      handleIn: { x: 0, y: 0 },
      handleOut: { x: 0, y: 0 },
    })),
  };
}

function getForegroundPathSamples(svgString, options) {
  const hiddenSvg = makeHiddenSvg(svgString);
  if (!hiddenSvg) return [];

  try {
    const paths = [...hiddenSvg.svg.querySelectorAll('path')];
    const foregroundPaths = paths.filter(isForegroundPath);
    const candidates = foregroundPaths.length > 0 ? foregroundPaths : paths;

    return candidates
      .map((path) => sampleSvgPath(path, options))
      .filter(Boolean)
      .filter((candidate) => candidate.area >= options.minCandidateArea)
      .sort((a, b) => b.area - a.area || b.length - a.length);
  } finally {
    hiddenSvg.host.remove();
  }
}

export function traceImageDataToSvg(imageData, options = {}) {
  if (!imageData) return '';
  const traceOptions = normalizeOptions(options);
  const thresholdedImageData = createThresholdImageData(imageData, traceOptions);

  return ImageTracer.imagedataToSVG(thresholdedImageData, {
    ltres: 1,
    qtres: 1,
    pathomit: Math.max(4, Math.round(traceOptions.traceSimplify)),
    rightangleenhance: false,
    colorsampling: 0,
    numberofcolors: 2,
    colorquantcycles: 1,
    pal: [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ],
    layering: 0,
    strokewidth: 0,
    linefilter: true,
    scale: 1,
    roundcoords: 2,
    viewbox: true,
    desc: false,
  });
}

export function simplifyEditablePathData(pathData, options = {}) {
  if (!pathData?.segments?.length) return null;
  const traceOptions = normalizeOptions(options);
  const epsilon = Math.max(0.25, traceOptions.traceSimplify * 0.35);
  const points = pathData.segments.map((segment) => segment.point);
  const simplifiedPoints = decimatePoints(
    simplifyPoints(points, epsilon),
    Math.max(8, traceOptions.maxSegments),
  );

  return pointsToEditablePathData(simplifiedPoints);
}

export function traceImageDataToPathCandidates(imageData, options = {}) {
  const traceOptions = normalizeOptions(options);
  if (!imageData || traceOptions.traceMode !== 'auto') return [];
  if (typeof document === 'undefined') return [];

  const svg = traceImageDataToSvg(imageData, traceOptions);
  return getForegroundPathSamples(svg, traceOptions)
    .slice(0, Math.max(1, traceOptions.maxCandidates))
    .map((tracedPath, index) => {
      const pathData = pointsToEditablePathData(tracedPath.points);
      const editablePath = simplifyEditablePathData(pathData, traceOptions);
      if (!editablePath) return null;

      return {
        id: `path-${index}`,
        area: Number(tracedPath.area.toFixed(1)),
        length: Number(tracedPath.length.toFixed(1)),
        pathData: tracedPath.pathData,
        editablePath: {
          ...editablePath,
          trace: {
            svg,
            pathData: tracedPath.pathData,
            width: imageData.width,
            height: imageData.height,
          },
        },
      };
    })
    .filter(Boolean);
}

export function traceImageDataToEditablePathData(imageData, options = {}) {
  const [firstCandidate] = traceImageDataToPathCandidates(imageData, options);
  return firstCandidate?.editablePath ?? null;
}
