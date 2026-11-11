export function readTelemetry(data) {
  if (typeof data !== 'string' || data.length > 4096) return null;
  let message;
  try {
    message = JSON.parse(data);
  } catch {
    return null;
  }
  if (!message || typeof message !== 'object') return null;
  const { time, x, y, z, roll, pitch, yaw } = message;
  if (![time, x, y, z, roll, pitch, yaw].every(Number.isFinite) || time < 0 ||
    Math.abs(roll) > 180 || Math.abs(pitch) > 90 || Math.abs(yaw) > 180) return null;
  return { time, position: [x, y, z], orientation: [roll, pitch, yaw] };
}
