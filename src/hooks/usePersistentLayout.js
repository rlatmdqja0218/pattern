import { useCallback, useEffect, useState } from 'react';

/**
 * 워크스페이스 레이아웃(분할 비율 + 패널 접힘 상태)을 localStorage에
 * 저장/복원하는 훅. 새로고침해도 사용자가 조절한 레이아웃이 유지된다.
 */

const STORAGE_KEY = 'patternGenerator.workspaceLayout.v1';

const DEFAULT_LAYOUT = {
  /** 좌측 작업 컬럼(2D+벡터)이 워크스페이스에서 차지하는 가로 비율 */
  workspaceLeftRatio: 0.56,
  /** 좌측 컬럼 안에서 2D 프리뷰가 차지하는 세로 비율 */
  leftStackTopRatio: 0.42,
  collapsedPanels: {
    pattern2d: false,
    vectorEditor: false,
    mockup3d: false,
  },
};

function clampRatio(value, fallback) {
  return typeof value === 'number' && value > 0.05 && value < 0.95
    ? value
    : fallback;
}

function loadLayout() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw);
    return {
      workspaceLeftRatio: clampRatio(
        parsed.workspaceLeftRatio,
        DEFAULT_LAYOUT.workspaceLeftRatio,
      ),
      leftStackTopRatio: clampRatio(
        parsed.leftStackTopRatio,
        DEFAULT_LAYOUT.leftStackTopRatio,
      ),
      collapsedPanels: {
        ...DEFAULT_LAYOUT.collapsedPanels,
        ...(parsed.collapsedPanels ?? {}),
      },
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function usePersistentLayout() {
  const [layout, setLayout] = useState(loadLayout);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // 저장 실패(프라이빗 모드 등)해도 레이아웃 동작에는 영향 없음
    }
  }, [layout]);

  const setRatio = useCallback((key, value) => {
    setLayout((current) => ({ ...current, [key]: value }));
  }, []);

  const togglePanel = useCallback((panelId) => {
    setLayout((current) => ({
      ...current,
      collapsedPanels: {
        ...current.collapsedPanels,
        [panelId]: !current.collapsedPanels[panelId],
      },
    }));
  }, []);

  return { layout, setRatio, togglePanel };
}
