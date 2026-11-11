import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildFacility, bayCenterZ } from './facility.js';
import { buildDrone, groundHeight } from './drone.js';
import { aircraftAngles, backflip, compileFlight, maxFlightTime, maxKeyframes, readFlight, readFlightCsv, setAircraftOrientation, writeFlightCsv } from './flights.js';

const flightStorageKey = 'range-flight-sequences-v1';
const select = (query) => document.querySelector(query);
const viewport = select('#viewport');
const error = select('#error');
const play = select('#play');
const playLabel = select('#play-label');
const slider = select('#time');
const label = select('#time-label');
const positionReadout = select('#position');
const timeReadout = select('#flight-time');
const fpsReadout = select('#fps');
const locationLabel = select('#location');
const hint = select('#hint');

function formatReadout(label, value, unit = ' ') {
  return `${label.padEnd(5)} ${value.padStart(7)} ${unit}`;
}

function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  viewport.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb6c2bd);
  scene.fog = new THREE.FogExp2(0xb6c2bd, 0.024);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.05);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.56;
  room.dispose();
  pmrem.dispose();

  const sky = new THREE.Mesh(new THREE.SphereGeometry(65, 28, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x6e959d) },
      horizon: { value: new THREE.Color(0xded5c3) },
    },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 direction;
      uniform vec3 zenith;
      uniform vec3 horizon;
      void main() {
        float blend = smoothstep(-0.04, 0.54, normalize(direction).y);
        gl_FragColor = vec4(mix(horizon, zenith, blend), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.position.z = -6;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xcbd9db, 0x8b7960, 1.25));
  const sun = new THREE.DirectionalLight(0xffd9ab, 3.05);
  sun.position.set(-15, 13, 10);
  sun.target.position.set(0, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -20, right: 20, top: 16, bottom: -16, near: 0.5, far: 48,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.012;
  scene.add(sun, sun.target);

  const bayKey = new THREE.SpotLight(0xf4f6e1, 145, 12, Math.PI / 3.15, 0.65, 2);
  bayKey.position.set(0.55, 3.12, bayCenterZ + 1.5);
  bayKey.target.position.set(0, 0, bayCenterZ);
  bayKey.castShadow = true;
  bayKey.shadow.mapSize.set(1024, 1024);
  bayKey.shadow.bias = -0.00018;
  bayKey.shadow.camera.near = 0.25;
  bayKey.shadow.normalBias = 0.006;
  scene.add(bayKey, bayKey.target);
  for (const offset of [-3.5, -1.4, 3.5]) {
    const fill = new THREE.PointLight(0xe6eee5, 45, 9, 2);
    fill.position.set(-0.4, 3.10, bayCenterZ + offset);
    scene.add(fill);
  }

  buildFacility(scene, Math.min(renderer.capabilities.getMaxAnisotropy(), 8));
  const { root, rotors } = buildDrone(scene);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.12, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.screenSpacePanning = false;
  controls.minDistance = 1.25;
  controls.maxDistance = 27;
  controls.maxPolarAngle = Math.PI * 0.495;

  const followButton = select('#follow');
  let following = false;
  let elapsed = 0;
  let running = false;
  let manualPose = false;
  const poseToggle = select('#pose-toggle');
  const poseForm = select('#pose-form');
  const poseFields = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'].map((name, index) => {
    const input = poseForm.elements.namedItem(name);
    const range = select(`#pose-${name}-slider`);
    return { input, range, decimals: index < 3 ? 2 : 1 };
  });
  let manualAngles = [0, 0, 0];
  const flights = [readFlight(backflip)];
  try {
    const saved = JSON.parse(localStorage.getItem(flightStorageKey) || '[]');
    if (Array.isArray(saved)) {
      for (const entry of saved) {
        const flight = readFlight(entry);
        if (flight.name !== backflip.name) flights.push(flight);
      }
    }
  } catch {
    // The built-in flight remains available if local storage cannot be read.
  }
  let activeFlight = flights[0];
  let sampleFlight = compileFlight(activeFlight);
  let duration = activeFlight.keyframes.at(-1).time;
  const flightToggle = select('#flight-toggle');
  const flightPanel = select('#flight-panel');
  const flightSelect = select('#flight-select');
  const flightDelete = select('#flight-delete');
  const flightStatus = select('#flight-status');
  const flightFile = select('#flight-file');
  const keyframeTime = select('#keyframe-time');
  const keyframeAction = select('#keyframe-action');
  const keyframeActionIcon = keyframeAction.firstElementChild;
  const keyframeCancel = select('#keyframe-cancel');
  const keyframeRows = select('#keyframe-rows');
  let editingKeyframe = null;
  const followPosition = new THREE.Vector3();
  const followTarget = new THREE.Vector3();
  const followOffset = new THREE.Vector3(1.95, 0.95, 2.8);

  function setFollowing(enabled) {
    following = enabled;
    controls.enabled = !enabled;
    followButton.setAttribute('aria-pressed', String(enabled));
    if (enabled) {
      // Clear pending orbit movement before handing the camera to Follow.
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = true;
      updateFollow(1);
      hint.textContent = 'Turn off Follow to adjust the camera';
      locationLabel.textContent = 'FLIGHT TRACKING';
    } else {
      hint.textContent = 'Drag to orbit · Right-click and drag to pan · Scroll to zoom';
      locationLabel.textContent = 'DESERT TEST APRON';
    }
  }

  function resetCamera() {
    setFollowing(false);
    camera.position.set(1.5, 3.1, 7.8);
    controls.target.set(0, 1.35, 0);
    controls.update();
  }

  function updateDrone() {
    const [x, y, z] = sampleFlight(elapsed, root.quaternion);
    root.position.set(y, groundHeight + z, x);
    const ramp = Math.min(0.5, duration / 2);
    const spin = ramp ? THREE.MathUtils.smoothstep(elapsed, 0, ramp) *
      (1 - THREE.MathUtils.smoothstep(elapsed, duration - ramp, duration)) : 0;
    updateRotors(spin);
    slider.value = elapsed;
    const totalTime = duration.toFixed(2);
    const currentTime = elapsed.toFixed(2).padStart(totalTime.length, '0');
    label.value = `${currentTime} / ${Number(totalTime)} S`;
    updatePositionReadout();
    if (!poseForm.hidden) populatePoseForm();
  }

  function updateRotors(spin) {
    for (const { rotor, blades, disc, direction } of rotors) {
      rotor.rotation.y = direction * elapsed * 79 * spin;
      blades.visible = spin < 0.85;
      disc.material.opacity = 0.15 * spin;
      disc.visible = spin > 0;
    }
  }

  function rangePosition() {
    return [root.position.z, root.position.x, root.position.y - groundHeight];
  }

  function updatePositionReadout() {
    const [x, y, z] = rangePosition();
    const [roll, pitch, yaw] = manualPose ? manualAngles : aircraftAngles(root.quaternion);
    timeReadout.textContent = formatReadout('TIME', elapsed.toFixed(2), 'S');
    positionReadout.textContent = [
      ['X', x, 'M'], ['Y', y, 'M'], ['Z', z, 'M'],
      ['ROLL', roll, '°'], ['PITCH', pitch, '°'], ['YAW', yaw, '°'],
    ].map(([axis, value, unit]) => formatReadout(axis, value.toFixed(2), unit)).join('\n');
  }

  function populatePoseForm(values = [...rangePosition(), ...aircraftAngles(root.quaternion)]) {
    values.forEach((value, index) => {
      const field = poseFields[index];
      if (running && document.activeElement === field.input && !field.input.validity.valid) return;
      field.input.value = Number(value.toFixed(4));
      syncPoseSlider(field);
    });
  }

  function syncPoseSlider({ input, range }) {
    const value = input.valueAsNumber;
    if (!input.validity.valid || !Number.isFinite(value)) return;
    range.value = THREE.MathUtils.clamp(value, Number(range.min), Number(range.max));
  }

  function updateFollow(blend) {
    followPosition.copy(root.position).add(followOffset);
    followTarget.copy(root.position);
    followTarget.y += 0.015;
    camera.position.lerp(followPosition, blend);
    controls.target.lerp(followTarget, blend);
    camera.lookAt(controls.target);
  }

  function setRunning(value) {
    running = value;
    playLabel.textContent = running ? 'Pause' : elapsed > 0 && elapsed < duration ? 'Resume' : 'Run flight';
    play.classList.toggle('is-playing', running);
  }

  function seekFlight(time) {
    if (editingKeyframe) {
      setEditingKeyframe(null);
      flightStatus.textContent = 'Keyframe edit canceled.';
    }
    elapsed = time;
    manualPose = false;
    setRunning(false);
    updateDrone();
    if (following) updateFollow(1);
  }

  function keyframeIconButton(icon, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button';
    button.title = label;
    button.setAttribute('aria-label', label);
    const symbol = document.createElement('span');
    symbol.className = `flight-icon ${icon}`;
    symbol.setAttribute('aria-hidden', 'true');
    button.append(symbol);
    return button;
  }

  function renderFlightEditor() {
    flightSelect.replaceChildren(...flights.map((flight, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = flight.name;
      return option;
    }));
    flightSelect.value = flights.indexOf(activeFlight);
    flightDelete.disabled = activeFlight === flights[0];
    keyframeRows.replaceChildren(...activeFlight.keyframes.map(frame => {
      const row = document.createElement('tr');
      const poseValues = [...frame.position, ...frame.orientation].map(value => Number(value.toFixed(2)));
      for (const value of [frame.time, ...poseValues]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      const actions = document.createElement('td');
      const edit = keyframeIconButton('icon-edit', `Edit keyframe at ${frame.time} seconds`);
      edit.addEventListener('click', () => {
        seekFlight(frame.time);
        setEditingKeyframe(frame);
        keyframeTime.value = frame.time;
        manualPose = true;
        manualAngles = frame.orientation;
        updateRotors(0);
        setPosePanel(true);
        populatePoseForm([...frame.position, ...frame.orientation]);
        flightStatus.textContent = `Editing the keyframe at ${frame.time} s. Change its time or pose, then save.`;
      });
      actions.append(edit);
      if (activeFlight.keyframes.length > 1) {
        const remove = keyframeIconButton('icon-delete', `Remove keyframe at ${frame.time} seconds`);
        remove.addEventListener('click', () => {
          activeFlight.keyframes = activeFlight.keyframes.filter(item => item !== frame);
          refreshFlight(Math.min(elapsed, activeFlight.keyframes.at(-1).time));
          saveFlights('Keyframe removed.');
        });
        actions.append(remove);
      }
      row.append(actions);
      return row;
    }));
  }

  function refreshFlight(time = 0) {
    sampleFlight = compileFlight(activeFlight);
    duration = activeFlight.keyframes.at(-1).time;
    slider.max = duration;
    play.disabled = slider.disabled = duration === 0;
    seekFlight(time);
    renderFlightEditor();
  }

  function selectFlight(flight) {
    activeFlight = flight;
    refreshFlight();
    keyframeTime.value = Math.min(maxFlightTime, duration + 1);
    flightStatus.textContent = flight === flights[0]
      ? 'Backflip resets on refresh. Duplicate it to keep your changes.'
      : 'Edit an existing keyframe or add a new one at a different time.';
  }

  function setEditingKeyframe(frame) {
    editingKeyframe = frame;
    const label = frame ? 'Save keyframe' : 'New keyframe';
    keyframeAction.title = label;
    keyframeAction.setAttribute('aria-label', label);
    keyframeActionIcon.className = frame ? 'flight-icon icon-save' : 'flight-icon icon-add';
    keyframeCancel.hidden = !frame;
  }

  function captureKeyframe(time) {
    const angles = manualPose ? manualAngles : aircraftAngles(root.quaternion);
    return {
      time,
      position: rangePosition().map(value => Number(value.toFixed(6))),
      orientation: angles.map(value => Number(value.toFixed(6))),
    };
  }

  function saveFlights(message) {
    try {
      localStorage.setItem(flightStorageKey, JSON.stringify(flights.slice(1)));
      flightStatus.textContent = message;
    } catch {
      flightStatus.textContent = `${message} Browser storage is unavailable. Export CSV to keep a copy.`;
    }
  }

  flightToggle.addEventListener('click', () => {
    flightPanel.hidden = !flightPanel.hidden;
    flightToggle.setAttribute('aria-expanded', String(!flightPanel.hidden));
  });
  flightSelect.addEventListener('change', () => selectFlight(flights[Number(flightSelect.value)]));
  function uniqueFlightName(base) {
    let name = base;
    for (let number = 2; flights.some(flight => flight.name === name); number++) {
      const suffix = ` (${number})`;
      name = base.slice(0, 80 - suffix.length) + suffix;
    }
    return name;
  }

  function promptFlightName(message, suggestion) {
    const name = window.prompt(message, suggestion)?.trim();
    if (!name) return;
    if (name.length > 80 || flights.some(flight => flight.name === name)) {
      flightStatus.textContent = 'Choose a unique name of up to 80 characters.';
      return;
    }
    return name;
  }

  select('#flight-duplicate').addEventListener('click', () => {
    const suggestion = uniqueFlightName(`${activeFlight.name.slice(0, 75)} copy`);
    const name = promptFlightName('Name the duplicate flight', suggestion);
    if (!name) return;
    const copy = readFlight({ ...activeFlight, name });
    flights.push(copy);
    selectFlight(copy);
    saveFlights(`Created ${copy.name}.`);
  });
  flightDelete.addEventListener('click', () => {
    const index = flights.indexOf(activeFlight);
    if (index < 1 || !window.confirm(`Delete “${activeFlight.name}”?`)) return;
    const [deleted] = flights.splice(index, 1);
    selectFlight(flights[Math.min(index, flights.length - 1)]);
    saveFlights(`Deleted ${deleted.name}.`);
  });
  select('#flight-new').addEventListener('click', () => {
    const name = promptFlightName('Name this flight', `Flight ${flights.length}`);
    if (!name) return;
    const flight = { version: 1, name, keyframes: [captureKeyframe(0)] };
    flights.push(flight);
    selectFlight(flight);
    saveFlights('First keyframe added at 0 s. Set the next pose and time, then click New keyframe.');
  });
  keyframeAction.addEventListener('click', () => {
    const time = keyframeTime.valueAsNumber;
    if (!Number.isFinite(time) || !keyframeTime.reportValidity()) {
      flightStatus.textContent = 'Enter a keyframe time between 0 and 3,600 seconds.';
      return;
    }
    if (!poseForm.checkValidity()) {
      setPosePanel(true);
      poseForm.reportValidity();
      return;
    }
    const frames = activeFlight.keyframes;
    if (frames.some(frame => frame !== editingKeyframe && frame.time === time)) {
      flightStatus.textContent = 'A keyframe already exists at that time. Choose a different time.';
      return;
    }
    if (!editingKeyframe && frames.length >= maxKeyframes) {
      flightStatus.textContent = 'This flight has reached 1,000 keyframes.';
      return;
    }
    const frame = captureKeyframe(time);
    const edited = editingKeyframe !== null;
    if (edited) frames[frames.indexOf(editingKeyframe)] = frame;
    else frames.push(frame);
    frames.sort((a, b) => a.time - b.time);
    setEditingKeyframe(null);
    refreshFlight(time);
    keyframeTime.value = Math.min(maxFlightTime, time + 1);
    saveFlights(edited ? `Keyframe saved at ${time} s.` : `Keyframe added at ${time} s.`);
  });
  keyframeCancel.addEventListener('click', () => {
    if (!editingKeyframe) return;
    keyframeTime.value = editingKeyframe.time;
    seekFlight(editingKeyframe.time);
  });
  select('#flight-import').addEventListener('click', () => flightFile.click());
  flightFile.addEventListener('change', async () => {
    const file = flightFile.files[0];
    flightFile.value = '';
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a flight CSV file under 1 MB.');
      const name = file.name.replace(/\.csv$/i, '').trim().slice(0, 80) || 'Imported flight';
      const flight = readFlightCsv(await file.text(), name);
      flight.name = uniqueFlightName(flight.name);
      flights.push(flight);
      selectFlight(flight);
      saveFlights(`Imported ${flight.name}.`);
    } catch (cause) {
      flightStatus.textContent = `Import failed. ${cause.message}`;
    }
  });
  select('#flight-export').addEventListener('click', () => {
    const blob = new Blob([writeFlightCsv(activeFlight)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = activeFlight.name.replace(/[<>:"/\\|?*]/g, '-').replace(/[. ]+$/, '') || 'flight';
    link.download = `${filename}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  followButton.addEventListener('click', () => setFollowing(!following));
  function setPosePanel(open) {
    poseForm.hidden = !open;
    poseToggle.setAttribute('aria-expanded', String(open));
    if (open && !manualPose) updateDrone();
  }
  poseToggle.addEventListener('click', () => setPosePanel(poseForm.hidden));
  for (const field of poseFields) {
    const { input, range, decimals } = field;
    input.addEventListener('input', () => {
      syncPoseSlider(field);
      updateManualPose();
    });
    range.addEventListener('input', () => {
      const value = Number(range.valueAsNumber.toFixed(decimals));
      input.value = THREE.MathUtils.clamp(value, Number(range.min), Number(range.max));
      updateManualPose();
    });
  }
  poseForm.addEventListener('submit', event => event.preventDefault());

  function updateManualPose() {
    if (poseFields.some(({ input }) => !input.validity.valid)) return;
    const values = poseFields.map(({ input }) => input.valueAsNumber);
    if (!values.every(Number.isFinite)) return;
    const [x, y, z, ...angles] = values;
    manualPose = true;
    manualAngles = angles;
    setRunning(false);
    root.position.set(y, groundHeight + z, x);
    setAircraftOrientation(root.quaternion, angles);
    updateRotors(0);
    updatePositionReadout();
  }
  play.addEventListener('click', () => {
    if (editingKeyframe) {
      setEditingKeyframe(null);
      flightStatus.textContent = 'Keyframe edit canceled.';
    }
    if (elapsed >= duration) elapsed = 0;
    if (manualPose) {
      manualPose = false;
      updateDrone();
    }
    setRunning(!running);
  });
  select('#reset').addEventListener('click', () => {
    seekFlight(0);
    resetCamera();
  });
  slider.addEventListener('input', () => seekFlight(Number(slider.value)));

  function resize() {
    const { clientWidth, clientHeight } = viewport;
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.fov = camera.aspect < 0.9 ? 60 : 46;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight, false);
  }
  window.addEventListener('resize', resize);
  resize();
  selectFlight(activeFlight);
  resetCamera();
  let last = performance.now();
  let fpsSampleStart = null;
  let framesRendered = 0;
  document.addEventListener('visibilitychange', () => {
    fpsSampleStart = null;
    framesRendered = 0;
  });
  renderer.setAnimationLoop((now) => {
    const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (running) {
      elapsed = Math.min(duration, elapsed + delta);
      updateDrone();
      if (elapsed >= duration) setRunning(false);
    }
    if (following) updateFollow(1 - Math.exp(-delta * 6));
    else controls.update();
    renderer.render(scene, camera);
    if (fpsSampleStart === null) {
      fpsSampleStart = now;
    } else {
      framesRendered++;
      const sampleMs = now - fpsSampleStart;
      if (sampleMs >= 500) {
        const fps = framesRendered * 1000 / sampleMs;
        fpsReadout.textContent = formatReadout('FPS', fps.toFixed(2));
        fpsSampleStart = now;
        framesRendered = 0;
      }
    }
  });
}

try {
  start();
} catch (cause) {
  console.error(cause);
  error.textContent = 'The 3D scene could not start. Open this page in a browser with WebGL 2 and hardware acceleration enabled.';
  error.hidden = false;
  select('.control-dock').hidden = true;
}
