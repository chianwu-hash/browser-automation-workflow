async function detectExportRoutes(page) {
  const routes = {
    menu: false,
    hover: false,
    lightbox: false,
  };

  const menuButton = page.locator('button[aria-label*="更多"], button.more-menu-button').first();
  routes.menu = await menuButton.isVisible().catch(() => false);

  const imageButton = page.locator('button.image-button').first();
  if (await imageButton.isVisible().catch(() => false)) {
    const box = await imageButton.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.move(box.x + box.width - 24, box.y + 24);
      await page.waitForTimeout(800);

      const hoverButton = page.locator('button.generated-image-button').first();
      routes.hover = await hoverButton.isVisible().catch(() => false);

      const expandButton = page.locator('button[aria-label="展開"]').first();
      routes.lightbox = await expandButton.isVisible().catch(() => false);
    }
  }

  return routes;
}

function choosePreferredRoute(routes) {
  if (routes.hover) return 'hover';
  if (routes.lightbox) return 'lightbox';
  if (routes.menu) return 'menu';
  return 'none';
}

module.exports = {
  choosePreferredRoute,
  detectExportRoutes,
};
