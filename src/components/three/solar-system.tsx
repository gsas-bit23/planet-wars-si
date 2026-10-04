"use client";

import * as THREE from "three";
import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Stars, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useRouter } from "next/navigation";
import { PLANETS, type PlanetMeta } from "@/lib/planets";
import { Atmosphere } from "./materials";

function Sun() {
  const tex = useTexture("/textures/sun_1k.webp");
  const ref = useRef<THREE.Mesh>(null);
  const cage = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.03;
    if (cage.current) {
      cage.current.rotation.y -= dt * 0.08;
      cage.current.rotation.x += dt * 0.02;
    }
  });
  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry args={[2.6, 64, 64]} />
        <meshBasicMaterial map={tex} color={new THREE.Color(1.8, 1.25, 0.9)} toneMapped={false} />
      </mesh>
      <Atmosphere radius={2.6} color="#ff7a2e" intensity={1.6} power={2.2} />
      {/* SI containment cage around the Sun */}
      <group ref={cage}>
        <mesh>
          <icosahedronGeometry args={[3.7, 1]} />
          <meshBasicMaterial color="#ff3b30" wireframe transparent opacity={0.22} toneMapped={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2.4, 0, 0]}>
          <torusGeometry args={[4.4, 0.012, 8, 160]} />
          <meshBasicMaterial color="#ff3b30" toneMapped={false} transparent opacity={0.8} />
        </mesh>
      </group>
      <pointLight intensity={420} distance={140} decay={1.6} color="#fff1dc" />
    </group>
  );
}

function OrbitRing({ radius, highlighted }: { radius: number; highlighted: boolean }) {
  const geom = useMemo(() => {
    const pts = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2).getPoints(256);
    return new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0, p.y)));
  }, [radius]);
  return (
    <lineLoop geometry={geom}>
      <lineBasicMaterial color={highlighted ? "#8ff3ff" : "#3a4458"} transparent opacity={highlighted ? 0.9 : 0.45} />
    </lineLoop>
  );
}

function SaturnRing({ size }: { size: number }) {
  const tex = useTexture("/textures/saturn_ring_alpha.webp");
  const geom = useMemo(() => {
    const inner = size * 1.3;
    const outer = size * 2.3;
    const g = new THREE.RingGeometry(inner, outer, 128, 1);
    // Remap UVs radially so the 1D ring strip texture wraps correctly.
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    return g;
  }, [size]);
  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial map={tex} alphaMap={tex} transparent side={THREE.DoubleSide} depthWrite={false} color="#e8d9b0" />
    </mesh>
  );
}

function Planet({
  planet,
  hovered,
  onHover,
  onSelect,
  timeScale,
}: {
  planet: PlanetMeta;
  hovered: boolean;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string) => void;
  timeScale: React.RefObject<number>;
}) {
  const tex = useTexture(planet.textureSmall);
  const orbitRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const offset = useMemo(() => (planet.bodyId * 1.618) % (Math.PI * 2), [planet.bodyId]);
  const angle = useRef(offset);

  useFrame((_, dt) => {
    angle.current += (dt * (Math.PI * 2)) / planet.period / 3 * (timeScale.current ?? 1);
    if (orbitRef.current) orbitRef.current.rotation.y = angle.current;
    if (bodyRef.current) bodyRef.current.rotation.y += dt * 0.25;
  });

  return (
    <group>
      <OrbitRing radius={planet.orbit} highlighted={hovered} />
      <group ref={orbitRef}>
        <group position={[planet.orbit, 0, 0]} rotation={[0, 0, planet.tilt]}>
          <mesh
            ref={bodyRef}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover(planet.slug);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              onHover(null);
              document.body.style.cursor = "";
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(planet.slug);
            }}
            scale={hovered ? 1.15 : 1}
          >
            <sphereGeometry args={[planet.size, 48, 48]} />
            <meshStandardMaterial map={tex} roughness={0.95} metalness={0} />
          </mesh>
          {planet.atmosphere && <Atmosphere radius={planet.size} color={planet.atmosphere} intensity={0.9} />}
          {planet.ring && <SaturnRing size={planet.size} />}
          {/* SI marker */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[planet.size * 1.55, 0.008, 6, 64]} />
            <meshBasicMaterial color="#ff3b30" transparent opacity={hovered ? 0.95 : 0.35} toneMapped={false} />
          </mesh>
          <Html
            position={[0, planet.size + 0.55, 0]}
            center
            distanceFactor={22}
            zIndexRange={[20, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div
              className={`whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.2em] transition-all duration-300 ${hovered ? "text-ion opacity-100" : "text-haze/70 opacity-80"}`}
            >
              {planet.name}
              {hovered && <span className="ml-2 text-si">{planet.siControl}% SI</span>}
            </div>
          </Html>
        </group>
      </group>
    </group>
  );
}

function CameraRig() {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const baseX = Math.sin(t * 0.03) * 6;
    const desired = new THREE.Vector3(baseX + pointer.x * 4, 20 + pointer.y * 3, 46 + Math.cos(t * 0.03) * 3);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 1.2));
    camera.lookAt(target);
  });
  return null;
}

function Scene() {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const timeScale = useRef(1);
  useFrame((_, dt) => {
    const want = hovered ? 0.08 : 1;
    timeScale.current += (want - timeScale.current) * Math.min(1, dt * 3);
  });

  return (
    <>
      <color attach="background" args={["#04050a"]} />
      <fog attach="fog" args={["#04050a", 60, 140]} />
      <ambientLight intensity={0.05} />
      <Stars radius={180} depth={80} count={6000} factor={5} saturation={0} fade speed={0.4} />
      <Sun />
      {PLANETS.map((p) => (
        <Planet
          key={p.slug}
          planet={p}
          hovered={hovered === p.slug}
          onHover={setHovered}
          onSelect={(slug) => router.push(`/planets/${slug}`)}
          timeScale={timeScale}
        />
      ))}
      <CameraRig />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.6} luminanceSmoothing={0.3} />
        <Vignette eskil={false} offset={0.25} darkness={0.85} />
      </EffectComposer>
    </>
  );
}

export default function SolarSystem({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 22, 48], fov: 42, near: 0.1, far: 400 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
