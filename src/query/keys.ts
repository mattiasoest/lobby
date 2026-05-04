export const queryKeys = {
  auth: {
    providers: ['auth', 'providers'] as const,
    bootstrap: ['auth', 'bootstrap'] as const,
  },
  rooms: {
    messages: (roomId: number) => ['rooms', roomId, 'messages'] as const,
  },
} as const;
