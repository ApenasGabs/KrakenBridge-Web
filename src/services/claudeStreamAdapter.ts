/**
 * Adaptador do `claude -p --output-format stream-json --verbose` para o schema
 * de eventos já consumido pelo chat (o mesmo emitido pelo driver AGY/Gemini).
 *
 * Contexto (Issue #184): em modo texto o Claude Code só imprime o resultado final
 * no stdout, então toda narração intermediária e todas as chamadas de ferramenta
 * ficavam invisíveis na UI ("silêncio absoluto"). Com stream-json cada bloco de
 * texto/ferramenta chega em tempo real e é traduzido aqui.
 *
 * Também audita a Regra de Ouro nº 2: um `tool_use` sem nenhum texto visível
 * desde a ferramenta anterior gera um `guardrail_warning` (`silent_tool_call`).
 */

export interface NormalizedAgentEvent {
  event: string;
  [key: string]: unknown;
}

type ClaudeContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

type ClaudeStreamLine = {
  type?: string;
  subtype?: string;
  session_id?: string;
  message?: { content?: ClaudeContentBlock[] | string; usage?: Record<string, unknown> };
  result?: string;
  usage?: Record<string, unknown>;
  is_error?: boolean;
};

const MAX_TOOL_OUTPUT_CHARS = 20_000;

/** Converte o input de uma ferramenta do Claude Code nos parâmetros que a UI já sabe exibir. */
export const mapClaudeToolInput = (name: string, input: Record<string, unknown> = {}): Record<string, unknown> => {
  const params: Record<string, unknown> = { ...input };
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

  if (str(input.command)) params.CommandLine = input.command;
  const filePath = str(input.file_path) ?? str(input.notebook_path) ?? str(input.path);
  if (filePath) {
    if (name === 'Read' || name === 'Glob' || name === 'Grep') {
      params.AbsolutePath = filePath;
    } else {
      params.TargetFile = filePath;
    }
  }
  if (str(input.description) && !params.Description) params.Description = input.description;
  if (str(input.pattern) && !params.query) params.query = input.pattern;
  if (str(input.url)) params.Url = input.url;
  if (name.startsWith('mcp__')) {
    const [, server, ...tool] = name.split('__');
    params.ServerName = server;
    params.ToolName = tool.join('__');
  }
  return params;
};

const stringifyToolResult = (content: unknown): string => {
  let out: string;
  if (typeof content === 'string') {
    out = content;
  } else if (Array.isArray(content)) {
    out = content
      .map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : ''))
      .filter(Boolean)
      .join('\n');
  } else if (content == null) {
    out = '';
  } else {
    out = JSON.stringify(content);
  }
  return out.length > MAX_TOOL_OUTPUT_CHARS ? `${out.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n…[saída truncada]` : out;
};

/** Retorna true se a linha JSON tem o formato do stream-json do Claude Code. */
export const isClaudeStreamLine = (parsed: unknown): parsed is ClaudeStreamLine => {
  if (!parsed || typeof parsed !== 'object') return false;
  const t = (parsed as { type?: unknown }).type;
  return t === 'system' || t === 'assistant' || t === 'user' || t === 'result';
};

/**
 * Cria um tradutor com estado (mapeia tool_use_id -> step_index e acompanha se
 * houve narração desde a última ferramenta).
 */
export const createClaudeStreamTranslator = () => {
  const stepIndexByToolId = new Map<string, number>();
  const toolNameById = new Map<string, string>();
  let nextStepIndex = 0;
  let narratedSinceLastTool = false;
  let emittedText = false;

  return function translate(line: ClaudeStreamLine): NormalizedAgentEvent[] {
    const out: NormalizedAgentEvent[] = [];

    if (line.type === 'assistant' && line.message) {
      const content = line.message.content;
      const blocks: ClaudeContentBlock[] = typeof content === 'string' ? [{ type: 'text', text: content }] : content || [];
      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          // Separa blocos de narração consecutivos com uma linha em branco.
          const delta = (emittedText ? '\n\n' : '') + block.text;
          emittedText = true;
          narratedSinceLastTool = true;
          out.push({ event: 'step_update', step_update: { step_type: 'agent_response', text_delta: delta } });
        } else if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking) {
          out.push({ event: 'step_update', step_update: { step_type: 'agent_response', thinking_delta: block.thinking } });
        } else if (block.type === 'tool_use' && block.id) {
          const name = block.name || 'tool';
          if (!narratedSinceLastTool) {
            out.push({
              event: 'guardrail_warning',
              kind: 'silent_tool_call',
              tool_name: name,
              message: `Ferramenta "${name}" chamada sem narração prévia no chat (Regra de Ouro nº 2).`
            });
          }
          narratedSinceLastTool = false;
          const stepIndex = nextStepIndex++;
          stepIndexByToolId.set(block.id, stepIndex);
          toolNameById.set(block.id, name);
          out.push({
            event: 'step_update',
            step_update: {
              step_type: 'tool',
              tool_name: name,
              step_index: stepIndex,
              state: 'RUNNING',
              tool_info: { parameters: mapClaudeToolInput(name, block.input) }
            }
          });
        }
      }
      if (line.message.usage) {
        out.push({ event: 'step_update', step_update: { step_type: 'usage', usage: line.message.usage } });
      }
    } else if (line.type === 'user' && line.message && Array.isArray(line.message.content)) {
      for (const block of line.message.content) {
        if (block.type !== 'tool_result' || !block.tool_use_id) continue;
        const stepIndex = stepIndexByToolId.get(block.tool_use_id);
        if (stepIndex === undefined) continue;
        out.push({
          event: 'step_update',
          step_update: {
            step_type: 'tool',
            tool_name: toolNameById.get(block.tool_use_id) || 'tool',
            step_index: stepIndex,
            state: block.is_error ? 'ERROR' : 'DONE',
            tool_info: { output: stringifyToolResult(block.content) }
          }
        });
      }
    } else if (line.type === 'result') {
      out.push({
        event: 'result',
        result: { response: typeof line.result === 'string' ? line.result : '', usage: line.usage },
        is_error: line.is_error === true
      });
    }
    // `system` (init/hooks) não tem equivalente na UI — ignorado de propósito
    // (não salvar session_id como agyConvId para não quebrar trocas de agente).
    return out;
  };
};
