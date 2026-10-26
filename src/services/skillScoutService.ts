import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

const GEMINI_CONFIG_DIR = process.env.GEMINI_CONFIG_DIR || '/root/.gemini/config';
const HOOKS_PATH = path.join(GEMINI_CONFIG_DIR, 'hooks.json');
const SCOUT_SCRIPT_PATH = path.join(GEMINI_CONFIG_DIR, 'skill-scout.cjs');
const SCOUT_SKILL_DIR = path.join(GEMINI_CONFIG_DIR, 'skills', 'skill-scout');
const SCOUT_SKILL_MD_PATH = path.join(SCOUT_SKILL_DIR, 'SKILL.md');

// Caminho dos templates internos empacotados com o backend
const TEMPLATES_DIR = path.resolve(
  fsSync.existsSync(path.resolve('src/templates'))
    ? path.resolve('src/templates')
    : path.resolve('dist-server/templates')
);

class SkillScoutService {
  private initialized = false;

  /**
   * Garante que o Skill Scout, o script interceptador e os hooks estejam provisionados out-of-the-box
   */
  async ensureSkillScoutProvisioned(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // 1. Garantir que as pastas de configuração e skills existam
      await fs.mkdir(SCOUT_SKILL_DIR, { recursive: true });

      // 2. Provisionar o script executável skill-scout.cjs
      const templateCjs = path.join(TEMPLATES_DIR, 'skill-scout.cjs');
      if (fsSync.existsSync(templateCjs)) {
        const cjsContent = await fs.readFile(templateCjs, 'utf8');
        await fs.writeFile(SCOUT_SCRIPT_PATH, cjsContent, { encoding: 'utf8', mode: 0o755 });
      }

      // 3. Provisionar a definição canônica da skill skill-scout/SKILL.md
      const templateMd = path.join(TEMPLATES_DIR, 'skill-scout.md');
      if (fsSync.existsSync(templateMd)) {
        const mdContent = await fs.readFile(templateMd, 'utf8');
        await fs.writeFile(SCOUT_SKILL_MD_PATH, mdContent, { encoding: 'utf8', mode: 0o644 });
      }

      // 4. Provisionar e atualizar o hooks.json com o gancho PreInvocation
      let hooksConfig: Record<string, any> = {};
      try {
        if (fsSync.existsSync(HOOKS_PATH)) {
          const raw = await fs.readFile(HOOKS_PATH, 'utf8');
          hooksConfig = JSON.parse(raw);
        }
      } catch (err) {
        console.warn('[SkillScoutService] Erro ao ler hooks.json existente, recriando:', (err as Error).message);
        hooksConfig = {};
      }

      // Registrar o hook do skill-scout
      hooksConfig['skill-scout'] = {
        PreInvocation: [
          {
            type: 'command',
            command: `node ${SCOUT_SCRIPT_PATH}`,
            timeout: 15
          }
        ]
      };

      await fs.writeFile(HOOKS_PATH, JSON.stringify(hooksConfig, null, 2), { encoding: 'utf8', mode: 0o644 });

      // 5. Ajustar permissões para garantir execução sem falhas
      try {
        await fs.chmod(SCOUT_SCRIPT_PATH, 0o755);
      } catch {}

      this.initialized = true;
      console.log('[SkillScoutService] Skill Scout nativo e hooks.json provisionados com sucesso!');
      return true;
    } catch (err) {
      console.error('[SkillScoutService] Falha ao provisionar Skill Scout:', (err as Error).message);
      return false;
    }
  }

  /**
   * Retorna o status operacional do Skill Scout
   */
  async getStatus(): Promise<{ provisioned: boolean; scriptExists: boolean; hooksConfigured: boolean }> {
    const scriptExists = fsSync.existsSync(SCOUT_SCRIPT_PATH);
    let hooksConfigured = false;
    try {
      if (fsSync.existsSync(HOOKS_PATH)) {
        const raw = await fs.readFile(HOOKS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        hooksConfigured = !!parsed['skill-scout'];
      }
    } catch {}

    return {
      provisioned: this.initialized && scriptExists && hooksConfigured,
      scriptExists,
      hooksConfigured
    };
  }
}

export const skillScoutService = new SkillScoutService();
