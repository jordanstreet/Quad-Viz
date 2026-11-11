import { Euler, MathUtils, Quaternion } from 'three';

export const maxFlightTime = 3600;
export const maxKeyframes = 1000;

export const backflip = {
  version: 1,
  name: 'Backflip',
  keyframes: [
    [0, 0], [1.4, 0], [2.25, 0.65], [3.2, 1.35], [3.65, 1.35], [4.2, 2.41],
    [4.4, 2.97, 0, 90], [4.6, 3.14, 180, 0, 180], [4.8, 2.91, 0, -90],
    [5, 2.28], [5.65, 1.48], [6.25, 1.48], [7.65, 0.8], [9.65, 0], [11, 0],
  ].map(([time, height, roll = 0, pitch = 0, yaw = 0]) => ({
    time, position: [0, 0, height], orientation: [roll, pitch, yaw],
  })),
};

export function readFlight(data) {
  const name = typeof data?.name === 'string' ? data.name.trim() : '';
  if (data?.version !== 1 || !name || name.length > 80 || !Array.isArray(data.keyframes) ||
    data.keyframes.length < 1 || data.keyframes.length > maxKeyframes) {
    throw new Error('Expected a version 1 flight with a name and 1–1,000 keyframes.');
  }
  const triplet = values => Array.isArray(values) && values.length === 3 && values.every(Number.isFinite);
  let previousTime = -1;
  const keyframes = data.keyframes.map(frame => {
    if (!Number.isFinite(frame?.time) || frame.time < 0 || frame.time > maxFlightTime || frame.time <= previousTime ||
      !triplet(frame.position) || !triplet(frame.orientation) ||
      frame.orientation.some((angle, axis) => Math.abs(angle) > (axis === 1 ? 90 : 180))) {
      throw new Error('Keyframes need increasing times and valid X, Y, Z and roll, pitch, yaw values.');
    }
    previousTime = frame.time;
    return { time: frame.time, position: [...frame.position], orientation: [...frame.orientation] };
  });
  return { version: 1, name, keyframes };
}

const csvColumns = ['time_s', 'x_m', 'y_m', 'z_m', 'roll_deg', 'pitch_deg', 'yaw_deg'];

export function writeFlightCsv({ keyframes }) {
  const rows = keyframes.map(({ time, position, orientation }) =>
    [time, ...position, ...orientation].join(','));
  return [csvColumns.join(','), ...rows, ''].join('\r\n');
}

export function readFlightCsv(text, name) {
  const source = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let offset = 0;
  const fieldPattern = /("(?:[^"]|"")*"|[^",\r\n]*)(,|\r\n|\n|\r|$)/gy;
  for (const [token, field, delimiter] of source.matchAll(fieldPattern)) {
    offset += token.length;
    row.push(field.startsWith('"') ? field.slice(1, -1).replaceAll('""', '"') : field.trim());
    if (delimiter !== ',') {
      if (row.length !== 1 || row[0] !== '') rows.push(row);
      row = [];
    }
  }
  if (offset !== source.length || rows.slice(1).some(fields => fields.length !== csvColumns.length)) {
    throw new Error('Each CSV row needs seven fields.');
  }
  const [header, ...frames] = rows;
  if (header?.length !== csvColumns.length || header.some((field, i) => field !== csvColumns[i]) || frames.length === 0) {
    throw new Error(`Expected the CSV header ${csvColumns.join(',')} and at least one keyframe.`);
  }
  const keyframes = frames.map(fields => {
    const [time, x, y, z, roll, pitch, yaw] = fields.map(value => value.trim() === '' ? NaN : Number(value));
    return { time, position: [x, y, z], orientation: [roll, pitch, yaw] };
  });
  return readFlight({ version: 1, name, keyframes });
}

const aircraftEuler = new Euler(0, 0, 0, 'YXZ');

export function setAircraftOrientation(quaternion, [roll, pitch, yaw]) {
  const radians = MathUtils.degToRad;
  // At zero attitude, aircraft forward/right/down map to world +Z/-X/-Y.
  aircraftEuler.set(-radians(pitch), -radians(yaw), radians(roll));
  return quaternion.setFromEuler(aircraftEuler);
}

export function aircraftAngles(quaternion) {
  aircraftEuler.setFromQuaternion(quaternion);
  return [aircraftEuler.z, -aircraftEuler.x, -aircraftEuler.y].map(MathUtils.radToDeg);
}

export function compileFlight({ keyframes }) {
  const frames = keyframes.map(frame => ({
    ...frame, rotation: setAircraftOrientation(new Quaternion(), frame.orientation),
  }));
  return (time, rotation) => {
    const next = frames.findIndex(frame => frame.time > time);
    if (next === 0 || next === -1) {
      const frame = next === 0 ? frames[0] : frames.at(-1);
      rotation.copy(frame.rotation);
      return frame.position;
    }
    const a = frames[next - 1];
    const b = frames[next];
    const t = (time - a.time) / (b.time - a.time);
    rotation.copy(a.rotation).slerp(b.rotation, t);
    return a.position.map((value, axis) => (1 - t) * value + t * b.position[axis]);
  };
}
