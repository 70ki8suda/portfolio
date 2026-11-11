import { expect, test } from '@playwright/test';

test('a partial framebuffer allocation failure releases all backdrop resources', async ({ page }) => {
  await page.addInitScript(() => {
    const counts = { created: 0, deleted: 0, checks: 0 };
    Object.assign(window, { allocationProbe: counts });
    const prototype = WebGL2RenderingContext.prototype;
    const own = (gl: WebGL2RenderingContext) => (gl.canvas as HTMLCanvasElement).dataset.testid === 'fluid-canvas';
    for (const name of ['createTexture', 'createFramebuffer', 'createProgram'] as const) {
      const original = prototype[name];
      prototype[name] = function (this: WebGL2RenderingContext) {
        const result = original.call(this);
        if (own(this) && result) counts.created += 1;
        return result;
      };
    }
    for (const name of ['deleteTexture', 'deleteFramebuffer', 'deleteProgram'] as const) {
      const original = prototype[name];
      prototype[name] = function (this: WebGL2RenderingContext, object: WebGLTexture | null) {
        if (own(this) && object) counts.deleted += 1;
        return original.call(this, object);
      };
    }
    const check = prototype.checkFramebufferStatus;
    prototype.checkFramebufferStatus = function (target) {
      if (own(this) && ++counts.checks === 3) return this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      return check.call(this, target);
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('fluid-backdrop')).toHaveAttribute('data-state', 'unavailable');
  await expect(page.getByTestId('fluid-canvas')).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const counts = await page.evaluate(() => (window as unknown as {
    allocationProbe: { created: number; deleted: number; checks: number };
  }).allocationProbe);
  expect(counts.checks).toBe(3);
  expect(counts.created).toBeGreaterThan(0);
  expect(counts.deleted).toBe(counts.created);
});
