import { useState } from 'react';

export default function PreviewPanel({
  title,
  meta,
  children,
  defaultCollapsed = false,
  className = '',
  actions = null,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const classes = ['preview-panel', collapsed ? 'is-collapsed' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes}>
      <header className="preview-panel__header">
        <div className="preview-panel__title">
          <button
            type="button"
            className="preview-panel__toggle"
            aria-label={collapsed ? `${title} 펼치기` : `${title} 접기`}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <h2>{title}</h2>
        </div>
        <div className="preview-panel__tools">
          {actions}
          <span className="preview-panel__meta">{meta}</span>
        </div>
      </header>
      <div className="preview-panel__content" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
