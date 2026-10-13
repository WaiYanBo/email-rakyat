import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const panduanCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/panduan' }),
  schema: z.object({
    title: z.string(),
    metaTitle: z.string().optional(),
    description: z.string(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('Team Email Rakyat (ER Advocacy Sdn. Bhd.)'),
    authorRole: z.string().default('Pegawai Advokasi & Penasihat Hak Pengguna'),
    readTime: z.string().default('12 min bacaan'),
    category: z.string().default('Undang-Undang & Tindakan Kecemasan'),
    badge: z.string().default('Panduan Definitif 2026'),
    image: z.string().default('/logo.png'),
    imageAlt: z.string().default('Panduan Tindakan Undang-Undang Mangsa Ah Long Malaysia'),
    keywords: z.array(z.string()),
    lawSections: z.array(
      z.object({
        act: z.string(),
        section: z.string(),
        title: z.string(),
        description: z.string(),
        legalPenalty: z.string()
      })
    ).optional(),
    faqs: z.array(
      z.object({
        question: z.string(),
        answer: z.string()
      })
    ).optional()
  })
});

export const collections = {
  panduan: panduanCollection
};
