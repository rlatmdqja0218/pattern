/**
 * STL 매핑 엔진
 *
 * STL은 보통 UV가 없으므로, position/normal 기반으로 UV를 직접 생성해
 * 패턴 텍스처를 투사한다. v1은 planar(front/top/side)와 box 매핑을 지원한다.
 *
 * TODO(다음 단계):
 * - triplanar: ShaderMaterial로 world position + normal 기반 X/Y/Z 투영 블렌딩
 * - decalProjector: three DecalGeometry 또는 three-projected-material로
 *   특정 면에 스티커처럼 투사 (현재 UI는 fallback 안내만)
 * - xatlas-three를 이용한 automatic UV unwrap
 * - STL surface decal painting / clicked face projection
 * - pattern bake → PNG export, custom STL 스크린샷 export
 */

import * as THREE from 'three';

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

/** planar 모드별 (U축, V축) 매핑 */
const PLANAR_AXES = {
  planarFront: ['x', 'y'], // Z 방향 정면 투사 — 정면/후면 패널용
  planarTop: ['x', 'z'], // Y 방향 상단 투사 — 상판용
  planarSide: ['z', 'y'], // X 방향 측면 투사 — 측면 패널용
};

/**
 * 아직 완전 구현되지 않은 매핑 모드를 v1 fallback으로 해석한다.
 * @returns {{ effective: string, label: string }}
 */
export function resolveStlMappingMode(mode = 'planarFront') {
  if (mode === 'triplanar') {
    // TODO: shader 기반 triplanar 구현 전까지 box로 대체
    return { effective: 'box', label: 'box (triplanar 준비 중)' };
  }
  if (mode === 'decalProjector') {
    // TODO: DecalGeometry / three-projected-material 도입 전까지 planarFront로 대체
    return { effective: 'planarFront', label: 'planarFront (decal 준비 중)' };
  }
  if (!PLANAR_AXES[mode] && mode !== 'box') {
    return { effective: 'planarFront', label: 'planarFront' };
  }
  return { effective: mode, label: mode };
}

/**
 * STL geometry를 화면 중앙·표준 크기로 정규화한다.
 * 노멀 재계산 → bounding box 기준 center → 긴 변이 targetSize가 되도록 scale.
 *
 * @param {THREE.BufferGeometry} geometry (제자리 수정)
 * @param {number} [targetSize] 정규화 후 긴 변 길이
 */
export function normalizeStlGeometry(geometry, targetSize = 2.4) {
  if (!geometry?.attributes?.position) return geometry;

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const center = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);

  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  geometry.scale(scale, scale, scale);

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * bounding box 기준 planar 투영 UV를 생성한다.
 * 예: planarFront는 각 정점의 (x, y)를 0~1로 정규화해 UV로 사용 —
 * Z 방향에서 정면으로 패턴을 투사한 것처럼 보인다.
 *
 * @param {THREE.BufferGeometry} geometry (uv attribute를 새로 만든다)
 * @param {'planarFront'|'planarTop'|'planarSide'} [mode]
 */
export function applyPlanarUV(geometry, mode = 'planarFront') {
  const position = geometry?.attributes?.position;
  if (!position) return geometry;

  const [uAxis, vAxis] = PLANAR_AXES[mode] ?? PLANAR_AXES.planarFront;
  const uIdx = AXIS_INDEX[uAxis];
  const vIdx = AXIS_INDEX[vAxis];

  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const minArr = [min.x, min.y, min.z];
  const rangeArr = [
    max.x - min.x || 1,
    max.y - min.y || 1,
    max.z - min.z || 1,
  ];

  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = (position.getComponent(i, uIdx) - minArr[uIdx]) / rangeArr[uIdx];
    uv[i * 2 + 1] = (position.getComponent(i, vIdx) - minArr[vIdx]) / rangeArr[vIdx];
  }

  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.attributes.uv.needsUpdate = true;
  return geometry;
}

