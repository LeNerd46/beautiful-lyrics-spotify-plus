import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/Lyrics/scroll-model.ts', import.meta.url))],
    bundle: true, format: 'esm', platform: 'node', write: false,
});
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { buildScrollLayout, canFollowLine, findActiveLine, firstLineAtOffset,
    isLineVisible, lineScrollOffset, lineStaggerDelay, nextLineRange, renderWindow,
    rowPlaybackPosition, scrollDuration, scrollMotionOffset, stepMomentum } = model;

test('follow respects browsing, touch, momentum, and the resume delay', () => {
    const layout = buildScrollLayout(Array(60).fill(90), 600);
    const follow = (offset, suspended, touching = false, dragging = false, momentum = false, idle = 500, force = false) =>
        canFollowLine(layout, 2, 3, offset, suspended, touching, dragging, momentum, idle, force);
    assert.equal(follow(0, false), true);
    assert.equal(follow(lineScrollOffset(layout, 40), true), false);
    assert.equal(follow(lineScrollOffset(layout, 40), true, false, false, false, 500, true), true);
    assert.equal(follow(lineScrollOffset(layout, 2), true, true), false);
    assert.equal(follow(lineScrollOffset(layout, 2), true, false, true), false);
    assert.equal(follow(lineScrollOffset(layout, 2), true, false, false, true), false);
    assert.equal(follow(lineScrollOffset(layout, 2), true, false, false, false, 499), false);
    assert.equal(follow(lineScrollOffset(layout, 2), true), true);
});

test('song starts with a compact margin; later rows align using measured variable heights', () => {
    const layout = buildScrollLayout([70, 220, 90, 145], 600);
    assert.equal(lineScrollOffset(layout, 0), 0);
    assert.equal(layout.tops[0], 24);
    assert.equal(buildScrollLayout([70, 220], 1000).tops[0], 24);
    for (let index = 0; index < layout.tops.length; index += 1) {
        const offset = lineScrollOffset(layout, index);
        assert.ok(offset >= 0 && offset <= layout.maxOffset);
        assert.equal(layout.tops[index] - offset, Math.min(layout.tops[index], 600 * 0.25));
    }
    assert.equal(isLineVisible(layout, -1, 0), false);
    assert.equal(isLineVisible(layout, 1, layout.tops[1] + 219), true);
    assert.equal(isLineVisible(layout, 1, layout.tops[1] + 220), false);
    assert.equal(firstLineAtOffset(layout, layout.tops[1] + 220), 2);
});

test('overlapping vocals, gaps, and exact line boundaries select the right row', () => {
    const ranges = [
        { index: 0, start: 1000, end: 6000, previousEnd: -1 },
        { index: 1, start: 2000, end: 3000, previousEnd: 6000 },
        { index: 2, start: 6000, end: 6500, previousEnd: 6000 },
        { index: 3, start: 8000, end: 9000, previousEnd: 6500 },
    ];
    assert.equal(findActiveLine(ranges, 500), -1);
    assert.equal(findActiveLine(ranges, 1000), 0);
    assert.equal(findActiveLine(ranges, 2000), 1);
    assert.equal(findActiveLine(ranges, 3000), 0);
    assert.equal(findActiveLine(ranges, 6000), 2);
    assert.equal(findActiveLine(ranges, 7000), -1);
    assert.equal(findActiveLine(ranges, 9000), -1);
    assert.equal(nextLineRange(ranges, 1500).index, 1);
    assert.equal(nextLineRange(ranges, 2000).index, 2);
    assert.equal(nextLineRange(ranges, 7000).index, 3);
    assert.equal(nextLineRange(ranges, 9000), undefined);
});

test('inactive interludes leave no height or extra gaps, including at either song boundary', () => {
    const heights = [70, 90, 80, 120, 70];
    const interludes = [true, false, true, false, true];
    const collapsed = buildScrollLayout(heights, 300, interludes);
    const vocalsOnly = buildScrollLayout([90, 120], 300);
    assert.deepEqual(collapsed.heights, [0, 90, 0, 120, 0]);
    assert.equal(collapsed.tops[1], vocalsOnly.tops[0]);
    assert.equal(collapsed.tops[3], vocalsOnly.tops[1]);
    assert.equal(collapsed.maxOffset, vocalsOnly.maxOffset);
    assert.equal(firstLineAtOffset(collapsed, 0), 1);
    assert.equal(firstLineAtOffset(collapsed, collapsed.tops[1] + 90), 3);
    for (const index of [0, 2, 4]) assert.equal(isLineVisible(collapsed, index, 0), false);
    assert.deepEqual(heights, [70, 90, 80, 120, 70]);
});

test('interlude space expands during playback, collapses after its exit, and reopens on seek', () => {
    const heights = [90, 80, 120];
    const interludes = [false, true, false];
    const timeline = [{ index: 1, start: 2000, end: 5000 + model.INTERLUDE_EXIT_MS, previousEnd: -1 }];
    const at = position => buildScrollLayout(heights, 300, interludes, findActiveLine(timeline, position));
    const before = at(1999), active = at(2000), exiting = at(5500), finished = at(5750);
    assert.equal(before.heights[1], 0);
    assert.equal(active.heights[1], 80);
    assert.deepEqual(exiting, active);
    assert.deepEqual(finished, before);
    assert.deepEqual(at(3000), active);
    assert.equal(active.tops[2] - finished.tops[2], 80 + model.LYRIC_GAP);
    // Remap the scroll offset by the anchor's displacement, preserving the
    // vocal's screen position while removing the completed slot above it.
    const offset = lineScrollOffset(active, 2);
    const remapped = offset + finished.tops[2] - active.tops[2];
    assert.equal(finished.tops[2] - remapped, active.tops[2] - offset);
});

