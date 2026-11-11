import * as THREE from 'three';

export const launchPadSurfaceY = 0;
export const bayCenterZ = -13;
const apronSize = 16;
// Apron (X, Y) maps to world (Z, X), pointing away from the bay and right when facing it.
const conePositions = [[3, 3], [3, -3], [-3, 3], [-3, -3]];

const standard = (color, roughness = 0.65, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

export function box(parent, name, size, position, material, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function noiseCanvas(base, amount) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(256, 256);
  let seed = 813;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const value = base + amount * (seed / 4294967296 - 0.5);
    pixels.data.set([value, value, value, 255], i);
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function surfaceNoise(base, amount, repeat, anisotropy) {
  const texture = new THREE.CanvasTexture(noiseCanvas(base, amount));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = anisotropy;
  return texture;
}

function apronSurface(anisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  const pixelsPerMeter = canvas.width / apronSize;
  // On the box's top face, canvas right and down are world +X and +Z.
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(pixelsPerMeter, pixelsPerMeter);
  const half = apronSize / 2;
  const noise = noiseCanvas(220, 29);
  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) ctx.drawImage(noise, x, z, 1, 1);
  }
  for (let m = 1 - half; m < half; m++) {
    ctx.strokeStyle = m === 0 ? '#8c887c' : '#aaa69c';
    ctx.lineWidth = m === 0 ? 0.022 : 0.015;
    ctx.beginPath();
    ctx.moveTo(m, -half);
    ctx.lineTo(m, half);
    ctx.moveTo(-half, m);
    ctx.lineTo(half, m);
    ctx.stroke();
  }

  ctx.fillStyle = '#454d49';
  ctx.fillRect(-0.5, -0.5, 1, 1);
  ctx.strokeStyle = '#ffc263';
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      ctx.moveTo(x * 0.32, z * 0.46);
      ctx.lineTo(x * 0.46, z * 0.46);
      ctx.lineTo(x * 0.46, z * 0.32);
    }
  }
  ctx.stroke();
  ctx.fillStyle = '#e8ebd5';
  ctx.fillRect(-0.09, -0.007, 0.18, 0.014);
  ctx.fillRect(-0.007, -0.09, 0.014, 0.18);

  ctx.setTransform(1, 0, 0, 1, canvas.width / 2, canvas.height / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const stencil = (text, x, z, height, width) => {
    ctx.font = `bold ${height * pixelsPerMeter}px Consolas, monospace`;
    ctx.fillText(text, x * pixelsPerMeter, z * pixelsPerMeter, width * pixelsPerMeter);
  };
  ctx.fillStyle = '#e8ebd5';
  stencil('01', 0, 0.31, 0.15, 0.42);
  stencil('0, 0', 0, -0.31, 0.12, 0.40);
  ctx.fillStyle = '#464740';
  for (const [x, y] of conePositions) {
    stencil(`(${x}, ${y}) m`, y + 0.5, x + 0.36, 0.23, 0.87);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function lettering(parent, text, width, height, position, color = '#eff0df') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'bold 156px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 137, 1010);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, toneMapped: false,
  }));
  mesh.position.set(...position);
  parent.add(mesh);
}

function mountHeightScale(scene, cladding, anisotropy) {
  const width = 0.60;
  const height = 3.30;
  const bottom = 0.12;
  const pixelsPerMeter = 320;
  const canvas = document.createElement('canvas');
  canvas.width = width * pixelsPerMeter;
  canvas.height = height * pixelsPerMeter;
  const ctx = canvas.getContext('2d');
  const tickY = meters => (bottom + height - meters) * pixelsPerMeter;

  ctx.fillStyle = '#303832';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#a1a89b';
  ctx.fillRect(22, tickY(3.25), 3, tickY(0.25) - tickY(3.25));
  ctx.font = 'bold 38px Consolas, monospace';
  ctx.textBaseline = 'middle';
  for (let quarter = 1; quarter <= 13; quarter++) {
    const y = tickY(quarter / 4);
    const wholeMeter = quarter % 4 === 0;
    const labeled = quarter % 2 === 0;
    ctx.fillStyle = wholeMeter ? '#ffc263' : '#e8ebdf';
    ctx.fillRect(22, y - 2, labeled ? 48 : 26, 4);
    if (labeled) ctx.fillText(`${(quarter / 4).toFixed(1)} m`, 78, y);
  }

  const face = standard(0xffffff, 0.83);
  face.map = new THREE.CanvasTexture(canvas);
  face.map.colorSpace = THREE.SRGBColorSpace;
  face.map.anisotropy = anisotropy;
  // Mount beyond the rib faces so the scale and cladding never share a visible surface.
  box(scene, 'Exterior height scale', [width, height, 0.024], [3.48, bottom + height / 2, -7.899],
    [cladding, cladding, cladding, cladding, face, cladding], false);
}

