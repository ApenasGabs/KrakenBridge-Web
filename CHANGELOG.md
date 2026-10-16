# 📝 Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.7.1](https://github.com/ApenasGabs/KrakenBridge-Web/compare/v1.7.0...v1.7.1) (2026-10-16)

### 🐛 Bug Fixes

* **auth:** fallback para client_id do Google Antigravity e validacao na criacao de URL ([#63](https://github.com/ApenasGabs/KrakenBridge-Web/issues/63)) ([#66](https://github.com/ApenasGabs/KrakenBridge-Web/issues/66)) ([6751856](https://github.com/ApenasGabs/KrakenBridge-Web/commit/67518569e0284a2e73d11b236e8568ea6bdbb0cf))

## [1.7.0](https://github.com/ApenasGabs/KrakenBridge-Web/compare/v1.6.0...v1.7.0) (2026-10-16)

### ✨ Features

* **mcp:** auto-provisionamento de servidores MCP SQLite para gabot e ai-memory ([#48](https://github.com/ApenasGabs/KrakenBridge-Web/issues/48)) ([#65](https://github.com/ApenasGabs/KrakenBridge-Web/issues/65)) ([9955e58](https://github.com/ApenasGabs/KrakenBridge-Web/commit/9955e58c7e0619437288006132964f60dfd2a293))

## [1.6.0](https://github.com/ApenasGabs/KrakenBridge-Web/compare/v1.5.0...v1.6.0) (2026-10-16)

### ✨ Features

* **workspace:** isolamento de workspace efêmero para execução concorrente de múltiplos agentes ([#59](https://github.com/ApenasGabs/KrakenBridge-Web/issues/59)) ([#62](https://github.com/ApenasGabs/KrakenBridge-Web/issues/62)) ([597c9ee](https://github.com/ApenasGabs/KrakenBridge-Web/commit/597c9eece1bef484b5fadb4debe7f649347788ba))

## [1.5.0](https://github.com/ApenasGabs/KrakenBridge-Web/compare/v1.4.1...v1.5.0) (2026-10-16)

### ✨ Features

* **chat:** spinner verbs customizáveis estilo Claude Code (Claudionary) com cronômetro e toggle de exibição ([#58](https://github.com/ApenasGabs/KrakenBridge-Web/issues/58)) ([#61](https://github.com/ApenasGabs/KrakenBridge-Web/issues/61)) ([9348d62](https://github.com/ApenasGabs/KrakenBridge-Web/commit/9348d625a60a68ba2f813a9491499a28d172ebf7))

## [1.4.1](https://github.com/ApenasGabs/KrakenBridge-Web/compare/v1.4.0...v1.4.1) (2026-10-16)

### 🐛 Bug Fixes

* **infra:** instalar binario oficial gh no dockerfile e robustecer symlinks ([#30](https://github.com/ApenasGabs/KrakenBridge-Web/issues/30)) ([#60](https://github.com/ApenasGabs/KrakenBridge-Web/issues/60)) ([cb43588](https://github.com/ApenasGabs/KrakenBridge-Web/commit/cb4358826adcd480789fc5aa105237c03569191e))

## [1.4.0](https://github.com/ApenasGabs/KrakenBridge-Web/compare/v1.3.0...v1.4.0) (2026-10-16)

### ✨ Features

* **whats-next:** permitir fechar issues e prs diretamente na interface ([#55](https://github.com/ApenasGabs/KrakenBridge-Web/issues/55)) ([#57](https://github.com/ApenasGabs/KrakenBridge-Web/issues/57)) ([0839ebf](https://github.com/ApenasGabs/KrakenBridge-Web/commit/0839ebfe9e1cd83d7c0ee7beeacab237fa2dfc8c))

## [1.3.0](https://github.com/ApenasGabs/KrakenBridge-Web/compare/v1.2.0...v1.3.0) (2026-10-16)

### ✨ Features

* **quota/mcp:** dynamic quota groups, living model fallback, and streaming indicator ([#54](https://github.com/ApenasGabs/KrakenBridge-Web/issues/54)) ([#56](https://github.com/ApenasGabs/KrakenBridge-Web/issues/56)) ([ffecff9](https://github.com/ApenasGabs/KrakenBridge-Web/commit/ffecff9558eb8e49f8e3331edc7aced322ab8563))

## [1.2.0](https://github.com/ApenasGabs/KrakenBridge-Web/compare/v1.1.1...v1.2.0) (2026-10-16)

### ✨ Features

* **ux:** feedback visual de Pod Drain, bloqueio preventivo de chat e reconexao automatica (Refs [#45](https://github.com/ApenasGabs/KrakenBridge-Web/issues/45)) ([#46](https://github.com/ApenasGabs/KrakenBridge-Web/issues/46)) ([2a8d07a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/2a8d07a4305cbd556fd82f71cd25f5e18b5c9358))

## [1.1.1](https://github.com/ApenasGabs/KrakenBridge-Web/compare/v1.1.0...v1.1.1) (2026-10-16)

### 🐛 Bug Fixes

* **chat:** 🐛 memoizar componentes markdown para evitar remounting do MermaidBlock (Refs [#43](https://github.com/ApenasGabs/KrakenBridge-Web/issues/43)) ([f704c5a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/f704c5ab8b336a805b343f66934934d2a18c2084))
* **e2e:** 🐛 corrigir autenticação do mock de PIN e adicionar validação de pipeline às diretrizes (Refs [#43](https://github.com/ApenasGabs/KrakenBridge-Web/issues/43)) ([e65521a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/e65521a1840470a16539fc9f5a20cdb6f0f5e9a9))

## [1.1.0](https://github.com/ApenasGabs/KrakenBridge-Web/compare/v1.0.0...v1.1.0) (2026-10-16)

### ✨ Features

* **chat:** modo leitura por voz da resposta com Web Speech API (Refs [#39](https://github.com/ApenasGabs/KrakenBridge-Web/issues/39)) ([1960cdf](https://github.com/ApenasGabs/KrakenBridge-Web/commit/1960cdff5b35b02c0c5856e59d167b8f9a633da1))
* **chat:** suporte à leitura de resposta final, seletor de seções e velocidade da fala (Refs [#39](https://github.com/ApenasGabs/KrakenBridge-Web/issues/39)) ([0ed7777](https://github.com/ApenasGabs/KrakenBridge-Web/commit/0ed7777bb9fcf3e516d08ce174161e1e67685179))

### 🔧 Chores

* merge main into feat/[#39](https://github.com/ApenasGabs/KrakenBridge-Web/issues/39)-modo-leitura-voz ([5df6508](https://github.com/ApenasGabs/KrakenBridge-Web/commit/5df65089db799de7c52a359fea8de4f217c8cc33))
* merge release v1.0.0 into feat/[#39](https://github.com/ApenasGabs/KrakenBridge-Web/issues/39)-modo-leitura-voz ([76c0544](https://github.com/ApenasGabs/KrakenBridge-Web/commit/76c0544b99ed3ec3344299c68c3941b34c06d041))

## 1.0.0 (2026-10-16)

### ✨ Features

* add CasaOS/ZimaOS official AppStore v2 package and specifications ([983f537](https://github.com/ApenasGabs/KrakenBridge-Web/commit/983f5370d126772da55288b7220d3bcd826ff6bd))
* add integrated web-based authentication modal and inline OAuth flow ([baaf8da](https://github.com/ApenasGabs/KrakenBridge-Web/commit/baaf8da48d5b5e8a143db72183860f4083079a65))
* adicionar intellisense de comandos slash no prompt e gestor de servidores mcp ([dbbd6f9](https://github.com/ApenasGabs/KrakenBridge-Web/commit/dbbd6f94e2eb62cf4b51f53c0c2d5687f4402a70))
* **agent:** support isolated multi-account execution per chat session ([b50b5c8](https://github.com/ApenasGabs/KrakenBridge-Web/commit/b50b5c8684543896167c120c6faa937c1b788f4c))
* **auth:** add GitHub CLI Device Code flow and PAT login in AuthModal ([214eb64](https://github.com/ApenasGabs/KrakenBridge-Web/commit/214eb64dda2b010dab58d56a960051b6e0b6f0c1))
* **auth:** adicionar suporte e integração completa ao Vercel CLI via Device Code Flow e PAT (Refs [#20](https://github.com/ApenasGabs/KrakenBridge-Web/issues/20)) ([a509a0d](https://github.com/ApenasGabs/KrakenBridge-Web/commit/a509a0d5e0145e0e5a3187b4ce79352c2bccc644))
* **auth:** suporte a multiplas contas com alternancia em 1-clique e correcao do fluxo oauth ([d7bff23](https://github.com/ApenasGabs/KrakenBridge-Web/commit/d7bff2391af28dd52c1c94f1914c3074c2b7c3cd))
* **autonomy:** grant Kraken full autonomy to manage Docker, CasaOS apps and Homelab on ZimaOS ([c08f0a4](https://github.com/ApenasGabs/KrakenBridge-Web/commit/c08f0a48c479d1aba35d41785ef17cdef7e73ec9))
* **backend:** transcrever backend para TypeScript com zero downtime e pod drain ([c9ff5e2](https://github.com/ApenasGabs/KrakenBridge-Web/commit/c9ff5e2950ef7215080d09a5bc710e4898cb0195))
* brand project as krakenbridge-web and add multi-agent support ([406ac1c](https://github.com/ApenasGabs/KrakenBridge-Web/commit/406ac1c12a4dac64b9c2c8715f9d7e713a83f0c5))
* categorização dinâmica e tags semânticas contextuais para conversas ([ab17545](https://github.com/ApenasGabs/KrakenBridge-Web/commit/ab175454c80657d2018ccef42c192ea91fb9235c))
* **chat:** add force send option and fix queue auto-dispatch reliability ([377c605](https://github.com/ApenasGabs/KrakenBridge-Web/commit/377c6056c8e32cc365bb6378a972ffc9721a46ba))
* **chat:** add inline file diff card and code preview viewer (Refs [#12](https://github.com/ApenasGabs/KrakenBridge-Web/issues/12)) ([7847243](https://github.com/ApenasGabs/KrakenBridge-Web/commit/78472430e4cf959cbcd5295ac415bf37cc3a103c))
* **chat:** adicionar seletor de modelos direto no prompt e reconhecimento de voz por microfone ([5c115f0](https://github.com/ApenasGabs/KrakenBridge-Web/commit/5c115f0297db77a58d914037836fb45768675fc3))
* **chat:** full terminal output cards, thinking process accordion, and robust message sync ([f201b22](https://github.com/ApenasGabs/KrakenBridge-Web/commit/f201b2251b081ab8483be17120c3ece4af8eaace))
* **chat:** renderizador visual interativo de diagramas Mermaid no Chat (Refs [#14](https://github.com/ApenasGabs/KrakenBridge-Web/issues/14)) ([74eaac2](https://github.com/ApenasGabs/KrakenBridge-Web/commit/74eaac21ca1251210f0495d4655c91291b2af523))
* **ci:** ✨ pipeline de release automatizada e changelog com semantic-release (Refs [#41](https://github.com/ApenasGabs/KrakenBridge-Web/issues/41)) ([b85edfe](https://github.com/ApenasGabs/KrakenBridge-Web/commit/b85edfed1894d79917b18d992b0ed1b8a4342f0d))
* dashboard What's Next (backlog de issues) e central de revisão interativa de PRs (closes [#22](https://github.com/ApenasGabs/KrakenBridge-Web/issues/22)) ([#23](https://github.com/ApenasGabs/KrakenBridge-Web/issues/23)) ([9f65afc](https://github.com/ApenasGabs/KrakenBridge-Web/commit/9f65afc86ba157c6f632fa4e688da1a26bf00404))
* **dashboard:** busca agnóstica de PRs/MRs, cache persistente e filtros avançados (Refs [#24](https://github.com/ApenasGabs/KrakenBridge-Web/issues/24)) ([#25](https://github.com/ApenasGabs/KrakenBridge-Web/issues/25)) ([511e539](https://github.com/ApenasGabs/KrakenBridge-Web/commit/511e539a82e2feb4b22c1bdc7fdbcd67936edc04))
* **directive:** enforce pre-action transparency narration and fix file operation card display ([7056121](https://github.com/ApenasGabs/KrakenBridge-Web/commit/70561213c11520fd569845e14d2225df72f1dad6))
* expansão da varredura global do GitHub para PRs/MRs e Issues com ordenação unificada (closes [#26](https://github.com/ApenasGabs/KrakenBridge-Web/issues/26)) ([#27](https://github.com/ApenasGabs/KrakenBridge-Web/issues/27)) ([e3fd5c8](https://github.com/ApenasGabs/KrakenBridge-Web/commit/e3fd5c85ac9d654be0af16ef859e0d731314c9e6))
* **frontend:** migrar arquitetura de Vanilla JS para React + Vite + TypeScript + DaisyUI (baseado em ApenasTemplate) ([2201fba](https://github.com/ApenasGabs/KrakenBridge-Web/commit/2201fbae633d7d5414cad79a87b16900d133fd08))
* **hub:** adicionar visao em malha interativa de agentes com React Flow e melhorar responsividade mobile ([c145e30](https://github.com/ApenasGabs/KrakenBridge-Web/commit/c145e30e61569cddbfb88f6c94f2248b129abbbc))
* **identity:** add .kraken-identity.json and inject Kraken self-awareness into system directives ([91b671b](https://github.com/ApenasGabs/KrakenBridge-Web/commit/91b671b22704d7cc0fa520fde22a6cc807653e2a))
* implementar fila de mensagens em execucao e auto-vinculacao correta de projetos ([c22310e](https://github.com/ApenasGabs/KrakenBridge-Web/commit/c22310e29aecc6a0bf82366184cbd0085f6a4ca8))
* initial commit for zimaos-antigravity-studio ([04cc7b6](https://github.com/ApenasGabs/KrakenBridge-Web/commit/04cc7b6d592012773490ffd45d35c6f4dd6aa676))
* **mcp,chat:** autenticacao manual OAuth/PIN ([#4](https://github.com/ApenasGabs/KrakenBridge-Web/issues/4)) e modo somente chat com suporte a MCPs ([#5](https://github.com/ApenasGabs/KrakenBridge-Web/issues/5)) ([f34cbb0](https://github.com/ApenasGabs/KrakenBridge-Web/commit/f34cbb076ee2a0917e2279cc4b8c4b183da6dff6))
* **mcp,chat:** autenticacao manual OAuth/PIN ([#4](https://github.com/ApenasGabs/KrakenBridge-Web/issues/4)) e modo somente chat com suporte a MCPs ([#5](https://github.com/ApenasGabs/KrakenBridge-Web/issues/5)) ([3a68d38](https://github.com/ApenasGabs/KrakenBridge-Web/commit/3a68d38737640331063d7fe864d3725a4234bf6c))
* **memory:** integrate ai-memory for cross-session long-term memory (Refs [#35](https://github.com/ApenasGabs/KrakenBridge-Web/issues/35)) ([9007144](https://github.com/ApenasGabs/KrakenBridge-Web/commit/900714436caffbfcee760e726758577e7b92d34f))
* **mobile:** melhorias de usabilidade no seletor e troca de contas no mobile ([6a269e3](https://github.com/ApenasGabs/KrakenBridge-Web/commit/6a269e3f2a92938a6663d152631fe08befe53a52))
* **quota:** alinhar cotas com padrao oficial Antigravity e limites reais ([febff95](https://github.com/ApenasGabs/KrakenBridge-Web/commit/febff95574448b2582b0105e466c46c6b03dfd21))
* **quota:** consulta oficial ao vivo de cotas do Google via agy ([aa13c30](https://github.com/ApenasGabs/KrakenBridge-Web/commit/aa13c30abc3fb4f198d5af820bd0b14d1018226c))
* **quota:** implementar rastreamento de cotas horaria e semanal com balao flutuante ([6e8b2b5](https://github.com/ApenasGabs/KrakenBridge-Web/commit/6e8b2b58e2086e45940379769d86ea84fdae100a))
* **sdlc:** garantir obrigatoriedade de assignee do usuário em issues e PRs ([62adc9b](https://github.com/ApenasGabs/KrakenBridge-Web/commit/62adc9be4c41c9a878234f06d9b927792b1782a2))
* **search:** motor de busca inteligente por conteúdo e relevância contextual (Refs [#17](https://github.com/ApenasGabs/KrakenBridge-Web/issues/17)) ([#29](https://github.com/ApenasGabs/KrakenBridge-Web/issues/29)) ([03915cc](https://github.com/ApenasGabs/KrakenBridge-Web/commit/03915ccf037be8cbf942ed60f56e49699b60a971))
* **status:** add split screen Status view with topology mesh and Orca-style AI metrics ([b1f8ddb](https://github.com/ApenasGabs/KrakenBridge-Web/commit/b1f8ddb72bb1759abce4c61e9ff0d07b0fe5a260))
* **system:** add self-evolution engine with decoupled reload and post-boot resume ([cdd1dd2](https://github.com/ApenasGabs/KrakenBridge-Web/commit/cdd1dd2f553d55a1974e435c6b55943d78ec96ee))
* **system:** implement Pod Drain pattern for zero-interruption graceful self-reload ([2378905](https://github.com/ApenasGabs/KrakenBridge-Web/commit/2378905e6d8e8a4ecf0d6fa95c460cc9d04cc6af))
* **telemetry:** auto-provisionamento out-of-the-box da stack SRE, correção do cAdvisor/containerd, alertas PromQL e chat de setup (Refs [#28](https://github.com/ApenasGabs/KrakenBridge-Web/issues/28)) ([6509875](https://github.com/ApenasGabs/KrakenBridge-Web/commit/6509875b4e229930269aa1a7100fc3df4849baac))
* **testing:** add Playwright E2E and visual regression test suite (Refs [#9](https://github.com/ApenasGabs/KrakenBridge-Web/issues/9)) ([4e1d27e](https://github.com/ApenasGabs/KrakenBridge-Web/commit/4e1d27e48f953b14df0a8f98362885784114d1b7))
* **whats-next:** migrar serviço de coleta do GitHub para API GraphQL nativa com alta performance ([#32](https://github.com/ApenasGabs/KrakenBridge-Web/issues/32)) ([6e8d8e6](https://github.com/ApenasGabs/KrakenBridge-Web/commit/6e8d8e63b05cf86810c0678a482744f17dfe9bfc)), closes [#31](https://github.com/ApenasGabs/KrakenBridge-Web/issues/31)
* **whatsnext:** implementar cache local e sincronização a cada 5 minutos (Refs [#33](https://github.com/ApenasGabs/KrakenBridge-Web/issues/33)) ([#34](https://github.com/ApenasGabs/KrakenBridge-Web/issues/34)) ([cca11df](https://github.com/ApenasGabs/KrakenBridge-Web/commit/cca11df0ac3ddc459ee95c06016a7635d3daaae1))
* **workflow:** implement structured SDLC GitHub Flow (Issue -> Branch -> PR -> Manual Approval) ([372b050](https://github.com/ApenasGabs/KrakenBridge-Web/commit/372b050e02aec233ab2a8a1124ae74d46d528a5f))

### 🐛 Bug Fixes

* **auth:** auto-detect PIN changes, clear stale token and enforce Anytype documentation directive ([8294003](https://github.com/ApenasGabs/KrakenBridge-Web/commit/8294003828acfe06c00cc72a4f00fe9c6158f7f7))
* **auth:** detectar sessao ativa do Antigravity CLI e exibir conta conectada no modal ([0874555](https://github.com/ApenasGabs/KrakenBridge-Web/commit/08745551f73795d3ff9b24c032641eac96133b2e))
* **auth:** permitir self-reload a partir de localhost sem PIN ([97e113f](https://github.com/ApenasGabs/KrakenBridge-Web/commit/97e113fc31ee027adf0af5ab533c588524a92385))
* **chat:** exibir comandos executados, saida detalhada e deduplicar steps de ferramentas ([7e1652a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/7e1652a7ec73fb41cf1efb96564ce0cb46ebdcc2))
* **chat:** manter execucao do agente em background ao sair da tela e persistir historico incrementalmente ([dd82fa6](https://github.com/ApenasGabs/KrakenBridge-Web/commit/dd82fa6d24c0fdfbd600015528334db6f6b7941a))
* **chat:** stream thinking deltas, flush SSE headers, and prevent aborting background tasks on client disconnect ([2bceabb](https://github.com/ApenasGabs/KrakenBridge-Web/commit/2bceabbe75fec03ea6645d787a745df28b6e5d2a))
* **cli:** alinhar selecao de modelos e modos aos parametros aceitos pelo Antigravity CLI ([a80c1ae](https://github.com/ApenasGabs/KrakenBridge-Web/commit/a80c1ae94eaef59079be1b01fc4702883faa7164))
* conversation switching reactivity and agyConvId destructuring ([c2b7a52](https://github.com/ApenasGabs/KrakenBridge-Web/commit/c2b7a525d15386ed606d821872919278506c82f4))
* **docker:** configurar timezone padrão America/Sao_Paulo no krakenbridge-web (Refs [#18](https://github.com/ApenasGabs/KrakenBridge-Web/issues/18)) ([a9c541a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/a9c541a68279ada656194d14df68ebf00a6662f2))
* **frontend:** resolve React hook error [#310](https://github.com/ApenasGabs/KrakenBridge-Web/issues/310) in AuthModal (Closes [#8](https://github.com/ApenasGabs/KrakenBridge-Web/issues/8)) ([3d57559](https://github.com/ApenasGabs/KrakenBridge-Web/commit/3d575593bbcb3cb9dd5c6e7ebf5f612d1b6f0140))
* **mobile:** corrigir responsividade do header, seletor de temas e overflow no mobile (Refs [#15](https://github.com/ApenasGabs/KrakenBridge-Web/issues/15)) ([52bd9a1](https://github.com/ApenasGabs/KrakenBridge-Web/commit/52bd9a12779aaee7b672a5dd1ed008b08dae2927))
* resolve mermaid syntax error and add ghcr docker publish workflow ([990c854](https://github.com/ApenasGabs/KrakenBridge-Web/commit/990c85433c1549d799b36f015161fc81d7c35865))
* **stability:** use node:sqlite, prevent orphaned agy processes, and add atomic writes ([9dfe86a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/9dfe86a19cbeccf33cd7d40eb02b815447f20fb8))
* **supervisor:** exclude PID 1 when detecting node server process in self-reload.sh ([a5a822b](https://github.com/ApenasGabs/KrakenBridge-Web/commit/a5a822bc0e840ed5fd9b290549162bf4585251ba))
* **telemetry:** ajustar flags containerd/moby e limites de RAM da stack para evitar swap thrashing (Refs [#28](https://github.com/ApenasGabs/KrakenBridge-Web/issues/28)) ([99dbf3a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/99dbf3a1c36dc3d022445b915d39ee2e5bceb17c))
* **ui:** corrigir renderizacao de inline code no markdown e adicionar keep-alive no sse ([cbfed96](https://github.com/ApenasGabs/KrakenBridge-Web/commit/cbfed96d3acc5bd7ea6c0502d3f58eed76432999))

### 📚 Documentation

* **changelog:** 📚 gerar histórico retroativo completo da v1.0.0 (Refs [#41](https://github.com/ApenasGabs/KrakenBridge-Web/issues/41)) ([8e54d3d](https://github.com/ApenasGabs/KrakenBridge-Web/commit/8e54d3d83a813996a154593635cc181746f9b851))
* **cicd:** registrar regra de deploy automático contínuo via Vercel ([ea5d2bf](https://github.com/ApenasGabs/KrakenBridge-Web/commit/ea5d2bfc269d9e90ecccc40c1e26342f5299a924))
* document Kraken architecture, self-evolution and Pod Drain pattern ([78e3020](https://github.com/ApenasGabs/KrakenBridge-Web/commit/78e3020700fa316d827c6506cadaf03fe44dc9a0))
* **identity:** add pull --rebase and push steps to self-evolution protocol ([5d12dfa](https://github.com/ApenasGabs/KrakenBridge-Web/commit/5d12dfa1c993e40de6a9660fd32efa0fc4a5649b))
* **identity:** enforce git commit step in self-evolution directives ([bdb0bc6](https://github.com/ApenasGabs/KrakenBridge-Web/commit/bdb0bc6d29734ec9b011a61e9e4fdde1534fc575))
* sync homelab and dashboard visibility directives in kraken identity ([7583d03](https://github.com/ApenasGabs/KrakenBridge-Web/commit/7583d0314e95b75447caf54e1d0240e3aacfe53f))

### 👌 Styles

* aperfeicoar responsividade da navbar, tabs e drawer da sidebar ([5a39148](https://github.com/ApenasGabs/KrakenBridge-Web/commit/5a3914853123c2d6b88a877f210df8ffb299ee8e))
* clean up README header and remove distorted ascii art ([ebd20e6](https://github.com/ApenasGabs/KrakenBridge-Web/commit/ebd20e6cb17dbed126f5217faccf7fb862babdda))

### ♻️ Refactoring

* modular architecture, conversation history sidebar, advanced CLI options, and clean SVG UI ([5d438ad](https://github.com/ApenasGabs/KrakenBridge-Web/commit/5d438adfd63d5de01f4005d5a2f699aaee1b7372))

### 🧱 CI/CD

* add GitHub Actions workflow as blocking check for merges (Refs [#9](https://github.com/ApenasGabs/KrakenBridge-Web/issues/9)) ([f22493e](https://github.com/ApenasGabs/KrakenBridge-Web/commit/f22493e9037796f3898a6cc19398e06a7aace620))

### 🔧 Chores

* atualizar package-lock.json com vercel ([655f50c](https://github.com/ApenasGabs/KrakenBridge-Web/commit/655f50cc9aa892c16d11f5022aef014b5b7206c2))
* **docker:** update docker-compose and appstore manifests with full homelab autonomy mounts ([4caf1fb](https://github.com/ApenasGabs/KrakenBridge-Web/commit/4caf1fb122e8e65518b6f9da50eb51d644988cd5))
* merge main ([#36](https://github.com/ApenasGabs/KrakenBridge-Web/issues/36)) into feat/[#28](https://github.com/ApenasGabs/KrakenBridge-Web/issues/28)-out-of-box-telemetry-and-autoconfig ([95fe556](https://github.com/ApenasGabs/KrakenBridge-Web/commit/95fe55677a99c7e25b102d66a32c09ce9f73217d))

## 1.0.0 (2026-10-16)

### ✨ Features

* **chat:** renderizador visual interativo de diagramas Mermaid no Chat (Refs [#14](https://github.com/ApenasGabs/KrakenBridge-Web/issues/14)) ([74eaac2](https://github.com/ApenasGabs/KrakenBridge-Web/commit/74eaac21ca1251210f0495d4655c91291b2af523))
* **telemetry:** auto-provisionamento out-of-the-box da stack SRE, correção do cAdvisor/containerd, alertas PromQL e chat de setup (Refs [#28](https://github.com/ApenasGabs/KrakenBridge-Web/issues/28)) ([6509875](https://github.com/ApenasGabs/KrakenBridge-Web/commit/6509875b4e229930269aa1a7100fc3df4849baac))
* **memory:** integrate ai-memory for cross-session long-term memory (Refs [#35](https://github.com/ApenasGabs/KrakenBridge-Web/issues/35)) ([9007144](https://github.com/ApenasGabs/KrakenBridge-Web/commit/900714436caffbfcee760e726758577e7b92d34f))
* **whatsnext:** implementar cache local e sincronização a cada 5 minutos (Refs [#33](https://github.com/ApenasGabs/KrakenBridge-Web/issues/33)) ([#34](https://github.com/ApenasGabs/KrakenBridge-Web/pull/34)) ([cca11df](https://github.com/ApenasGabs/KrakenBridge-Web/commit/cca11df0ac3ddc459ee95c06016a7635d3daaae1))
* **whats-next:** migrar serviço de coleta do GitHub para API GraphQL nativa com alta performance ([#32](https://github.com/ApenasGabs/KrakenBridge-Web/pull/32)) ([6e8d8e6](https://github.com/ApenasGabs/KrakenBridge-Web/commit/6e8d8e63b05cf86810c0678a482744f17dfe9bfc))
* **search:** motor de busca inteligente por conteúdo e relevância contextual (Refs [#17](https://github.com/ApenasGabs/KrakenBridge-Web/issues/17)) ([#29](https://github.com/ApenasGabs/KrakenBridge-Web/pull/29)) ([03915cc](https://github.com/ApenasGabs/KrakenBridge-Web/commit/03915ccf037be8cbf942ed60f56e49699b60a971))
* expansão da varredura global do GitHub para PRs/MRs e Issues com ordenação unificada (closes [#26](https://github.com/ApenasGabs/KrakenBridge-Web/issues/26)) ([#27](https://github.com/ApenasGabs/KrakenBridge-Web/pull/27)) ([e3fd5c8](https://github.com/ApenasGabs/KrakenBridge-Web/commit/e3fd5c85ac9d654be0af16ef859e0d731314c9e6))
* **dashboard:** busca agnóstica de PRs/MRs, cache persistente e filtros avançados (Refs [#24](https://github.com/ApenasGabs/KrakenBridge-Web/issues/24)) ([#25](https://github.com/ApenasGabs/KrakenBridge-Web/pull/25)) ([511e539](https://github.com/ApenasGabs/KrakenBridge-Web/commit/511e539a82e2feb4b22c1bdc7fdbcd67936edc04))
* **sdlc:** garantir obrigatoriedade de assignee do usuário em issues e PRs ([62adc9b](https://github.com/ApenasGabs/KrakenBridge-Web/commit/62adc9be4c41c9a878234f06d9b927792b1782a2))
* dashboard What's Next (backlog de issues) e central de revisão interativa de PRs (closes [#22](https://github.com/ApenasGabs/KrakenBridge-Web/issues/22)) ([#23](https://github.com/ApenasGabs/KrakenBridge-Web/pull/23)) ([9f65afc](https://github.com/ApenasGabs/KrakenBridge-Web/commit/9f65afc86ba157c6f632fa4e688da1a26bf00404))
* **directive:** enforce pre-action transparency narration and fix file operation card display ([7056121](https://github.com/ApenasGabs/KrakenBridge-Web/commit/70561213c11520fd569845e14d2225df72f1dad6))
* **auth:** adicionar suporte e integração completa ao Vercel CLI via Device Code Flow e PAT (Refs [#20](https://github.com/ApenasGabs/KrakenBridge-Web/issues/20)) ([a509a0d](https://github.com/ApenasGabs/KrakenBridge-Web/commit/a509a0d5e0145e0e5a3187b4ce79352c2bccc644))
* **chat:** add inline file diff card and code preview viewer (Refs [#12](https://github.com/ApenasGabs/KrakenBridge-Web/issues/12)) ([7847243](https://github.com/ApenasGabs/KrakenBridge-Web/commit/78472430e4cf959cbcd5295ac415bf37cc3a103c))
* **testing:** add Playwright E2E and visual regression test suite (Refs [#9](https://github.com/ApenasGabs/KrakenBridge-Web/issues/9)) ([4e1d27e](https://github.com/ApenasGabs/KrakenBridge-Web/commit/4e1d27e48f953b14df0a8f98362885784114d1b7))
* **workflow:** implement structured SDLC GitHub Flow (Issue -> Branch -> PR -> Manual Approval) ([372b050](https://github.com/ApenasGabs/KrakenBridge-Web/commit/372b050e02aec233ab2a8a1124ae74d46d528a5f))
* **backend:** transcrever backend para TypeScript com zero downtime e pod drain ([c9ff5e2](https://github.com/ApenasGabs/KrakenBridge-Web/commit/c9ff5e2950ef7215080d09a5bc710e4898cb0195))
* categorização dinâmica e tags semânticas contextuais para conversas ([ab17545](https://github.com/ApenasGabs/KrakenBridge-Web/commit/ab175454c80657d2018ccef42c192ea91fb9235c))
* **chat:** full terminal output cards, thinking process accordion, and robust message sync ([f201b22](https://github.com/ApenasGabs/KrakenBridge-Web/commit/f201b2251b081ab8483be17120c3ece4af8eaace))
* **autonomy:** grant Kraken full autonomy to manage Docker, CasaOS apps and Homelab on ZimaOS ([c08f0a4](https://github.com/ApenasGabs/KrakenBridge-Web/commit/c08f0a48c479d1aba35d41785ef17cdef7e73ec9))
* **status:** add split screen Status view with topology mesh and Orca-style AI metrics ([b1f8ddb](https://github.com/ApenasGabs/KrakenBridge-Web/commit/b1f8ddb72bb1759abce4c61e9ff0d07b0fe5a260))
* **chat:** add force send option and fix queue auto-dispatch reliability ([377c605](https://github.com/ApenasGabs/KrakenBridge-Web/commit/377c6056c8e32cc365bb6378a972ffc9721a46ba))
* **identity:** add .kraken-identity.json and inject Kraken self-awareness into system directives ([91b671b](https://github.com/ApenasGabs/KrakenBridge-Web/commit/91b671b22704d7cc0fa520fde22a6cc807653e2a))
* **system:** implement Pod Drain pattern for zero-interruption graceful self-reload ([2378905](https://github.com/ApenasGabs/KrakenBridge-Web/commit/2378905e6d8e8a4ecf0d6fa95c460cc9d04cc6af))
* **system:** add self-evolution engine with decoupled reload and post-boot resume ([cdd1dd2](https://github.com/ApenasGabs/KrakenBridge-Web/commit/cdd1dd2f553d55a1974e435c6b55943d78ec96ee))
* **agent:** support isolated multi-account execution per chat session ([b50b5c8](https://github.com/ApenasGabs/KrakenBridge-Web/commit/b50b5c8684543896167c120c6faa937c1b788f4c))
* **auth:** add GitHub CLI Device Code flow and PAT login in AuthModal ([214eb64](https://github.com/ApenasGabs/KrakenBridge-Web/commit/214eb64dda2b010dab58d56a960051b6e0b6f0c1))
* **mcp,chat:** autenticacao manual OAuth/PIN ([#4](https://github.com/ApenasGabs/KrakenBridge-Web/pull/4)) e modo somente chat com suporte a MCPs ([#5](https://github.com/ApenasGabs/KrakenBridge-Web/pull/5)) ([f34cbb0](https://github.com/ApenasGabs/KrakenBridge-Web/commit/f34cbb076ee2a0917e2279cc4b8c4b183da6dff6))
* **mcp,chat:** autenticacao manual OAuth/PIN ([#4](https://github.com/ApenasGabs/KrakenBridge-Web/pull/4)) e modo somente chat com suporte a MCPs ([#5](https://github.com/ApenasGabs/KrakenBridge-Web/pull/5)) ([3a68d38](https://github.com/ApenasGabs/KrakenBridge-Web/commit/3a68d38737640331063d7fe864d3725a4234bf6c))
* **mobile:** melhorias de usabilidade no seletor e troca de contas no mobile ([6a269e3](https://github.com/ApenasGabs/KrakenBridge-Web/commit/6a269e3f2a92938a6663d152631fe08befe53a52))
* **quota:** consulta oficial ao vivo de cotas do Google via agy ([aa13c30](https://github.com/ApenasGabs/KrakenBridge-Web/commit/aa13c30abc3fb4f198d5af820bd0b14d1018226c))
* **auth:** suporte a multiplas contas com alternancia em 1-clique e correcao do fluxo oauth ([d7bff23](https://github.com/ApenasGabs/KrakenBridge-Web/commit/d7bff2391af28dd52c1c94f1914c3074c2b7c3cd))
* implementar fila de mensagens em execucao e auto-vinculacao correta de projetos ([c22310e](https://github.com/ApenasGabs/KrakenBridge-Web/commit/c22310e29aecc6a0bf82366184cbd0085f6a4ca8))
* **hub:** adicionar visao em malha interativa de agentes com React Flow e melhorar responsividade mobile ([c145e30](https://github.com/ApenasGabs/KrakenBridge-Web/commit/c145e30e61569cddbfb88f6c94f2248b129abbbc))
* adicionar intellisense de comandos slash no prompt e gestor de servidores mcp ([dbbd6f9](https://github.com/ApenasGabs/KrakenBridge-Web/commit/dbbd6f94e2eb62cf4b51f53c0c2d5687f4402a70))
* **chat:** adicionar seletor de modelos direto no prompt e reconhecimento de voz por microfone ([5c115f0](https://github.com/ApenasGabs/KrakenBridge-Web/commit/5c115f0297db77a58d914037836fb45768675fc3))
* **quota:** alinhar cotas com padrao oficial Antigravity e limites reais ([febff95](https://github.com/ApenasGabs/KrakenBridge-Web/commit/febff95574448b2582b0105e466c46c6b03dfd21))
* **quota:** implementar rastreamento de cotas horaria e semanal com balao flutuante ([6e8b2b5](https://github.com/ApenasGabs/KrakenBridge-Web/commit/6e8b2b58e2086e45940379769d86ea84fdae100a))
* **frontend:** migrar arquitetura de Vanilla JS para React + Vite + TypeScript + DaisyUI (baseado em ApenasTemplate) ([2201fba](https://github.com/ApenasGabs/KrakenBridge-Web/commit/2201fbae633d7d5414cad79a87b16900d133fd08))
* add integrated web-based authentication modal and inline OAuth flow ([baaf8da](https://github.com/ApenasGabs/KrakenBridge-Web/commit/baaf8da48d5b5e8a143db72183860f4083079a65))
* add CasaOS/ZimaOS official AppStore v2 package and specifications ([983f537](https://github.com/ApenasGabs/KrakenBridge-Web/commit/983f5370d126772da55288b7220d3bcd826ff6bd))
* brand project as krakenbridge-web and add multi-agent support ([406ac1c](https://github.com/ApenasGabs/KrakenBridge-Web/commit/406ac1c12a4dac64b9c2c8715f9d7e713a83f0c5))
* initial commit for zimaos-antigravity-studio ([04cc7b6](https://github.com/ApenasGabs/KrakenBridge-Web/commit/04cc7b6d592012773490ffd45d35c6f4dd6aa676))

### 🐛 Bug Fixes

* **telemetry:** ajustar flags containerd/moby e limites de RAM da stack para evitar swap thrashing (Refs [#28](https://github.com/ApenasGabs/KrakenBridge-Web/issues/28)) ([99dbf3a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/99dbf3a1c36dc3d022445b915d39ee2e5bceb17c))
* **auth:** auto-detect PIN changes, clear stale token and enforce Anytype documentation directive ([8294003](https://github.com/ApenasGabs/KrakenBridge-Web/commit/8294003828acfe06c00cc72a4f00fe9c6158f7f7))
* **auth:** permitir self-reload a partir de localhost sem PIN ([97e113f](https://github.com/ApenasGabs/KrakenBridge-Web/commit/97e113fc31ee027adf0af5ab533c588524a92385))
* **docker:** configurar timezone padrão America/Sao_Paulo no krakenbridge-web (Refs [#18](https://github.com/ApenasGabs/KrakenBridge-Web/issues/18)) ([a9c541a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/a9c541a68279ada656194d14df68ebf00a6662f2))
* **mobile:** corrigir responsividade do header, seletor de temas e overflow no mobile (Refs [#15](https://github.com/ApenasGabs/KrakenBridge-Web/issues/15)) ([52bd9a1](https://github.com/ApenasGabs/KrakenBridge-Web/commit/52bd9a12779aaee7b672a5dd1ed008b08dae2927))
* **chat:** stream thinking deltas, flush SSE headers, and prevent aborting background tasks on client disconnect ([2bceabb](https://github.com/ApenasGabs/KrakenBridge-Web/commit/2bceabbe75fec03ea6645d787a745df28b6e5d2a))
* **stability:** use node:sqlite, prevent orphaned agy processes, and add atomic writes ([9dfe86a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/9dfe86a19cbeccf33cd7d40eb02b815447f20fb8))
* **frontend:** resolve React hook error #310 in AuthModal (closes [#8](https://github.com/ApenasGabs/KrakenBridge-Web/issues/8)) ([3d57559](https://github.com/ApenasGabs/KrakenBridge-Web/commit/3d575593bbcb3cb9dd5c6e7ebf5f612d1b6f0140))
* **supervisor:** exclude PID 1 when detecting node server process in self-reload.sh ([a5a822b](https://github.com/ApenasGabs/KrakenBridge-Web/commit/a5a822bc0e840ed5fd9b290549162bf4585251ba))
* **chat:** manter execucao do agente em background ao sair da tela e persistir historico incrementalmente ([dd82fa6](https://github.com/ApenasGabs/KrakenBridge-Web/commit/dd82fa6d24c0fdfbd600015528334db6f6b7941a))
* **ui:** corrigir renderizacao de inline code no markdown e adicionar keep-alive no sse ([cbfed96](https://github.com/ApenasGabs/KrakenBridge-Web/commit/cbfed96d3acc5bd7ea6c0502d3f58eed76432999))
* **chat:** exibir comandos executados, saida detalhada e deduplicar steps de ferramentas ([7e1652a](https://github.com/ApenasGabs/KrakenBridge-Web/commit/7e1652a7ec73fb41cf1efb96564ce0cb46ebdcc2))
* **cli:** alinhar selecao de modelos e modos aos parametros aceitos pelo Antigravity CLI ([a80c1ae](https://github.com/ApenasGabs/KrakenBridge-Web/commit/a80c1ae94eaef59079be1b01fc4702883faa7164))
* **auth:** detectar sessao ativa do Antigravity CLI e exibir conta conectada no modal ([0874555](https://github.com/ApenasGabs/KrakenBridge-Web/commit/08745551f73795d3ff9b24c032641eac96133b2e))
* conversation switching reactivity and agyConvId destructuring ([c2b7a52](https://github.com/ApenasGabs/KrakenBridge-Web/commit/c2b7a525d15386ed606d821872919278506c82f4))
* resolve mermaid syntax error and add ghcr docker publish workflow ([990c854](https://github.com/ApenasGabs/KrakenBridge-Web/commit/990c85433c1549d799b36f015161fc81d7c35865))

### 📚 Documentation

* **cicd:** registrar regra de deploy automático contínuo via Vercel ([ea5d2bf](https://github.com/ApenasGabs/KrakenBridge-Web/commit/ea5d2bfc269d9e90ecccc40c1e26342f5299a924))
* sync homelab and dashboard visibility directives in kraken identity ([7583d03](https://github.com/ApenasGabs/KrakenBridge-Web/commit/7583d0314e95b75447caf54e1d0240e3aacfe53f))
* document Kraken architecture, self-evolution and Pod Drain pattern ([78e3020](https://github.com/ApenasGabs/KrakenBridge-Web/commit/78e3020700fa316d827c6506cadaf03fe44dc9a0))
* **identity:** add pull --rebase and push steps to self-evolution protocol ([5d12dfa](https://github.com/ApenasGabs/KrakenBridge-Web/commit/5d12dfa1c993e40de6a9660fd32efa0fc4a5649b))
* **identity:** enforce git commit step in self-evolution directives ([bdb0bc6](https://github.com/ApenasGabs/KrakenBridge-Web/commit/bdb0bc6d29734ec9b011a61e9e4fdde1534fc575))

### 👌 Styles

* aperfeicoar responsividade da navbar, tabs e drawer da sidebar ([5a39148](https://github.com/ApenasGabs/KrakenBridge-Web/commit/5a3914853123c2d6b88a877f210df8ffb299ee8e))
* clean up README header and remove distorted ascii art ([ebd20e6](https://github.com/ApenasGabs/KrakenBridge-Web/commit/ebd20e6cb17dbed126f5217faccf7fb862babdda))

### ♻️ Refactoring

* modular architecture, conversation history sidebar, advanced CLI options, and clean SVG UI ([5d438ad](https://github.com/ApenasGabs/KrakenBridge-Web/commit/5d438adfd63d5de01f4005d5a2f699aaee1b7372))

### 🧱 CI/CD

* add GitHub Actions workflow as blocking check for merges (Refs [#9](https://github.com/ApenasGabs/KrakenBridge-Web/issues/9)) ([f22493e](https://github.com/ApenasGabs/KrakenBridge-Web/commit/f22493e9037796f3898a6cc19398e06a7aace620))

### 🔧 Chores

* atualizar package-lock.json com vercel ([655f50c](https://github.com/ApenasGabs/KrakenBridge-Web/commit/655f50cc9aa892c16d11f5022aef014b5b7206c2))
* **docker:** update docker-compose and appstore manifests with full homelab autonomy mounts ([4caf1fb](https://github.com/ApenasGabs/KrakenBridge-Web/commit/4caf1fb122e8e65518b6f9da50eb51d644988cd5))
