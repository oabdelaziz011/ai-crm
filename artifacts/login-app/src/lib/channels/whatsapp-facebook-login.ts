/**
 * Facebook JS SDK Embedded Signup login helpers.
 *
 * Meta's FB.login rejects AsyncFunction callbacks with:
 * "Expression is of type asyncfunction, not function"
 */

export type FacebookLoginAuthResponse = {
  authResponse?: { code?: string } | null;
};

/** Synchronous callback contract required by FB.login. */
export type FacebookLoginCallback = (response: FacebookLoginAuthResponse) => void;

export type FacebookSdkLogin = {
  login: (cb: FacebookLoginCallback, opts: Record<string, unknown>) => void;
};

/**
 * Wrap an async (or sync) response handler so FB.login always receives a
 * normal function. Handler errors must be handled inside the handler; this
 * wrapper also guards against unhandled promise rejections.
 */
export function asFacebookLoginCallback(
  handleResponse: (response: FacebookLoginAuthResponse) => void | Promise<void>,
): FacebookLoginCallback {
  return (response) => {
    void Promise.resolve(handleResponse(response)).catch(() => {
      // Intentionally empty: callers catch and toast; this prevents unhandled rejections.
    });
  };
}

export function isAsyncFunction(fn: unknown): boolean {
  return typeof fn === "function" && fn.constructor?.name === "AsyncFunction";
}
