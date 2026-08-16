import test from 'node:test';
import assert from 'node:assert/strict';

import { parseYouTubeUrl, safeFilename } from './youtube.js';

const ID = 'dQw4w9WgXcQ';
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;

test('parseYouTubeUrl accepts every URL shape YouTube hands out', () => {
  const accepted = [
    `https://www.youtube.com/watch?v=${ID}`,
    `http://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `youtube.com/watch?v=${ID}`,
    `  https://youtu.be/${ID}  `,
  ];

  for (const input of accepted) {
    assert.deepEqual(parseYouTubeUrl(input), { id: ID, url: CANONICAL }, input);
  }
});

test('parseYouTubeUrl keeps extra query parameters out of the canonical URL', () => {
  const withExtras = parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&list=PLxx&t=42s`);
  assert.equal(withExtras.url, CANONICAL);
});

test('parseYouTubeUrl rejects anything that is not a YouTube video', () => {
  const rejected = [
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    'https://vimeo.com/12345678',
    'https://www.youtube.com/playlist?list=PLabc',
    'https://www.youtube.com/@someChannel',
    `javascript:alert(1)//youtube.com/watch?v=${ID}`,
    `file:///etc/passwd`,
    'hello world',
    'https://www.youtube.com/watch?v=tooshort',
    'https://www.youtube.com/watch?v=waytoolongvideoid',
    '',
    '   ',
  ];

  for (const input of rejected) {
    assert.equal(parseYouTubeUrl(input), null, input);
  }
});

test('parseYouTubeUrl rejects non-string input', () => {
  for (const input of [null, undefined, 42, {}, [], true]) {
    assert.equal(parseYouTubeUrl(input), null);
  }
});

test('parseYouTubeUrl rejects absurdly long input without parsing it', () => {
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}?x=${'a'.repeat(3000)}`), null);
});

test('safeFilename keeps spaces and hyphens', () => {
  // Regression: an earlier version stripped both, turning every title to mush.
  assert.equal(safeFilename('Me at the zoo', 'mp3'), 'Me at the zoo.mp3');
  assert.equal(safeFilename('Live - Session', 'mp3'), 'Live - Session.mp3');
});

test('safeFilename removes control characters', () => {
  const dirty = `A${String.fromCharCode(0)}B${String.fromCharCode(7)}C${String.fromCharCode(31)}`;
  const result = safeFilename(dirty, 'mp3');

  assert.equal(result, 'ABC.mp3');
  assert.ok(![...result].some((ch) => ch.charCodeAt(0) < 32));
});

test('safeFilename removes characters reserved by filesystems', () => {
  assert.equal(safeFilename('a/b\\c?d%e*f:g|h"i<j>k', 'mp3'), 'abcdefghijk.mp3');
});

test('safeFilename escapes Windows reserved device names', () => {
  for (const name of ['CON', 'con', 'PRN', 'aux', 'NUL', 'COM1', 'lpt9']) {
    assert.equal(safeFilename(name, 'mp3'), `${name}_.mp3`, name);
  }
});

test('safeFilename only escapes device names that stand alone', () => {
  assert.equal(safeFilename('CONCERT', 'mp3'), 'CONCERT.mp3');
  assert.equal(safeFilename('COM10', 'mp3'), 'COM10.mp3');
  assert.equal(safeFilename('NUL and void', 'mp3'), 'NUL and void.mp3');
});

test('safeFilename catches device names produced by sanitising', () => {
  // The colon is stripped first, which is what leaves "NUL" behind.
  assert.equal(safeFilename('NUL:', 'mp3'), 'NUL_.mp3');
});

test('safeFilename falls back when nothing survives', () => {
  assert.equal(safeFilename('', 'mp3'), 'audio.mp3');
  assert.equal(safeFilename(null, 'flac'), 'audio.flac');
  assert.equal(safeFilename('///', 'wav'), 'audio.wav');
});

test('safeFilename truncates long titles and trims trailing dots', () => {
  const long = safeFilename('x'.repeat(300), 'mp3');
  assert.ok(long.length <= 124, long.length);
  assert.equal(safeFilename('Title...', 'mp3'), 'Title.mp3');
});
