const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Load the HTML file
  const htmlContent = fs.readFileSync('reportCard.html', 'utf8');
  await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

  // Generate PDF
  await page.pdf({
    path: 'reportCard.pdf',
    format: 'A4',
    printBackground: true,
  });

  await browser.close();
})();
