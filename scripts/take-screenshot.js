import { chromium } from 'playwright';

async function takeScreenshot() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Set a wide viewport
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  // Navigate to the page
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  
  // Click the "Load Example" button
  await page.click('button:has-text("Load Example")');
  
  // Wait for all content to load (analysis, images, etc.)
  await page.waitForTimeout(5000);
  
  // Scroll through the page to ensure all content is rendered
  await page.evaluate(() => {
    return new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          // Scroll back to top
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });
  
  // Wait a bit more for any lazy-loaded content
  await page.waitForTimeout(2000);
  
  // Take full page screenshot
  await page.screenshot({
    path: 'public/screenshot-full.png',
    fullPage: true,
    type: 'png'
  });
  
  await browser.close();
  console.log('Screenshot saved to public/screenshot-full.png');
}

takeScreenshot().catch(console.error);
