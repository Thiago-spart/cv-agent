import { z } from 'zod';

export const cvSchema = z.object({
  name: z.string().min(1, 'name is required'),
  title: z.string().min(1, 'title is required'),
  contact: z.object({
    email: z.string().email('contact.email must be a valid email'),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().url().optional(),
    github: z.string().url().optional(),
    website: z.string().url().optional(),
  }),
  summary: z.string().min(1, 'summary is required'),
  experience: z
    .array(
      z.object({
        company: z.string().min(1, 'experience[].company is required'),
        role: z.string().min(1, 'experience[].role is required'),
        location: z.string().optional(),
        startDate: z.string().min(1, 'experience[].startDate is required'),
        endDate: z.string().optional(),
        highlights: z
          .array(z.string())
          .min(1, 'experience[].highlights must have at least one item'),
      })
    )
    .min(1, 'experience must have at least one entry'),
  education: z.array(
    z.object({
      institution: z.string().min(1, 'education[].institution is required'),
      degree: z.string().min(1, 'education[].degree is required'),
      startDate: z.string().min(1, 'education[].startDate is required'),
      endDate: z.string().optional(),
      details: z.string().optional(),
    })
  ),
  skills: z.array(z.string()).min(1, 'skills must have at least one item'),
  projects: z
    .array(
      z.object({
        name: z.string().min(1, 'projects[].name is required'),
        description: z.string().min(1, 'projects[].description is required'),
        url: z.string().url().optional(),
        highlights: z.array(z.string()).optional(),
      })
    )
    .optional(),
  languages: z
    .array(
      z.object({
        name: z.string().min(1, 'languages[].name is required'),
        level: z.string().min(1, 'languages[].level is required'),
      })
    )
    .optional(),
});

export type Cv = z.infer<typeof cvSchema>;
