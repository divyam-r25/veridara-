export const createLogger = (prefix?: string) => ({
  info: (msg: string, ...args: unknown[]) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] INFO${prefix ? ' [' + prefix + ']' : ''}: ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] WARN${prefix ? ' [' + prefix + ']' : ''}: ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    const timestamp = new Date().toISOString();
    // Never log secrets - sanitize args
    const sanitized = args.map(a => {
      if (a instanceof Error) return { message: a.message, name: a.name };
      return a;
    });
    console.error(`[${timestamp}] ERROR${prefix ? ' [' + prefix + ']' : ''}: ${msg}`, ...sanitized);
  },
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.DEBUG) {
      const timestamp = new Date().toISOString();
      console.debug(`[${timestamp}] DEBUG${prefix ? ' [' + prefix + ']' : ''}: ${msg}`, ...args);
    }
  }
});

export const logger = createLogger();
