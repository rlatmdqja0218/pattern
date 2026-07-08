import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import PreviewPanel from './PreviewPanel';

/**
 * 3D 목업의 임시 오브젝트. 지금은 천천히 회전하는 박스이며,
 * PatternCanvas의 최종 결과 캔버스를 CanvasTexture로 받아 표면에 입힌다.
 * 다음 단계에서 가전제품/모니터 모델 표면 래핑 구조로 교체할 수 있다.
 */
function MockupPlaceholder({ patternCanvas, patternVersion }) {
  const meshRef = useRef(null);
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    if (!patternCanvas) {
      setTexture(null);
      return;
    }

    const canvasTexture = new THREE.CanvasTexture(patternCanvas);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    canvasTexture.wrapS = THREE.RepeatWrapping;
    canvasTexture.wrapT = THREE.RepeatWrapping;
    canvasTexture.needsUpdate = true;
    setTexture(canvasTexture);

    return () => {
      canvasTexture.dispose();
    };
  }, [patternCanvas]);

  useEffect(() => {
    if (texture) texture.needsUpdate = true;
  }, [patternVersion, texture]);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.4;
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[2, 2.6, 1.2]} />
      {/* map 유무가 바뀌면 셰이더 재컴파일이 필요하므로 key로 머티리얼을 재생성 */}
      <meshStandardMaterial
        key={texture ? 'textured' : 'plain'}
        color={texture ? '#ffffff' : '#7a869c'}
        map={texture}
      />
    </mesh>
  );
}

/**
 * 3D Mockup 프리뷰 (three.js + @react-three/fiber 기반).
 */
export default function MockupViewer({ patternCanvas, patternVersion }) {
  return (
    <PreviewPanel title="3D 목업 프리뷰" meta="CanvasTexture">
      <div className="preview-panel__body">
        <Canvas camera={{ position: [0, 1.2, 4], fov: 45 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 4]} intensity={1.2} />
          <MockupPlaceholder patternCanvas={patternCanvas} patternVersion={patternVersion} />
        </Canvas>
      </div>
    </PreviewPanel>
  );
}
