import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArcballControls, OrbitControls } from '@react-three/drei';
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
import { createStlPatternTextureCanvas } from '../engines/stlPatternTexture';

const DEFAULT_MOCKUP_PARAMS = {
  mockupPatternScaleX: 1,
  mockupPatternScaleY: 1,
  mockupPatternOffsetX: 0,
  mockupPatternOffsetY: 0,
  mockupPatternRotation: 0,
};
const CUSTOM_STL_DEFAULT_CAMERA_POSITION = new THREE.Vector3(0.2, 0.25, 5.1);

const STL_TEXTURE_PARAM_KEYS = new Set([
  'stlTextureResolution',
  'stlTextureBackgroundMode',
  'stlTextureMappingMode',
  'stlBaseColor',
]);
const BAKED_STL_TEXTURE_PARAM_KEYS = new Set([
  'stlPatternScale',
  'stlPatternRepeatX',
  'stlPatternRepeatY',
]);

function clampControlSpeed(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.min(3, Math.max(0.1, numericValue));
}

function isEditableKeyboardTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable
    || tagName === 'input'
    || tagName === 'select'
    || tagName === 'textarea'
    || Boolean(target.closest('.leva-c-kWgxhW'));
}

function syncControlsTarget(controls, target, saveState = false) {
  if (!controls) return;
  if (typeof controls.setTarget === 'function') {
    controls.setTarget(target.x, target.y, target.z);
  } else if (controls.target) {
    controls.target.copy(target);
  }
  if (typeof controls.update === 'function') controls.update();
  if (saveState && typeof controls.saveState === 'function') controls.saveState();
}

function getOrbitMouseButtons(controlMode, spacePanActive) {
  if (controlMode === 'pan' || spacePanActive) {
    return {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
  }
  return {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
}

function getStlTextureRenderParams(params) {
  const isBakedSurface = (params.stlTextureMappingMode ?? 'bakedSurface') === 'bakedSurface';
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => (
      !key.startsWith('stl')
      || STL_TEXTURE_PARAM_KEYS.has(key)
      || (isBakedSurface && BAKED_STL_TEXTURE_PARAM_KEYS.has(key))
    )),
  );
}

