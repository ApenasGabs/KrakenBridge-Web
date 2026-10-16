import { Router, type Request, type Response } from 'express';
import { githubProjectService } from '../services/githubProjectService.js';
import { historyService } from '../services/historyService.js';
import { randomUUID } from 'crypto';

export const projectsRouter = Router();

// Compatibilidade: redireciona GET / para config/projects
projectsRouter.get('/', (_req: Request, res: Response) => {
  res.redirect('../config/projects');
});

// Overview com contagem de issues e PRs
projectsRouter.get('/github/overview', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const overview = await githubProjectService.getOverview(force);
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Listar issues abertas dos projetos
projectsRouter.get('/github/issues', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const issues = await githubProjectService.getIssues(force);
    res.json({ issues, count: issues.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Listar PRs abertos e pendentes de revisão
projectsRouter.get('/github/prs', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true';
    const pullRequests = await githubProjectService.getPullRequests(force);
    res.json({ prs: pullRequests, pullRequests, count: pullRequests.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Aprovar, mergear ou fechar PR
projectsRouter.post('/github/prs/action', async (req: Request, res: Response) => {
  try {
    const { repo, prNumber, action } = req.body || {};
    if (!repo || !prNumber || !['approve', 'merge', 'close'].includes(action)) {
      return res.status(400).json({ error: 'Parâmetros inválidos. É obrigatório informar repo, prNumber e action (approve, merge ou close).' });
    }
    const result = await githubProjectService.approveOrMergePR(repo, Number(prNumber), action);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Fechar ou executar ação em Issue
projectsRouter.post('/github/issues/action', async (req: Request, res: Response) => {
  try {
    const { repo, issueNumber, action, stateReason } = req.body || {};
    if (!repo || !issueNumber || action !== 'close') {
      return res.status(400).json({ error: 'Parâmetros inválidos. É obrigatório informar repo, issueNumber e action ("close").' });
    }
    const result = await githubProjectService.closeIssue(repo, Number(issueNumber), stateReason);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Despachar solicitação de revisão em linguagem natural
projectsRouter.post('/github/prs/review', async (req: Request, res: Response) => {
  try {
    const { repo, prNumber, prTitle, prUrl, branch, comment } = req.body || {};
    if (!repo || !prNumber || !comment || !comment.trim()) {
      return res.status(400).json({ error: 'Parâmetros inválidos. Informe repo, prNumber e comment.' });
    }

    const result = await githubProjectService.dispatchReview({
      repo,
      prNumber: Number(prNumber),
      prTitle: prTitle || `PR #${prNumber}`,
      prUrl: prUrl || `https://github.com/${repo}/pull/${prNumber}`,
      branch,
      comment: String(comment).trim()
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Iniciar resolução de Issue diretamente com uma conversa do Kraken
projectsRouter.post('/github/issues/resolve', async (req: Request, res: Response) => {
  try {
    const { repo, issueNumber, title, url, body, subproject } = req.body || {};
    if (!issueNumber || !title) {
      return res.status(400).json({ error: 'Parâmetros inválidos. Informe issueNumber e title.' });
    }

    const newId = randomUUID();
    const cleanSubproject = subproject || (repo && repo.includes('/') ? repo.split('/')[1] : repo) || '';
    
    const initialPrompt = `Por favor, atue na resolução da seguinte issue do repositório ${repo || 'do projeto'}:\n\n**Issue #${issueNumber}: ${title}**\nLink: ${url || ''}\n\n${body ? `### Detalhes:\n${body}` : ''}`;

    const newSession = await historyService.save({
      id: newId,
      title: `Issue #${issueNumber}: ${title.slice(0, 32)}`,
      agent: 'antigravity',
      model: 'gemini-3.8-flash-high',
      effort: 'high',
      mode: 'default',
      subproject: cleanSubproject,
      tags: ['issue', `issue-${issueNumber}`, 'github'],
      messages: []
    });

    res.json({
      success: true,
      conversationId: newSession?.id || newId,
      subproject: cleanSubproject,
      suggestedPrompt: initialPrompt
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
