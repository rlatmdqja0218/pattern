export function downloadCanvasAsPng(canvas, filename) {
  if (!canvas || typeof canvas.toBlob !== 'function') return false;

  try {
    canvas.toBlob((blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }, 'image/png');
  } catch {
    return false;
  }

  return true;
}
