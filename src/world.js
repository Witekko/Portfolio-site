/*
 * The world around the story, so the scenes feel like one place:
 *
 *  - dust: specks drifting through the whole page. When you scroll from the head down to
 *    the robot, the dust rises exactly as fast as the robot's cell does, which reads as
 *    the camera going down a level (from the head, up in the air, to the robot's floor).
 *    It sways slowly, twinkles, parts around the cursor, and a few specks turn warm in
 *    the robot's hall.
 *  - floor: a dot grid the robot stands on (it lives in the robot's stage). Not rigid:
 *    it breathes in slow waves, glows warm under the gripper, has a soft ring around the
 *    robot's base, and a ripple runs out wherever the gripper takes or leaves something.
 *    It fades out away from the robot, so the copy on the left stays clean.
 *
 * Both are additive points: cheap, and order-independent.
 */
import * as THREE from 'three';

/* ----------------------------------------------------------------- dust -- */

const DUST_VS = /* glsl */`
  uniform float uTime, uLift, uSize, uAlpha, uWarm, uH;
  uniform vec3 uRayO, uRayD;   // the pointer's ray (world)
  uniform float uPush;
  attribute vec4 aSeed;        // x, y: random; z: size; w: 1 for the specks that turn warm
  varying float vA;
  varying vec3 vC;
  void main() {
    vec3 p = position;
    float r = aSeed.x, r2 = aSeed.y;
    p.x += sin(uTime * (0.05 + 0.04 * r2) + r * 40.0) * 0.4;
    p.z += cos(uTime * (0.04 + 0.03 * r) + r2 * 23.0) * 0.3;
    p.y += uTime * (0.015 + 0.03 * r2) + uLift;
    // An endless column: specks leaving at the top come back at the bottom, out of sight.
    p.y = mod(p.y + uH * 0.5, uH) - uH * 0.5;
    float edge = smoothstep(uH * 0.5, uH * 0.4, abs(p.y));

    // The cursor parts the dust a little (radius grows with depth, so it looks the same size).
    float k = (p.z - uRayO.z) / uRayD.z;
    vec2 d = p.xy - (uRayO + uRayD * k).xy;
    float R = 0.07 * max(0.5, uRayO.z - p.z);
    p.xy += normalize(d + 1e-5) * uPush * exp(-dot(d, d) / (R * R)) * R * 0.8;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float D = -mv.z;
    float size = uSize * aSeed.z / D;
    gl_PointSize = max(size, 1.0);
    float twinkle = 0.65 + 0.35 * sin(uTime * (0.6 + r) + r2 * 60.0);
    vA = uAlpha * twinkle * edge
       * smoothstep(0.8, 2.5, D) * (1.0 - smoothstep(13.0, 20.0, D))   // not in your face, gone in the distance
       * min(1.0, size / 1.5);                                          // sub-pixel specks fade instead of flickering
    vC = mix(vec3(0.6, 0.76, 1.0), vec3(1.0, 0.62, 0.32), aSeed.w * uWarm);
  }
`;

const SOFT_DOT_FS = /* glsl */`
  varying float vA;
  varying vec3 vC;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.0, r));
  }
`;

