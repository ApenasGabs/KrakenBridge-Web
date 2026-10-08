# Arquiteturas para Web Scraping com Playwright

Um guia comparativo de arquiteturas para construir scrapers robustos, escaláveis e mantíveis.

## 📊 Análise do Projeto "QueroDADOS"

### Problemas Identificados

O projeto `querodados` apresenta boas características, mas com alguns desafios:

**✅ Pontos Fortes:**
- Scraper específico por portal (OLX, ZAP)
- GitHub Actions para automação
- Documentação básica
- Configurações por portal

**❌ Pontos Fracos:**
- Entry point único (`index.js`) com lógica if/else
- Scrapers não compartilham estrutura comum
- Sem validação de dados centralizada
- Sem sistema de retry/fallback
- Sem tipagem TypeScript
- Sem tratamento robusto de erros
- Sem logging estruturado
- Dados salvos mas sem pipeline clara
- Sem testes unitários/E2E
- Estrutura cresce desordenadamente com novos scrapers

---

## 🏗️ Arquitetura 1: Modular Simples (Recomendado para começar)

Ideal para 1-3 scrapers simples com requisitos básicos.

```
scrapers/
├── base/
│   ├── BaseScraper.ts          # Classe abstrata
│   └── types.ts                 # Tipos compartilhados
├── olx/
│   ├── OlxScraper.ts
│   ├── selectors.ts
│   └── mapper.ts
├── zap/
│   ├── ZapScraper.ts
│   ├── selectors.ts
│   └── mapper.ts
└── index.ts                     # Factory/Router

utils/
├── logger.ts                    # Logging estruturado
├── validator.ts                 # Validação de dados
├── retry.ts                     # Retry logic
└── storage.ts                   # Persistência

config/
├── index.ts                     # Config centralizada
├── scrapers.ts                  # Config por scraper
└── env.ts                       # Variáveis de ambiente

main.ts                          # Entry point limpo
```

**Pros:**
- ✅ Simples de entender e começar
- ✅ Fácil adicionar novo scraper
- ✅ Código reutilizável com BaseScraper
- ✅ Configuração centralizada

**Contras:**
- ❌ Cresce mal com muitos scrapers (10+)
- ❌ Sem separação por domínio
- ❌ Difícil escalar para microserviços

**Quando usar:**
- Projeto novo com 1-3 scrapers
- Prototipagem rápida
- Time pequeno

---

## 🏗️ Arquitetura 2: Domain-Driven Design (DDD)

Ideal para 5+ scrapers ou domínios diferentes.

```
src/
├── domains/                     # Contextos por domínio
│   ├── imobiliario/
│   │   ├── application/
│   │   │   ├── ScrapeImovelUseCase.ts
│   │   │   └── ProcessImovelUseCase.ts
│   │   ├── domain/
│   │   │   ├── Imovel.ts       # Entity
│   │   │   ├── ImovelRepository.ts
│   │   │   └── events/
│   │   ├── infrastructure/
│   │   │   ├── OlxScraper.ts
│   │   │   ├── ZapScraper.ts
│   │   │   └── FileStorage.ts
│   │   └── http/               # Controllers
│   ├── veiculo/
│   │   ├── application/
│   │   ├── domain/
│   │   └── infrastructure/
│   └── ...outros domínios
├── shared/
│   ├── domain/
│   │   ├── Result.ts
│   │   └── DomainEvent.ts
│   ├── infrastructure/
│   │   ├── Logger.ts
│   │   └── Config.ts
│   └── http/
│       └── StatusController.ts
├── main.ts
└── container.ts                # Dependency Injection
```

**Pros:**
- ✅ Muito escalável
- ✅ Fácil adicionar domínios (imóveis, veículos, etc)
- ✅ Código independente por domínio
- ✅ Pronto para microserviços
- ✅ Testabilidade excelente

**Contras:**
- ❌ Complexidade inicial alta
- ❌ Curva de aprendizado
- ❌ Pode ser overkill para projeto pequeno
- ❌ Mais boilerplate

**Quando usar:**
- Projeto vai ter múltiplos domínios
- Time experiente com DDD
- Scaling é prioridade
- Longo prazo

---

## 🏗️ Arquitetura 3: Plugin-Based

Ideal para 10+ scrapers ou sistema extensível.

```
src/
├── core/
│   ├── ScraperPlugin.interface.ts
│   ├── PipelineOrchestrator.ts
│   ├── EventBus.ts
│   └── Registry.ts
├── plugins/
│   ├── olx/
│   │   ├── OlxPlugin.ts
│   │   ├── OlxScraper.ts
│   │   ├── OlxMapper.ts
│   │   └── olx.config.ts
│   ├── zap/
│   │   ├── ZapPlugin.ts
│   │   └── ...
│   ├── immobiliare/
│   │   └── ...
│   └── registry.ts
├── pipeline/
│   ├── steps/
│   │   ├── ValidateStep.ts
│   │   ├── EnrichStep.ts
│   │   ├── DeduplicateStep.ts
│   │   └── StorageStep.ts
│   └── executor.ts
├── shared/
│   ├── types/
│   ├── utils/
│   └── storage/
└── main.ts
```

**Pros:**
- ✅ Altamente extensível
- ✅ Plugins independentes
- ✅ Fácil remover/adicionar scrapers
- ✅ Hot-reload possível
- ✅ Pronto para distribuição

**Contras:**
- ❌ Complexidade muito alta
- ❌ Mais difícil de debugar
- ❌ Requer padrões rígidos