function addServiceRoad(scene, groundY, anisotropy) {
  const route = new THREE.CatmullRomCurve3([
    [9.6, 18.3], [11.5, 12.5], [13, 6], [11.5, -3], [10, -8], [7.8, -14],
    [7.5, -19], [10.2, -25], [13.4, -31.6], [12.2, -37.6],
  ].map(([x, z]) => new THREE.Vector3(x, groundY + 0.008, z)));
  const lanes = [-1, -0.83, -0.55, -0.33, 0, 0.33, 0.55, 0.83, 1];
  const shades = [0xb1a089, 0xaaa08e, 0x958b7a, 0x9a9080, 0xafa491, 0x9a9080, 0x958b7a, 0xaaa08e, 0xb1a089]
    .map(hex => new THREE.Color(hex));
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const steps = 128;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = route.getPointAt(t);
    const direction = route.getTangentAt(t);
    const halfWidth = 1.52 + 0.07 * Math.sin(i * 1.7);
    for (const [j, lane] of lanes.entries()) {
      positions.push(point.x - direction.z * lane * halfWidth, point.y, point.z + direction.x * lane * halfWidth);
      colors.push(shades[j].r, shades[j].g, shades[j].b);
      uvs.push((lane + 1) / 2, t);
      if (i > 0 && j > 0) {
        const b = i * lanes.length + j;
        indices.push(b - lanes.length - 1, b - lanes.length, b, b - lanes.length - 1, b, b - 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    map: surfaceNoise(218, 50, [2, 36], anisotropy), vertexColors: true, roughness: 1,
  });
  const road = new THREE.Mesh(geometry, material);
  road.name = 'Gravel service road';
  road.receiveShadow = true;
  scene.add(road);
}

function addDesertTerrain(scene, groundY, anisotropy) {
  const hills = [];
  for (let i = 0; i < 17; i++) {
    const angle = i * 2.39996;
    const distance = 28 + (i % 4) * 4;
    hills.push([
      Math.sin(angle) * distance, Math.cos(angle) * distance - 8,
      6 + (i % 3) * 2.4, 5.5 + (i % 5) * 0.65, 1.5 + (i % 4) * 0.65, angle,
    ]);
  }
  hills.push(
    [-15, -43, 13, 9, 4.4, 0.24], [3, -46, 12, 8, 3.6, -0.22], [17, -45, 11, 8, 4.1, 0.52],
    [-11.8, -13.4, 3.7, 2.2, 0.46, 0.42], [14.8, -11.4, 2.9, 1.7, 0.39, -0.7],
    [5.0, -24.8, 3.3, 1.9, 0.56, -0.28],
  );
  const profiles = hills.map(([x, z, width, depth, height, angle]) =>
    ({ x, z, width, depth, height, cos: Math.cos(angle), sin: Math.sin(angle) }));
  const geometry = new THREE.PlaneGeometry(100, 100, 160, 160);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, groundY, -6);
  const points = geometry.attributes.position;
  const colors = new Float32Array(points.count * 3);
  const sand = new THREE.Color(0xb1a089);
  const stone = new THREE.Color(0x938775);
  const shade = new THREE.Color();
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i);
    const z = points.getZ(i);
    const warpedX = x + 0.8 * Math.sin(z * 0.37) + 0.34 * Math.sin((x + z) * 0.71);
    const warpedZ = z + 0.7 * Math.sin(x * 0.31) + 0.33 * Math.cos((x - z) * 0.64);
    let elevation = 0;
    for (const hill of profiles) {
      const dx = warpedX - hill.x;
      const dz = warpedZ - hill.z;
      const u = (dx * hill.cos - dz * hill.sin) / hill.width;
      const v = (dx * hill.sin + dz * hill.cos) / hill.depth;
      const footprint = 1 - u * u - v * v;
      if (footprint > 0) elevation += hill.height * footprint ** 1.65;
    }
    points.setY(i, groundY + elevation);
    const grain = Math.sin(x * 0.62 + z * 0.79) * Math.sin(x * 0.23 - z * 0.51);
    shade.copy(sand).lerp(stone, Math.min(0.85, elevation / 4.5))
      .multiplyScalar(1 + 0.035 * grain + 0.04 * Math.sin(x * 0.24 + z * 0.18));
    shade.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    map: surfaceNoise(217, 35, [60, 60], anisotropy), vertexColors: true, roughness: 1,
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = 'Desert terrain';
  terrain.receiveShadow = true;
  scene.add(terrain);
}

