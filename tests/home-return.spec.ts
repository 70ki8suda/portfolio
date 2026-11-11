import { expect, test } from '@playwright/test';

test('returning home exposes the live WebGL animation after each reused transition', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { draws: 0, completed: 0 };
    Object.assign(window, { homeReturnProbe: state });
    const draw = WebGL2RenderingContext.prototype.drawArraysInstanced;
    WebGL2RenderingContext.prototype.drawArraysInstanced = function (...args) {
      if ((this.canvas as HTMLCanvasElement).dataset.testid === 'fluid-canvas') state.draws++;
      return draw.apply(this, args);
    };
    window.addEventListener('pagetransition', event => {
      if ((event as CustomEvent).detail.phase !== 'start') state.completed++;
    });
  });
  const probe = () => page.evaluate(() => (window as unknown as { homeReturnProbe: { draws: number; completed: number } }).homeReturnProbe);
  await page.goto('/');
  await expect(page.getByTestId('fluid-canvas')).toHaveAttribute('data-ready', 'true');
  for (let round = 0; round < 2; round++) {
    const completed = (await probe()).completed;
    await page.getByRole('navigation').getByRole('link', { name: 'Blog', exact: true }).click();
    await expect.poll(async () => (await probe()).completed).toBeGreaterThan(completed);
    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect.poll(async () => (await probe()).completed).toBeGreaterThan(completed + 1);
    await expect(page.getByTestId('fluid-backdrop')).toHaveAttribute('data-state', 'running');
    // A running simulation is insufficient: the transition's last frame must not cover it.
    await expect(page.locator('canvas[data-page-transition="output"]')).toHaveCount(1);
    await expect(page.locator('canvas[data-page-transition="output"]')).toBeHidden();
    const before = await page.screenshot();
    const draws = (await probe()).draws;
    await expect.poll(async () => (await probe()).draws).toBeGreaterThan(draws + 12);
    expect((await page.screenshot()).equals(before)).toBe(false);
    await expect(page.locator('[data-page-transition="stage"]')).toHaveCount(0);
  }
});
