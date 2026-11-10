import * as THREE from 'three';

export const outdoorPadZ = 21;

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

function surfaceNoise(base, amount, repeat, anisotropy) {
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
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = anisotropy;
  return texture;
}

function lettering(parent, text, width, height, position, floor = false, color = '#eff0df') {
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
  if (floor) mesh.rotation.x = -Math.PI / 2;
  parent.add(mesh);
}

export function buildFacility(scene, anisotropy) {
  const steel = standard(0x333b37, 0.54, 0.42);
  const dark = standard(0x202925, 0.76, 0.15);
  const wall = standard(0x9c9e8d, 0.89);
  const charcoal = standard(0x343b36, 0.82);
  const amber = standard(0xe9aa46, 0.68);
  const paint = standard(0xbbbfac, 0.85);
  const seam = standard(0x565b52, 0.97);
  const concrete = standard(0xa8a99a, 0.84);
  concrete.map = surfaceNoise(217, 26, [12, 20], anisotropy);
  const apron = standard(0xc1b8a5, 0.88);
  apron.map = surfaceNoise(220, 29, [18, 24], anisotropy);
  const dirt = standard(0xb1a089, 1);
  dirt.map = surfaceNoise(217, 35, [60, 60], anisotropy);
  const lightFace = new THREE.MeshBasicMaterial({ color: 0xf4f5dc, toneMapped: false });
  const amberFace = new THREE.MeshBasicMaterial({ color: 0xffac45, toneMapped: false });
  const glass = standard(0x253a38, 0.2, 0.45);

  box(scene, 'Desert ground', [190, 0.3, 190], [0, -0.23, 22], dirt, false);
  box(scene, 'Bay floor', [20, 0.16, 23], [0, -0.08, -4.5], concrete, false);
  box(scene, 'Outdoor apron', [37, 0.15, 35], [0, -0.075, 24.5], apron, false);
  for (const x of [-15, -10, -5, 0, 5, 10, 15]) {
    box(scene, 'Apron expansion joint', [0.022, 0.003, 35], [x, 0.001, 24.5], seam, false);
  }
  for (let z = 10; z <= 40; z += 5) {
    box(scene, 'Apron expansion joint', [37, 0.003, 0.022], [0, 0.001, z], seam, false);
    // The outdoor launch pad occupies this part of the taxi line.
    if (z !== 20) {
      box(scene, 'Taxi marking', [0.07, 0.004, 1.8], [0, 0.007, z], amber, false);
    }
  }
  for (let z = -15; z <= 5; z += 5) {
    box(scene, 'Slab joint', [20, 0.003, 0.017], [0, 0.001, z], seam, false);
  }
  for (const x of [-7.6, 7.6]) {
    box(scene, 'Flight perimeter line', [0.05, 0.004, 20], [x, 0.006, -4], amber, false);
    for (let z = -13; z <= 5; z += 2) {
      box(scene, 'Scale tick', [0.45, 0.004, 0.035], [x * 0.88, 0.006, z], paint, false);
    }
  }

  const wallHeight = 6.5;
  const baseHeight = 0.48;
  for (const side of [-1, 1]) {
    // Keep the panel ends above the trim so their faces cannot overlap.
    box(scene, 'Wall base', [0.29, baseHeight, 22.7], [side * 9.98, baseHeight / 2, -4.5], charcoal);
    for (const z of [-13.7, -9.2, -4.6, 0, 4.6]) {
      box(scene, 'Side wall slab', [0.26, wallHeight - baseHeight, 4.57],
        [side * 10, (wallHeight + baseHeight) / 2, z], wall);
      box(scene, 'Steel column', [0.31, 6.4, 0.23], [side * 9.73, 3.2, z - 2.21], steel);
    }
  }
  for (const x of [-8, -4, 0, 4, 8]) {
    box(scene, 'Rear concrete panel', [3.97, 6.5, 0.3], [x, 3.25, -16], wall);
  }
  box(scene, 'Rear equipment stripe', [19.6, 0.25, 0.05], [0, 1.18, -15.82], charcoal);
  box(scene, 'Roof', [20.6, 0.24, 23.3], [0, 6.54, -4.5], dark);
  for (const z of [-13.5, -9, -4.5, 0, 4.5]) {
    box(scene, 'Roof crossbeam', [19.8, 0.29, 0.24], [0, 6.16, z], steel);
    for (const x of [-5.9, 0, 5.9]) {
      box(scene, 'Strip fixture', [0.31, 0.12, 2.75], [x, 6.04, z + 1], steel);
      box(scene, 'Strip diffuser', [0.22, 0.045, 2.62], [x, 5.96, z + 1], lightFace, false);
    }
  }

  for (const side of [-1, 1]) {
    box(scene, 'Hangar front cladding', [5.9, 6.5, 0.31], [side * 7.08, 3.25, 7.02], charcoal);
    box(scene, 'Door jamb', [0.3, 5.1, 0.54], [side * 4.1, 2.55, 7.02], steel);
    box(scene, 'Jamb safety stripe', [0.10, 1.1, 0.02], [side * 4.1, 0.7, 7.30], amber, false);
    box(scene, 'Exterior lamp', [0.78, 0.13, 0.18], [side * 5.7, 4.25, 7.23], lightFace, false);
    for (let x = 4.45; x < 10; x += 0.39) {
      box(scene, 'Cladding rib', [0.045, 6.42, 0.045], [side * x, 3.25, 7.2], steel, false);
    }
  }
  box(scene, 'Door header', [8.3, 1.45, 0.38], [0, 5.78, 7.02], charcoal);
  box(scene, 'Raised door roll', [8.15, 0.28, 0.55], [0, 4.98, 6.95], steel);
  lettering(scene, 'RANGE', 5.7, 1.0, [0, 5.82, 7.23]);
  lettering(scene, 'BAY', 6.6, 0.82, [0, 4.72, -15.81]);
  lettering(scene, '01', 3.5, 1.24, [0, 3.45, -15.81], false, '#ffcb7c');

  for (const x of [-8.2, -6.55, -4.9]) {
    box(scene, 'Observation window frame', [1.65, 1.55, 0.21], [x, 2.42, -15.74], steel);
    box(scene, 'Smoked observation glass', [1.48, 1.36, 0.06], [x, 2.42, -15.61], glass);
    box(scene, 'Observation strip reflection', [1.13, 0.019, 0.009], [x, 2.91, -15.575], paint, false);
  }
  box(scene, 'Console counter', [4.9, 0.14, 0.78], [-6.55, 0.97, -14.76], steel);
  for (const x of [-8.5, -5.0]) {
    box(scene, 'Console cabinet', [0.7, 0.9, 0.65], [x, 0.45, -14.76], dark);
  }
  const olive = standard(0x555e45, 0.75);
  for (const [x, y, z] of [[7.9, 0.3, -14.6], [7.9, 0.8, -14.6], [8.85, 0.24, -13.4], [-8.5, 0.26, 10]]) {
    box(scene, 'Equipment transit case', [1.18, y === 0.8 ? 0.4 : 0.48, 0.73], [x, y, z], olive);
    for (const offset of [-0.42, 0.42]) {
      box(scene, 'Case reinforcement', [0.09, 0.4, 0.035], [x + offset, y, z + 0.375], steel);
    }
  }
  for (const x of [-8.2, 8.2]) {
    box(scene, 'Range status light housing', [0.26, 0.31, 0.17], [x, 4.23, -15.76], dark);
    box(scene, 'Range status light', [0.15, 0.15, 0.03], [x, 4.24, -15.66], amberFace, false);
  }

  function pad(z) {
    box(scene, 'Flush launch marking', [3.5, 0.004, 3.5], [0, 0.004, z], charcoal, false);
    for (const x of [-1, 1]) {
      for (const side of [-1, 1]) {
        box(scene, 'Pad corner', [0.56, 0.004, 0.065], [x * 1.35, 0.009, z + side * 1.61], amber, false);
        box(scene, 'Pad corner', [0.065, 0.004, 0.56], [x * 1.61, 0.009, z + side * 1.35], amber, false);
      }
    }
    box(scene, 'Center cross', [0.58, 0.004, 0.04], [0, 0.009, z], paint, false);
    box(scene, 'Center cross', [0.04, 0.004, 0.58], [0, 0.009, z], paint, false);
    lettering(scene, '01', 1.6, 0.44, [0, 0.012, z + 0.99], true);
  }
  pad(-3.8);
  pad(outdoorPadZ);

  const ridge = [0x9e927d, 0xa19280, 0x8d8576].map((color) => standard(color, 1));
  for (let i = 0; i < 17; i++) {
    const angle = i * 2.39996;
    const radius = 55 + (i % 4) * 9;
    const shape = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), ridge[i % ridge.length]);
    shape.position.set(Math.sin(angle) * radius, 0.2, Math.cos(angle) * radius + 7);
    shape.scale.set(11 + (i % 3) * 5, 2.1 + (i % 4) * 0.95, 9 + (i % 5));
    shape.rotation.y = angle;
    scene.add(shape);
  }

  for (const x of [-17.8, 17.8]) {
    for (let z = 9; z < 40; z += 4) {
      box(scene, 'Apron edge marker', [0.14, 0.6, 0.14], [x, 0.3, z], olive);
      box(scene, 'Apron edge reflector', [0.15, 0.11, 0.15], [x, 0.55, z], amber, false);
    }
  }
}