test('every visible row joins the stagger, including rows above the active lyric', () => {
    assert.equal(lineStaggerDelay(23, 24), 0);
    assert.equal(lineStaggerDelay(24, 24), 0);
    assert.equal(lineStaggerDelay(25, 24), 36);
    assert.ok(lineStaggerDelay(26, 24) > 36);
    assert.ok(lineStaggerDelay(26, 24) < 72);
    assert.ok(lineStaggerDelay(27, 24) > lineStaggerDelay(26, 24));
    assert.equal(lineStaggerDelay(200, 24), 140);
    assert.equal(lineStaggerDelay(101, 100), lineStaggerDelay(1, 0));
});

test('row phases use scheduled times even when a frame skips multiple stagger delays', () => {
    const oldActive = { from: 0, to: 140, start: 1000, duration: 430 };
    const newActive = { ...oldActive, start: 1036 };
    const below = { ...oldActive, start: 1071 };
    assert.equal(scrollMotionOffset(newActive, 1030), 0);
    assert.ok(scrollMotionOffset(oldActive, 1016) > 0);
    assert.ok(scrollMotionOffset(newActive, 1050) > 0);
    // A 120-ms missed-frame gap must preserve three different wave positions,
    // rather than starting every overdue row's animation simultaneously.
    const positions = [oldActive, newActive, below].map(motion => scrollMotionOffset(motion, 1120));
    assert.ok(positions[0] > positions[1] && positions[1] > positions[2]);
    assert.equal(scrollMotionOffset(newActive, 1466), 140);
    assert.equal(scrollMotionOffset({ ...newActive, duration: 0 }, 1000), 140);
});

test('inactive row effects clocks stay still while preserving lyric timing and settling', () => {
    assert.equal(rowPlaybackPosition(1000, 5000, 7000), 4999);
    assert.equal(rowPlaybackPosition(4000, 5000, 7000), 4999);
    assert.equal(rowPlaybackPosition(5000, 5000, 7000), 5000);
    assert.equal(rowPlaybackPosition(6400, 5000, 7000), 6400);
    assert.equal(rowPlaybackPosition(7500, 5000, 7000), 7500);
    assert.equal(rowPlaybackPosition(9000, 5000, 7000), 8500);
    assert.equal(rowPlaybackPosition(50000, 5000, 7000), 8500);
    assert.equal(rowPlaybackPosition(4000, 5000, 7000), 4999);
});

test('normal waves stay smooth and finish well before a second', () => {
    assert.equal(scrollDuration(250, false, false), 340);
    assert.equal(scrollDuration(5000, false, false), 430);
    assert.equal(scrollDuration(5000, true, false), 450);
    assert.equal(scrollDuration(5000, false, true), 460);
    assert.ok(scrollDuration(5000, false, false) + lineStaggerDelay(20, 0) <= 570);
});

test('flings slow continuously and stop at both 60 Hz and 120 Hz', () => {
    for (const fps of [60, 120]) {
        let offset = 1000;
        let velocity = 4000;
        let elapsed = 0;
        let finished = false;
        while (!finished && elapsed < 2000) {
            const next = stepMomentum(offset, velocity, 1000 / fps, 0, 10000);
            assert.ok(Math.abs(next.velocity) < Math.abs(velocity));
            assert.ok(next.offset >= offset);
            ({ offset, velocity, finished } = next);
            elapsed += 1000 / fps;
        }
        assert.equal(finished, true);
        assert.equal(velocity, 0);
        assert.ok(elapsed < 1600);
        assert.ok(offset < 2000);
    }
});

test('momentum distance is independent of frame rate and clamps at song boundaries', () => {
    const once = stepMomentum(1000, -2000, 100, 0, 10000);
    let many = { offset: 1000, velocity: -2000 };
    for (let frame = 0; frame < 10; frame += 1) {
        many = stepMomentum(many.offset, many.velocity, 10, 0, 10000);
    }
    assert.ok(Math.abs(once.offset - many.offset) < 0.000001);
    assert.ok(Math.abs(once.velocity - many.velocity) < 0.000001);
    assert.deepEqual(stepMomentum(5, -1000, 100, 0, 200), { offset: 0, velocity: 0, finished: true });
    assert.deepEqual(stepMomentum(195, 1000, 100, 0, 200), { offset: 200, velocity: 0, finished: true });
    assert.equal(stepMomentum(100, 500, 3000, 0, 1000).finished, true);
});

test('long songs mount a bounded window, including both ends of an animated step', () => {
    const layout = buildScrollLayout(Array(2000).fill(96), 600);
    for (const index of [0, 20, 1000, 1999]) {
        const offset = lineScrollOffset(layout, index);
        const window = renderWindow(layout, offset, offset);
        assert.ok(window.first <= index && window.last >= index);
        assert.ok(window.last - window.first < 20);
        assert.ok(window.first >= 0 && window.last < 2000);
    }
    const current = lineScrollOffset(layout, 20);
    const next = lineScrollOffset(layout, 21);
    const window = renderWindow(layout, current, next);
    assert.ok(window.first <= firstLineAtOffset(layout, current));
    assert.ok(window.last >= firstLineAtOffset(layout, next + 600));
});
