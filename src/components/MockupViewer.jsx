import { useEffect, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import PreviewPanel from './PreviewPanel';

const DEFAULT_MOCKUP_PARAMS = {
  mockupPatternScaleX: 1,
  mockupPatternScaleY: 1,
  mockupPatternOffsetX: 0,
  mockupPatternOffsetY: 0,
  mockupPatternRotation: 0,
};

function applyTextureSettings(texture, params = {}) {
  if (!texture) return;
  const {
    mockupPatternScaleX,
    mockupPatternScaleY,
    mockupPatternOffsetX,
    mockupPatternOffsetY,
    mockupPatternRotation,
  } = { ...DEFAULT_MOCKUP_PARAMS, ...params };

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    Math.max(0.01, mockupPatternScaleX),
    Math.max(0.01, mockupPatternScaleY),
  );
  texture.offset.set(mockupPatternOffsetX, mockupPatternOffsetY);
  texture.center.set(0.5, 0.5);
  texture.rotation = mockupPatternRotation;
  texture.needsUpdate = true;
}

/**
 * 모니터/전자제품 후면 패널형 목업.
 * 패턴 텍스처는 넓은 후면 패널에만 적용하고, 힌지/스탠드는 금속 재질로 분리한다.
 */
function ProductBackPanelMockup({ patternCanvas, patternVersion, params }) {
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    if (!patternCanvas) {
      setTexture(null);
      return;
    }

    const canvasTexture = new THREE.CanvasTexture(patternCanvas);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    applyTextureSettings(canvasTexture);
    setTexture(canvasTexture);

    return () => {
      canvasTexture.dispose();
    };
  }, [patternCanvas]);

  useEffect(() => {
    applyTextureSettings(texture, params);
  }, [
    params,
    params?.mockupPatternOffsetX,
    params?.mockupPatternOffsetY,
    params?.mockupPatternRotation,
    params?.mockupPatternScaleX,
    params?.mockupPatternScaleY,
    texture,
  ]);

  useEffect(() => {
    if (texture) texture.needsUpdate = true;
  }, [patternVersion, texture]);

  const panelMaterialKey = texture ? 'pattern-panel' : 'plain-panel';

  return (
    <group rotation={[0.12, -0.45, 0]} position={[0, 0.35, 0]}>
      <mesh position={[0, 0.2, -0.08]}>
        <boxGeometry args={[4.05, 1.82, 0.24]} />
        <meshStandardMaterial
          color="#2a3038"
          roughness={0.62}
          metalness={0.18}
        />
      </mesh>

      <mesh position={[0, 0.2, 0.07]}>
        <boxGeometry args={[3.8, 1.6, 0.12]} />
        <meshStandardMaterial
          attach="material-0"
          color="#252b33"
          roughness={0.58}
          metalness={0.16}
        />
        <meshStandardMaterial
          attach="material-1"
          color="#252b33"
          roughness={0.58}
          metalness={0.16}
        />
        <meshStandardMaterial
          attach="material-2"
          color="#252b33"
          roughness={0.58}
          metalness={0.16}
        />
        <meshStandardMaterial
          attach="material-3"
          color="#252b33"
          roughness={0.58}
          metalness={0.16}
        />
        <meshStandardMaterial
          attach="material-4"
          key={panelMaterialKey}
          color={texture ? '#ffffff' : '#7a869c'}
          map={texture}
          roughness={0.48}
          metalness={0.05}
        />
        <meshStandardMaterial
          attach="material-5"
          color="#252b33"
          roughness={0.58}
          metalness={0.16}
        />
      </mesh>

      <mesh position={[-1.78, 0.2, 0.15]}>
        <boxGeometry args={[0.16, 1.34, 0.05]} />
        <meshStandardMaterial color="#20262d" roughness={0.7} metalness={0.25} />
      </mesh>
      <mesh position={[1.78, 0.2, 0.15]}>
        <boxGeometry args={[0.16, 1.34, 0.05]} />
        <meshStandardMaterial color="#20262d" roughness={0.7} metalness={0.25} />
      </mesh>

      <mesh position={[-0.9, 0.2, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.12, 48]} />
        <meshStandardMaterial color="#11161d" roughness={0.36} metalness={0.72} />
      </mesh>

      <mesh position={[-0.9, -0.72, 0.13]}>
        <boxGeometry args={[0.2, 1.24, 0.22]} />
        <meshStandardMaterial color="#151b22" roughness={0.42} metalness={0.68} />
      </mesh>

      <mesh position={[-0.9, -1.42, 0.18]}>
        <boxGeometry args={[1.62, 0.16, 0.82]} />
        <meshStandardMaterial color="#141a21" roughness={0.48} metalness={0.62} />
      </mesh>

      <mesh position={[-0.9, -1.31, 0.18]}>
        <boxGeometry args={[0.72, 0.12, 0.46]} />
        <meshStandardMaterial color="#202730" roughness={0.5} metalness={0.52} />
      </mesh>
    </group>
  );
}

/**
 * 3D Mockup 프리뷰 (three.js + @react-three/fiber 기반).
 */
export default function MockupViewer({ patternCanvas, patternVersion, params }) {
  return (
    <PreviewPanel title="3D 목업 프리뷰" meta="monitor back panel">
      <div className="preview-panel__body">
        <Canvas camera={{ position: [0.2, 0.25, 5.1], fov: 38 }}>
          <color attach="background" args={['#101317']} />
          <ambientLight intensity={0.58} />
          <directionalLight position={[3.5, 4.5, 4]} intensity={1.15} />
          <directionalLight position={[-3, 1.5, 2]} intensity={0.45} />
          <ProductBackPanelMockup
            patternCanvas={patternCanvas}
            patternVersion={patternVersion}
            params={params}
          />
          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            autoRotate={false}
            minDistance={3.1}
            maxDistance={7}
          />
        </Canvas>
      </div>
    </PreviewPanel>
  );
}
