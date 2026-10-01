const WEAK_SECRET_MARKERS = ['replace', 'change', 'secret', 'example', 'password', 'your'];

function checkJwtSecret(secret) {
  if (!secret || secret.trim().length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
  }

  const normalizedSecret = secret.toLowerCase();
  const containsWeakMarker = WEAK_SECRET_MARKERS.some((marker) => normalizedSecret.includes(marker));
  const isRepeatedCharacter = new Set(secret).size === 1;

  if (containsWeakMarker || isRepeatedCharacter) {
    throw new Error('JWT_SECRET is weak. Generate one with: npm run gen:secret');
  }

  return true;
}

module.exports = checkJwtSecret;