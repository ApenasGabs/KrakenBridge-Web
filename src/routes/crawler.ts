import { Router, Request, Response } from 'express';
import { crawlerExtractionService, PREDEFINED_SCHEMAS, type SupportedCrawlerSchema } from '../services/crawlerExtractionService.js';

export const crawlerRouter = Router();

// Obter esquemas estruturados pré-configurados (querovagas, querocasa)
crawlerRouter.get('/schemas', (_req: Request, res: Response) => {
  res.json({
    success: true,
    schemas: PREDEFINED_SCHEMAS
  });
});

// Executar extração estruturada de uma URL ou HTML fornecido
crawlerRouter.post('/extract', async (req: Request, res: Response) => {
  try {
    const { url, schema = 'generic', html } = req.body;
    if (!url && !html) {
      res.status(400).json({ success: false, error: 'Forneça a "url" da página ou "html" para extração.' });
      return;
    }

    const result = await crawlerExtractionService.extract(
      url || 'http://localhost/mock-page',
      schema as SupportedCrawlerSchema,
      html
    );

    res.json({
      success: result.success,
      data: result
    });
  } catch (err: any) {
    console.error('[CrawlerRoute] Erro na extração:', err);
    res.status(500).json({ success: false, error: err?.message || 'Falha na extração de conteúdo' });
  }
});

// Relatório de impacto de memória no host ZimaOS
crawlerRouter.get('/benchmark', (_req: Request, res: Response) => {
  const report = crawlerExtractionService.evaluateMemoryImpact();
  res.json({
    success: true,
    report
  });
});
