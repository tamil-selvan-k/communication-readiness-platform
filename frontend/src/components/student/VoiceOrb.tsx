import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface VoiceOrbProps {
  state: 'idle' | 'listening' | 'speaking' | 'thinking';
  volume?: number;
  size?: number;
}

const VoiceOrbComponent: React.FC<VoiceOrbProps> = ({ state, volume = 0.3, size = 380 }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const stateRef = useRef(state);
  const volumeRef = useRef(volume);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = size;
    const height = size;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.4);

    // 2. High-Fidelity WebGL Renderer with Alpha Transparency (No box, no borders)
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 3. Studio 3D Lighting Setup for Pristine Spherical Ball Shading
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x09090b, 1.4);
    scene.add(hemiLight);

    // Key Light (top-left) - smooth studio specular shine on curved surface
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(-2.6, 3.2, 3.8);
    scene.add(keyLight);

    // Soft Rim Light (top-back) - sharp edge definition around the sphere silhouette
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.5);
    rimLight.position.set(1.5, 2.8, -3.2);
    scene.add(rimLight);

    // 4. Main 3D Ball (Smooth 128x128 Sphere Geometry)
    const sphereRadius = 1.32;
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 128, 128);
    sphereGeometry.computeVertexNormals();

    const sphereMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#0c0d12'),
      emissive: new THREE.Color('#121318'),
      roughness: 0.32,
      metalness: 0.08,
      clearcoat: 0.6,
      clearcoatRoughness: 0.16,
      reflectivity: 0.85,
      ior: 1.5,
    });

    // Sphere has its own dedicated group so its movement is independent and OPPOSITE to the waves
    const sphereGroup = new THREE.Group();
    const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphereGroup.add(sphereMesh);
    scene.add(sphereGroup);

    // 5. Rich Constellation of 8 Pure White Connected Wave Ribbons (Housed in wavesGroup for OPPOSITE movement)
    const wavesGroup = new THREE.Group();
    scene.add(wavesGroup);

    // 8 continuous 360-degree closed wave ribbons wrapping all around the sphere (calibrated smooth speeds)
    const ringConfigs = [
      {
        name: 'Equatorial',
        tiltX: 0.08,
        tiltY: 0.0,
        tiltZ: 0.05,
        rotSpeedZ: -0.006,
        rotSpeedY: -0.004,
        rOffset: 0.022,
        ribbonWidth: 0.062,
        lobes: 3,
        speed: 3.5,
        phase: 0.0,
      },
      {
        name: 'Diagonal-1',
        tiltX: Math.PI / 4.2,
        tiltY: 0.25,
        tiltZ: 0.15,
        rotSpeedZ: -0.0055,
        rotSpeedY: -0.003,
        rOffset: 0.028,
        ribbonWidth: 0.056,
        lobes: 4,
        speed: 4.0,
        phase: 1.2,
      },
      {
        name: 'Diagonal-2',
        tiltX: -Math.PI / 3.6,
        tiltY: -0.32,
        tiltZ: -0.2,
        rotSpeedZ: 0.006,
        rotSpeedY: -0.0045,
        rOffset: 0.024,
        ribbonWidth: 0.058,
        lobes: 3,
        speed: 3.2,
        phase: 2.5,
      },
      {
        name: 'Polar-1',
        tiltX: Math.PI / 2.15,
        tiltY: 0.15,
        tiltZ: 0.35,
        rotSpeedZ: -0.007,
        rotSpeedY: -0.004,
        rOffset: 0.032,
        ribbonWidth: 0.052,
        lobes: 5,
        speed: 4.2,
        phase: 3.8,
      },
      {
        name: 'Cross-Orbital',
        tiltX: -Math.PI / 4.5,
        tiltY: Math.PI / 3.2,
        tiltZ: -0.25,
        rotSpeedZ: -0.0065,
        rotSpeedY: -0.005,
        rOffset: 0.026,
        ribbonWidth: 0.056,
        lobes: 4,
        speed: 3.8,
        phase: 4.6,
      },
      {
        name: 'Mid-Latitude-Upper',
        tiltX: Math.PI / 6.0,
        tiltY: -0.22,
        tiltZ: 0.3,
        rotSpeedZ: 0.0065,
        rotSpeedY: 0.0035,
        rOffset: 0.025,
        ribbonWidth: 0.054,
        lobes: 4,
        speed: 3.6,
        phase: 0.8,
      },
      {
        name: 'Mid-Latitude-Lower',
        tiltX: -Math.PI / 5.5,
        tiltY: 0.3,
        tiltZ: -0.18,
        rotSpeedZ: -0.006,
        rotSpeedY: -0.005,
        rOffset: 0.03,
        ribbonWidth: 0.055,
        lobes: 3,
        speed: 4.0,
        phase: 2.1,
      },
      {
        name: 'Polar-Transverse',
        tiltX: -Math.PI / 2.2,
        tiltY: -0.25,
        tiltZ: 0.4,
        rotSpeedZ: 0.0075,
        rotSpeedY: 0.0045,
        rOffset: 0.034,
        ribbonWidth: 0.05,
        lobes: 5,
        speed: 4.4,
        phase: 5.2,
      },
    ];

    const SEGMENTS = 128; // High resolution for silky-smooth continuous loops
    const ringMeshes: THREE.Mesh[] = [];
    const ringGeometries: THREE.BufferGeometry[] = [];
    const ringMaterials: THREE.MeshBasicMaterial[] = [];
    const ringGroups: THREE.Group[] = [];

    ringConfigs.forEach((cfg) => {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(SEGMENTS * 2 * 3); // 2 vertices per segment
      const indices: number[] = [];

      const R_base = sphereRadius * (1.02 + cfg.rOffset);
      const w = cfg.ribbonWidth;
      const jiggleAmpR = 0.03;
      const jiggleAmpZ = 0.035;

      for (let j = 0; j < SEGMENTS; j++) {
        const i0 = j * 2;
        const i1 = j * 2 + 1;
        const i2 = ((j + 1) % SEGMENTS) * 2;
        const i3 = ((j + 1) % SEGMENTS) * 2 + 1;
        // Two triangles forming a seamless quad strip
        indices.push(i0, i1, i2);
        indices.push(i1, i3, i2);

        // Pre-compute initial vertex geometry at t=0 so frame 0 has zero empty buffer flash
        const phi = (j / SEGMENTS) * Math.PI * 2;
        const waveHarmonic1 = Math.sin(phi * cfg.lobes + cfg.phase);
        const waveHarmonic2 = Math.cos(phi * (cfg.lobes + 2) + cfg.phase * 1.5);
        const compositeWave = waveHarmonic1 * 0.65 + waveHarmonic2 * 0.35;
        const rInner = R_base + compositeWave * (jiggleAmpR * 0.6);
        const rOuter = rInner + w + compositeWave * (jiggleAmpR * 0.4);
        const zDisplace = Math.cos(phi * (cfg.lobes + 1) + cfg.phase) * jiggleAmpZ;
        const cosP = Math.cos(phi);
        const sinP = Math.sin(phi);

        positions[j * 6 + 0] = cosP * rInner;
        positions[j * 6 + 1] = sinP * rInner;
        positions[j * 6 + 2] = zDisplace;
        positions[j * 6 + 3] = cosP * rOuter;
        positions[j * 6 + 4] = sinP * rOuter;
        positions[j * 6 + 5] = zDisplace * 1.15;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(indices);

      // Pure White Color with high luminosity
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geo, mat);

      // Each ring is housed in an oriented parent group inside wavesGroup
      const ringGroup = new THREE.Group();
      ringGroup.rotation.set(cfg.tiltX, cfg.tiltY, cfg.tiltZ);
      ringGroup.add(mesh);

      wavesGroup.add(ringGroup);
      ringGroups.push(ringGroup);
      ringMeshes.push(mesh);
      ringGeometries.push(geo);
      ringMaterials.push(mat);
    });

    // 6. Interactive Mouse Parallax (Opposite Direction Tracking)
    let targetRotX = 0;
    let targetRotY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX - (rect.left + rect.width / 2);
      const clientY = e.clientY - (rect.top + rect.height / 2);
      targetRotY = (clientX / (rect.width / 2)) * 0.32;
      targetRotX = (clientY / (rect.height / 2)) * 0.22;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // 7. Animation Loop with Voice-Driven Wave Movement in OPPOSITE Direction to Sphere
    let animationFrameId: number;
    let smoothedVolume = 0.15;
    const startedAt = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const time = (performance.now() - startedAt) / 1000;
      const currentState = stateRef.current;
      const rawVolume = volumeRef.current || 0.15;

      const isListening = currentState === 'listening';
      const isSpeaking = currentState === 'speaking';
      const isThinking = currentState === 'thinking';
      const isVoiceActive = isListening || isSpeaking;

      // --- SILKY-SMOOTH VOLUME INTERPOLATION (ZERO FLICKER) ---
      let targetVolume = rawVolume;
      if (isSpeaking) {
        // Continuous harmonic syllable cadence (flowing sinusoidal curve, zero sudden steps)
        const speechEnvelope = Math.sin(time * 2.4) * 0.5 + 0.5;
        targetVolume = 0.18 + speechEnvelope * 0.14;
      }

      // Exponential moving average filter completely eliminates volume spikes and flickering
      smoothedVolume += (targetVolume - smoothedVolume) * 0.08;
      const effectiveVolume = Math.min(1.0, Math.max(0.08, smoothedVolume));

      // --- CONSTANT ROTATION SPEED IN OPPOSITE DIRECTIONS (UNAFFECTED BY AUDIO VOLUME) ---
      // For any amount of sound, speed remains steady and constant
      // 1) Autonomous rotation in OPPOSITE directions:
      // Sphere rolls clockwise (+Y, +X) at a steady, calm speed
      sphereMesh.rotation.y += 0.002;
      sphereMesh.rotation.x += 0.0008;

      // Waves rotate counter-clockwise (-Y, -X) in OPPOSITE direction at a steady, calm speed
      wavesGroup.rotation.y -= 0.0035;
      wavesGroup.rotation.x -= 0.001;

      // 2) Mouse parallax tilt in opposite directions:
      sphereGroup.rotation.y += (targetRotY - sphereGroup.rotation.y) * 0.06;
      sphereGroup.rotation.x += (targetRotX - sphereGroup.rotation.x) * 0.06;

      wavesGroup.rotation.y += (-targetRotY * 1.15 - wavesGroup.rotation.y) * 0.06;
      wavesGroup.rotation.x += (-targetRotX * 1.15 - wavesGroup.rotation.x) * 0.06;

      // Synchronized floating hover (constant frequency and amplitude)
      const hoverOffset = Math.sin(time * 1.5) * 0.04;
      sphereGroup.position.y = hoverOffset;
      wavesGroup.position.y = hoverOffset;

      // 3) Scale Swell of Sphere vs Waves:
      // Smoothly swells with volume without any jerky jumps
      const sphereScaleTarget = 1.0 + (isVoiceActive ? effectiveVolume * 0.06 : Math.sin(time * 1.5) * 0.006);
      sphereMesh.scale.setScalar(sphereScaleTarget);

      const waveScaleTarget = 1.0 + (isVoiceActive ? effectiveVolume * 0.12 : Math.sin(time * 1.5) * 0.008);
      wavesGroup.scale.setScalar(waveScaleTarget);

      // 4) Voice-Reactive Wave Crest Jiggle (Smooth displacement, strictly constant speed)
      const jiggleAmpR = isVoiceActive
        ? 0.03 + effectiveVolume * 0.15
        : isThinking
        ? 0.05
        : 0.025;

      const jiggleAmpZ = isVoiceActive
        ? 0.035 + effectiveVolume * 0.16
        : isThinking
        ? 0.055
        : 0.028;

      // Animate, Jiggle, and Rotate all 8 continuous connected white wave rings
      ringConfigs.forEach((cfg, idx) => {
        const geo = ringGeometries[idx];
        const mat = ringMaterials[idx];
        const mesh = ringMeshes[idx];
        const group = ringGroups[idx];
        const posAttr = geo.attributes.position as THREE.BufferAttribute;

        // Individual orbital rotation counter to sphere at CONSTANT speed (no volume acceleration)
        mesh.rotation.z += cfg.rotSpeedZ;
        group.rotation.y += cfg.rotSpeedY;

        // Stable, pure white glow opacity (never strobing or flickering)
        if (isVoiceActive) {
          mat.opacity = 0.90;
        } else if (isThinking) {
          mat.opacity = 0.85 + Math.sin(time * 3 + idx) * 0.1;
        } else {
          mat.opacity = 0.65;
        }

        const R_base = sphereRadius * (1.02 + cfg.rOffset);
        const w = cfg.ribbonWidth;

        // Constant ripple traveling frequency — exactly the same speed regardless of volume!
        const constantRippleSpeed = cfg.speed * 0.45;

        for (let j = 0; j < SEGMENTS; j++) {
          const phi = (j / SEGMENTS) * Math.PI * 2;

          // Harmonic sinusoidal soundwave jiggle at constant velocity
          const waveHarmonic1 = Math.sin(phi * cfg.lobes + time * constantRippleSpeed + cfg.phase);
          const waveHarmonic2 = Math.cos(phi * (cfg.lobes + 2) - time * (constantRippleSpeed * 1.25) + cfg.phase * 1.5);
          const compositeWave = waveHarmonic1 * 0.65 + waveHarmonic2 * 0.35;

          // Radial wave pulsation hugging the sphere surface (amplitude grows with volume, speed stays constant)
          const rInner = R_base + compositeWave * (jiggleAmpR * 0.6);
          const rOuter = rInner + w + compositeWave * (jiggleAmpR * 0.4);

          // Out-of-plane 3D wave undulation at constant speed
          const zDisplace = Math.cos(phi * (cfg.lobes + 1) + time * (constantRippleSpeed * 1.1) + cfg.phase) * jiggleAmpZ;

          const cosP = Math.cos(phi);
          const sinP = Math.sin(phi);

          // Inner vertex
          posAttr.setXYZ(j * 2, cosP * rInner, sinP * rInner, zDisplace);
          // Outer vertex
          posAttr.setXYZ(j * 2 + 1, cosP * rOuter, sinP * rOuter, zDisplace * 1.15);
        }

        posAttr.needsUpdate = true;
      });

      renderer.render(scene, camera);
    };

    // Synchronous initial frame render so canvas is instantly painted before first tick
    renderer.render(scene, camera);
    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);

      sphereGeometry.dispose();
      sphereMaterial.dispose();
      ringGeometries.forEach((g) => g.dispose());
      ringMaterials.forEach((m) => m.dispose());
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return (
    <div className="relative flex items-center justify-center select-none pointer-events-auto overflow-visible">
      {/* 3D WebGL Canvas with no square bounding box */}
      <div 
        ref={mountRef} 
        style={{ width: size, height: size }} 
        className="flex items-center justify-center cursor-grab active:cursor-grabbing overflow-visible"
      />
    </div>
  );
};

export const VoiceOrb = React.memo(VoiceOrbComponent);