**Quando usar:**
- Plataforma scraper (app terceiros)
- Muitos scrapers heterogêneos
- SaaS scraping platform

---

## 🏗️ Arquitetura 4: Queue-Based (Async Job Processing)

Ideal para scraping em larga escala com agendamento.

```
src/
├── queues/
│   ├── ScraperQueue.ts
│   ├── ProcessorQueue.ts
│   └── workers/
│       ├── scraperWorker.ts
│       ├── validatorWorker.ts
│       └── storageWorker.ts
├── scrapers/
│   ├── BaseScraper.ts
│   ├── olx/
│   └── zap/
├── jobs/
│   ├── ScrapeJob.ts
│   ├── ProcessJob.ts
│   └── DeliveryJob.ts
├── scheduler/
│   ├── Scheduler.ts
│   └── cron-jobs/
├── monitoring/
│   ├── MetricsCollector.ts
│   └── HealthCheck.ts
└── main.ts
```

**Pros:**
- ✅ Escalabilidade horizontal
- ✅ Retry automático
- ✅ Processamento assíncrono
- ✅ Agendamento robusto
- ✅ Monitoramento built-in

**Contras:**
- ❌ Infra complexa (Redis, RabbitMQ, etc)
- ❌ Debugging difícil
- ❌ Requer DevOps
- ❌ Overkill para pequenos projetos

**Quando usar:**
- Centenas de scrapers
- Scraping 24/7 em produção
- Múltiplos workers/máquinas
- SLA importante

---

## 📋 Comparação Rápida

| Aspecto | Modular | DDD | Plugin | Queue |
|--------|---------|-----|--------|-------|
| **Simplicidade** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐ |
| **Escalabilidade** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Testabilidade** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Curva Aprendizado** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Infra Necessária** | Minimal | Minimal | Minimal | Complexa |
| **Melhor Para** | Começo | Médio prazo | Extensível | Produção |

---

## 🎯 Recomendação para Novo Projeto

### Fase 1: Começar (Semanas 1-4)
**Use: Arquitetura Modular Simples**

```typescript
// Estrutura limpa e direta
src/
├── scrapers/base/BaseScraper.ts
├── scrapers/olx/OlxScraper.ts
├── utils/logger.ts
├── config/index.ts
└── main.ts
```

**Benefícios:**
- Rápido para começar
- Fácil de manter enquanto cresce
- Sem overhead

### Fase 2: Crescimento (Meses 2-6)
**Migrar para: DDD ou continuar Modular**

Quando atingir:
- 5+ scrapers
- Múltiplos domínios (imóvel, veículo, etc)
- Requisitos complexos

### Fase 3: Produção (Mês 6+)
**Considerar: Queue-Based + Monitoramento**

Quando atingir:
- Centenas de scrapers
- Necessidade de 24/7
- Múltiplas máquinas

---

## 🛠️ Stack Recomendado para Cada Arquitetura

### Modular Simples
```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "winston": "^3.11.0",
    "joi": "^17.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "ts-node": "^10.9.0"
  }
}
```

### DDD
```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "winston": "^3.11.0",
    "joi": "^17.0.0",
    "tsyringe": "^4.8.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "ts-node": "^10.9.0"
  }
}
```

### Plugin-Based
```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "winston": "^3.11.0",
    "joi": "^17.0.0",
    "tsyringe": "^4.8.0",
    "eventemitter3": "^5.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "ts-node": "^10.9.0"
  }
}
```

### Queue-Based
```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "winston": "^3.11.0",
    "joi": "^17.0.0",
    "bull": "^4.11.0",
    "ioredis": "^5.3.0",
    "tsyringe": "^4.8.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "ts-node": "^10.9.0"
  }
}
```

---

## 💡 Princípios Fundamentais

Independente da arquitetura escolhida:

### 1. **Separação de Responsabilidades**
```typescript
// ❌ Ruim - Tudo misturado
async function scrape() {
  const page = await browser.newPage();
  await page.goto(url);
  const data = await page.evaluate(...);
  // Scraping + Mapping + Validação + Storage
}

// ✅ Bom - Cada coisa no seu lugar
async function scrape() {
  const raw = await scraper.fetch(url);
  const mapped = mapper.toImovel(raw);
  validator.validate(mapped);
  await storage.save(mapped);
}
```

### 2. **Configuração Centralizada**
```typescript
// config/index.ts
export const scraperConfig = {
  olx: { timeout: 30000, retries: 3 },
  zap: { timeout: 25000, retries: 2 },
};
```

### 3. **Logging Estruturado**
```typescript
logger.info('Scraping started', { scraper: 'olx', url });
logger.error('Failed to fetch', { error, retries: 2 });
```

### 4. **Validação de Dados**
```typescript
// Sempre validar dados coletados
const schema = joi.object({
  title: joi.string().required(),
  price: joi.number().positive().required(),
});
```

### 5. **Error Handling Robusto**
```typescript
try {
  await scraper.run();
} catch (error) {
  if (isRecoverable(error)) {
    await retry();
  } else {
    await notifyOps();
  }
}
```

### 6. **Sem Duplicação**
- Lógica compartilhada em `BaseScraper`
- Utilitários em `utils/`
- Config centralizada

---

## 🚀 Próximos Passos

Recomendo começar com a **Arquitetura Modular Simples** e evoluir conforme necessário.

Se quiser, posso criar um template starter com essa arquitetura!

