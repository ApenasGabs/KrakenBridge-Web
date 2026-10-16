import React, { useState, useEffect, useCallback } from 'react';
import type { TelemetryStackStatus, OutOfBoxSetupConfig } from '../../types';
import { api } from '../../services/api';
import {
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Wrench,
  MessageSquarePlus,
  CheckCircle2,
  XCircle,
  Server,
  Sliders,
  Sparkles,
  RotateCw
} from 'lucide-react';

interface TelemetryAndSetupPanelProps {
  onStartSetupChat?: (data: { conversationId: string; suggestedPrompt: string }) => void;
}

export const TelemetryAndSetupPanel: React.FC<TelemetryAndSetupPanelProps> = ({
  onStartSetupChat
}) => {
  const [telemetry, setTelemetry] = useState<TelemetryStackStatus | null>(null);
  const [setupConfig, setSetupConfig] = useState<OutOfBoxSetupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states para o Setup Out-of-the-Box
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [vercelToken, setVercelToken] = useState('');
  const [krakenPin, setKrakenPin] = useState('');
  const [defaultMemLimit, setDefaultMemLimit] = useState('512M');
  const [grafanaPort, setGrafanaPort] = useState(3003);
  const [uptimeKumaPort, setUptimeKumaPort] = useState(3002);
  const [autoProvision, setAutoProvision] = useState(true);
  const [customChatNotes, setCustomChatNotes] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [telData, cfgData] = await Promise.all([
        api.getTelemetryStatus().catch(() => null),
        api.getSetupConfig().catch(() => null)
      ]);
      if (telData) setTelemetry(telData);
      if (cfgData) {
        setSetupConfig(cfgData);
        setDefaultMemLimit(cfgData.defaultContainerMemLimit || '512M');
        setGrafanaPort(cfgData.grafanaPort || 3003);
        setUptimeKumaPort(cfgData.uptimeKumaPort || 3002);
        setAutoProvision(cfgData.autoProvisionTelemetry ?? true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleProvisionNow = async () => {
    setProvisioning(true);
    setFeedbackMsg(null);
    try {
      const res = await api.provisionTelemetry();
      setFeedbackMsg({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
      await loadData();
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: (err as Error).message
      });
    } finally {
      setProvisioning(false);
    }
  };

  const handleSaveSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);
    setFeedbackMsg(null);
    try {
      const res = await api.applySetupConfig({
        geminiApiKey: geminiApiKey.trim() || undefined,
        githubToken: githubToken.trim() || undefined,
        vercelToken: vercelToken.trim() || undefined,
        krakenPin: krakenPin.trim() || undefined,
        defaultContainerMemLimit: defaultMemLimit,
        grafanaPort: Number(grafanaPort),
        uptimeKumaPort: Number(uptimeKumaPort),
        autoProvisionTelemetry: autoProvision,
        provisionNow: true
      });
      setGeminiApiKey('');
      setGithubToken('');
      setVercelToken('');
      setKrakenPin('');
      setFeedbackMsg({
        type: 'success',
        text: res.provisionResult?.message || 'Configurações Out-of-the-Box salvas e aplicadas com sucesso!'
      });
      await loadData();
      setIsSetupModalOpen(false);
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: (err as Error).message
      });
    } finally {
      setProvisioning(false);
    }
  };

  const handleLaunchSetupChat = async () => {
    setStartingChat(true);
    try {
      const res = await api.startSetupChat(customChatNotes.trim() || undefined);
      setIsSetupModalOpen(false);
      onStartSetupChat?.({
        conversationId: res.conversationId,
        suggestedPrompt: res.suggestedPrompt
      });
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: (err as Error).message
      });
    } finally {
      setStartingChat(false);
    }
  };

  const gaps = telemetry?.gapsResolved;
  const allGapsFixed = !!(
    gaps?.containerdSocketMounted &&
    gaps?.grafanaAlertRulesProvisioned &&
    gaps?.cgroupsPersisted &&
    gaps?.realisticStackLimits &&
    gaps?.casaosDualAppRegistered
  );

  return (
    <div
      data-testid="telemetry-setup-panel"
      className="rounded-2xl border border-base-300/80 bg-base-200/30 p-4 sm:p-5 flex flex-col gap-4 shadow-xs"
    >
      {/* Cabeçalho da Telemetria & Setup Out-of-the-Box */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-base-content">
                Telemetria SRE & Contenção Cgroups (Out-of-the-Box)
              </h3>
              {telemetry?.enabled && telemetry.activeSeriesCount > 0 ? (
                <span className="badge badge-xs badge-success font-mono py-2">
                  {telemetry.activeSeriesCount} séries PromQL • {telemetry.totalStackMemMb} MB RAM
                </span>
              ) : (
                <span className="badge badge-xs badge-warning font-mono py-2">
                  {loading ? 'verificando...' : 'requer sincronização'}
                </span>
              )}
            </div>
            <p className="text-xs text-base-content/60">
              Auto-configuração de cAdvisor, VictoriaMetrics, Grafana (alertas &gt;80% e predict_linear), Uptime Kuma e limites Cgroups
            </p>
          </div>
        </div>

        {/* Botões de Ação Out-of-the-Box */}
        <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
          <button
            data-testid="open-setup-wizard-btn"
            onClick={() => setIsSetupModalOpen(true)}
            className="btn btn-xs sm:btn-sm btn-outline btn-primary gap-1.5 rounded-xl"
            title="Configurar variáveis de ambiente, chaves e telemetria via formulário ou Chat com o Kraken"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Setup / Envs</span>
          </button>

          {onStartSetupChat && (
            <button
              data-testid="start-setup-chat-btn"
              onClick={handleLaunchSetupChat}
              disabled={startingChat}
              className="btn btn-xs sm:btn-sm btn-secondary gap-1.5 rounded-xl shadow-xs"
              title="Abrir um chat interativo para passar envs e configurações diretamente para o Kraken"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>{startingChat ? 'Abrindo Chat...' : 'Chat de Config'}</span>
            </button>
          )}

          <button
            data-testid="provision-telemetry-btn"
            onClick={handleProvisionNow}
            disabled={provisioning}
            className="btn btn-xs sm:btn-sm btn-primary gap-1.5 rounded-xl shadow-xs"
            title="Auto-configurar ou reparar toda a stack de telemetria e cgroups em 1 clique"
          >
            {provisioning ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wrench className="w-3.5 h-3.5" />
            )}
            <span>{provisioning ? 'Provisionando...' : allGapsFixed ? 'Revalidar Stack' : 'Auto-Configurar Agora'}</span>
          </button>
        </div>
      </div>

      {/* Feedback de Provisionamento */}
      {feedbackMsg && (
        <div
          className={`alert text-xs py-2 px-3 rounded-xl ${
            feedbackMsg.type === 'success' ? 'alert-success' : 'alert-error'
          }`}
        >
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Alertas de Pré-Degradação Ativos */}
      {telemetry?.preDegradationAlerts && telemetry.preDegradationAlerts.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-warning font-bold text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Alertas de Pré-Degradação Detectados ({telemetry.preDegradationAlerts.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {telemetry.preDegradationAlerts.map((al, i) => (
              <div key={i} className="text-[11px] font-mono text-base-content/80 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${al.severity === 'critical' ? 'bg-error' : 'bg-warning'}`} />
                <strong className="text-base-content">{al.container}:</strong>
                <span className="truncate">{al.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid dos 4 Serviços da Stack de Telemetria */}
      {telemetry?.services && telemetry.services.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {telemetry.services.map((svc) => (
            <div
              key={svc.id}
              className="rounded-xl border border-base-300 bg-base-100/70 p-3 flex flex-col justify-between gap-2"
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Server className={`w-3.5 h-3.5 shrink-0 ${svc.running ? 'text-success' : 'text-base-content/40'}`} />
                  <span className="text-xs font-bold text-base-content truncate">{svc.name}</span>
                </div>
                <span
                  className={`badge badge-xs font-mono ${
                    svc.running ? 'badge-success' : 'badge-ghost text-base-content/50'
                  }`}
                >
                  {svc.running ? `:${svc.port}` : 'off'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-base-content/60">
                <span>
                  RAM: <strong className="text-base-content">{svc.memUsageMb}M</strong> / {svc.memLimitMb}M
                </span>
                <a
                  href={svc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5 font-sans font-medium"
                >
                  <span>Abrir</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Checklist das 5 Garantias SRE Out-of-the-Box (Issue #28) */}
      {gaps && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {[
            { ok: gaps.containerdSocketMounted, label: 'cAdvisor containerd.sock + cgroup v2' },
            { ok: gaps.grafanaAlertRulesProvisioned, label: 'Alertas PromQL (>80% & predict_linear 30m)' },
            { ok: gaps.cgroupsPersisted, label: 'Limites Cgroups Persistidos' },
            { ok: gaps.realisticStackLimits, label: 'Filtro de Cardinalidade (--store_container_labels=false)' },
            { ok: gaps.casaosDualAppRegistered, label: 'ZimaOS: Grafana (:3003) + Uptime Kuma (:3002)' }
          ].map((item, idx) => (
            <span
              key={idx}
              className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-mono ${
                item.ok
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-warning/30 bg-warning/10 text-warning'
              }`}
            >
              {item.ok ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* Barras de Contenção Cgroups dos Principais Containers */}
      {telemetry?.containers && telemetry.containers.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-base-300/60">
          <div className="flex items-center justify-between text-xs text-base-content/70">
            <span className="font-bold">Contenção Física de Memória por Container (Cgroups)</span>
            <span className="font-mono text-[11px]">{telemetry.containers.length} containers ativos</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {telemetry.containers.slice(0, 8).map((c) => {
              const barColor =
                c.alertSeverity === 'critical'
                  ? 'bg-error'
                  : c.alertSeverity === 'warning'
                    ? 'bg-warning'
                    : 'bg-emerald-500';
              return (
                <div key={c.name} className="bg-base-100/50 border border-base-300/60 rounded-xl p-2.5 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-base-content truncate">{c.name}</span>
                      {c.hasExplicitLimit ? (
                        <span className="badge badge-xs badge-outline border-emerald-500/40 text-emerald-400 text-[9px]">
                          cgroup
                        </span>
                      ) : (
                        <span className="badge badge-xs badge-ghost text-[9px] text-base-content/50">
                          host
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-base-content/70">
                      {c.memUsageFormatted} / {c.memLimitFormatted} ({c.memPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-base-300 overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, Math.max(3, c.memPercent))}%` }}
                      className={`h-full rounded-full transition-all ${barColor}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Setup Out-of-the-Box & Chat de Configuração */}
      {isSetupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-base-100 border border-base-300 rounded-2xl max-w-xl w-full p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-base-300 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="text-base font-bold text-base-content">
                    Configuração Out-of-the-Box do KrakenBridge
                  </h3>
                  <p className="text-xs text-base-content/60">
                    Preencha as variáveis abaixo ou inicie um Chat de Setup para o Kraken configurar tudo para você
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSetupModalOpen(false)}
                className="btn btn-xs btn-circle btn-ghost"
              >
                ✕
              </button>
            </div>

            {/* Opção 1: Chat Guiado de Setup */}
            {onStartSetupChat && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <MessageSquarePlus className="w-4 h-4" />
                    Prefere conversar com o Kraken para configurar?
                  </span>
                  <span className="badge badge-xs badge-primary">Recomendado</span>
                </div>
                <textarea
                  value={customChatNotes}
                  onChange={(e) => setCustomChatNotes(e.target.value)}
                  placeholder="Opcional: cole aqui suas envs, tokens ou preferências em texto livre (ex: 'Configure a porta do Grafana para 3003 e aplique limite de 512M nos crawlers')..."
                  className="textarea textarea-bordered textarea-xs w-full text-xs rounded-lg bg-base-100"
                  rows={2}
                />
                <button
                  type="button"
                  onClick={handleLaunchSetupChat}
                  disabled={startingChat}
                  className="btn btn-sm btn-primary rounded-xl gap-1.5 w-full"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                  <span>{startingChat ? 'Iniciando Sessão de Setup...' : 'Iniciar Chat de Configuração com o Kraken'}</span>
                </button>
              </div>
            )}

            {/* Opção 2: Formulário Rápido de Envs & Telemetria */}
            <form onSubmit={handleSaveSetup} className="flex flex-col gap-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label py-1 font-medium">
                    Gemini API Key {setupConfig?.hasGeminiKey && <span className="text-success">(Já configurada)</span>}
                  </label>
                  <input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder={setupConfig?.hasGeminiKey ? '•••••••• (manter atual)' : 'AIzaSy...'}
                    className="input input-sm input-bordered w-full font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="label py-1 font-medium">
                    PIN de Segurança Web {setupConfig?.krakenPinConfigured && <span className="text-success">(Ativo)</span>}
                  </label>
                  <input
                    type="password"
                    value={krakenPin}
                    onChange={(e) => setKrakenPin(e.target.value)}
                    placeholder="Opcional (ex: 1234)"
                    className="input input-sm input-bordered w-full font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="label py-1 font-medium">
                    GitHub Personal Token {setupConfig?.hasGithubToken && <span className="text-success">(Conectado)</span>}
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder={setupConfig?.hasGithubToken ? '•••••••• (manter atual)' : 'ghp_...'}
                    className="input input-sm input-bordered w-full font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="label py-1 font-medium">
                    Vercel Token {setupConfig?.hasVercelToken && <span className="text-success">(Conectado)</span>}
                  </label>
                  <input
                    type="password"
                    value={vercelToken}
                    onChange={(e) => setVercelToken(e.target.value)}
                    placeholder={setupConfig?.hasVercelToken ? '•••••••• (manter atual)' : 'Token da Vercel'}
                    className="input input-sm input-bordered w-full font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="label py-1 font-medium">Porta do Grafana</label>
                  <input
                    type="number"
                    value={grafanaPort}
                    onChange={(e) => setGrafanaPort(Number(e.target.value))}
                    className="input input-sm input-bordered w-full font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="label py-1 font-medium">Porta do Uptime Kuma</label>
                  <input
                    type="number"
                    value={uptimeKumaPort}
                    onChange={(e) => setUptimeKumaPort(Number(e.target.value))}
                    className="input input-sm input-bordered w-full font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="label py-1 font-medium">Limite Cgroup Padrão (RAM)</label>
                  <input
                    type="text"
                    value={defaultMemLimit}
                    onChange={(e) => setDefaultMemLimit(e.target.value)}
                    placeholder="512M"
                    className="input input-sm input-bordered w-full font-mono text-xs"
                  />
                </div>

                <div className="flex items-center pt-6">
                  <label className="cursor-pointer flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={autoProvision}
                      onChange={(e) => setAutoProvision(e.target.checked)}
                      className="checkbox checkbox-xs checkbox-primary"
                    />
                    <span className="font-medium">Auto-provisionar Telemetria no Boot</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-base-300">
                <button
                  type="button"
                  onClick={() => setIsSetupModalOpen(false)}
                  className="btn btn-sm btn-ghost rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={provisioning}
                  className="btn btn-sm btn-success rounded-xl gap-1.5"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>{provisioning ? 'Aplicando...' : 'Salvar & Provisionar Agora'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
