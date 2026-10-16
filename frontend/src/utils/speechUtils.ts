/**
 * Utilitários de Síntese de Voz (Text-to-Speech / TTS) para leitura das respostas do assistente.
 * Utiliza a Web Speech API nativa do navegador de forma resiliente, leve e sem dependências externas.
 */

export interface SpeechOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
}

type SpeechListener = (activeId: string | null) => void;

let activeId: string | null = null;
let activeUtterances: SpeechSynthesisUtterance[] = [];
const listeners = new Set<SpeechListener>();

/**
 * Retorna as instâncias ativas de SpeechSynthesisUtterance retidas na memória.
 */
export function getActiveUtterances(): readonly SpeechSynthesisUtterance[] {
  return activeUtterances;
}

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener(activeId);
    } catch (err) {
      console.warn('[speechUtils] Erro ao notificar listener de speech:', err);
    }
  });
}

/**
 * Verifica se a Web Speech API de síntese de voz é suportada no navegador atual.
 */
export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window
  );
}

/**
 * Higieniza o texto Markdown para uma leitura falada fluida e agradável:
 * - Substitui blocos de código ou diagramas por avisos descritivos curtos.
 * - Converte links [texto](url) para apenas o texto do link.
 * - Remove URLs brutas, tags HTML e caracteres de formatação (#, *, _, ~, >, |).
 * - Normaliza pontuação e quebras de linha para pausas naturais na fala.
 */
