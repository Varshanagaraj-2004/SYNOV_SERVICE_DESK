const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const checkJwtSecret = require('../src/utils/checkSecrets');

describe('JWT secret validation', () => {
  it('rejects weak placeholder values without including them in the error', () => {
    const weakSecret = 'Replace-this-with-a-long-random-secret-value';

    assert.throws(() => checkJwtSecret(weakSecret), (error) => {
      assert.match(error.message, /JWT_SECRET is weak/);
      assert.match(error.message, /npm run gen:secret/);
      assert.doesNotMatch(error.message, new RegExp(weakSecret, 'i'));
      return true;
    });
  });

  it('rejects secrets shorter than 32 characters', () => {
    assert.throws(() => checkJwtSecret('short-secret'), /at least 32 characters/);
  });

  it('accepts a 96-character hexadecimal secret', () => {
    const hexSecret = '0123456789abcdef'.repeat(6);

    assert.equal(hexSecret.length, 96);
    assert.equal(checkJwtSecret(hexSecret), true);
  });

  it('rejects a single repeated character', () => {
    assert.throws(() => checkJwtSecret('a'.repeat(96)), /JWT_SECRET is weak/);
  });
});