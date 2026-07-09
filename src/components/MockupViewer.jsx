import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import PreviewPanel from './PreviewPanel';
import {
  normalizeStlGeometry,
  getPerspectiveFitDistance,
  applyStlUV,
  createPatternMaterial,
  createUvCheckerTexture,
  updatePatternMaterial,
  updatePatternTextureTransform,
} from '../engines/stlMapping';

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
 * 사용자 업로드 STL 목업.
 * STL은 보통 UV가 없으므로 engines/stlMapping이 planar/box UV를 생성하고,
 * 2D 패턴과 동일한 CanvasTexture를 머티리얼에 입혀 실시간 반영한다.
 */
function CustomStlMockup({
  stlUrl,
  patternCanvas,
  patternVersion,
  params,
  fitRequest,
}) {
  const [geometry, setGeometry] = useState(null);
  const [texture, setTexture] = useState(null);
  const controlsRef = useRef(null);
  const { camera, size, invalidate } = useThree();
  const mappingOptions = useMemo(() => ({
    stlMappingMode: params.stlMappingMode,
    stlProjectionAxis: params.stlProjectionAxis,
    stlSwapUV: params.stlSwapUV,
    stlFlipU: params.stlFlipU,
    stlFlipV: params.stlFlipV,
  }), [
    params.stlFlipU,
    params.stlFlipV,
    params.stlMappingMode,
    params.stlProjectionAxis,
    params.stlSwapUV,
  ]);
  const mappingOptionsRef = useRef(mappingOptions);
  mappingOptionsRef.current = mappingOptions;

  // STL 로드 → 노멀/센터/스케일 정규화 → 초기 UV 생성
  useEffect(() => {
    if (!stlUrl) {
      setGeometry(null);
      return;
    }
    let disposed = false;
    new STLLoader().load(
      stlUrl,
      (loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        normalizeStlGeometry(loaded);
        applyStlUV(loaded, mappingOptionsRef.current);
        setGeometry(loaded);
      },
      undefined,
      () => {
        if (!disposed) setGeometry(null);
      },
    );
    return () => {
      disposed = true;
    };
  }, [stlUrl]);

  // geometry 교체/언마운트 시 GPU 리소스 해제
  useEffect(() => () => geometry?.dispose(), [geometry]);

  // 투사 축과 방향 옵션이 바뀌면 같은 geometry에 UV를 다시 생성
  useEffect(() => {
    if (geometry) applyStlUV(geometry, mappingOptions);
  }, [geometry, mappingOptions]);

  // 2D 패턴 캔버스 → CanvasTexture (monitor 목업과 동일한 소스 캔버스 공유)
  useEffect(() => {
    if (!patternCanvas) {
      setTexture(null);
      return;
    }
    const canvasTexture = new THREE.CanvasTexture(patternCanvas);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    setTexture(canvasTexture);
    return () => canvasTexture.dispose();
  }, [patternCanvas]);

  // 텍스처 반복/오프셋/회전 변환
  useEffect(() => {
    if (texture) updatePatternTextureTransform(texture, params, geometry);
  }, [geometry, texture, params]);

  // 패턴 파라미터·role·preset 변경으로 캔버스가 다시 그려지면 텍스처 갱신
  useEffect(() => {
    if (texture) texture.needsUpdate = true;
  }, [patternVersion, texture]);

  const uvCheckerTexture = useMemo(() => createUvCheckerTexture(), []);
  useEffect(() => () => uvCheckerTexture.dispose(), [uvCheckerTexture]);
  useEffect(() => {
    updatePatternTextureTransform(uvCheckerTexture, params, geometry);
  }, [geometry, params, uvCheckerTexture]);

  // 머티리얼은 한 번 만들고 제자리 갱신 (map 유무 변화 시 재컴파일 처리 포함)
  const material = useMemo(() => createPatternMaterial(null, {}), []);
  useEffect(() => () => material.dispose(), [material]);
  const activeTexture = params.stlShowUvChecker ? uvCheckerTexture : texture;
  useEffect(() => {
    updatePatternMaterial(material, activeTexture, params);
  }, [activeTexture, material, params]);

  const fitStlView = useCallback(() => {
    if (!geometry || !camera.isPerspectiveCamera) return;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const sphere = geometry.boundingSphere;
    const target = sphere.center.clone();
    const radius = Math.max(sphere.radius, 0.01);
    const aspect = Math.max(0.01, size.width / Math.max(1, size.height));
    const distance = getPerspectiveFitDistance(radius, camera.fov, aspect);
    const direction = camera.position.clone().sub(target);
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, 1);
    direction.normalize();

    camera.position.copy(target).addScaledVector(direction, distance);
    camera.near = Math.max(0.01, distance / 100);
    camera.far = Math.max(100, distance * 100);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(target);
      controlsRef.current.update();
    }
    invalidate();
  }, [camera, geometry, invalidate, size.height, size.width]);

  useEffect(() => {
    fitStlView();
  }, [fitRequest, fitStlView, geometry]);

  useEffect(() => {
    if (!camera.isPerspectiveCamera) return;
    camera.aspect = Math.max(0.01, size.width / Math.max(1, size.height));
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, size.height, size.width]);

  return (
    <>
      {geometry && <mesh geometry={geometry} material={material} />}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        autoRotate={false}
        enablePan
        minDistance={0.3}
        maxDistance={30}
      />
    </>
  );
}