export function cleanMarkdownForSpeech(text: string): string {
  if (!text) return '';

  return (
    text
      // 1. Substitui diagramas (mermaid/charts) por aviso falado
      .replace(/```(?:mermaid|chart)[^`]*?```/gis, ' Diagrama visual omitido. ')
      // 2. Substitui blocos de código extensos por aviso falado
      .replace(/```[^`]*?```/gs, ' Bloco de código omitido. ')
      // 2.1 Converte dois-pontos antes de blocos omitidos em ponto final suave
      .replace(/:\s*(?=Bloco de código omitido|Diagrama visual omitido)/g, '. ')
      // 3. Remove código inline `código` mantendo o texto interno
      .replace(/`([^`]+)`/g, '$1')
      // 4. Converte links com imagem ![alt](url) -> alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      // 5. Converte links [texto](url) -> texto
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // 6. Remove URLs delimitadas <http...> ou <file:...>
      .replace(/<(?:https?|file):[^>]+>/g, '')
      // 7. Remove URLs brutas (http://, https://, file://)
      .replace(/(?:https?|file):\/\/[^\s)]+/g, '')
      // 8. Limpa linhas de separação de tabelas Markdown (| --- | --- |)
      .replace(/\|?\s*[-:]+[-| :]*\s*\|?/g, ' ')
      // 9. Converte delimitadores de coluna de tabelas (|) em pausas leves (vírgulas)
      .replace(/\|/g, ', ')
      // 10. Remove marcadores de cabeçalho (# Título -> Título)
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      // 11. Remove marcadores de listas (*, -, +, 1.) no início da linha
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      // 12. Remove blockquotes (> texto)
      .replace(/^\s*>\s*/gm, '')
      // 13. Remove linhas horizontais de separação (---, ***, ___)
      .replace(/^\s*[-*_]{3,}\s*$/gm, '')
      // 14. Remove tags HTML (<tag> e </tag>)
      .replace(/<[^>]+>/g, '')
      // 15. Remove símbolos residuais de formatação de negrito, itálico e tachado
      .replace(/[*_~]{1,3}/g, '')
      // 16. Remove múltiplos pontos ou pontuação repetida
      .replace(/\.{2,}/g, '.')
      // 17. Converte quebras de linha em pausas suaves
      .replace(/[\r\n]+/g, '. ')
      // 18. Normaliza múltiplos espaços e espaços antes de pontuação
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/([.,!?;:])\1+/g, '$1')
      .trim()
  );
}

/**
 * Divide o texto em fragmentos menores respeitando a pontuação.
 * Isso contorna o problema histórico do Chromium de pausar falas após ~15 segundos.
 */
export function splitTextIntoChunks(text: string, maxChunkLength = 160): string[] {
  const trimmedText = text.trim();
  if (!trimmedText) return [];
  if (trimmedText.length <= maxChunkLength) return [trimmedText];

  const chunks: string[] = [];
  // Divide primariamente por terminadores de frase (. ! ? ou novas frases)
  const sentences = trimmedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [trimmedText];

  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxChunkLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      // Se a frase for mais longa que o limite máximo, divide por palavras
      const words = trimmed.split(/\s+/);
      let subChunk = '';
      for (const word of words) {
        if ((subChunk ? `${subChunk} ${word}` : word).length > maxChunkLength) {
          if (subChunk) chunks.push(subChunk.trim());
          subChunk = word;
        } else {
          subChunk = subChunk ? `${subChunk} ${word}` : word;
        }
      }
      if (subChunk) {
        chunks.push(subChunk.trim());
      }
    } else if ((currentChunk ? `${currentChunk} ${trimmed}` : trimmed).length > maxChunkLength) {
      chunks.push(currentChunk.trim());
      currentChunk = trimmed;
    } else {
      currentChunk = currentChunk ? `${currentChunk} ${trimmed}` : trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Interrompe qualquer reprodução em andamento e limpa os estados.
 */
export function stopSpeech(): void {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch (err) {
      console.warn('[speechUtils] Erro ao cancelar speech:', err);
    }
  }
  activeUtterances = [];
  if (activeId !== null) {
    activeId = null;
    notifyListeners();
  }
}

/**
 * Inicia ou alterna a leitura em voz alta de uma mensagem.
 * Se a mensagem informada já estiver em reprodução, a leitura é pausada/cancelada.
 */
export function playSpeech(id: string, text: string, options?: SpeechOptions): void {
  if (!isSpeechSynthesisSupported()) {
    console.warn('[speechUtils] Web Speech API não suportada neste ambiente.');
    return;
  }

  // Se já estiver tocando a mesma mensagem, atua como botão de stop/toggle
  if (activeId === id) {
    stopSpeech();
    return;
  }

  // Interrompe qualquer áudio prévio
  stopSpeech();

  const cleaned = cleanMarkdownForSpeech(text);
  if (!cleaned) return;

  const chunks = splitTextIntoChunks(cleaned);
  if (chunks.length === 0) return;

  activeId = id;
  notifyListeners();

  const targetLang = options?.lang || 'pt-BR';
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = window.speechSynthesis.getVoices();
  } catch {
    voices = [];
  }

  // Busca voz brasileira ou portuguesa prioritariamente
  const voice =
    voices.find((v) => v.lang === targetLang) ||
    voices.find((v) => v.lang.startsWith('pt')) ||
    null;

  let currentChunkIndex = 0;

  function speakNextChunk(): void {
    if (activeId !== id || currentChunkIndex >= chunks.length) {
      if (activeId === id) {
        activeId = null;
        activeUtterances = [];
        notifyListeners();
      }
      return;
    }

    const chunkText = chunks[currentChunkIndex];
    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.lang = targetLang;
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = options?.rate ?? 1.0;
    utterance.pitch = options?.pitch ?? 1.0;

    utterance.onend = () => {
      currentChunkIndex++;
      speakNextChunk();
    };

    utterance.onerror = (event) => {
      // Erros do tipo 'canceled' ou 'interrupted' são esperados ao chamar cancel()
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        console.warn('[speechUtils] Erro durante síntese:', event.error);
      }
      if (activeId === id) {
        activeId = null;
        activeUtterances = [];
        notifyListeners();
      }
    };

    // Mantém referência explícita no array global para evitar descarte prematuro pelo garbage collector do Chromium
    activeUtterances = [utterance];
    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[speechUtils] Falha ao invocar speak:', err);
      if (activeId === id) {
        activeId = null;
        activeUtterances = [];
        notifyListeners();
      }
    }
  }

  speakNextChunk();
}

/**
 * Inscreve um componente para receber atualizações sobre qual mensagem está sendo lida.
 * Retorna uma função de unsubscribe.
 */
export function subscribeSpeechState(listener: SpeechListener): () => void {
  listeners.add(listener);
  try {
    listener(activeId);
  } catch (err) {
    console.warn('[speechUtils] Erro ao disparar listener inicial:', err);
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Retorna o ID da mensagem que está sendo reproduzida no momento (ou null).
 */
export function getActiveSpeechId(): string | null {
  return activeId;
}

// Limpa qualquer fala ao descarregar a página
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    stopSpeech();
  });
}
