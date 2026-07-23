type ObjectClass =
  | 'Car'
  | 'Bus'
  | 'Truck'
  | 'Bicycle'
  | 'Motorcycle'
  | 'Pedestrian'
  | 'Dog'
  | 'Traffic light'
  | 'Stop sign';

type FrameMessage = {
  type: 'frame';
  frame: {
    id: number;
    queuedAt: number;
    width: number;
    height: number;
    enabledClasses: ObjectClass[];
  };
};

type ControlMessage = {
  type: 'reset';
};

type Detection = {
  className: ObjectClass;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type TrackedObject = Detection & {
  id: number;
  velocity: number;
  direction: string;
  lifetimeMs: number;
  predictedX: number;
  predictedY: number;
};

type LanePoint = {
  x: number;
  y: number;
};

type LaneModel = {
  leftLane: LanePoint[];
  rightLane: LanePoint[];
  centerLane: LanePoint[];
  roadBoundaries: {
    left: LanePoint[];
    right: LanePoint[];
  };
};

type ResultMessage = {
  type: 'result';
  frameId: number;
  detections: Detection[];
  tracks: TrackedObject[];
  lanes: LaneModel;
  performance: {
    processingMs: number;
    queueLatencyMs: number;
    workerLoad: number;
  };
};

type WorkerMessage = FrameMessage | ControlMessage;

type TrackState = {
  id: number;
  className: ObjectClass;
  x: number;
  y: number;
  startedAt: number;
  updatedAt: number;
  previousX: number;
  previousY: number;
};

const objectClasses: ObjectClass[] = [
  'Car',
  'Bus',
  'Truck',
  'Bicycle',
  'Motorcycle',
  'Pedestrian',
  'Dog',
  'Traffic light',
  'Stop sign',
];

const trackState = new Map<string, TrackState>();
let nextTrackId = 100;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function directionFromDelta(dx: number, dy: number) {
  if (Math.abs(dx) < 0.003 && Math.abs(dy) < 0.003) {
    return 'holding';
  }

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'eastbound' : 'westbound';
  }

  return dy > 0 ? 'southbound' : 'northbound';
}

function sizeForClass(className: ObjectClass) {
  switch (className) {
    case 'Bus':
      return { width: 0.2, height: 0.16 };
    case 'Truck':
      return { width: 0.18, height: 0.15 };
    case 'Bicycle':
    case 'Motorcycle':
      return { width: 0.1, height: 0.13 };
    case 'Pedestrian':
      return { width: 0.07, height: 0.2 };
    case 'Dog':
      return { width: 0.08, height: 0.1 };
    case 'Traffic light':
    case 'Stop sign':
      return { width: 0.06, height: 0.1 };
    default:
      return { width: 0.15, height: 0.12 };
  }
}

function generateDetections(frameId: number, enabledClasses: ObjectClass[]) {
  const enabled = new Set(enabledClasses);

  return objectClasses.flatMap((className, index) => {
    if (!enabled.has(className)) {
      return [];
    }

    const size = sizeForClass(className);
    const phase = frameId * 0.03 + index * 0.74;
    const laneOffset = (index % 3) * 0.16;
    const baseX = 0.18 + laneOffset + Math.sin(phase) * 0.035;
    const baseY =
      className === 'Traffic light' || className === 'Stop sign' ? 0.18 : 0.36 + (index % 4) * 0.1;
    const x = clamp(baseX + Math.cos(phase * 0.7) * 0.025, 0.04, 0.88);
    const y = clamp(baseY + Math.sin(phase * 0.55) * 0.035, 0.05, 0.82);

    return [
      {
        className,
        confidence: 0.74 + ((index * 7 + frameId) % 20) / 100,
        x,
        y,
        width: size.width,
        height: size.height,
      },
    ];
  });
}

function updateTracks(detections: Detection[], now: number) {
  return detections.map((detection, index) => {
    const key = `${detection.className}-${index}`;
    const previous = trackState.get(key);
    const current = previous ?? {
      id: nextTrackId++,
      className: detection.className,
      x: detection.x,
      y: detection.y,
      previousX: detection.x,
      previousY: detection.y,
      startedAt: now,
      updatedAt: now,
    };

    const elapsedSeconds = Math.max((now - current.updatedAt) / 1000, 0.016);
    const dx = detection.x - current.x;
    const dy = detection.y - current.y;
    const velocity = Math.round((Math.hypot(dx, dy) / elapsedSeconds) * 1000) / 10;
    const direction = directionFromDelta(dx, dy);

    current.previousX = current.x;
    current.previousY = current.y;
    current.x = detection.x;
    current.y = detection.y;
    current.updatedAt = now;
    trackState.set(key, current);

    return {
      ...detection,
      id: current.id,
      velocity,
      direction,
      lifetimeMs: Math.round(now - current.startedAt),
      predictedX: clamp(detection.x + dx * 8, 0.02, 0.94),
      predictedY: clamp(detection.y + dy * 8, 0.02, 0.9),
    };
  });
}

function generateLanes(frameId: number): LaneModel {
  const drift = Math.sin(frameId * 0.025) * 0.015;

  return {
    leftLane: [
      { x: 0.36 + drift, y: 1 },
      { x: 0.43 + drift * 0.4, y: 0.62 },
      { x: 0.47, y: 0.32 },
    ],
    centerLane: [
      { x: 0.5 + drift * 0.25, y: 1 },
      { x: 0.5, y: 0.62 },
      { x: 0.5 - drift * 0.2, y: 0.32 },
    ],
    rightLane: [
      { x: 0.64 + drift, y: 1 },
      { x: 0.57 + drift * 0.4, y: 0.62 },
      { x: 0.53, y: 0.32 },
    ],
    roadBoundaries: {
      left: [
        { x: 0.12, y: 1 },
        { x: 0.31 + drift, y: 0.42 },
      ],
      right: [
        { x: 0.88, y: 1 },
        { x: 0.69 + drift, y: 0.42 },
      ],
    },
  };
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === 'reset') {
    trackState.clear();
    nextTrackId = 100;
    return;
  }

  const startedAt = performance.now();
  const receivedAt = Date.now();
  const { frame } = event.data;
  const detections = generateDetections(frame.id, frame.enabledClasses);
  const tracks = updateTracks(detections, startedAt);
  const lanes = generateLanes(frame.id);
  const processingMs = performance.now() - startedAt;
  const result: ResultMessage = {
    type: 'result',
    frameId: frame.id,
    detections,
    tracks,
    lanes,
    performance: {
      processingMs: Math.round(processingMs * 10) / 10,
      queueLatencyMs: Math.max(0, Math.round((receivedAt - frame.queuedAt) * 10) / 10),
      workerLoad: Math.min(99, Math.round(34 + detections.length * 4 + processingMs * 3)),
    },
  };

  self.postMessage(result);
};
