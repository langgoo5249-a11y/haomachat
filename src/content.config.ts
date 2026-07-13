import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 博客内容集合 - GEO 内容新鲜度信号
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('号码通查'),
    tags: z.array(z.string()).default([]),
    heroImage: z.string().optional(),
    heroDescription: z.string().optional(),
    draft: z.boolean().default(false),
    category: z.string().optional(),
    howToSteps: z.array(z.object({
      name: z.string(),
      text: z.string(),
    })).optional(),
    howToTotalTime: z.string().optional(),
    howToCost: z.string().optional(),
    howToMaterials: z.array(z.string()).optional(),
  }),
});

export const collections = { blog };