function addShoulderGravel(scene, groundY) {
  const patches = [
    [-9.3, 1.7], [-9.2, -5.6], [-6.9, -10.1], [-8.8, -15.8], [-7.4, -21.6],
    [8.9, 0.3], [8.9, -4.9], [6.15, -9.2], [5.45, -13.5], [5.1, -20.0],
    [13.7, -9.4], [14.3, -15.8], [12.2, -20.8], [13.8, -24.2], [-11.2, -24.7],
  ];
  const random = THREE.MathUtils.seededRandom;
  random(1385);
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ roughness: 1 }), patches.length * 12);
  stones.name = 'Shoulder gravel';
  stones.receiveShadow = true;
  const transform = new THREE.Object3D();
  const rockColors = [0x9c907a, 0xb1a38e, 0x938672].map(hex => new THREE.Color(hex));
  for (const [patch, [x, z]] of patches.entries()) {
    for (let i = 0; i < 12; i++) {
      const angle = random() * Math.PI * 2;
      const offset = 0.85 * Math.sqrt(random());
      const size = 0.018 + random() * 0.05;
      transform.position.set(x + Math.cos(angle) * offset, groundY, z + Math.sin(angle) * offset);
      transform.rotation.y = angle;
      transform.scale.set(size, size * 0.40, size * 0.8);
      transform.updateMatrix();
      const index = patch * 12 + i;
      stones.setMatrixAt(index, transform.matrix);
      stones.setColorAt(index, rockColors[i % rockColors.length]);
    }
  }
  scene.add(stones);
}

