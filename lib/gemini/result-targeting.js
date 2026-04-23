async function getLatestResultTarget(page) {
  const imageButtons = page.locator('button.image-button');
  const imageButtonCount = await imageButtons.count().catch(() => 0);
  if (imageButtonCount > 0) {
    const locator = imageButtons.nth(imageButtonCount - 1);
    return {
      kind: 'image-button',
      locator,
      index: imageButtonCount - 1,
    };
  }

  const images = page.locator('img.image.loaded, img[src^="blob:"]');
  const imageCount = await images.count().catch(() => 0);
  if (imageCount > 0) {
    const locator = images.nth(imageCount - 1);
    return {
      kind: 'image',
      locator,
      index: imageCount - 1,
    };
  }

  const error = new Error('Could not find a generated Gemini result to export.');
  error.code = 'RESULT_NOT_FOUND';
  throw error;
}

module.exports = {
  getLatestResultTarget,
};
