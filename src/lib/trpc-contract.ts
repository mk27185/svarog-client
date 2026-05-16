import type { AuthUser } from '@/types/auth';

type RegisterResult =
  | { success: false; error: string }
  | { success: true; sessionId: string; user: AuthUser };

type LoginResult =
  | { success: false; error: string }
  | { success: true; sessionId: string; user: AuthUser };

export type SvarogTrpcClient = {
  auth: {
    me: { query: () => Promise<AuthUser> };
    login: { mutate: (input: { username: string; password: string }) => Promise<LoginResult> };
    register: { mutate: (input: { username: string; email?: string; password: string }) => Promise<RegisterResult> };
    logout: { mutate: () => Promise<{ success: true }> };
  };
};
