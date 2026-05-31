import { NavLink } from 'react-router-dom';
import { ERROR_PREVIEW_VARIANTS, type ErrorPreviewVariant } from '@/features/dev/errorPreviewFixtures.ts';
import styles from './ErrorPreviewNav.css';

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
    <div className={styles.nav}>
      <p className={styles.navLabel}>Dev error gallery</p>
      <div className={styles.navModes}>
        {MODES.map((entry) => (
          <NavLink
            key={entry.id}
            to={`/dev/errors/${entry.id}/${activeVariant}`}
            className={({ isActive }) => `${styles.navMode}${isActive ? ` ${styles.navModeActive}` : ''}`}
          >
            {entry.label}
          </NavLink>
        ))}
      </div>
      <div className={styles.navVariants}>
        {ERROR_PREVIEW_VARIANTS.map((variant) => (
          <NavLink
            key={variant.id}
            to={`/dev/errors/${mode}/${variant.id}`}
            className={({ isActive }) => `${styles.navVariant}${isActive ? ` ${styles.navVariantActive}` : ''}`}
          >
            {variant.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
