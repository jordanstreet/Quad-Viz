import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildFacility, outdoorPadZ } from './facility.js';
import { buildDrone, groundHeight } from './drone.js';

const duration = 11;
const select = (query) => document.querySelector(query);
const viewport = select('#viewport');
const error = select('#error');
const play = select('#play');
const slider = select('#time');
const label = select('#time-label');
const phase = select('#phase');
const altitude = select('#altitude');
const locationLabel = select('#location');
const hint = select('#hint');

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
  scene.fog = new THREE.FogExp2(0xb6c2bd, 0.012);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.05);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.56;
  room.dispose();
  pmrem.dispose();

  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 28, 16), new THREE.ShaderMaterial({
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
  sky.position.z = 14;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xcbd9db, 0x8b7960, 1.25));
  const sun = new THREE.DirectionalLight(0xffd9ab, 3.05);
  sun.position.set(-26, 21, 31);
  sun.target.position.set(0, 0, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 28, bottom: -28, near: 1, far: 85 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  const bayKey = new THREE.SpotLight(0xf4f6e1, 480, 26, Math.PI / 3.15, 0.65, 2);
  bayKey.position.set(1.1, 5.76, -1.4);
  bayKey.target.position.set(0, 0, -4.5);
  bayKey.castShadow = true;
  bayKey.shadow.mapSize.set(1024, 1024);
  bayKey.shadow.bias = -0.00018;
  bayKey.shadow.normalBias = 0.013;
  scene.add(bayKey, bayKey.target);
  for (const z of [-12.5, -7.8, 3.5]) {
    const fill = new THREE.PointLight(0xe6eee5, 145, 20, 2);
    fill.position.set(-0.9, 5.55, z);
    scene.add(fill);
  }

  buildFacility(scene, Math.min(renderer.capabilities.getMaxAnisotropy(), 8));
  const { root, rotors } = buildDrone(scene);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.2, 185);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.screenSpacePanning = false;
  controls.minDistance = 2.8;
  controls.maxDistance = 34;
  controls.maxPolarAngle = Math.PI * 0.495;

  const views = {
    bay: { position: [5.25, 2.55, 2.8], target: [0, 0.96, -5.25], label: 'BAY' },
    apron: { position: [5, 3.1, outdoorPadZ + 8], target: [0, 1.65, outdoorPadZ], label: 'DESERT TEST APRON' },
  };
  const defaultView = 'apron';
  let activeView = defaultView;
  let elapsed = 0;
  let running = false;
  const followPosition = new THREE.Vector3();
  const followTarget = new THREE.Vector3();

  function setView(view) {
    activeView = view;
    controls.enabled = view !== 'follow';
    for (const button of document.querySelectorAll('[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }
    if (view === 'follow') {
      updateFollow(1);
      hint.textContent = 'Select Bay or Apron to pan';
      locationLabel.textContent = 'FLIGHT TRACKING';
    } else {
      const preset = views[view];
      camera.position.set(...preset.position);
      controls.target.set(...preset.target);
      controls.update();
      hint.textContent = 'Drag to orbit · Right-drag or two-finger drag to pan along the floor · Scroll or pinch to zoom';
      locationLabel.textContent = preset.label;
    }
  }

  const spoolStart = 0.6;
  const liftStart = 1.4;
  const climbEnd = 3.2;
  const punchStart = 3.65;
  const flipStart = 4.2;
  const flipEnd = 5;
  const catchEnd = 5.65;
  const descentStart = 6.25;
  const touchdown = 9.65;
  const hoverHeight = 1.35;
  const gravity = 9.81;
  const punchAcceleration = 7;
  const punchTime = flipStart - punchStart;
  const flipTime = flipEnd - flipStart;
  const catchTime = catchEnd - flipEnd;
  const flipEntrySpeed = punchAcceleration * punchTime;
  const flipEntryHeight = hoverHeight + 0.5 * punchAcceleration * punchTime ** 2;
  const catchEntrySpeed = flipEntrySpeed - gravity * flipTime;
  const catchEntryHeight = flipEntryHeight + flipEntrySpeed * flipTime - 0.5 * gravity * flipTime ** 2;
  const catchAcceleration = -catchEntrySpeed / catchTime;
  const catchEndHeight = catchEntryHeight + 0.5 * catchEntrySpeed * catchTime;

  function updateDrone() {
    const climb = THREE.MathUtils.smoothstep(elapsed, liftStart, climbEnd);
    let height = hoverHeight * climb;
    const flip = THREE.MathUtils.smoothstep(elapsed, flipStart, flipEnd);
    let state = 'ON PAD';

    if (elapsed >= descentStart) {
      const descent = THREE.MathUtils.smoothstep(elapsed, descentStart, touchdown);
      height = catchEndHeight * (1 - descent);
      if (elapsed < touchdown) state = 'LANDING';
    } else if (elapsed >= catchEnd) {
      height = catchEndHeight;
      state = 'HOVER';
    } else if (elapsed >= flipEnd) {
      const time = elapsed - flipEnd;
      height = catchEntryHeight + catchEntrySpeed * time + 0.5 * catchAcceleration * time ** 2;
      state = 'CATCH';
    } else if (elapsed >= flipStart) {
      // Coast under gravity while the quad rolls, then carry that speed into the catch.
      const time = elapsed - flipStart;
      height = flipEntryHeight + flipEntrySpeed * time - 0.5 * gravity * time ** 2;
      state = 'SIDE FLIP';
    } else if (elapsed >= punchStart) {
      const time = elapsed - punchStart;
      height = hoverHeight + 0.5 * punchAcceleration * time ** 2;
      state = 'PUNCH UP';
    } else if (elapsed >= climbEnd) {
      state = 'HOVER';
    } else if (elapsed >= liftStart) {
      state = 'CLIMB';
    } else if (elapsed >= spoolStart) {
      state = 'SPOOL UP';
    }

    root.position.set(0, groundHeight + height, outdoorPadZ);
    root.rotation.z = Math.PI * 2 * flip;
    const spin = THREE.MathUtils.smoothstep(elapsed, spoolStart, liftStart) *
      (1 - THREE.MathUtils.smoothstep(elapsed, touchdown, duration));
    for (const { rotor, blades, disc, direction } of rotors) {
      rotor.rotation.y = direction * elapsed * 79 * spin;
      blades.visible = spin < 0.85;
      disc.material.opacity = 0.15 * spin;
      disc.visible = spin > 0;
    }
    slider.value = elapsed.toFixed(2);
    label.value = elapsed.toFixed(1).padStart(4, '0') + ' / ' + duration + ' S';
    phase.textContent = state;
    altitude.textContent = 'ALT ' + height.toFixed(1) + ' M';
  }

  function updateFollow(blend) {
    followPosition.copy(root.position).add(new THREE.Vector3(2.8, 1.36, 3.65));
    followTarget.copy(root.position).add(new THREE.Vector3(0, 0.03, 0));
    camera.position.lerp(followPosition, blend);
    controls.target.lerp(followTarget, blend);
    camera.lookAt(controls.target);
  }

  function setRunning(value) {
    running = value;
    play.textContent = running ? 'Pause' : elapsed > 0 && elapsed < duration ? 'Resume' : 'Run demo';
  }

  for (const button of document.querySelectorAll('[data-view]')) {
    button.addEventListener('click', () => setView(button.dataset.view));
  }
  play.addEventListener('click', () => {
    if (elapsed >= duration) elapsed = 0;
    setRunning(!running);
  });
  select('#reset').addEventListener('click', () => {
    elapsed = 0;
    setRunning(false);
    updateDrone();
    setView(defaultView);
  });
  slider.addEventListener('input', () => {
    elapsed = Number(slider.value);
    setRunning(false);
    updateDrone();
    if (activeView === 'follow') updateFollow(1);
  });

  function resize() {
    const { clientWidth, clientHeight } = viewport;
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.fov = camera.aspect < 0.9 ? 60 : 46;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight, false);
  }
  window.addEventListener('resize', resize);
  resize();
  updateDrone();
  setView(defaultView);
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (running) {
      elapsed = Math.min(duration, elapsed + delta);
      updateDrone();
      if (elapsed >= duration) setRunning(false);
    }
    if (activeView === 'follow') updateFollow(1 - Math.exp(-delta * 6));
    else controls.update();
    renderer.render(scene, camera);
  });
}

try {
  start();
} catch (cause) {
  console.error(cause);
  error.textContent = 'The 3D scene could not start. Open this page in a browser with WebGL 2 and hardware acceleration enabled.';
  error.hidden = false;
  select('.controls').hidden = true;
}
