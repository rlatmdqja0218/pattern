import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 3D 목업의 임시 오브젝트. 지금은 천천히 회전하는 박스이며,
 * 이미지가 업로드되면 표면 텍스처로 입혀 상태 연결만 확인한다.
 * 추후 가전제품(냉장고 등) 모델과 심리스 패턴 텍스처로 교체 예정.
 */
function MockupPlaceholder({ imageUrl }) {
  const meshRef = useRef(null);
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    if (!imageUrl) {
      setTexture(null);
      return;
    }
    let disposed = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('Anonymous');
    loader.load(imageUrl, (loaded) => {
      if (disposed) return;
      loaded.colorSpace = THREE.SRGBColorSpace;
      setTexture(loaded);
    });
    return () => {
      disposed = true;
    };
  }, [imageUrl]);

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
 * 3D Mockup 프리뷰 (three.js + @react-three/fiber 기반) 빈 껍데기.
 */
export default function Preview3D({ imageUrl }) {
  return (
    <section className="preview-panel">
      <header className="preview-panel__header">
        <h2>3D 목업 프리뷰</h2>
        <span className="preview-panel__meta">placeholder</span>
      </header>
      <div className="preview-panel__body">
        <Canvas camera={{ position: [0, 1.2, 4], fov: 45 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 4]} intensity={1.2} />
          <MockupPlaceholder imageUrl={imageUrl} />
        </Canvas>
      </div>
    </section>
  );
}
