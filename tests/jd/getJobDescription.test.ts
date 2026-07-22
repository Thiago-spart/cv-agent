import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveJobDescription, stripHtml, JobDescriptionError } from '../../src/jd/getJobDescription.js';

describe('stripHtml', () => {
  it('removes tags and scripts, collapses whitespace', () => {
    const html =
      '<html><head><style>.a{}</style></head><body><script>evil()</script><h1>Backend Engineer</h1><p>5+ years  experience</p></body></html>';
    expect(stripHtml(html)).toBe('Backend Engineer 5+ years experience');
  });
});

describe('resolveJobDescription', () => {
  it('trims and returns pasted text', async () => {
    const text = await resolveJobDescription({ mode: 'paste', text: '  Backend role  \n' });
    expect(text).toBe('Backend role');
  });

  it('throws JobDescriptionError for empty pasted text', async () => {
    await expect(resolveJobDescription({ mode: 'paste', text: '   ' })).rejects.toThrowError(
      JobDescriptionError
    );
  });

  it('reads and returns file contents', async () => {
    const tmpFile = path.join(os.tmpdir(), `jd-${Date.now()}.txt`);
    await fs.writeFile(tmpFile, 'Backend role from file', 'utf8');
    try {
      const text = await resolveJobDescription({ mode: 'file', path: tmpFile });
      expect(text).toBe('Backend role from file');
    } finally {
      await fs.rm(tmpFile);
    }
  });

  it('throws JobDescriptionError when the file does not exist', async () => {
    await expect(
      resolveJobDescription({ mode: 'file', path: '/nonexistent/path.txt' })
    ).rejects.toThrowError(JobDescriptionError);
  });

  it('fetches and strips HTML from a URL', async () => {
    const html = '<html><body><h1>Backend Engineer</h1><p>' + 'x'.repeat(60) + '</p></body></html>';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => html,
      })
    );
    const text = await resolveJobDescription({ mode: 'url', url: 'https://example.com/job' });
    expect(text).toContain('Backend Engineer');
    vi.unstubAllGlobals();
  });

  it('throws JobDescriptionError when the URL fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(
      resolveJobDescription({ mode: 'url', url: 'https://example.com/job' })
    ).rejects.toThrowError(JobDescriptionError);
    vi.unstubAllGlobals();
  });
});
