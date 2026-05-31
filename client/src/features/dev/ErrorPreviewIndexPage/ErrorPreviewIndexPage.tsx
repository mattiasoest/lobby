import { Link } from 'react-router-dom';
import { ERROR_PREVIEW_VARIANTS } from '../errorPreviewFixtures.ts';
import styles from './ErrorPreviewIndexPage.css';

const MODES = [
  { id: 'preview', label: 'Preview', description: 'Static screen with mocked error data' },
  { id: 'live', label: 'Route error', description: 'Loader throws; root errorElement renders RouteErrorPage' },
  { id: 'boundary', label: 'Boundary', description: 'Component throws; AppErrorBoundary catches it' },
] as const;

export function ErrorPreviewIndexPage() {
  return (
    <div className={styles.index}>
      <h1 className={styles.indexTitle}>Error page dev gallery</h1>
      <p className={styles.indexLead}>Pick a mode and variant to inspect every app error screen.</p>
      {MODES.map((mode) => (
        <section key={mode.id} className={styles.indexSection}>
          <h2 className={styles.indexHeading}>{mode.label}</h2>
          <p className={styles.indexCopy}>{mode.description}</p>
          <ul className={styles.indexLinks}>
            {ERROR_PREVIEW_VARIANTS.map((variant) => (
              <li key={variant.id}>
                <Link to={`/dev/errors/${mode.id}/${variant.id}`}>{variant.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
