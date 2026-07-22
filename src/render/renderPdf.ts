import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

export async function renderHtmlToPdf(html: string, outputPath: string): Promise<string> {
  try {
    const browser = await puppeteer.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
      return outputPath;
    } finally {
      await browser.close();
    }
  } catch (error) {
    const fallbackPath = outputPath.replace(/\.pdf$/, '.html');
    await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
    await fs.writeFile(fallbackPath, html, 'utf8');
    console.error(
      `PDF rendering failed (${(error as Error).message}). Saved HTML instead: ${fallbackPath}`
    );
    return fallbackPath;
  }
}
