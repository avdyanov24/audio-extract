import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyYtDlpError, ffmpegError, spawnError } from './errors.js';

/**
 * The stderr strings below are how yt-dlp actually phrases these failures.
 * Paraphrasing them defeats the point of the test.
 */
const CASES = [
  ['private', 'ERROR: [youtube] abc: Private video. Sign in if you have been granted access to this video'],
  ['age_restricted', 'ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate for some users.'],
  ['bot_check', "ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser"],
  ['members_only', 'ERROR: [youtube] abc: Join this channel to get access to members-only content'],
  ['region_blocked', 'ERROR: [youtube] abc: The uploader has not made this video available in your country'],
  ['unavailable', 'ERROR: [youtube] abc: Video unavailable. This video has been removed by the uploader'],
  ['live', 'ERROR: [youtube] abc: This live event will begin in 3 hours'],
  ['ytdlp_outdated', 'ERROR: [youtube] abc: Unable to extract player response; please report this issue'],
  ['rate_limited', 'ERROR: Unable to download webpage: HTTP Error 429: Too Many Requests'],
  ['unsupported', 'ERROR: Unsupported URL: https://example.com/video'],
];

for (const [code, stderr] of CASES) {
  test(`classifyYtDlpError identifies ${code}`, () => {
    const result = classifyYtDlpError(stderr, 1);

    assert.equal(result.code, code);
    assert.ok(result.title, 'every classified error needs a title');
    assert.equal(typeof result.detail, 'string');
  });
}

test('age restriction is matched before the bot check', () => {
  // Both messages open with "Sign in to confirm", so rule order is load-bearing.
  const age = classifyYtDlpError('ERROR: Sign in to confirm your age', 1);
  assert.equal(age.code, 'age_restricted');
});

test('the out-of-date case carries an actionable update command', () => {
  const result = classifyYtDlpError('ERROR: nsig extraction failed', 1);

  assert.equal(result.code, 'ytdlp_outdated');
  assert.match(result.hint, /yt-dlp/);
});

test('rate limiting suggests waiting', () => {
  assert.match(classifyYtDlpError('HTTP Error 429', 1).hint, /wait/i);
});

test('unrecognised stderr falls back without inventing a cause', () => {
  const result = classifyYtDlpError('ERROR: something nobody predicted', 1);

  assert.equal(result.code, 'unknown');
  assert.match(result.detail, /something nobody predicted/);
});

test('an empty stderr still reports the exit code', () => {
  const result = classifyYtDlpError('', 3);

  assert.equal(result.code, 'unknown');
  assert.match(result.detail, /3/);
});

test('warnings are not mistaken for the failure reason', () => {
  const stderr = [
    'WARNING: [youtube] Falling back to generic extractor',
    'WARNING: unable to obtain file audio codec with ffprobe',
    'ERROR: [youtube] abc: Private video',
  ].join('\n');

  assert.equal(classifyYtDlpError(stderr, 1).code, 'private');
});

test('ffmpegError reports the encoder failing rather than the download', () => {
  const result = ffmpegError('Invalid data found when processing input', 1);

  assert.equal(result.code, 'encode_failed');
  assert.match(result.detail, /Invalid data/);
});

test('spawnError distinguishes a missing binary from other spawn failures', () => {
  const missing = spawnError(Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' }), 'yt-dlp');
  assert.equal(missing.code, 'missing_binary');
  assert.match(missing.hint, /install/i);

  const other = spawnError(new Error('EACCES'), 'ffmpeg');
  assert.equal(other.code, 'spawn_failed');
});