export function buildFacility(scene, anisotropy) {
  const steel = standard(0x333b37, 0.54, 0.42);
  const dark = standard(0x202925, 0.76, 0.15);
  const wall = standard(0x9c9e8d, 0.89);
  const charcoal = standard(0x343b36, 0.82);
  const amber = standard(0xe9aa46, 0.68);
  const seam = standard(0x565b52, 0.97);
  const concrete = standard(0xa8a99a, 0.84);
  concrete.map = surfaceNoise(217, 26, [12, 20], anisotropy);
  const apron = standard(0xc1b8a5, 0.88);
  const apronTop = apron.clone();
  apronTop.map = apronSurface(anisotropy);
  const lightFace = new THREE.MeshBasicMaterial({ color: 0xf4f5dc, toneMapped: false });
  const amberFace = new THREE.MeshBasicMaterial({ color: 0xffac45, toneMapped: false });
  const glass = standard(0x253a38, 0.2, 0.45);
  const olive = standard(0x555e45, 0.75);

  const desertY = -0.075;
  addDesertTerrain(scene, desertY, anisotropy);
  addServiceRoad(scene, desertY, anisotropy);
  addShoulderGravel(scene, desertY);
  box(scene, 'Bay floor', [9, 0.15, 10], [0, -0.075, bayCenterZ], concrete, false);
  box(scene, 'Slab joint', [9, 0.002, 0.012], [0, 0.0008, bayCenterZ], seam, false);
  box(scene, 'Slab joint', [0.012, 0.002, 10], [0, 0.0008, bayCenterZ], seam, false);
  box(scene, 'Outdoor apron', [apronSize, 0.15, apronSize], [0, -0.075, 0],
    [apron, apron, apronTop, apron, apron, apron], false);

  const coneGeometry = new THREE.CylinderGeometry(0.025, 0.09, 0.28, 20);
  for (const [x, y] of conePositions) {
    box(scene, 'Survey marker base', [0.22, 0.02, 0.22], [y, 0.01, x], dark);
    const cone = new THREE.Mesh(coneGeometry, amber);
    cone.name = 'Survey cone';
    cone.position.set(y, 0.16, x);
    cone.castShadow = true;
    cone.receiveShadow = true;
    scene.add(cone);
  }

  const wallHeight = 3.55;
  const trimHeight = 0.15;
  const rearWallZ = -18;
  const wallDepth = 0.15;
  const rearWallFaceZ = rearWallZ + wallDepth / 2;
  const columnDepth = 0.13;
  const sideWallFrontZ = bayCenterZ + 5;
  for (const side of [-1, 1]) {
    box(scene, 'Wall base', [0.18, trimHeight, sideWallFrontZ - rearWallFaceZ],
      [side * 4.49, trimHeight / 2, (sideWallFrontZ + rearWallFaceZ) / 2], charcoal);
    for (const z of [-17, -15, -13, -11, -9]) {
      const slabFrontZ = z + 0.995;
      const slabBackZ = Math.max(z - 0.995, rearWallFaceZ);
      box(scene, 'Side wall slab', [wallDepth, wallHeight - trimHeight, slabFrontZ - slabBackZ],
        [side * 4.5, (wallHeight + trimHeight) / 2, (slabFrontZ + slabBackZ) / 2], wall);
      // Keep the rear columns inside the bay so their front faces clear the rear panels.
      const columnZ = Math.max(z - 0.99, rearWallFaceZ + columnDepth / 2);
      box(scene, 'Steel column', [0.15, 3.49, columnDepth], [side * 4.37, 1.745, columnZ], steel);
    }
  }
  for (const x of [-3.6, -1.8, 0, 1.8, 3.6]) {
    box(scene, 'Rear concrete panel', [1.79, wallHeight, wallDepth], [x, wallHeight / 2, rearWallZ], wall);
  }
  box(scene, 'Rear equipment stripe', [8.75, 0.10, 0.018], [0, 0.52, -17.916], charcoal);
  const roofThickness = 0.16;
  box(scene, 'Roof', [9.3, roofThickness, 10.3], [0, wallHeight + roofThickness / 2, bayCenterZ], dark);
  const antennaX = -2.8;
  const antennaZ = sideWallFrontZ - 0.6;
  const roofTop = wallHeight + roofThickness;
  box(scene, 'GPS antenna mounting plate', [0.24, 0.035, 0.24], [antennaX, roofTop + 0.0175, antennaZ], steel);
  const radome = standard(0xe2e4d8, 0.55);
  for (const [name, topRadius, baseRadius, height, base, material] of [
    ['GPS antenna mast', 0.022, 0.031, 0.52, 0.035, steel],
    ['GPS antenna collar', 0.052, 0.032, 0.05, 0.555, dark],
    ['GPS antenna radome', 0.088, 0.105, 0.055, 0.605, radome],
  ]) {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, baseRadius, height, 24), material);
    part.name = name;
    part.position.set(antennaX, roofTop + base + height / 2, antennaZ);
    part.castShadow = part.receiveShadow = true;
    scene.add(part);
  }
  const conduitPath = new THREE.CatmullRomCurve3([
    [antennaX, roofTop + 0.02, antennaZ], [antennaX, roofTop + 0.02, -7.90],
    [antennaX, roofTop - 0.025, -7.824], [antennaX, roofTop - 0.15, -7.824],
    [antennaX, roofTop - 0.26, -7.874], [antennaX, 2.95, -7.874],
    [antennaX, 1.76, -7.874], [antennaX, 1.55, -7.874],
  ].map(point => new THREE.Vector3(...point)));
  const conduit = new THREE.Mesh(new THREE.TubeGeometry(conduitPath, 56, 0.014, 8), steel);
  conduit.name = 'GPS antenna conduit';
  conduit.castShadow = conduit.receiveShadow = true;
  scene.add(conduit);
  box(scene, 'GPS conduit junction box', [0.19, 0.20, 0.09], [antennaX, 1.48, -7.887], steel);
  for (const y of [2.18, 3.1]) {
    box(scene, 'GPS conduit clamp', [0.065, 0.036, 0.062], [antennaX, y, -7.891], dark);
  }
  for (const z of [-17, -15, -13, -11, -9]) {
    box(scene, 'Roof crossbeam', [8.9, 0.22, 0.14], [0, 3.44, z], steel);
    for (const x of [-2.65, 0, 2.65]) {
      box(scene, 'Strip fixture', [0.10, 0.075, 1.2], [x, 3.29, z + 0.42], steel);
      box(scene, 'Strip diffuser', [0.075, 0.025, 1.16], [x, 3.24, z + 0.42], lightFace, false);
    }
  }

  for (const side of [-1, 1]) {
    box(scene, 'Hangar front cladding', [2.96, wallHeight, 0.15], [side * 3.02, wallHeight / 2, -8], charcoal);
    box(scene, 'Door jamb', [0.10, 2.62, 0.22], [side * 1.55, 1.31, -8], steel);
    box(scene, 'Jamb safety stripe', [0.05, 0.65, 0.008], [side * 1.55, 0.55, -7.886], amber, false);
    box(scene, 'Exterior lamp', [0.28, 0.07, 0.09], [side * 2.45, 2.85, -7.87], lightFace, false);
    for (let x = 1.77; x < 4.48; x += 0.20) {
      box(scene, 'Cladding rib', [0.018, 3.5, 0.024], [side * x, 1.75, -7.916], steel, false);
    }
  }
  box(scene, 'Door header', [3.12, 0.93, 0.16], [0, 3.085, -8], charcoal);
  box(scene, 'Raised door roll', [3.04, 0.18, 0.25], [0, 2.64, -8.02], steel);
  mountHeightScale(scene, charcoal, anisotropy);
  lettering(scene, 'RANGE', 1.70, 0.32, [0, 3.14, -7.912]);
  lettering(scene, 'BAY', 1.3, 0.31, [0, 2.42, -17.91]);
  lettering(scene, '01', 1, 0.45, [0, 1.98, -17.91], '#ffcb7c');

  for (const x of [-3.72, -3.09, -2.46]) {
    box(scene, 'Observation window frame', [0.62, 0.76, 0.085], [x, 1.45, -17.89], steel);
    box(scene, 'Smoked observation glass', [0.54, 0.68, 0.022], [x, 1.45, -17.837], glass);
  }
  const benchZ = -17.60;
  box(scene, 'Bench seat', [1.85, 0.05, 0.44], [-3.09, 0.435, benchZ], olive);
  box(scene, 'Bench stretcher', [1.56, 0.05, 0.04], [-3.09, 0.17, benchZ - 0.15], steel);
  for (const x of [-3.85, -2.33]) {
    for (const offset of [-0.15, 0.15]) {
      box(scene, 'Bench leg', [0.045, 0.41, 0.05], [x, 0.205, benchZ + offset], steel);
    }
  }

  for (const [x, z, width, depth, height, base] of [
    [3.63, -17.32, 0.85, 0.68, 0.35, 0], [3.63, -17.32, 0.55, 0.35, 0.23, 0.35],
    [3.85, -16.42, 0.36, 0.25, 0.16, 0], [-4.02, -6.62, 0.55, 0.35, 0.23, 0],
    [-4.02, -6.62, 0.36, 0.25, 0.16, 0.23],
  ]) {
    const y = base + height / 2;
    box(scene, 'Equipment transit case', [width, height, depth], [x, y, z], olive);
    for (const side of [-1, 1]) {
      box(scene, 'Case reinforcement', [0.035, height * 0.78, 0.014],
        [x + side * width * 0.35, y, z + depth / 2 + 0.004], steel);
    }
  }

  const consoleX = -3.08;
  box(scene, 'Apron operator cabinet', [0.77, 0.86, 0.50], [consoleX, 0.43, -7.10], olive);
  box(scene, 'Operator work surface', [0.88, 0.05, 0.59], [consoleX, 0.885, -7.10], steel);
  box(scene, 'Monitor stand', [0.08, 0.21, 0.065], [consoleX, 1.015, -7.23], steel);
  const monitor = new THREE.Group();
  monitor.position.set(consoleX, 1.265, -7.25);
  monitor.rotation.x = THREE.MathUtils.degToRad(-12);
  scene.add(monitor);
  box(monitor, 'Weatherproof monitor housing', [0.51, 0.33, 0.11], [0, 0, 0], dark);
  box(monitor, 'Operator monitor', [0.46, 0.27, 0.012], [0, 0, 0.06], glass, false);
  box(monitor, 'Monitor power light', [0.025, 0.009, 0.008], [0.22, -0.153, 0.06], amberFace, false);
  box(scene, 'Console junction box', [0.15, 0.17, 0.09], [-3.56, 0.23, -7.83], steel);
  const cablePath = new THREE.CatmullRomCurve3([
    [-3.56, 0.15, -7.78], [-3.53, 0.014, -7.60], [-3.47, 0.014, -7.45], [-3.34, 0.06, -7.34],
  ].map(point => new THREE.Vector3(...point)));
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cablePath, 16, 0.008, 6, false), dark);
  cable.name = 'Operator station cable';
  scene.add(cable);
  for (const x of [-3.95, 3.95]) {
    box(scene, 'Range status light housing', [0.12, 0.14, 0.075], [x, 2.7, -17.887], dark);
    box(scene, 'Range status light', [0.07, 0.07, 0.014], [x, 2.7, -17.844], amberFace, false);
  }

  for (const x of [-7.75, 7.75]) {
    for (let z = -7; z <= 7; z += 2) {
      box(scene, 'Apron edge marker', [0.065, 0.22, 0.065], [x, 0.11, z], olive);
      box(scene, 'Apron edge reflector', [0.071, 0.05, 0.071], [x, 0.193, z], amber, false);
    }
  }

  const mastX = -7.35;
  const mastZ = -6.65;
  const mastHeight = 2.4;
  box(scene, 'Windsock foundation', [0.32, 0.08, 0.32], [mastX, 0.04, mastZ], apron);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.033, mastHeight, 12), steel);
  pole.name = 'Windsock mast';
  pole.position.set(mastX, mastHeight / 2, mastZ);
  pole.castShadow = true;
  scene.add(pole);

  const windsock = new THREE.Group();
  windsock.name = 'Windsock';
  windsock.position.set(mastX, mastHeight, mastZ);
  scene.add(windsock);
  const sockOffset = 0.18;
  box(windsock, 'Windsock swivel bracket', [0.2, 0.025, 0.025], [0.085, 0, 0], steel);
  const fabric = [standard(0xd65d2f, 0.9), standard(0xe5dac0, 0.9)];
  for (const material of fabric) material.side = THREE.DoubleSide;
  const bandLength = 0.12;
  const radii = [0.12, 0.108, 0.091, 0.072, 0.054, 0.038];
  for (let i = 0; i < radii.length - 1; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(
      radii[i + 1], radii[i], bandLength, 20, 1, true,
    ), fabric[i % 2]);
    band.rotation.z = Math.PI;
    band.position.set(sockOffset, -(i + 0.5) * bandLength, 0);
    band.castShadow = true;
    windsock.add(band);
  }
}
