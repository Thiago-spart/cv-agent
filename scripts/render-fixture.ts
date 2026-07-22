import { loadCv } from '../src/data/loadCv.js';
import { fillCvTemplate } from '../src/render/fillTemplate.js';
import { renderHtmlToPdf } from '../src/render/renderPdf.js';

async function main() {
  const cv = loadCv('tests/fixtures/valid-cv.yaml');
  const html = fillCvTemplate(cv);
  const output = await renderHtmlToPdf(html, 'output/manual-render-test.pdf');
  console.log(`Wrote ${output}`);
}

main();
