"use client";

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";

/** Fresnel rim glow, rendered on a slightly larger back-faced sphere. */
export function Atmosphere({ radius, color, intensity = 1.1, power = 3.2 }: { radius: number; color: string; intensity?: number; power?: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uIntensity: { value: intensity },
          uPower: { value: power },
        },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uIntensity;
          uniform float uPower;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float f = pow(1.0 - abs(dot(vNormal, vView)), uPower);
            gl_FragColor = vec4(uColor * uIntensity, f * uIntensity);
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [color, intensity, power],
  );
  return (
    <mesh scale={1.12}>
      <sphereGeometry args={[radius, 64, 64]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * The SI occupation lattice: a latitude/longitude grid that scans across the surface.
 * `control` (0..1) drives opacity — liberated worlds show a fainter net.
 */
export function SiLattice({ radius, control = 0.9 }: { radius: number; control?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uControl: { value: control } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vUv = uv;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uControl;
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec2 g = abs(fract(vUv * vec2(48.0, 24.0)) - 0.5);
            float line = smoothstep(0.47, 0.5, max(g.x, g.y));
            float scan = smoothstep(0.0, 0.08, fract(vUv.y * 1.0 - uTime * 0.06)) *
                         (1.0 - smoothstep(0.08, 0.16, fract(vUv.y * 1.0 - uTime * 0.06)));
            float rim = pow(1.0 - abs(dot(vNormal, vView)), 1.6);
            float a = (line * 0.28 + scan * 0.35) * uControl * (0.35 + rim);
            gl_FragColor = vec4(vec3(1.0, 0.23, 0.19), a);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [control],
  );
  useFrame((state) => {
    const m = ref.current?.material as THREE.ShaderMaterial | undefined;
    if (m?.uniforms.uTime) m.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh ref={ref} scale={1.012}>
      <sphereGeometry args={[radius, 96, 64]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/** Saturn-style ring with radially remapped UVs so the 1-D ring strip texture wraps correctly. */
export function PlanetRing({ inner, outer, rotation = [-Math.PI / 2, 0, 0] }: { inner: number; outer: number; rotation?: [number, number, number] }) {
  const tex = useTexture("/textures/saturn_ring_alpha.webp");
  const geom = useMemo(() => {
    const g = new THREE.RingGeometry(inner, outer, 160, 1);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    return g;
  }, [inner, outer]);
  return (
    <mesh geometry={geom} rotation={rotation}>
      <meshStandardMaterial map={tex} alphaMap={tex} transparent side={THREE.DoubleSide} depthWrite={false} color="#e8d9b0" />
    </mesh>
  );
}
