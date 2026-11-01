// Project the actual tilted glass rim to check its screen coverage without WebGL.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import sharp from 'sharp';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = await readFile(new URL('../lib/content/disc.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ES2020}}).outputText;
const { glassCircleComposition } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const viewHeight = 26 * Math.tan(Math.PI / 10) * 2;
const rotation = new THREE.Euler(-12 * Math.PI / 180, 0, 8 * Math.PI / 180, 'ZYX');
const anchors = [[.97, .02], [.79, .55], [.45, .98]];
function points(pose, aspect, fraction = 1) {
  const camera = new THREE.PerspectiveCamera(36, aspect, .1, 100);
  camera.position.z = 26;
  camera.updateMatrixWorld();
  return Array.from({length: 1440}, (_, i) => {
    const angle = i * Math.PI / 720;
    const p = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0)
      .multiplyScalar(pose[2] * viewHeight * fraction).applyEuler(rotation);
    p.x += (pose[0] - .5) * viewHeight * aspect;
    p.y += (.5 - pose[1]) * viewHeight;
    p.project(camera);
    return [(p.x + 1) / 2, (1 - p.y) / 2];
  });
}
for (const [width, height] of [[641,430],[768,436],[882,501],[1024,582],[1440,818],[1920,938],[2560,1067]]) {
  const { x, y, radius } = glassCircleComposition(width, height, 1);
  const rim = points([x,y,radius], width/height);
  const distances = anchors.map(([u,v]) => Math.sqrt(Math.min(...rim.map(([a,b]) => (a-u)**2+(b-v)**2))));
  assert.ok(distances.every(d => d < .035), `Rim missed the reference at ${width}x${height}: ${distances}`);
  console.log(`${width}x${height}: reference rim within ${(Math.max(...distances)*100).toFixed(2)}% of stage`);
}

// Optional reference overlay: cyan is the implemented outer/inner glass rim.
if (process.argv[2]) {
  const { x, y, radius } = glassCircleComposition(882,501,1);
  const curves = [1,.62].map(fraction => points([x,y,radius],882/501,fraction)
    .map(([u,v],i) => `${i ? 'L' : 'M'}${(u*882).toFixed(2)},${(v*501).toFixed(2)}`).join(' ')+'Z');
  const overlay = Buffer.from(`<svg width="882" height="501"><g fill="none" stroke="#4df4ff" stroke-width="2">${curves.map(d => `<path d="${d}"/>`).join('')}</g></svg>`);
  const output = join(tmpdir(),'dolly-disc-reference-overlay.png');
  await sharp(process.argv[2]).resize(882,501).composite([{input:overlay}]).png().toFile(output);
  console.log(output);
}
