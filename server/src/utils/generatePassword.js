const crypto = require('crypto');

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const CHARACTERS = LETTERS + DIGITS;

function generatePassword(length = 12) {
  if (!Number.isInteger(length) || length < 2) {
    throw new RangeError('Password length must be at least 2');
  }

  const characters = [
    LETTERS[crypto.randomInt(LETTERS.length)],
    DIGITS[crypto.randomInt(DIGITS.length)],
  ];

  while (characters.length < length) {
    characters.push(CHARACTERS[crypto.randomInt(CHARACTERS.length)]);
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join('');
}

module.exports = { generatePassword };
