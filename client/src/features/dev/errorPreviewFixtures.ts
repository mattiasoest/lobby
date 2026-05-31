export type ErrorPreviewVariant = 'chunk' | 'not-found' | 'route' | 'runtime';

export const ERROR_PREVIEW_VARIANTS: { id: ErrorPreviewVariant; label: string }[] = [
  { id: 'chunk', label: 'Chunk load' },
  { id: 'not-found', label: '404' },
  { id: 'route', label: 'Route error' },
  { id: 'runtime', label: 'Runtime error' },
];

export function errorFixtureFor(variant: ErrorPreviewVariant): unknown {
  switch (variant) {
    case 'chunk':
      return new TypeError(
        'Failed to fetch dynamically imported module: https://pixelport.app/assets/LoginPage-BS9U2IDr.js',
      );
    case 'not-found':
      return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    case 'route':
      return new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });
    case 'runtime':
      return new Error('Canvas failed to initialize.');
  }
}

export function isErrorPreviewVariant(value: string | undefined): value is ErrorPreviewVariant {
  return ERROR_PREVIEW_VARIANTS.some((variant) => variant.id === value);
}