export function createDust(n) {
  const H = 14;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 12;
    pos[i * 3 + 1] = (Math.random() - 0.5) * H;
    pos[i * 3 + 2] = -14 + Math.random() * 18.5;
    seed[i * 4] = Math.random();
    seed[i * 4 + 1] = Math.random();
    seed[i * 4 + 2] = 0.5 + Math.random() ** 3 * 1.6;       // mostly fine specks, a few bigger ones
    seed[i * 4 + 3] = Math.random() < 0.09 ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const uniforms = {
    uTime: { value: 0 }, uLift: { value: 0 }, uSize: { value: 10 }, uAlpha: { value: 0.32 }, uWarm: { value: 0 }, uH: { value: H },
    uRayO: { value: new THREE.Vector3(0, 0, 6) }, uRayD: { value: new THREE.Vector3(0, 0, -1) }, uPush: { value: 0 },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    vertexShader: DUST_VS, fragmentShader: SOFT_DOT_FS, uniforms,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  points.renderOrder = -1;

  return {
    points,
    /** pxPerUnit: screen px per world unit at distance 1. */
    setPx(pxPerUnit) { uniforms.uSize.value = pxPerUnit * 0.012; },
    /** lift: how far the camera has gone down (world units); warm 0..1; alpha 0..1; ray: pointer ray or null. */
    update({ t, lift, warm, alpha, ray }) {
      uniforms.uTime.value = t;
      uniforms.uLift.value = lift;
      uniforms.uWarm.value = warm;
      uniforms.uAlpha.value = 0.32 * alpha;
      uniforms.uPush.value += ((ray ? 1 : 0) - uniforms.uPush.value) * 0.1;
      if (ray) { uniforms.uRayO.value.copy(ray.origin); uniforms.uRayD.value.copy(ray.direction); }
    },
  };
}

/* ---------------------------------------------------------------- floor -- */

const FLOOR_VS = /* glsl */`
  uniform float uTime, uSize, uAlpha, uStep, uViewH;
  uniform vec3 uGlow;       // x, z under the gripper; z: strength (stronger the lower the gripper)
  uniform vec2 uBase;       // the robot's base on the floor
  uniform vec2 uPool;       // centre of the lit part of the floor
  uniform vec4 uRip[4];     // x, z, start time, strength
  attribute float aRand;
  varying float vA;
  varying vec3 vC;
  void main() {
    vec3 p = position;
    // Breathing: slow, soft waves, like cloth on water.
    float w = sin(p.x * 0.8 + uTime * 0.5) * sin(p.z * 1.05 - uTime * 0.35) * 0.04
            + sin((p.x - p.z) * 1.6 + uTime * 0.7) * 0.012;
    float rip = 0.0;
    for (int i = 0; i < 4; i++) {
      float age = uTime - uRip[i].z;
      if (age > 0.0 && age < 3.5) {
        float front = age * 1.4;
        float dist = distance(p.xz, uRip[i].xy);
        rip += uRip[i].w * exp(-pow((dist - front) * 3.2, 2.0)) * exp(-age * 1.1);
      }
    }
    p.y += w + rip * 0.05;

    vec2 g = p.xz - uGlow.xy;
    float glow = uGlow.z * exp(-dot(g, g) / 0.45);
    float ring = exp(-pow((distance(p.xz, uBase) - 0.56) * 14.0, 2.0)) * 0.55;
    float pool = 1.0 - smoothstep(0.35, 1.0, length((p.xz - uPool) / vec2(11.0, 9.5)));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Seen at a grazing angle the far rows crowd together and shimmer (moire):
    // measure the on-screen gap to the next row and fade where it gets too small.
    vec4 nextRow = projectionMatrix * (modelViewMatrix * vec4(p - vec3(0.0, 0.0, uStep), 1.0));
    float gap = abs(gl_Position.y / gl_Position.w - nextRow.y / nextRow.w) * 0.5 * uViewH;
    pool *= smoothstep(1.6, 4.5, gap);
    float D = -mv.z;
    float size = uSize * (0.8 + 0.4 * aRand) * (1.0 + glow * 0.8 + rip) / D;
    gl_PointSize = max(size, 1.0);
    float lit = clamp(0.55 + w * 7.0 + rip * 2.5, 0.0, 1.6);
    float hot = clamp(glow + ring, 0.0, 1.0);
    vC = mix(vec3(0.30, 0.58, 1.0) * lit, vec3(1.0, 0.55, 0.24) * 1.3, hot);
    vA = pool * min(1.0, size / 1.5) * (uAlpha * (0.5 + 0.5 * lit) + hot * 0.45);
  }
`;

/**
 * y: floor height in stage space; base: the robot's base (x, z); pool: centre of the lit area.
 * Add `points` to the robot's stage, so it rises, scales and hides with it.
 */
export function createFloor({ y, base, pool, step = 0.16, x0 = -14, x1 = 12, z0 = -22, z1 = 2 }) {
  const nx = Math.round((x1 - x0) / step) + 1, nz = Math.round((z1 - z0) / step) + 1;
  const pos = new Float32Array(nx * nz * 3), rand = new Float32Array(nx * nz);
  let i = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++, i++) {
      pos[i * 3] = x0 + ix * step;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z0 + iz * step;
      rand[i] = Math.random();
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  const rips = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0));
  const uniforms = {
    uTime: { value: 0 }, uSize: { value: 10 }, uAlpha: { value: 0.6 }, uStep: { value: step }, uViewH: { value: 1000 },
    uGlow: { value: new THREE.Vector3(0, 0, 0) },
    uBase: { value: new THREE.Vector2(base.x, base.z) },
    uPool: { value: new THREE.Vector2(pool.x, pool.z) },
    uRip: { value: rips },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    vertexShader: FLOOR_VS, fragmentShader: SOFT_DOT_FS, uniforms,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  points.renderOrder = -1;
  let next = 0;

  return {
    points,
    /** pxPerUnit: screen px per world unit at distance 1; viewH: drawing buffer height in px. */
    setPx(pxPerUnit, viewH) { uniforms.uSize.value = pxPerUnit * 0.024; uniforms.uViewH.value = viewH; },
    /** gripper: { x, y, z } in stage space. */
    update({ t, gripper }) {
      uniforms.uTime.value = t;
      const strength = Math.min(1, Math.max(0, 1 - (gripper.y - y) / 3)) * 0.9;
      uniforms.uGlow.value.set(gripper.x, gripper.z, strength);
    },
    /** A ripple running out from (x, z), stage space. */
    ripple(x, z, t, strength = 1) {
      rips[next].set(x, z, t, strength);
      next = (next + 1) % rips.length;
    },
  };
}
