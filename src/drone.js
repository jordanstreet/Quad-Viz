import * as THREE from 'three';
import { box, launchPadSurfaceY } from './facility.js';
const rotorOffsetX = 0.76;
const propRadius = 0.355;
const modelScale = 1 / (2 * (rotorOffsetX + propRadius));
const skidCenterY = -0.119;
const skidThickness = 0.024;
export const groundHeight = launchPadSurfaceY + (skidThickness / 2 - skidCenterY) * modelScale;

export function buildDrone(scene) {
  const root = new THREE.Group();
  root.name = 'R03-01 Quadcopter';
  root.scale.setScalar(modelScale);
  scene.add(root);
  const body = new THREE.MeshStandardMaterial({ color: 0x353e3b, metalness: 0.28, roughness: 0.43 });
  const top = new THREE.MeshStandardMaterial({ color: 0x8b9384, metalness: 0.3, roughness: 0.38 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x171b1a, metalness: 0.36, roughness: 0.37 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x515955, metalness: 0.62, roughness: 0.35 });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x203b42, metalness: 0.42, roughness: 0.13, clearcoat: 1 });
  const led = new THREE.MeshBasicMaterial({ color: 0xffab49, toneMapped: false });

  function roundedBody() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.25, -0.26);
    shape.lineTo(-0.16, -0.42);
    shape.lineTo(0.16, -0.42);
    shape.lineTo(0.25, -0.26);
    shape.lineTo(0.21, 0.28);
    shape.lineTo(0.13, 0.40);
    shape.lineTo(-0.13, 0.40);
    shape.lineTo(-0.21, 0.28);
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
      depth: 0.092, bevelEnabled: true, bevelSize: 0.019, bevelThickness: 0.015, bevelSegments: 2, steps: 1,
    }), body);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.005;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  roundedBody();
  box(root, 'Top battery', [0.31, 0.044, 0.47], [0, 0.128, 0.025], top);
  box(root, 'Sensor face', [0.30, 0.066, 0.052], [0, 0.051, 0.424], carbon);
  box(root, 'Gimbal yoke', [0.18, 0.075, 0.086], [0, -0.036, 0.33], metal);

  function cylinder(parent, name, radius, height, position, material, front = false) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), material);
    mesh.name = name;
    mesh.position.set(...position);
    if (front) mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  cylinder(root, 'Camera pod', 0.063, 0.125, [0, -0.047, 0.382], carbon, true);
  cylinder(root, 'Camera lens', 0.045, 0.015, [0, -0.047, 0.451], lens, true);
  for (const x of [-0.10, 0.10]) {
    cylinder(root, 'Forward sensor', 0.021, 0.014, [x, 0.054, 0.455], lens, true);
  }

  const rotors = [];
  const bladeWidth = 0.046;
  const bladeRoot = 0.035;
  const bladeTip = Math.sqrt(propRadius ** 2 - (bladeWidth / 2) ** 2);
  const rotorPositions = [[-1, 0.60, 1], [1, 0.60, -1], [-1, -0.60, -1], [1, -0.60, 1]];
  for (const [side, z, direction] of rotorPositions) {
    const x = side * rotorOffsetX;
    const armRootX = side * 0.16;
    const armRootZ = Math.sign(z) * 0.18;
    const armLength = Math.hypot(x - armRootX, z - armRootZ);
    const arm = box(root, 'Carbon motor arm', [0.085, 0.05, armLength],
      [(x + armRootX) / 2, 0.021, (z + armRootZ) / 2], carbon);
    arm.rotation.y = Math.atan2(x - armRootX, z - armRootZ);
    cylinder(root, 'Motor', 0.075, 0.076, [x, 0.042, z], metal);
    cylinder(root, 'Motor collar', 0.063, 0.031, [x, 0.093, z], carbon);
    box(root, 'Motor position light', [0.039, 0.018, 0.020], [x, 0.044, z + Math.sign(z) * 0.075], led, false);

    const rotor = new THREE.Group();
    rotor.name = 'Rotor ' + (rotors.length + 1);
    rotor.position.set(x, 0.121, z);
    root.add(rotor);
    const blades = new THREE.Group();
    rotor.add(blades);
    cylinder(rotor, 'Propeller hub', 0.040, 0.029, [0, 0, 0], metal);
    for (const bladeSide of [-1, 1]) {
      box(blades, 'Propeller blade', [bladeWidth, 0.012, bladeTip - bladeRoot],
        [0, 0.007, (bladeTip + bladeRoot) / 2 * bladeSide], carbon);
    }
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.072, propRadius, 48), new THREE.MeshBasicMaterial({
      color: 0xb2bcb4, opacity: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.013;
    rotor.add(disc);
    rotors.push({ rotor, blades, disc, direction });
  }
  for (const side of [-1, 1]) {
    for (const z of [-0.23, 0.23]) {
      box(root, 'Landing strut', [0.04, 0.112, 0.048], [side * 0.18, -0.056, z], metal);
    }
    box(root, 'Landing skid', [0.05, skidThickness, 0.57], [side * 0.18, skidCenterY, 0], carbon);
  }
  return { root, rotors };
}