/**
 * 3D Mockup 프리뷰 (three.js + @react-three/fiber 기반).
 * mockupMode: 'monitor'(기존 모니터 후면 패널) | 'customStl'(업로드 STL)
 */
export default function MockupViewer({
  patternCanvas,
  patternVersion,
  params,
  stlUrl,
  panelCollapsed,
  onTogglePanel,
  onResetStlMapping,
}) {
  const [fitRequest, setFitRequest] = useState(0);
  const isCustomStl = params?.mockupMode === 'customStl';
  const meta = isCustomStl
    ? `custom STL · ${params.stlMappingPreset} · ${params.stlProjectionAxis}`
    : 'monitor back panel';
  const actions = isCustomStl ? (
    <div className="mockup-viewer__actions" aria-label="STL 보기 조절">
      <button
        type="button"
        onClick={() => setFitRequest((current) => current + 1)}
        disabled={!stlUrl}
        aria-label="STL 화면 맞춤"
        title="STL 화면 맞춤"
      >
        화면 맞춤
      </button>
      <button
        type="button"
        onClick={onResetStlMapping}
        aria-label="STL 매핑 리셋"
        title="현재 프리셋 기준으로 매핑 초기화"
      >
        매핑 리셋
      </button>
    </div>
  ) : null;

  return (
    <PreviewPanel
      title="3D 목업 프리뷰"
      meta={meta}
      collapsed={panelCollapsed}
      onToggleCollapsed={onTogglePanel}
      actions={actions}
    >
      <div className="preview-panel__body">
        {/* 접힌 동안 R3F Canvas를 unmount해 renderer를 정지/해제하고,
            다시 펼치면 새 패널 크기로 renderer가 재생성된다 */}
        {!panelCollapsed && (
        <Canvas camera={{ position: [0.2, 0.25, 5.1], fov: 38 }}>
          <color attach="background" args={['#101317']} />
          {isCustomStl ? (
            <>
              {/* 스튜디오 제품 렌더링 조명: 키 + 필 + 림 + 하늘빛 */}
              <hemisphereLight args={['#cfd8e3', '#1a1e24', 0.5]} />
              <directionalLight position={[4, 5, 5]} intensity={1.25} />
              <directionalLight position={[-4, 2, 3]} intensity={0.5} />
              <directionalLight position={[0, 3, -5]} intensity={0.7} />
              {stlUrl && (
                <CustomStlMockup
                  stlUrl={stlUrl}
                  patternCanvas={patternCanvas}
                  patternVersion={patternVersion}
                  params={params}
                  fitRequest={fitRequest}
                />
              )}
            </>
          ) : (
            <>
              <ambientLight intensity={0.58} />
              <directionalLight position={[3.5, 4.5, 4]} intensity={1.15} />
              <directionalLight position={[-3, 1.5, 2]} intensity={0.45} />
              <ProductBackPanelMockup
                patternCanvas={patternCanvas}
                patternVersion={patternVersion}
                params={params}
              />
            </>
          )}
          {!isCustomStl && (
            <OrbitControls
              enableDamping
              dampingFactor={0.08}
              autoRotate={false}
              minDistance={3.1}
              maxDistance={7}
            />
          )}
        </Canvas>
        )}
        {!panelCollapsed && isCustomStl && !stlUrl && (
          <p className="preview-panel__placeholder">STL 파일을 업로드하세요</p>
        )}
      </div>
    </PreviewPanel>
  );
}
