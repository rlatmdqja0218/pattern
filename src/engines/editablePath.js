function pointToObject(point) {
  return {
    x: Number(point.x.toFixed(2)),
    y: Number(point.y.toFixed(2)),
  };
}

export function createDefaultEditablePath(scope) {
  const { Path, Point, Size } = scope;
  const viewSize = scope.view?.size ?? new Size(640, 260);
  const center = viewSize.divide(2);
  const width = Math.min(220, viewSize.width * 0.38);
  const height = Math.min(190, viewSize.height * 0.58);

  const path = new Path({
    closed: true,
    strokeColor: '#2f9cff',
    strokeWidth: 2.5,
    fillColor: new scope.Color(0.18, 0.61, 1, 0.08),
    selected: true,
    fullySelected: true,
  });

  path.add(
    new scope.Segment(
      center.add(new Point(-width * 0.34, -height * 0.5)),
      new Point(-width * 0.16, height * 0.04),
      new Point(width * 0.18, -height * 0.04),
    ),
  );
  path.add(
    new scope.Segment(
      center.add(new Point(width * 0.42, -height * 0.42)),
      new Point(-width * 0.28, -height * 0.1),
      new Point(width * 0.34, height * 0.36),
    ),
  );
  path.add(
    new scope.Segment(
      center.add(new Point(width * 0.32, height * 0.5)),
      new Point(width * 0.3, -height * 0.22),
      new Point(-width * 0.24, height * 0.2),
    ),
  );
  path.add(
    new scope.Segment(
      center.add(new Point(-width * 0.44, height * 0.42)),
      new Point(width * 0.24, height * 0.18),
      new Point(-width * 0.36, -height * 0.34),
    ),
  );

  path.fullySelected = true;

  return path;
}

export function serializePaperPath(path) {
  return {
    closed: path.closed,
    segments: path.segments.map((segment) => ({
      point: pointToObject(segment.point),
      handleIn: pointToObject(segment.handleIn),
      handleOut: pointToObject(segment.handleOut),
    })),
  };
}

export function applySerializedPath(path, data) {
  const scope = path.project._scope;
  path.removeSegments();
  path.closed = Boolean(data.closed);

  data.segments.forEach((segment) => {
    path.add(
      new scope.Segment(
        new scope.Point(segment.point.x, segment.point.y),
        new scope.Point(segment.handleIn.x, segment.handleIn.y),
        new scope.Point(segment.handleOut.x, segment.handleOut.y),
      ),
    );
  });

  return path;
}
