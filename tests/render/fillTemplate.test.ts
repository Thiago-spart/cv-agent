import { describe, it, expect } from 'vitest';
import { fillCvTemplate } from '../../src/render/fillTemplate.js';
import type { Cv } from '../../src/data/cvSchema.js';

const sampleCv: Cv = {
  name: 'Jane Doe',
  title: 'Backend Engineer',
  contact: { email: 'jane@example.com' },
  summary: 'Backend engineer with 6 years of experience.',
  experience: [
    {
      company: 'Acme Corp',
      role: 'Senior Backend Engineer',
      startDate: '2021-01',
      endDate: 'Present',
      highlights: ['Led migration to microservices.'],
    },
  ],
  education: [],
  skills: ['TypeScript', 'Node.js'],
};

describe('fillCvTemplate', () => {
  it('renders name, title, and experience highlights into the HTML', () => {
    const html = fillCvTemplate(sampleCv);
    expect(html).toContain('Jane Doe');
    expect(html).toContain('Backend Engineer');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Led migration to microservices.');
  });
});
