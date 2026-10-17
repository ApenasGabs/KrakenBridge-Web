import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crawlerExtractionService, PREDEFINED_SCHEMAS } from '../../../../src/services/crawlerExtractionService';
import { mcpService } from '../../../../src/services/mcpService';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('CrawlerExtractionService - Crawl4AI Integration (Issue #47)', () => {
  let testRoot: string;
  let configPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    testRoot = path.join(os.tmpdir(), `kraken-test-crawl4ai-${Date.now()}`);
    configPath = path.join(testRoot, 'mcp_config.json');
    fs.mkdirSync(testRoot, { recursive: true });
    process.env.MCP_CONFIG_PATH = configPath;
  });

  it('deve possuir esquemas pré-definidos para querovagas e querocasa', () => {
    expect(PREDEFINED_SCHEMAS.querovagas).toBeDefined();
    expect(PREDEFINED_SCHEMAS.querovagas.fields).toContain('title');
    expect(PREDEFINED_SCHEMAS.querovagas.fields).toContain('company');

    expect(PREDEFINED_SCHEMAS.querocasa).toBeDefined();
    expect(PREDEFINED_SCHEMAS.querocasa.fields).toContain('price');
    expect(PREDEFINED_SCHEMAS.querocasa.fields).toContain('bedrooms');
  });

  it('deve executar PoC de extração estruturada para querovagas com sucesso', async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="card-vaga">
            <h2>Desenvolvedor Full Stack TypeScript</h2>
            <span class="company">Tech Lab Brasil</span>
            <span class="location">Remoto</span>
            <a href="https://example.com/apply/123">Candidatar-se</a>
          </div>
          <div class="card-vaga">
            <h2>Engenheiro de Dados Sênior</h2>
            <span class="company">DataCorp</span>
            <span class="location">São Paulo, SP</span>
            <a href="https://example.com/apply/456">Candidatar-se</a>
          </div>
        </body>
      </html>
    `;

    const result = await crawlerExtractionService.extract(
      'https://querovagas.local/jobs',
      'querovagas',
      mockHtml
    );

    expect(result.success).toBe(true);
    expect(result.schema).toBe('querovagas');
    expect(result.items.length).toBe(2);
    expect(result.items[0].title).toBe('Desenvolvedor Full Stack TypeScript');
    expect(result.items[0].company).toBe('Tech Lab Brasil');
    expect(result.items[0].remoteType).toBe('remoto');
    expect(result.items[0].applyUrl).toBe('https://example.com/apply/123');
    expect(result.markdown).toContain('#');
  });

  it('deve executar PoC de extração estruturada para querocasa com sucesso', async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="card-imovel">
            <h3>Apartamento 3 Dormitórios no Centro</h3>
            <span class="preco">R$ 650.000</span>
            <span class="detalhes">3 quartos | 95 m²</span>
            <a href="https://querocasa.local/imovel/987">Ver Imóvel</a>
          </div>
        </body>
      </html>
    `;

    const result = await crawlerExtractionService.extract(
      'https://querocasa.local/imoveis',
      'querocasa',
      mockHtml
    );

    expect(result.success).toBe(true);
    expect(result.schema).toBe('querocasa');
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe('Apartamento 3 Dormitórios no Centro');
    expect(result.items[0].price).toContain('650.000');
    expect(result.items[0].bedrooms).toBe(3);
    expect(result.items[0].areaM2).toBe(95);
  });

  it('deve converter HTML para Markdown limpo removendo ruídos (scripts, styles, SVGs)', () => {
    const dirtyHtml = `
      <html>
        <head>
          <style>body { color: red; }</style>
        </head>
        <body>
          <script>console.log("tracker");</script>
          <svg><path d="M0 0"/></svg>
          <h1>Título Principal</h1>
          <p>Conteúdo relevante do artigo.</p>
          <a href="https://link.com">Acessar</a>
        </body>
      </html>
    `;

    const md = crawlerExtractionService.htmlToCleanMarkdown(dirtyHtml);

    expect(md).toContain('# Título Principal');
    expect(md).toContain('Conteúdo relevante do artigo.');
    expect(md).toContain('[Acessar](https://link.com)');
    expect(md).not.toContain('tracker');
    expect(md).not.toContain('color: red');
    expect(md).not.toContain('<svg');
  });

  it('deve avaliar o impacto de memória no host ZimaOS demonstrando economia > 70% de RAM', () => {
    const report = crawlerExtractionService.evaluateMemoryImpact();

    expect(report.targetHost).toContain('gabisa');
    expect(report.ramSavingsPercent).toBeGreaterThan(70);
    expect(report.standalonePlaywrightMbPerInstance).toBeGreaterThan(300);
    expect(report.crawl4aiDaemonMb).toBeLessThan(150);
    expect(report.maxConcurrentCrawlers).toBeGreaterThanOrEqual(5);
  });

  it('deve auto-provisionar o servidor MCP crawl4ai no mcp_config.json', async () => {
    const provisioned = await mcpService.ensureHomelabCrawl4AiServer();
    expect(provisioned).toBe(true);

    const configRaw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configRaw);

    expect(config.mcpServers.crawl4ai).toBeDefined();
    expect(config.mcpServers.crawl4ai.url).toContain('11235');
    expect(config.mcpServers.crawl4ai.headers.Authorization).toContain('kraken-crawl4ai-homelab-2026');
  });
});
