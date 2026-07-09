import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createStlPatternTextureCanvas } from '../engines/stlPatternTexture';
import { downloadCanvasAsPng } from '../utils/downloadCanvas';

function getStlTextureResolution(params) {
  const resolution = Number(params?.stlTextureResolution);
  return [1024, 2048, 4096].includes(resolution) ? resolution : 2048;
}

export default function DownloadMenu({
  patternCanvas,
  onDownloadMockup,
  canDownloadMockup,
  params,
  editablePath,
  selectedMotifs,
  patternImageData,
  stlUrl,
  stlSurfaceAspect = 1,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const isCustomStl = params?.mockupMode === 'customStl';
  const stlResolution = getStlTextureResolution(params);
  const canDownload2d = Boolean(patternCanvas);
  const canDownloadStlTexture = Boolean(stlUrl) && isCustomStl;

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const downloadStlTexture = useCallback(() => {
    const textureCanvas = createStlPatternTextureCanvas({
      params,
      editablePath,
      selectedMotifs,
      imageData: patternImageData,
      width: stlResolution,
      height: stlResolution,
      surfaceAspect: stlSurfaceAspect,
    });
    return downloadCanvasAsPng(
      textureCanvas,
      `pattern-stl-texture-${stlResolution}.png`,
    );
  }, [
    editablePath,
    params,
    patternImageData,
    selectedMotifs,
    stlResolution,
    stlSurfaceAspect,
  ]);

  const items = useMemo(() => [
    {
      key: 'pattern',
      label: '2D 패턴 PNG 저장',
      disabled: !canDownload2d,
      onClick: () => downloadCanvasAsPng(patternCanvas, 'pattern-2d-preview.png'),
    },
    {
      key: 'mockup',
      label: '3D 목업 PNG 저장',
      disabled: !canDownloadMockup,
      onClick: onDownloadMockup,
    },
    {
      key: 'stl-texture',
      label: 'STL 텍스처 PNG 저장',
      disabled: !canDownloadStlTexture,
      onClick: downloadStlTexture,
    },
  ], [
    canDownload2d,
    canDownloadMockup,
    canDownloadStlTexture,
    downloadStlTexture,
    onDownloadMockup,
    patternCanvas,
  ]);

  const handleItemClick = (item) => {
    if (item.disabled) return;
    item.onClick?.();
    setOpen(false);
  };

  return (
    <div className="download-menu" ref={menuRef}>
      <button
        type="button"
        className="download-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        다운로드
      </button>
      {open && (
        <div className="download-menu__popover" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="download-menu__item"
              disabled={item.disabled}
              role="menuitem"
              onClick={() => handleItemClick(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
