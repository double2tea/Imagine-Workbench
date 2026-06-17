import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();

    // Set larger viewport to see both sidebar and gallery/board clearly
    await page.setViewportSize({ width: 1600, height: 1000 });

    console.log('Navigating to http://localhost:3000/board ...');
    await page.goto('http://localhost:3000/board');

    console.log('Waiting for elements to load...');
    // Wait 4 seconds for react flow and initial board state
    await page.waitForTimeout(4000);

    // Save screenshots
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'outputs/board-redesign-screenshot.png' });

    // Also hover on one of the asset cards if it exists, to check hover action strip
    const assetCard = await page.locator('.imagine-asset-card').first();
    if (await assetCard.count() > 0) {
      console.log('Hovering on first AssetCard...');
      await assetCard.hover();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'outputs/board-card-hover-screenshot.png' });
    }
  } finally {
    await browser.close();
  }
  console.log('Done!');
})();
