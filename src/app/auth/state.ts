/** Shared auth-form state. Kept out of the "use server" module: that file may
 *  only export async functions. */
export interface AuthState {
  error: string | null;
}

export const EMPTY_AUTH_STATE: AuthState = { error: null };
