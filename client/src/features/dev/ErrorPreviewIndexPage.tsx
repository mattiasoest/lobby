import { Link } from 'react-router-dom';
import { ERROR_PREVIEW_VARIANTS } from './errorPreviewFixtures.ts';

const MODES = [
  { id: 'preview', label: 'Preview', description: 'Static screen with mocked error data' },
  { id: 'live', label: 'Route error', description: 'Loader throws; root errorElement renders RouteErrorPage' },
  { id: 'boundary', label: 'Boundary', description: 'Component throws; AppErrorBoundary catches it' },
] as const;

export function ErrorPreviewIndexPage() {
  return (
    <div className="dev-error-index">
      <h1 className="dev-error-index-title">Error page dev gallery</h1>
      <p className="dev-error-index-lead">Pick a mode and variant to inspect every app error screen.</p>
      {MODES.map((mode) => (
        <section key={mode.id} className="dev-error-index-section">
          <h2 className="dev-error-index-heading">{mode.label}</h2>
          <p className="dev-error-index-copy">{mode.description}</p>
          <ul className="dev-error-index-links">
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
