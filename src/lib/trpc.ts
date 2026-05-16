import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { readSessionId } from '@/lib/session-storage';
import type { SvarogTrpcClient } from '@/lib/trpc-contract';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trpc = createTRPCClient<any>({
  links: [
    httpBatchLink({
      url: `${(import.meta.env.VITE_API_URL || 'http://localhost:3000')}/trpc`,
      headers() {
        const sid = readSessionId();
        const h: Record<string, string> = {};
        if (sid) h['x-session-id'] = sid;
        return h;
      },
    }),
  ],
}) as unknown as SvarogTrpcClient;
