#!/usr/bin/env node
/**
 * Kraken Skill Scout - Dynamic Just-In-Time Skill Acquisition Hook (PreInvocation)
 * Two-stage Hybrid Architecture:
 * - Stage 1 (0ms / 0 quota): Instant dictionary match for explicit tech terms.
 * - Stage 2 (Flash Router): Semantic classification via gemini-3.8-flash-low in an isolated,
 *   MCP-free sandbox (or REST API) to interpret natural language & voice-to-text typos without
 *   spending tokens or quota from the user's primary model (Claude Opus / Gemini 4 Argon).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Proteção contra recursão quando o próprio Scout invoca o agy
if (process.env.SKILL_SCOUT_INTERNAL === "1") {
  process.stdout.write("{}\n");
  process.exit(0);
}

const LOG_FILE = "/root/.gemini/config/skill-scout.log";
const GLOBAL_SKILLS_DIR = "/root/.gemini/config/skills";
const SCOUT_HOME = "/tmp/kraken-scout-home";

function log(msg) {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`);
  } catch {}
}

const PT_TO_EN = {
  // Metodologias Ágeis, PO e Gestão de Produto
  "pio": "product-owner", "po": "product-owner", "product-owner": "product-owner", "pm": "product-manager",
  "demandas": "agile", "demanda": "agile", "escopo": "scrum", "tarefas": "backlog", "backlog": "backlog",
  "requisitos": "user-stories", "sprint": "sprint", "priorizar": "prioritization", "historias": "user-stories",
  // Conceitos de Desenvolvimento
  "animacao": "animation", "animacoes": "animation", "animação": "animation", "animações": "animation",
  "migracao": "migration", "migracoes": "migration", "migração": "migration", "migrações": "migration",
  "fila": "queue", "filas": "queue", "autenticacao": "auth", "autenticação": "auth",
  "seguranca": "security", "segurança": "security", "estilizacao": "styling", "estilização": "styling",
  "componentes": "components", "componente": "component", "estado": "state", "roteamento": "routing",
  "consulta": "query", "consultas": "queries", "otimizacao": "optimization", "otimização": "optimization",
  "banco": "database", "testes": "testing", "teste": "testing", "pagamento": "payment", "pagamentos": "payments",
  "cache": "caching", "deploy": "deployment", "container": "docker", "containers": "docker"
};

const TECH_SIGNALS = new Set([
  // Gestão / Ágil / Product Owner
  "product-owner","product-manager","agile","scrum","kanban","backlog","sprint","jira","user-stories",
  // Frontend
  "react","nextjs","next","vue","nuxt","svelte","sveltekit","astro","angular","remix","solidjs",
  "tailwind","tailwindcss","shadcn","radix","daisyui","bootstrap","sass",
  "framer","motion","gsap","threejs","three","webgl","canvas","d3","chartjs","recharts",
  // Backend & Databases
  "drizzle","prisma","typeorm","sequelize","mongoose","knex","kysely","supabase","firebase","neon","planetscale","turso",
  "postgres","postgresql","mysql","sqlite","mongodb","redis","valkey","upstash","elasticsearch","qdrant","pgvector",
  "bullmq","rabbitmq","kafka","celery","temporal","inngest","trigger",
  // Testes & QA
  "playwright","cypress","vitest","jest","testing-library","puppeteer","selenium","k6",
  // Infra & DevOps
  "docker","kubernetes","k8s","helm","terraform","ansible","nginx","traefik","caddy","cloudflare","vercel","aws","gcp","azure",
  "fastapi","flask","django","pydantic","sqlalchemy","alembic","pytest",
  "express","fastify","nestjs","hono","elysia","trpc","graphql","apollo","urql","grpc","websocket","webrtc","socketio",
  "zustand","redux","jotai","recoil","mobx","tanstack","react-query","swr","axios","zod","valibot","yup","react-hook-form",
  "stripe","mercadopago","paypal","clerk","auth0","nextauth","lucia","better-auth","oauth","jwt","passkey",
  "expo","react-native","flutter","swift","kotlin","electron","tauri","capacitor",
  "rust","golang","python","typescript","bun","deno","zig",
  "ffmpeg","sharp","imagemagick","ocr","langchain","llamaindex","rag"
]);

const STOPWORDS = new Set([
  "o","a","os","as","um","uma","uns","umas","de","do","da","dos","das","em","no","na","nos","nas",
  "por","para","pra","com","sem","sob","sobre","entre","ate","apos","contra","desde","como","que",
  "qual","quais","quando","onde","quem","porque","porquê","isso","isto","aquilo","este","esta",
  "esse","essa","aquele","aquela","meu","minha","meus","minhas","seu","sua","seus","suas","nosso",
  "nossa","quero","preciso","gostaria","pode","poderia","fazer","criar","configurar","ajustar",
  "arrumar","corrigir","erro","bug","problema","ajuda","me","te","se","lhe","nos","vos","lhes",
  "oi","ola","olá","bom","boa","dia","tarde","noite","tudo","bem","ai","aí","aqui","la","lá",
  "seria","bom","toda","vez","mandar","alguma","coisa","olhar","estou","falando","procurar",
  "melhor","skill","skills","depois","iniciar","outro","agente","respondendo","algo","assim","deu","certo",
  "retornou","usar","usando","implementar","adicionar","instalar","projeto","sistema","app",
  "aplicacao","aplicação","codigo","código","arquivo","funcao","função","pagina","página","tela",
  "kraken","antigravity","paperclip","homelab","zimaos","gabisa","mcp"
]);

function stripSystemDirective(rawInput) {
  if (!rawInput || typeof rawInput !== "string") return "";
  let text = rawInput;

  if (text.includes("[DIRETIVA_DO_SISTEMA")) {
    const endMarker = "[FIM_DA_DIRETIVA_DO_SISTEMA]\n\n";
    const idxEnd = text.lastIndexOf(endMarker);
    if (idxEnd !== -1) {
      return text.slice(idxEnd + endMarker.length).trim();
    }

    const chatMarker = "quando solicitado.\n\n";
    const codeMarker = "/api/system/telemetry/provision\n\n";

    const idxChat = text.lastIndexOf(chatMarker);
    if (idxChat !== -1) {
      return text.slice(idxChat + chatMarker.length).trim();
    }
    const idxCode = text.lastIndexOf(codeMarker);
    if (idxCode !== -1) {
      return text.slice(idxCode + codeMarker.length).trim();
    }

    const lines = text.split("\n");
    let inDirective = true;
    const cleanLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (inDirective) {
        if (line.includes("quando solicitado.") || line.includes("/api/system/telemetry/provision") || (i > 10 && line.trim() === "")) {
          inDirective = false;
        }
      } else {
        cleanLines.push(line);
      }
    }
    if (cleanLines.length > 0) return cleanLines.join("\n").trim();
  }
  return text.trim();
}

function extractTechTokensFast(userPrompt) {
  const lower = userPrompt.toLowerCase().replace(/[^a-z0-9áàâãéêíóôõúç\- ]/gi, " ");
  const rawTokens = lower.split(/\s+/).filter(Boolean);
  const tech = [];
  const context = [];

  for (const t of rawTokens) {
    if (TECH_SIGNALS.has(t)) {
      tech.push(t);
    } else if (PT_TO_EN[t]) {
      tech.push(PT_TO_EN[t]);
    } else if (
      t.length >= 3 &&
      !STOPWORDS.has(t) &&
      (/^[a-z0-9]+-[a-z0-9]+$/.test(t) || /(js|ts|db|ql|ui|orm|sdk|cli|api|css|gl)$/.test(t))
    ) {
      tech.push(t);
    }
  }
  return {
    tech: [...new Set(tech)],
    context: [...new Set(context)]
  };
}

/**
 * Classificador Semântico com Gemini 3.8 Flash Low (Estágio 2)
 * Roda em sandbox limpo sem MCPs, garantindo 0 consumo do modelo principal (Argon/Opus).
 */
