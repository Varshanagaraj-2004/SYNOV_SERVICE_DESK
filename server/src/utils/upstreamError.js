function getCauseCode(error) {
  for (let current = error; current; current = current.cause) {
    if (current.code) return current.code;
  }
  return undefined;
}

function getCauseMessage(error) {
  let current = error;
  while (current?.cause) current = current.cause;
  const message = current?.message || error?.message || '';
  return message
    .replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[redacted]@')
    .replace(/([?&](?:password|token|secret|key)=)[^&\s]*/gi, '$1[redacted]');
}

function getReason(error) {
  const code = getCauseCode(error);
  const message = getCauseMessage(error);

  if (code === 'ETIMEDOUT' || error?.name === 'TimeoutError' || /timed?\s*out|timeout/i.test(message)) {
    return 'timeout';
  }
  if (['EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return 'unreachable';
  if (code === 'ECONNREFUSED') return 'connection_refused';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'dns_error';
  return 'upstream_error';
}

function getTarget(urlValue) {
  if (!urlValue) return {};

  try {
    const url = new URL(urlValue);
    return {
      targetHost: url.hostname,
      targetPort: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    };
  } catch {
    return {};
  }
}

function wrapUpstreamError(error, urlValue) {
  if (error?.targetHost) return error;

  const wrappedError = new Error(error?.message || 'Upstream request failed', { cause: error });
  Object.assign(wrappedError, getTarget(urlValue), { reason: getReason(error) });
  return wrappedError;
}

function getUpstreamErrorDetails(error, urlValue) {
  const target = getTarget(urlValue);
  return {
    causeCode: getCauseCode(error) || null,
    causeMessage: getCauseMessage(error) || null,
    targetHost: error?.targetHost || target.targetHost,
    targetPort: error?.targetPort || target.targetPort,
    reason: error?.reason || getReason(error),
  };
}

module.exports = { getTarget, getUpstreamErrorDetails, wrapUpstreamError };
