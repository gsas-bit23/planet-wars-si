"use client";

import * as THREE from "three";
import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { PlanetMeta } from "@/lib/planets";
import { Atmosphere, PlanetRing, SiLattice } from "./materials";

function Body({ planet, control }: { planet: PlanetMeta; control: number }) {
  const tex = useTexture(planet.texture);
  const clouds = useTexture(planet.slug === "earth" ? "/textures/earth_clouds_1k.webp" : planet.textureSmall);
  const group = useRef<THREE.Group>(null);
  const cloudRef = useRef<THREE.Mesh>(null);

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.06;
    if (cloudRef.current) cloudRef.current.rotation.y += dt * 0.012;
  });

  const R = planet.ring ? 1.25 : 2;
  return (
    <group rotation={[0, 0, planet.ring ? 0.35 : planet.tilt * 0.6]}>
      <group ref={group}>
        <mesh>
          <sphereGeometry args={[R, 128, 128]} />
          <meshStandardMaterial map={tex} roughness={0.92} />
        </mesh>
        {planet.slug === "earth" && (
          <mesh ref={cloudRef} scale={1.012}>
            <sphereGeometry args={[R, 96, 96]} />
            <meshStandardMaterial alphaMap={clouds} transparent depthWrite={false} color="#ffffff" opacity={0.85} />
          </mesh>
        )}
        <SiLattice radius={R} control={control} />
      </group>
      <Atmosphere radius={R} color={planet.atmosphere ?? planet.glow} intensity={planet.atmosphere ? 1.1 : 0.55} />
      {planet.ring && <PlanetRing inner={R * 1.25} outer={R * 2.25} rotation={[-Math.PI / 2 + 0.32, 0, 0]} />}
    </group>
  );
}

export default function PlanetView({ planet, control, className }: { planet: PlanetMeta; control: number; className?: string }) {
  return (
    <div className={className}>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0.5, 7.4], fov: 40 }} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <color attach="background" args={["#04050a"]} />
          <ambientLight intensity={0.06} />
          <directionalLight position={[-6, 2.5, 4]} intensity={3.2} color="#fff3e2" />
          <directionalLight position={[6, -1, -4]} intensity={0.35} color="#ff3b30" />
          <Stars radius={60} depth={30} count={2500} factor={3} fade speed={0.3} />
          <Body planet={planet} control={control} />
          <OrbitControls enablePan={false} enableZoom={false} autoRotate={false} rotateSpeed={0.5} />
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.7} />
            <Vignette offset={0.3} darkness={0.8} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