function classifyWithFlash(userPrompt) {
  const cliDir = path.join(SCOUT_HOME, ".gemini", "antigravity-cli");
  fs.mkdirSync(cliDir, { recursive: true });

  const tokenSrc = "/root/.gemini/antigravity-cli/antigravity-oauth-token";
  const tokenDst = path.join(cliDir, "antigravity-oauth-token");
  try {
    if (!fs.existsSync(tokenDst) && fs.existsSync(tokenSrc)) {
      fs.symlinkSync(tokenSrc, tokenDst);
    }
  } catch {}

  const sysPrompt = `You are a skills.sh search query router.
Given this user request (which may be in Portuguese or have voice-to-text transcription errors, e.g. "pio" -> product owner, "ixos" -> issues, "esqui" -> skill, "mergem" -> git merge):
${JSON.stringify(userPrompt)}

Output ONLY 1 to 2 English search terms to find relevant Agent Skills on skills.sh (e.g. "product-owner", "threejs shaders", "bullmq redis", "e2e testing", "tailwind"), or "NONE" if casual chat or general question without specialized framework/runbook. No explanation, just the terms.`;

  try {
    const raw = execSync(
      `agy -p ${JSON.stringify(sysPrompt)} --model gemini-3.8-flash-low --effort low --disable-slash-commands`,
      {
        cwd: SCOUT_HOME,
        env: { ...process.env, HOME: SCOUT_HOME, SKILL_SCOUT_INTERNAL: "1" },
        timeout: 10000,
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).toString().trim();

    const clean = raw.replace(/["\x27\n\r]/g, "").trim().toLowerCase();
    if (!clean || clean === "none" || clean.length < 3) return null;
    return clean.split(/\s+/).slice(0, 3);
  } catch (err) {
    log(`Flash classifier error: ${err.message || err}`);
    return null;
  }
}

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  try {
    return execSync("gh auth token", { timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function searchCandidates(tech, context = []) {
  if (!tech || tech.length === 0) return [];
  const queries = [tech.slice(0, 2).join(" ")];
  if (tech.length > 1) {
    for (const t of tech.slice(0, 2)) {
      if (!queries.includes(t)) queries.push(t);
    }
  }

  for (const q of queries) {
    try {
      const url = `https://skills.sh/api/search?q=${encodeURIComponent(q)}&limit=10`;
      const res = await fetchWithTimeout(url, {}, 2500);
      if (!res.ok) continue;
      const data = await res.json();
      const candidates = (data.skills || []).filter(s => (s.installs || 0) >= 15);
      if (candidates.length === 0) continue;

      const scored = candidates.map(s => {
        const idLower = `${s.skillId || ""} ${s.name || ""}`.toLowerCase();
        let score = Math.log10((s.installs || 1) + 1);
        let matchedTech = false;
        for (const t of tech) {
          const tClean = t.replace(/-/g, " ");
          if (idLower.includes(t) || idLower.includes(tClean)) {
            score += 10;
            matchedTech = true;
          }
        }
        for (const c of context) {
          if (idLower.includes(c)) score += 5;
        }
        return { ...s, score, matchedTech };
      }).filter(s => s.matchedTech).sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        return scored;
      }
    } catch {}
  }

  return [];
}

async function downloadSkillMd(source, skillId) {
  const token = getGitHubToken();
  const headers = { "User-Agent": "Kraken-Skill-Scout" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const treeUrl = `https://api.github.com/repos/${source}/git/trees/HEAD?recursive=1`;
  const treeRes = await fetchWithTimeout(treeUrl, { headers }, 3000);
  if (!treeRes.ok) return null;
  const treeData = await treeRes.json();
  const entries = treeData.tree || [];

  const slug = (skillId || "").toLowerCase();
  let mdEntry = entries.find(e => e.path.toLowerCase().endsWith(`/${slug}/skill.md`) || e.path.toLowerCase() === `${slug}/skill.md`);
  if (!mdEntry) {
    mdEntry = entries.find(e => e.path.toLowerCase().endsWith("/skill.md") && e.path.toLowerCase().includes(slug));
  }
  if (!mdEntry) {
    mdEntry = entries.find(e => e.path.toLowerCase() === "skill.md");
  }
  if (!mdEntry) return null;

  const rawUrl = `https://raw.githubusercontent.com/${source}/HEAD/${mdEntry.path}`;
  const rawRes = await fetchWithTimeout(rawUrl, {}, 3000);
  if (!rawRes.ok) return null;
  return await rawRes.text();
}

async function main() {
  let rawStdin = "";
  try {
    rawStdin = fs.readFileSync(0, "utf8");
  } catch {
    process.stdout.write("{}\n");
    return;
  }

  if (!rawStdin.trim()) {
    process.stdout.write("{}\n");
    return;
  }

  let payload = {};
  try {
    payload = JSON.parse(rawStdin);
  } catch {
    process.stdout.write("{}\n");
    return;
  }

  const userMessage = stripSystemDirective(payload.lastUserInput || "");
  if (!userMessage || userMessage.length < 4) {
    process.stdout.write("{}\n");
    return;
  }

  const workspaceDir = (payload.workspacePaths && payload.workspacePaths[0]) || "/workspace";
  const stateFile = path.join(GLOBAL_SKILLS_DIR, ".scout-last-msg.json");
  try {
    if (fs.existsSync(stateFile)) {
      const lastState = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (lastState.conversationId === payload.conversationId && lastState.userMessage === userMessage) {
        process.stdout.write("{}\n");
        return;
      }
    }
  } catch {}

  // Estágio 1: Extração rápida via Dicionário (0ms de IA)
  let { tech, context } = extractTechTokensFast(userMessage);
  let routerSource = "dicionário rápido";

  // Estágio 2: Se não houver termos técnicos óbvios, avaliar semântica via Gemini Flash Low
  if (tech.length === 0 && userMessage.length >= 15) {
    const flashKeywords = classifyWithFlash(userMessage);
    if (flashKeywords && flashKeywords.length > 0) {
      tech = flashKeywords;
      context = [];
      routerSource = "Gemini Flash Low";
    }
  }

  if (tech.length === 0) {
    process.stdout.write("{}\n");
    return;
  }

  log(`Scouting for prompt="${userMessage.slice(0, 100)}" [Router: ${routerSource}] -> tech=[${tech.join(",")}] context=[${context.join(",")}]`);

  const candidates = await searchCandidates(tech, context);
  if (candidates.length === 0) {
    log(`No matching skill found for tech=[${tech.join(",")}]`);
    process.stdout.write("{}\n");
    return;
  }

  let best = null;
  let skillContent = "";
  let wasNewlyInstalled = false;
  let wsSkillPath = "";

  for (const cand of candidates.slice(0, 4)) {
    const safeSkillId = (cand.skillId || cand.name || "custom-skill").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    const candWsSkillDir = path.join(workspaceDir, ".agents", "skills", safeSkillId);
    const candWsSkillPath = path.join(candWsSkillDir, "SKILL.md");
    const candGlobalSkillDir = path.join(GLOBAL_SKILLS_DIR, safeSkillId);
    const candGlobalSkillPath = path.join(candGlobalSkillDir, "SKILL.md");

    if (fs.existsSync(candWsSkillPath)) {
      best = cand;
      skillContent = fs.readFileSync(candWsSkillPath, "utf8");
      wsSkillPath = candWsSkillPath;
      break;
    } else if (fs.existsSync(candGlobalSkillPath)) {
      best = cand;
      skillContent = fs.readFileSync(candGlobalSkillPath, "utf8");
      wsSkillPath = candWsSkillPath;
      try {
        fs.mkdirSync(candWsSkillDir, { recursive: true });
        fs.writeFileSync(candWsSkillPath, skillContent, "utf8");
      } catch {}
      break;
    } else {
      try {
        const fetched = await downloadSkillMd(cand.source, cand.skillId || cand.name);
        if (fetched) {
          best = cand;
          skillContent = fetched;
          wsSkillPath = candWsSkillPath;
          wasNewlyInstalled = true;
          try {
            fs.mkdirSync(candWsSkillDir, { recursive: true });
            fs.writeFileSync(candWsSkillPath, skillContent, "utf8");
          } catch {}
          try {
            fs.mkdirSync(candGlobalSkillDir, { recursive: true });
            fs.writeFileSync(candGlobalSkillPath, skillContent, "utf8");
          } catch {}
          break;
        }
      } catch (err) {
        log(`Failed attempt on ${cand.id}: ${err.message}`);
      }
    }
  }

  if (!best || !skillContent) {
    log(`Failed to fetch SKILL.md for candidates of tech=[${tech.join(",")}]`);
    process.stdout.write("{}\n");
    return;
  }

  const safeSkillId = (best.skillId || best.name || "custom-skill").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();

  try {
    fs.mkdirSync(GLOBAL_SKILLS_DIR, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({
      conversationId: payload.conversationId,
      userMessage,
      skillId: safeSkillId,
      source: best.source,
      timestamp: Date.now()
    }));
  } catch {}

  const statusLabel = wasNewlyInstalled ? "baixada e instalada em tempo real" : "carregada do cache local";
  log(`Activated skill '${safeSkillId}' (${best.source}, ${best.installs} installs) [${statusLabel}] via [${routerSource}]`);

  const boundedContent = skillContent.length > 10000
    ? skillContent.slice(0, 10000) + "\n\n... [Truncado pelo Skill Scout - arquivo completo em " + wsSkillPath + "]"
    : skillContent;

  const output = {
    injectSteps: [
      {
        ephemeralMessage:
          `⚡ [AGENTE SKILL SCOUT - ${routerSource.toUpperCase()}]: Analisei a mensagem do usuário (tecnologias/papéis detectados: ${tech.join(", ")}) e selecionei no skills.sh a skill especializada "${safeSkillId}" do repositório "${best.source}" (${best.installs} instalações, ${statusLabel} em ${wsSkillPath}).\n` +
          `IMPORTANTE: No início da sua resposta ao usuário, mencione em uma linha (ex: "⚡ *Skill Scout:* Acoplei a skill \`${safeSkillId}\` (\`${best.source}\`) para apoiar esta resposta.") e utilize o runbook abaixo:\n\n` +
          `--- INÍCIO DA SKILL (${safeSkillId}) ---\n${boundedContent}\n--- FIM DA SKILL ---`
      }
    ]
  };

  process.stdout.write(JSON.stringify(output) + "\n");
}

main().catch(err => {
  log(`Error: ${err?.message || err}`);
  process.stdout.write("{}\n");
});
