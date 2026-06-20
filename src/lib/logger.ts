/** Dev-only logger; production builds strip raw console via esbuild.drop. */
const isDev = import.meta.env.DEV;

export const log = {
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (isDev) console.error(...args);
  },
};
