import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PodDrainBanner } from '../PodDrainBanner';
import { PodDrainReloadBubble } from '../PodDrainReloadBubble';
import { api } from '../../../services/api';
import type { EvolutionStatus } from '../../../types';

vi.mock('../../../services/api', () => ({
  api: {
    checkHealth: vi.fn()
  }
}));

describe('PodDrainBanner Component', () => {
  it('não deve renderizar nada se o status for nulo ou inativo', () => {
    const { container: c1 } = render(<PodDrainBanner status={null} />);
    expect(c1.firstChild).toBeNull();

    const idleStatus: EvolutionStatus = {
      active: false,
      status: 'idle',
      isDraining: false,
      activeTasksCount: 0
    };
    const { container: c2 } = render(<PodDrainBanner status={idleStatus} />);
    expect(c2.firstChild).toBeNull();
  });

  it('deve renderizar o banner de alerta quando isDraining === true', () => {
    const drainingStatus: EvolutionStatus = {
      active: true,
      status: 'draining',
      isDraining: true,
      activeTasksCount: 2,
      taskDescription: 'Refatoração da interface de usuário'
    };

    render(<PodDrainBanner status={drainingStatus} />);

    expect(screen.getByTestId('pod-drain-banner')).toBeInTheDocument();
    expect(screen.getByText(/Pod Drain em Andamento/i)).toBeInTheDocument();
    expect(screen.getByText(/2 tarefas ativas/i)).toBeInTheDocument();
    expect(screen.getByText(/Refatoração da interface de usuário/i)).toBeInTheDocument();
  });

  it('deve formatar no singular quando houver apenas 1 tarefa ativa', () => {
    const singleTaskStatus: EvolutionStatus = {
      active: true,
      status: 'draining',
      isDraining: true,
      activeTasksCount: 1,
      taskDescription: 'Correção de bug crítico'
    };

    render(<PodDrainBanner status={singleTaskStatus} />);

    expect(screen.getByText(/1 tarefa ativa/i)).toBeInTheDocument();
    expect(screen.getByText(/1 tarefa em execução/i)).toBeInTheDocument();
  });
});

describe('PodDrainReloadBubble Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('não deve renderizar se o status não for reloading', () => {
    const idleStatus: EvolutionStatus = {
      active: false,
      status: 'idle',
      isDraining: false,
      activeTasksCount: 0
    };

    const { container } = render(<PodDrainReloadBubble status={idleStatus} />);
    expect(container.firstChild).toBeNull();
  });

  it('deve renderizar o balão com contagem regressiva e barra de progresso durante o reloading', () => {
    const reloadingStatus: EvolutionStatus = {
      active: true,
      status: 'reloading',
      isDraining: false,
      activeTasksCount: 0,
      taskDescription: 'Instalação de novas dependências'
    };

    render(<PodDrainReloadBubble status={reloadingStatus} initialCountdown={20} />);

    expect(screen.getByTestId('pod-drain-reload-bubble')).toBeInTheDocument();
    expect(screen.getByText(/Reiniciando Kraken \(Auto-Reload\)/i)).toBeInTheDocument();
    expect(screen.getByText(/~20s/i)).toBeInTheDocument();
    expect(screen.getByText(/Instalação de novas dependências/i)).toBeInTheDocument();
  });

  it('deve atualizar a contagem regressiva com o passar do tempo', () => {
    const reloadingStatus: EvolutionStatus = {
      active: true,
      status: 'reloading',
      isDraining: false,
      activeTasksCount: 0
    };

    render(<PodDrainReloadBubble status={reloadingStatus} initialCountdown={15} />);

    expect(screen.getByText(/~15s/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/~12s/i)).toBeInTheDocument();
  });

  it('deve disparar onReconnected quando checkHealth responder healthy', async () => {
    const reloadingStatus: EvolutionStatus = {
      active: true,
      status: 'reloading',
      isDraining: false,
      activeTasksCount: 0
    };

    const onReconnected = vi.fn();
    (api.checkHealth as any).mockResolvedValue({ status: 'healthy', uptime: 2 });

    render(
      <PodDrainReloadBubble
        status={reloadingStatus}
        initialCountdown={10}
        onReconnected={onReconnected}
      />
    );

    // Avança para disparar o health check
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    expect(api.checkHealth).toHaveBeenCalled();
    expect(onReconnected).toHaveBeenCalled();
    expect(screen.getByText(/Kraken Restabelecido!/i)).toBeInTheDocument();
  });
});
