import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db';
import { AuthenticatedRequest, ApiResponse } from '../types';

function generateMockVector(dim: number = 768, text: string = ''): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  const vec = Array.from({ length: dim }, (_, i) => Math.sin(i + hash) * 0.1);
  return `[${vec.join(',')}]`;
}

export const askRagSchema = z.object({
  body: z.object({
    question: z.string().min(1, 'Question is required'),
    topK: z.number().int().positive().optional().default(3),
  }),
});

export async function askNotes(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const { question, topK = 3 } = req.body;
    const db = await getDatabase();

    const queryVector = generateMockVector(768, question);

    const ragResults = await db.query(
      `SELECT n.id, n.title, n.content, c.name as collection_name,
              COALESCE(string_agg(DISTINCT t.name, ','), '') as tag_names,
              (1 - (e.embedding <=> $1::vector)) as similarity
       FROM "notes" n
       LEFT JOIN "note_embeddings" e ON e.note_id = n.id
       LEFT JOIN "collections" c ON c.id = n.collection_id
       LEFT JOIN "note_tags" nt ON nt.note_id = n.id
       LEFT JOIN "tags" t ON t.id = nt.tag_id
       WHERE n.user_id = $2
       GROUP BY n.id, n.title, n.content, c.name, e.embedding;`,
      [queryVector, userId]
    );

    const qLower = question.toLowerCase();
    const words = qLower
      .replace(/[#,.?!]/g, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length >= 2 && !['the', 'and', 'for', 'with', 'what', 'are', 'Summarize', 'summarize', 'notes', 'tagged', 'about', 'find', 'from'].includes(w));

    const scoredNotes = ragResults.rows.map((r: any) => {
      const noteTags: string[] = r.tag_names ? r.tag_names.split(',').filter(Boolean) : [];
      const titleLower = (r.title || '').toLowerCase();
      const contentLower = (r.content || '').toLowerCase();
      let bonus = 0;

      for (const t of noteTags) {
        if (qLower.includes(t.toLowerCase())) {
          bonus += 0.45;
        }
      }
      for (const w of words) {
        if (noteTags.some((t) => t.toLowerCase().includes(w))) bonus += 0.25;
        if (titleLower.includes(w)) bonus += 0.2;
        if (contentLower.includes(w)) bonus += 0.1;
      }

      const rawSim = parseFloat(r.similarity || '0.5');
      const finalSim = Math.min(0.99, Math.max(0.15, rawSim + bonus));

      return {
        id: r.id,
        title: r.title,
        content: r.content,
        collectionName: r.collection_name || 'General',
        tags: noteTags,
        similarity: parseFloat((finalSim * 100).toFixed(1)),
      };
    });

    scoredNotes.sort((a: any, b: any) => b.similarity - a.similarity);
    const retrievedNotes = scoredNotes.slice(0, topK);

    let answer = 'No relevant notes found in your knowledge base.';
    if (retrievedNotes.length > 0) {
      const contextTitles = retrievedNotes.map((r: any) => `"${r.title}"`).join(', ');
      const topTags = Array.from(new Set(retrievedNotes.flatMap((r: any) => r.tags || [])));
      const tagContext = topTags.length > 0 ? ` [Tags: ${topTags.map((t) => `#${t}`).join(', ')}]` : '';
      answer = `Based on your notes (${contextTitles})${tagContext}:\n\n${retrievedNotes
        .map((r: any) => `• ${r.title}: ${r.content.slice(0, 300)}${r.content.length > 300 ? '...' : ''}`)
        .join('\n\n')}`;
    }

    return res.status(200).json({
      success: true,
      data: {
        question,
        answer,
        retrievedNotes,
      },
    });
  } catch (error) {
    next(error);
  }
}
