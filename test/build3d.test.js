import { describe, it, expect } from 'vitest';
import * as THREE from '../web/vendor/three/build/three.module.js';
import { build3DProject } from '../web/build3d.js';
import { buildProject } from '../web/project.js';
import { normalize } from '../web/rules.js';
import { randomProject, extremeProject } from './helpers.js';

function check(P) {
  const root = normalize(P), pr = buildProject(root), grp = build3DProject(THREE, pr, root);
  let meshes = 0;
  grp.updateMatrixWorld(true);
  grp.traverse(o => {
    if (!o.isMesh) return;
    meshes++;
    const p = o.getWorldPosition(new THREE.Vector3());
    expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) throw new Error('NaN в геометрии');
  });
  expect(meshes).toBeGreaterThan(0);
}

describe('3D: дымовая проверка сборки', () => {
  it('случайные проекты строятся без NaN', () => { for (let i = 1; i <= 40; i++) check(randomProject(i)); });
  it('крайние проекты строятся без NaN', () => { for (let i = 1; i <= 40; i++) check(extremeProject(i)); });
});
