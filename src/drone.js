import * as THREE from 'three';
import { box } from './facility.js';

export const groundHeight = 0.19;

export function buildDrone(scene) {
  const root = new THREE.Group();
  root.name = 'R03-01 Quadcopter';
  scene.add(root);
  const body = new THREE.MeshStandardMaterial({ color: 0x353e3b, metalness: 0.28, roughness: 0.43 });
  const top = new THREE.MeshStandardMaterial({ color: 0x8b9384, metalness: 0.3, roughness: 0.38 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x171b1a, metalness: 0.36, roughness: 0.37 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x515955, metalness: 0.62, roughness: 0.35 });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x203b42, metalness: 0.42, roughness: 0.13, clearcoat: 1 });
  const led = new THREE.MeshBasicMaterial({ color: 0xffab49, toneMapped: false });

  function roundedBody() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.36, -0.34);
    shape.lineTo(-0.22, -0.55);
    shape.lineTo(0.22, -0.55);
    shape.lineTo(0.36, -0.34);
    shape.lineTo(0.31, 0.40);
    shape.lineTo(0.19, 0.53);
    shape.lineTo(-0.19, 0.53);
    shape.lineTo(-0.31, 0.40);
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
      depth: 0.13, bevelEnabled: true, bevelSize: 0.033, bevelThickness: 0.027, bevelSegments: 2, steps: 1,
    }), body);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  roundedBody();
  box(root, 'Top battery', [0.43, 0.072, 0.57], [0, 0.175, 0.09], top);
  box(root, 'Sensor face', [0.45, 0.12, 0.09], [0, 0.068, 0.50], carbon);
  box(root, 'Gimbal yoke', [0.27, 0.12, 0.12], [0, -0.054, 0.34], metal);

  function cylinder(parent, name, radius, height, position, material, front = false) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), material);
    mesh.name = name;
    mesh.position.set(...position);
    if (front) mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  cylinder(root, 'Camera pod', 0.104, 0.19, [0, -0.075, 0.43], carbon, true);
  cylinder(root, 'Camera lens', 0.068, 0.017, [0, -0.075, 0.534], lens, true);
  for (const x of [-0.15, 0.15]) {
    cylinder(root, 'Forward sensor', 0.035, 0.02, [x, 0.075, 0.554], lens, true);
  }

  const rotors = [];
  for (const [x, z, direction] of [[-0.76, 0.60, 1], [0.76, 0.60, -1], [-0.76, -0.60, -1], [0.76, -0.60, 1]]) {
    const arm = box(root, 'Carbon motor arm', [0.13, 0.08, 0.79], [x * 0.63, 0.023, z * 0.68], carbon);
    arm.rotation.y = Math.atan2(x * 0.74, z * 0.66);
    cylinder(root, 'Motor', 0.094, 0.108, [x, 0.057, z], metal);
    cylinder(root, 'Motor collar', 0.079, 0.043, [x, 0.123, z], carbon);
    box(root, 'Motor position light', [0.052, 0.024, 0.026], [x, 0.047, z + Math.sign(z) * 0.094], led, false);

    const rotor = new THREE.Group();
    rotor.name = 'Rotor ' + (rotors.length + 1);
    rotor.position.set(x, 0.16, z);
    root.add(rotor);
    const blades = new THREE.Group();
    rotor.add(blades);
    cylinder(rotor, 'Propeller hub', 0.046, 0.034, [0, 0, 0], metal);
    for (const side of [-1, 1]) {
      const blade = box(blades, 'Propeller blade', [0.066, 0.016, 0.315], [0, 0.01, 0.185 * side], carbon);
      blade.rotation.y = 0.14 * direction;
    }
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.355, 48), new THREE.MeshBasicMaterial({
      color: 0xb2bcb4, opacity: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.017;
    rotor.add(disc);
    rotors.push({ rotor, blades, disc, direction });
  }
  for (const side of [-1, 1]) {
    for (const z of [-0.29, 0.29]) {
      box(root, 'Landing strut', [0.06, 0.17, 0.07], [side * 0.26, -0.077, z], metal);
    }
    box(root, 'Landing skid', [0.07, 0.029, 0.71], [side * 0.26, -0.168, 0], carbon);
  }
  return { root, rotors };
}
