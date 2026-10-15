import React from 'react';
import type { ConversationSession } from '../types';

/**
 * Normaliza o texto removendo acentos gráficos, pontuação e convertendo para minúsculas.
 */
export function normalizeSearchText(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Extrai um snippet contextual com reticências ao redor da ocorrência do termo de busca.
 */
export function extractSnippet(text: string, query: string, maxLength = 100): string {
  if (!text) return '';
  const normText = normalizeSearchText(text);
  const normQuery = normalizeSearchText(query);
  const terms = normQuery.split(/\s+/).filter(Boolean);

  let matchIndex = -1;
  let matchLen = 0;

  if (normQuery && normText.includes(normQuery)) {
    matchIndex = normText.indexOf(normQuery);
    matchLen = normQuery.length;
  } else {
    for (const term of terms) {
      const idx = normText.indexOf(term);
      if (idx !== -1) {
        matchIndex = idx;
        matchLen = term.length;
        break;
      }
    }
  }

  if (matchIndex === -1) {
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  }

  const half = Math.floor((maxLength - matchLen) / 2);
  let start = Math.max(0, matchIndex - half);
  let end = Math.min(text.length, matchIndex + matchLen + half);

  if (start > 0) {
    const spaceBefore = text.indexOf(' ', start);
    if (spaceBefore !== -1 && spaceBefore < matchIndex) start = spaceBefore + 1;
  }
  if (end < text.length) {
    const spaceAfter = text.lastIndexOf(' ', end);
    if (spaceAfter !== -1 && spaceAfter > matchIndex + matchLen) end = spaceAfter;
  }

  const snippet = text.slice(start, end).trim();
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${snippet}${suffix}`;
}

export interface RelevanceResult {
  score: number;
  matchedSnippet?: string;
  matchSource?: 'user' | 'title' | 'subproject' | 'tag' | 'content';
}

/**
 * Calcula a pontuação de relevância de uma conversa para uma dada consulta de busca.
 * Prioridade máxima é dada ao que o usuário realmente conversou (role: user).
 */
export function calculateRelevance(item: ConversationSession, rawQuery: string): RelevanceResult {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) return { score: 0 };
  const terms = normQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { score: 0 };

  const normTitle = normalizeSearchText(item.title);
  const normSubproject = normalizeSearchText(item.subproject);
  const normTags = (item.tags || []).map(t => normalizeSearchText(t));
  const userQueries = item.userQueries || [];
  const normSearchable = normalizeSearchText(item.searchableText);
  const normSnippet = normalizeSearchText(item.lastMessageSnippet);

  let score = 0;
  let matchedSnippet: string | undefined = undefined;
  let matchSource: 'user' | 'title' | 'subproject' | 'tag' | 'content' | undefined = undefined;

  // 1. Mensagens digitadas pelo usuário (role: 'user') - PRIORIDADE MÁXIMA
  for (const uq of userQueries) {
    const normUq = normalizeSearchText(uq);
    if (normUq.includes(normQuery)) {
      score += 160; // Usuário falou exatamente o termo/frase pesquisada!
      if (!matchedSnippet) {
        matchedSnippet = extractSnippet(uq, normQuery);
        matchSource = 'user';
      }
      break;
    } else {
      const matchedTermCount = terms.filter(t => normUq.includes(t)).length;
      if (matchedTermCount === terms.length && terms.length > 1) {
        score += 100;
        if (!matchedSnippet) {
          matchedSnippet = extractSnippet(uq, terms[0]);
          matchSource = 'user';
        }
        break;
      } else if (matchedTermCount > 0) {
        score += matchedTermCount * 30;
        if (!matchedSnippet) {
          matchedSnippet = extractSnippet(uq, terms[0]);
          matchSource = 'user';
        }
      }
    }
  }

  // 2. Título da conversa
  if (normTitle === normQuery) {
    score += 200;
    if (!matchSource) matchSource = 'title';
  } else if (normTitle.includes(normQuery)) {
    score += 100;
    if (!matchSource) matchSource = 'title';
  } else {
    const titleMatchedCount = terms.filter(t => normTitle.includes(t)).length;
    if (titleMatchedCount === terms.length && terms.length > 1) {
      score += 60;
      if (!matchSource) matchSource = 'title';
    } else if (titleMatchedCount > 0) {
      score += titleMatchedCount * 20;
      if (!matchSource) matchSource = 'title';
    }
  }

  // 3. Subprojeto ativo
  if (normSubproject === normQuery) {
    score += 120;
    if (!matchSource) matchSource = 'subproject';
  } else if (normSubproject.includes(normQuery)) {
    score += 80;
    if (!matchSource) matchSource = 'subproject';
  } else {
    const subprojectMatched = terms.some(t => normSubproject.includes(t));
    if (subprojectMatched) {
      score += 40;
      if (!matchSource) matchSource = 'subproject';
    }
  }

  // 4. Tags contextuais
  for (const tag of normTags) {
    if (tag === normQuery) {
      score += 50;
      if (!matchSource) matchSource = 'tag';
    } else if (tag.includes(normQuery)) {
      score += 30;
      if (!matchSource) matchSource = 'tag';
    } else {
      const tagMatched = terms.some(t => tag.includes(t));
      if (tagMatched) {
        score += 15;
        if (!matchSource) matchSource = 'tag';
      }
    }
  }

  // 5. Conteúdo geral indexado (respostas, ferramentas, último snippet)
  if (normSearchable.includes(normQuery)) {
    score += 30;
    if (!matchedSnippet) {
      matchedSnippet = extractSnippet(item.searchableText || '', normQuery);
      matchSource = 'content';
    }
  } else if (normSnippet.includes(normQuery)) {
    score += 25;
    if (!matchedSnippet) {
      matchedSnippet = extractSnippet(item.lastMessageSnippet || '', normQuery);
      matchSource = 'content';
    }
  } else {
    const searchMatched = terms.some(t => normSearchable.includes(t) || normSnippet.includes(t));
    if (searchMatched) {
      score += 15;
      if (!matchedSnippet) {
        matchedSnippet = extractSnippet(item.searchableText || item.lastMessageSnippet || '', terms[0]);
        matchSource = 'content';
      }
    }
  }

  // Bônus suave de recência para desempate
  if (score > 0) {
    const time = new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (time > 0) {
      const daysOld = Math.max(0, (Date.now() - time) / (1000 * 60 * 60 * 24));
      score += Math.max(0, 5 - Math.min(5, daysOld * 0.2));
    }
  }

  return { 
    score: Math.round(score * 10) / 10, 
    matchedSnippet,
    matchSource
  };
}

/**
 * Filtra e ordena conversas por score de relevância decrescente.
 */
export function filterAndRankConversations(
  conversations: ConversationSession[], 
  query: string
): (ConversationSession & { relevanceScore: number; matchedSnippet?: string; matchSource?: string })[] {
  if (!query.trim()) return [];

  const results: (ConversationSession & { relevanceScore: number; matchedSnippet?: string; matchSource?: string })[] = [];

  for (const c of conversations) {
    const { score, matchedSnippet, matchSource } = calculateRelevance(c, query);
    if (score > 0) {
      results.push({
        ...c,
        relevanceScore: score,
        matchedSnippet: matchedSnippet || c.matchedSnippet,
        matchSource
      });
    }
  }

  results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return results;
}

/**
 * Destaca visualmente os termos da busca dentro de uma string de texto.
 */
export function highlightMatches(text: string, query: string): React.ReactNode {
  if (!text || !query.trim()) return text;

  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return text;

  // Cria regex que busca qualquer um dos termos, respeitando limites
  const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

  const parts = text.split(regex);
  if (parts.length <= 1) return text;

  return (
    <>
      {parts.map((part, index) => {
        const isMatch = terms.some(t => normalizeSearchText(t) === normalizeSearchText(part));
        if (isMatch) {
          return (
            <mark 
              key={index} 
              className="bg-primary/25 text-primary font-semibold px-0.5 rounded"
            >
              {part}
            </mark>
          );
        }
        return part;
      })}
    </>
  );
}
