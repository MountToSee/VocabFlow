import { describe, expect, it } from 'vitest';
import { LatencyAwareRouter } from '../src/llm/router.js';
import { FakeLlm } from './fakes.js';

const msgs = [{ role: 'user' as const, content: 'hi' }];

describe('LatencyAwareRouter', () => {
  it('uses the first healthy provider', async () => {
    const cloud = new FakeLlm('cloud', 'cloud', () => 'from-cloud');
    const local = new FakeLlm('local', 'local', () => 'from-local');
    const router = new LatencyAwareRouter([cloud, local], { latencyBudgetMs: 200 });
    expect((await router.complete(msgs))?.text).toBe('from-cloud');
    expect(local.calls).toBe(0);
  });

  it('falls back when the cloud provider exceeds the budget, then cools it down', async () => {
    let now = 0;
    const cloud = new FakeLlm('cloud', 'cloud', () => 'late', 100);
    const local = new FakeLlm('local', 'local', () => 'from-local');
    const router = new LatencyAwareRouter([cloud, local], {
      latencyBudgetMs: 20,
      cooldownMs: 1_000,
      now: () => now,
    });

    expect((await router.complete(msgs))?.text).toBe('from-local');
    expect(cloud.calls).toBe(1);

    // Cloud is cooling down: skipped entirely.
    expect((await router.complete(msgs))?.text).toBe('from-local');
    expect(cloud.calls).toBe(1);

    // After cooldown it is probed again.
    now = 2_000;
    await router.complete(msgs);
    expect(cloud.calls).toBe(2);
  });

  it('falls back on errors and returns null when nothing answers', async () => {
    const broken = new FakeLlm('broken', 'cloud', () => {
      throw new Error('boom');
    });
    const router = new LatencyAwareRouter([broken], { latencyBudgetMs: 50 });
    expect(await router.complete(msgs)).toBeNull();
    expect(router.snapshot().broken?.consecutiveFailures).toBe(1);
  });

  it('demotes a consistently slow provider behind a faster one', async () => {
    const cloud = new FakeLlm('cloud', 'cloud', () => 'slow-cloud', 40);
    const local = new FakeLlm('local', 'local', () => 'fast-local');
    const router = new LatencyAwareRouter([cloud, local], { latencyBudgetMs: 50 });
    expect((await router.complete(msgs))?.text).toBe('slow-cloud');
    expect((await router.complete(msgs))?.text).toBe('fast-local');
  });

  it('returns null immediately when the caller aborts', async () => {
    const slow = new FakeLlm('slow', 'cloud', () => 'x', 100);
    const router = new LatencyAwareRouter([slow], { latencyBudgetMs: 500 });
    const controller = new AbortController();
    const pending = router.complete(msgs, { signal: controller.signal });
    controller.abort();
    expect(await pending).toBeNull();
    expect(router.snapshot().slow?.consecutiveFailures).toBe(0);
  });
});
