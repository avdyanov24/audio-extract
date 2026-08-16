import test from 'node:test';
import assert from 'node:assert/strict';

import { duration, bytes, count, uploadDate } from './format.js';

test('duration formats below an hour as m:ss', () => {
  assert.equal(duration(0), '0:00');
  assert.equal(duration(9), '0:09');
  assert.equal(duration(19), '0:19');
  assert.equal(duration(597), '9:57');
  assert.equal(duration(3599), '59:59');
});

test('duration adds an hours field only when needed', () => {
  assert.equal(duration(3600), '1:00:00');
  assert.equal(duration(3661), '1:01:01');
  assert.equal(duration(36000), '10:00:00');
});

test('duration degrades visibly rather than printing NaN', () => {
  for (const input of [null, undefined, NaN, Infinity, 'abc']) {
    assert.equal(duration(input), '--:--');
  }
});

test('bytes picks a sensible unit', () => {
  assert.equal(bytes(0), '0 B');
  assert.equal(bytes(999), '999 B');
  assert.equal(bytes(1024), '1.0 KB');
  // Decimals are dropped above 100 on purpose: "447 KB" reads better than
  // "446.7 KB" at a glance, and the extra digit tells the reader nothing.
  assert.equal(bytes(457431), '447 KB');
  assert.equal(bytes(14 * 1024 * 1024), '14.0 MB');
});

test('bytes stops at GB rather than running off the unit list', () => {
  assert.match(bytes(5 * 1024 ** 3), /GB$/);
  assert.match(bytes(5000 * 1024 ** 3), /GB$/);
});

test('bytes degrades visibly on bad input', () => {
  for (const input of [null, undefined, NaN, 'abc']) {
    assert.equal(bytes(input), '--');
  }
});

test('count abbreviates at each threshold', () => {
  assert.equal(count(0), '0');
  assert.equal(count(999), '999');
  assert.equal(count(1000), '1.0K');
  assert.equal(count(9_000_000), '9.0M');
  assert.equal(count(404_912_828), '404.9M');
  assert.equal(count(2_500_000_000), '2.5B');
});

test('count returns null when there is nothing to show', () => {
  for (const input of [null, undefined, NaN, 'abc']) {
    assert.equal(count(input), null);
  }
});

test('uploadDate reformats the YYYYMMDD yt-dlp returns', () => {
  assert.equal(uploadDate('20050424'), '2005.04.24');
  assert.equal(uploadDate('20080529'), '2008.05.29');
});

test('uploadDate handles a numeric date without throwing', () => {
  // Regression: the regex coerced to string but .slice() ran on the original,
  // so a number passed validation and then threw.
  assert.equal(uploadDate(20050424), '2005.04.24');
});

test('uploadDate rejects anything that is not eight digits', () => {
  for (const input of ['2005-04-24', '200504', '', null, undefined, {}, []]) {
    assert.equal(uploadDate(input), null);
  }
});
