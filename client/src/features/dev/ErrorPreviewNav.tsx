import { NavLink } from 'react-router-dom';
import { ERROR_PREVIEW_VARIANTS, type ErrorPreviewVariant } from './errorPreviewFixtures.ts';

type ErrorPreviewMode = 'preview' | 'live' | 'boundary';

type ErrorPreviewNavProps = {
  mode: ErrorPreviewMode;
  activeVariant: ErrorPreviewVariant;
};

const MODES: { id: ErrorPreviewMode; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'live', label: 'Route error' },
  { id: 'boundary', label: 'Boundary' },
];

export function ErrorPreviewNav({ mode, activeVariant }: ErrorPreviewNavProps) {
  return (
    <div className="dev-error-nav">
      <p className="dev-error-nav-label">Dev error gallery</p>
      <div className="dev-error-nav-modes">
        {MODES.map((entry) => (
          <NavLink
            key={entry.id}
            to={`/dev/errors/${entry.id}/${activeVariant}`}
            className={({ isActive }) => `dev-error-nav-mode${isActive ? ' dev-error-nav-mode--active' : ''}`}
          >
            {entry.label}
          </NavLink>
        ))}
      </div>
      <div className="dev-error-nav-variants">
        {ERROR_PREVIEW_VARIANTS.map((variant) => (
          <NavLink
            key={variant.id}
            to={`/dev/errors/${mode}/${variant.id}`}
            className={({ isActive }) => `dev-error-nav-variant${isActive ? ' dev-error-nav-variant--active' : ''}`}
          >
            {variant.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
