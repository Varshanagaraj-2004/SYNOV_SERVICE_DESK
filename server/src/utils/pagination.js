function parsePagination(query, defaultLimit = 20) {
  const rawPage = query.page ?? '1';
  const rawLimit = query.limit ?? String(defaultLimit);
  if (typeof rawPage !== 'string' && typeof rawPage !== 'number') return { error: 'page must be a positive integer' };
  if (typeof rawLimit !== 'string' && typeof rawLimit !== 'number') return { error: 'limit must be a positive integer' };

  const page = Number(rawPage);
  const requestedLimit = Number(rawLimit);
  if (!Number.isSafeInteger(page) || page < 1) return { error: 'page must be a positive integer' };
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    return { error: 'limit must be a positive integer' };
  }

  return { page, limit: Math.min(requestedLimit, 100) };
}

module.exports = { parsePagination };