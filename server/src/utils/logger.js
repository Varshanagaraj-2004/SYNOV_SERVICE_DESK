const pino = require('pino');

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'currentPassword',
      'newPassword',
      'token',
    ],
    censor: '[Redacted]',
  },
});

function log(level, args) {
  if (args.length === 1) {
    if (args[0] instanceof Error) return pinoLogger[level]({ err: args[0] }, args[0].message);
    return pinoLogger[level](args[0]);
  }

  if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && typeof args[1] === 'string') {
    return pinoLogger[level](args[0], args[1], ...args.slice(2));
  }

  const [message, ...details] = args;
  const error = details.find((detail) => detail instanceof Error);
  const values = details.filter((detail) => detail !== error);
  const fields = {};
  if (error) fields.err = error;
  if (values.length) fields.details = values.map((value) => (
    typeof value === 'string' && /(password|token|secret|body)/i.test(value)
      ? '[Redacted]'
      : value
  ));
  return pinoLogger[level](fields, typeof message === 'string' ? message : 'Log event');
}

const logger = {
  pino: pinoLogger,
  info: (...args) => log('info', args),
  warn: (...args) => log('warn', args),
  error: (...args) => log('error', args),
  debug: (...args) => log('debug', args),
};

module.exports = logger;