function configureStlTextureSampling(texture, gl) {
  if (!texture) return;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.max(1, gl.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
}

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
 * 별도 고해상도 캔버스에 패턴을 다시 그려 독립 CanvasTexture로 사용한다.
 */
function CustomStlMockup({
  stlUrl,
  patternImageData,
  editablePath,
  selectedMotifs = [],
  params,
  fitRequest,
  viewResetRequest,
  spacePanActive,
}) {
  const [geometry, setGeometry] = useState(null);
  const controlsRef = useRef(null);
  const {
    camera,
    gl,
    size,
    invalidate,
  } = useThree();
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
  const controlMode = params.stlControlMode ?? 'orbit';
  const panSpeed = clampControlSpeed(params.stlPanSpeed);
  const rotateSpeed = clampControlSpeed(params.stlRotateSpeed);
  const zoomSpeed = clampControlSpeed(params.stlZoomSpeed);
  const orbitMouseButtons = useMemo(
    () => getOrbitMouseButtons(controlMode, spacePanActive),
    [controlMode, spacePanActive],
  );

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

  const textureParamsKey = JSON.stringify(getStlTextureRenderParams(params));
  const textureRenderParams = useMemo(
    () => JSON.parse(textureParamsKey),
    [textureParamsKey],
  );
  const textureCanvas = useMemo(() => createStlPatternTextureCanvas({
    params: textureRenderParams,
    editablePath,
    selectedMotifs,
    imageData: patternImageData,
    width: textureRenderParams.stlTextureResolution,
    height: textureRenderParams.stlTextureResolution,
  }), [
    editablePath,
    patternImageData,
    selectedMotifs,
    textureRenderParams,
  ]);
  const texture = useMemo(() => {
    const canvasTexture = new THREE.CanvasTexture(textureCanvas);
    configureStlTextureSampling(canvasTexture, gl);
    return canvasTexture;
  }, [gl, textureCanvas]);
  useEffect(() => () => texture.dispose(), [texture]);

  // 텍스처 반복/오프셋/회전 변환
  useEffect(() => {
    updatePatternTextureTransform(texture, params, geometry);
  }, [geometry, texture, params]);

  const uvCheckerTexture = useMemo(() => createUvCheckerTexture(), []);
  useEffect(() => () => uvCheckerTexture.dispose(), [uvCheckerTexture]);
  useEffect(() => {
    configureStlTextureSampling(uvCheckerTexture, gl);
    updatePatternTextureTransform(uvCheckerTexture, params, geometry);
  }, [geometry, gl, params, uvCheckerTexture]);

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
      syncControlsTarget(controlsRef.current, target, true);
    }
    invalidate();
  }, [camera, geometry, invalidate, size.height, size.width]);

  const resetStlView = useCallback(() => {
    if (!geometry || !camera.isPerspectiveCamera) return;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const sphere = geometry.boundingSphere;
    const target = sphere.center.clone();
    const radius = Math.max(sphere.radius, 0.01);
    const aspect = Math.max(0.01, size.width / Math.max(1, size.height));
    const distance = getPerspectiveFitDistance(radius, camera.fov, aspect);
    const direction = CUSTOM_STL_DEFAULT_CAMERA_POSITION.clone().normalize();

    camera.position.copy(target).addScaledVector(direction, distance);
    camera.up.set(0, 1, 0);
    camera.zoom = 1;
    camera.near = Math.max(0.01, distance / 100);
    camera.far = Math.max(100, distance * 100);
    camera.aspect = aspect;
    camera.lookAt(target);
    camera.updateProjectionMatrix();

    syncControlsTarget(controlsRef.current, target, true);
    invalidate();
  }, [camera, geometry, invalidate, size.height, size.width]);

  useEffect(() => {
    fitStlView();
  }, [fitRequest, fitStlView, geometry]);

  useEffect(() => {
    if (viewResetRequest > 0) resetStlView();
  }, [resetStlView, viewResetRequest]);

  useEffect(() => {
    if (!geometry) return;
    geometry.computeBoundingSphere();
    syncControlsTarget(controlsRef.current, geometry.boundingSphere.center, true);
    invalidate();
  }, [controlMode, geometry, invalidate]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.minDistance = 0.3;
    controls.maxDistance = 30;

    if ('screenSpacePanning' in controls) controls.screenSpacePanning = true;
    if ('enableDamping' in controls) controls.enableDamping = true;
    if ('dampingFactor' in controls) controls.dampingFactor = 0.08;
    if ('rotateSpeed' in controls) controls.rotateSpeed = rotateSpeed;
    if ('panSpeed' in controls) controls.panSpeed = panSpeed;
    if ('zoomSpeed' in controls) controls.zoomSpeed = zoomSpeed;

    if (typeof controls.setMouseAction === 'function') {
      controls.setMouseAction(spacePanActive ? 'PAN' : 'ROTATE', 0);
      controls.setMouseAction('PAN', 0, 'SHIFT');
      controls.setMouseAction('PAN', 2);
      controls.setMouseAction('ZOOM', 'WHEEL');
      controls.setMouseAction('ZOOM', 1);
      controls.scaleFactor = 1 + (zoomSpeed * 0.08);
      controls.wMax = 12 + (rotateSpeed * 8);
      controls.dampingFactor = 18 + ((3 - rotateSpeed) * 3);
      controls.cursorZoom = false;
    }

    if (typeof controls.update === 'function') controls.update();
    invalidate();
  }, [
    controlMode,
    invalidate,
    panSpeed,
    rotateSpeed,
    spacePanActive,
    zoomSpeed,
  ]);

  useEffect(() => {
    if (!camera.isPerspectiveCamera) return;
    camera.aspect = Math.max(0.01, size.width / Math.max(1, size.height));
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, size.height, size.width]);

  return (
    <>
      {geometry && <mesh geometry={geometry} material={material} />}
      {controlMode === 'freeRotate' ? (
        <ArcballControls
          ref={controlsRef}
          enablePan
          enableRotate
          enableZoom
          enableAnimations
          enableGrid={false}
          cursorZoom={false}
          minDistance={0.3}
          maxDistance={30}
          scaleFactor={1 + (zoomSpeed * 0.08)}
          wMax={12 + (rotateSpeed * 8)}
          dampingFactor={18 + ((3 - rotateSpeed) * 3)}
        />
      ) : (
        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.08}
          autoRotate={false}
          enablePan
          enableRotate
          enableZoom
          screenSpacePanning
          mouseButtons={orbitMouseButtons}
          rotateSpeed={rotateSpeed}
          panSpeed={panSpeed}
          zoomSpeed={zoomSpeed}
          minDistance={0.3}
          maxDistance={30}
        />
      )}
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
  patternImageData,
  editablePath,
  selectedMotifs,
  params,
  stlUrl,
  panelCollapsed,
  onTogglePanel,
  onResetStlMapping,
}) {
  const [fitRequest, setFitRequest] = useState(0);
  const [viewResetRequest, setViewResetRequest] = useState(0);
  const [isStlPanelHovered, setIsStlPanelHovered] = useState(false);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const isCustomStl = params?.mockupMode === 'customStl';
  const canControlStlView = isCustomStl && !panelCollapsed && Boolean(stlUrl);
  const meta = isCustomStl
    ? `custom STL · ${params.stlMappingPreset} · ${params.stlTextureMappingMode} · ${params.stlTextureResolution}px`
    : 'monitor back panel';

  useEffect(() => {
    if (!canControlStlView || !isStlPanelHovered) {
      setSpacePanActive(false);
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (isEditableKeyboardTarget(event.target)) return;
      const key = event.key.toLowerCase();

      if (key === ' ') {
        event.preventDefault();
        setSpacePanActive(true);
        return;
      }

      if (key === 'f') {
        event.preventDefault();
        setFitRequest((current) => current + 1);
        return;
      }

      if (key === 'r') {
        event.preventDefault();
        setViewResetRequest((current) => current + 1);
      }
    };

    const handleKeyUp = (event) => {
      if (event.key === ' ') {
        event.preventDefault();
        setSpacePanActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [canControlStlView, isStlPanelHovered]);

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
      <button
        type="button"
        onClick={() => setViewResetRequest((current) => current + 1)}
        disabled={!stlUrl}
        aria-label="STL 뷰 리셋"
        title="카메라와 이동 상태를 초기 보기로 복구"
      >
        뷰 리셋
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
        <div
          className="mockup-viewer__interaction-layer"
          onPointerEnter={() => setIsStlPanelHovered(true)}
          onPointerLeave={() => {
            setIsStlPanelHovered(false);
            setSpacePanActive(false);
          }}
          onContextMenu={isCustomStl ? (event) => event.preventDefault() : undefined}
        >
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
                  patternImageData={patternImageData}
                  editablePath={editablePath}
                  selectedMotifs={selectedMotifs}
                  params={params}
                  fitRequest={fitRequest}
                  viewResetRequest={viewResetRequest}
                  spacePanActive={spacePanActive}
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
      </div>
    </PreviewPanel>
  );
}