/**
 * box 매핑: 각 정점 노멀의 dominant axis에 따라 세 planar 투영 중
 * 하나를 선택한다. UV 없는 STL 전체에 반복 패턴을 입히는 기본 고급 모드.
 * (STLLoader 결과는 face별 정점이 분리된 non-indexed geometry이므로
 * 정점 노멀 = 면 노멀이 되어 면 단위로 깔끔하게 나뉜다.)
 *
 * @param {THREE.BufferGeometry} geometry (uv attribute를 새로 만든다)
 */
export function applyBoxUV(geometry) {
  const position = geometry?.attributes?.position;
  if (!position) return geometry;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const normal = geometry.attributes.normal;

  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const minArr = [min.x, min.y, min.z];
  const rangeArr = [
    max.x - min.x || 1,
    max.y - min.y || 1,
    max.z - min.z || 1,
  ];

  // dominant axis → 나머지 두 축을 (U, V)로 사용
  const UV_BY_DOMINANT = [
    [2, 1], // X 지배 → (z, y)
    [0, 2], // Y 지배 → (x, z)
    [0, 1], // Z 지배 → (x, y)
  ];

  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const dominant = nx >= ny && nx >= nz ? 0 : ny >= nz ? 1 : 2;
    const [uIdx, vIdx] = UV_BY_DOMINANT[dominant];
    uv[i * 2] = (position.getComponent(i, uIdx) - minArr[uIdx]) / rangeArr[uIdx];
    uv[i * 2 + 1] = (position.getComponent(i, vIdx) - minArr[vIdx]) / rangeArr[vIdx];
  }

  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.attributes.uv.needsUpdate = true;
  return geometry;
}

/**
 * 매핑 모드에 맞는 UV를 geometry에 적용한다. (단일 진입점)
 */
export function applyStlUV(geometry, mode = 'planarFront') {
  const { effective } = resolveStlMappingMode(mode);
  if (effective === 'box') return applyBoxUV(geometry);
  return applyPlanarUV(geometry, effective);
}

/**
 * STL용 패턴 머티리얼을 생성한다. 스튜디오 제품 렌더링 느낌의
 * 기본값(낮은 metalness, 중간 roughness)을 갖는다.
 */
export function createPatternMaterial(texture = null, params = {}) {
  const opacity = params.stlPatternOpacity ?? 1;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(params.stlBaseColor ?? '#f2f2f2'),
    map: texture,
    roughness: params.stlRoughness ?? 0.72,
    metalness: params.stlMetalness ?? 0.05,
    wireframe: Boolean(params.stlShowWireframe),
    transparent: opacity < 1,
    opacity,
  });
}

/**
 * 기존 머티리얼을 파라미터로 제자리 갱신한다.
 * map 유무가 바뀌면 셰이더 재컴파일(needsUpdate)이 필요하다.
 */
export function updatePatternMaterial(material, texture, params = {}) {
  if (!material) return material;
  const hadMap = Boolean(material.map);
  material.map = texture ?? null;
  material.color.set(params.stlBaseColor ?? '#f2f2f2');
  material.roughness = params.stlRoughness ?? 0.72;
  material.metalness = params.stlMetalness ?? 0.05;
  material.wireframe = Boolean(params.stlShowWireframe);
  const opacity = params.stlPatternOpacity ?? 1;
  material.opacity = opacity;
  material.transparent = opacity < 1;
  if (hadMap !== Boolean(material.map)) material.needsUpdate = true;
  return material;
}

/**
 * 패턴 텍스처의 반복/오프셋/회전 변환을 STL 파라미터로 갱신한다.
 * stlPatternScale이 클수록 패턴이 커지도록 repeat를 scale로 나눈다.
 */
export function updatePatternTextureTransform(texture, params = {}) {
  if (!texture) return texture;
  const scale = Math.max(0.01, params.stlPatternScale ?? 1);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    (params.stlPatternRepeatX ?? 3) / scale,
    (params.stlPatternRepeatY ?? 3) / scale,
  );
  texture.offset.set(
    params.stlPatternOffsetX ?? 0,
    params.stlPatternOffsetY ?? 0,
  );
  texture.center.set(0.5, 0.5);
  texture.rotation = ((params.stlPatternRotation ?? 0) * Math.PI) / 180;
  texture.needsUpdate = true;
  return texture;
}
