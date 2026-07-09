import { useState } from 'react';

/**
 * 공용 패널 셸. collapsed/onToggleCollapsed를 넘기면 제어형(워크스페이스
 * 레이아웃이 상태 소유), 넘기지 않으면 기존처럼 내부 상태로 동작한다.
 * 접힌 패널은 헤더만 남고 본문([hidden])이 사라진다.
 */
export default function PreviewPanel({
  title,
  meta,
  children,
  defaultCollapsed = false,
  collapsible = true,
  collapsed: controlledCollapsed,
  onToggleCollapsed,
  className = '',
  actions = null,
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isControlled = controlledCollapsed !== undefined && controlledCollapsed !== null;
  const collapsed = isControlled ? controlledCollapsed : internalCollapsed;

  const handleToggle = () => {
    if (onToggleCollapsed) onToggleCollapsed();
    else setInternalCollapsed((current) => !current);
  };

  const classes = ['preview-panel', collapsed ? 'is-collapsed' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes}>
      <header className="preview-panel__header">
        <div className="preview-panel__title">
          {collapsible && (
            <button
              type="button"
              className="preview-panel__toggle"
              aria-label={collapsed ? `${title} 펼치기` : `${title} 접기`}
              aria-expanded={!collapsed}
              onClick={handleToggle}
            >
              {collapsed ? '▸' : '▾'}
            </button>
          )}
          <h2>{title}</h2>
        </div>
        <div className="preview-panel__tools">
          {!collapsed && actions}
          <span className="preview-panel__meta">{meta}</span>
        </div>
      </header>
      <div className="preview-panel__content" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
