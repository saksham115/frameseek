import { expect, test } from "bun:test";
import {
  formatClipTime,
  parseClipTime,
  rangeError,
} from "../src/lib/clip-time";

test("precise seconds and timecodes round-trip without losing minutes", () => {
  for (const seconds of [0, 4.25, 59.99, 60, 3600.5, 7324.12]) {
    expect(parseClipTime(formatClipTime(seconds))).toBe(seconds);
  }
  expect(parseClipTime("4.25")).toBe(4.25);
  expect(parseClipTime("1:02:03.25")).toBe(3723.25);
  expect(formatClipTime(59.999)).toBe("01:00.00");
});
test("malformed or ambiguous timecodes are rejected", () => {
  for (const value of [
    "",
    "-2",
    "1:60",
    "1::2",
    "1:2:3:4",
    "4abc",
    "Infinity",
    "1.5:20",
    "1:60:00",
    "4.123",
  ]) {
    expect(parseClipTime(value)).toBeNull();
  }
});
test("export bounds prevent inverted, oversized and out-of-video selections", () => {
  expect(rangeError(4, 6, 8)).toBeNull();
  expect(rangeError(0, 120, 200)).toBeNull();
  for (const range of [
    [4, 4],
    [4, 2],
    [0, 120.01],
    [0, 201],
    [-1, 2],
  ] as const) {
    expect(rangeError(range[0], range[1], 200)).not.toBeNull();
  }
  expect(rangeError(null, 2, 8)).not.toBeNull();
});
