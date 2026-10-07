import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/Entities/native-motion.ts', import.meta.url))],
    bundle: true, format: 'esm', platform: 'node', write: false });
const { sampleMotion, sampleAt, springSamples, SAMPLE_STEP_MS } = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const near = (actual, expected, epsilon = 1e-5) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ~= ${expected}`);

test('packed samples preserve all six channels and little-endian floats', () => {
    const track = sampleMotion(1000, 100, t => [t, t * 2, t * 3, -t * 4, 1 + t, 0.6]);
    const bytes = Buffer.from(track.samples, 'base64');
    assert.equal(bytes.length % 24, 0);
    near(bytes.readFloatLE(4 * 4), 1);
    for (const rate of [60, 120, 144]) for (let frame = 0; frame < rate / 10; frame++) {
        const t = frame / rate, v = sampleAt(track, 1000 + t * 1000);
        near(v[0], t); near(v[1], t * 2); near(v[3], -t * 4); near(v[4], 1 + t);
    }
});

test('seek, future opacity, completed state, and interlude hiding use absolute playback time', () => {
    const track = { ...sampleMotion(1000, 100, t => [t * 10, 0, 0, 0, 1, 0.6]),
        beforeOpacity: 1 / 3, hideAfterMs: 1200 };
    near(sampleAt(track, 500)[5], 1 / 3);
    near(sampleAt(track, 1050)[0], 0.5);
    near(sampleAt(track, 5000)[5], 0);
    near(sampleAt(track, 1025)[0], 0.25);
    near(sampleAt(track, 1150)[5], 0.6);
});

test('precomputed physics includes overshoot and a settling tail rather than snapping at the syllable end', () => {
    const track = springSamples(2500, t => [t < 1 ? 1.05 : 1, t < 1 ? -0.6 : 0, t < 1 ? 1 : 0],
        (t, scale, y, glow) => [Math.min(1, t), 8 * glow, glow, y, scale, 1]);
    assert.equal(track.stepMs, SAMPLE_STEP_MS);
    assert.notEqual(sampleAt(track, 1050)[3], 0);
    assert.ok(Math.abs(sampleAt(track, 2500)[3]) < 0.1);
    assert.ok(sampleAt(track, 1500)[2] < sampleAt(track, 1000)[2]);
});
