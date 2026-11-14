import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OptionsBar } from '../OptionsBar';
import type { ChatOptions } from '../../../types';

describe('OptionsBar Component - Engine & Model Separation (Issue #170)', () => {
  const defaultOptions: ChatOptions = {
    model: 'gemini-3.8-flash-high',
    agent: 'antigravity',
    effort: 'default',
    mode: 'default',
    interactionMode: 'agent',
    autoRouteByModelQuota: true
  };

  it('não deve renderizar quando isOpen === false', () => {
    const { container } = render(
      <OptionsBar
        options={defaultOptions}
        availableModels={[]}
        onChange={vi.fn()}
        isOpen={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('deve renderizar os seletores de motor e modelo com grupos separados (AGY vs Claude Code CLI)', () => {
    render(
      <OptionsBar
        options={defaultOptions}
        availableModels={[]}
        onChange={vi.fn()}
        isOpen={true}
      />
    );

    // Seletor de motor
    const agentSelect = screen.getByTestId('options-agent-select');
    expect(agentSelect).toBeInTheDocument();
    expect(agentSelect).toHaveValue('antigravity');

    // Seletor de modelo com optgroups
    const modelSelect = screen.getByTestId('options-model-select');
    expect(modelSelect).toBeInTheDocument();
    expect(modelSelect).toHaveValue('gemini-3.8-flash-high');

    const agyGroup = screen.getByRole('group', { name: '⚡ Google Antigravity (AGY)' });
    expect(agyGroup).toBeInTheDocument();

    const claudeGroup = screen.getByRole('group', { name: '💻 Claude Code CLI' });
    expect(claudeGroup).toBeInTheDocument();

    expect(screen.getAllByText(/\[AGY\]/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[Claude CLI\]/).length).toBeGreaterThan(0);
  });

  it('deve atualizar automaticamente o motor para "claude" ao selecionar um modelo do Claude Code CLI', () => {
    const onChange = vi.fn();
    render(
      <OptionsBar
        options={defaultOptions}
        availableModels={[]}
        onChange={onChange}
        isOpen={true}
      />
    );

    const modelSelect = screen.getByTestId('options-model-select');
    fireEvent.change(modelSelect, { target: { value: 'claude-3-7-sonnet-20250219' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-3-7-sonnet-20250219',
        agent: 'claude'
      })
    );
  });

  it('deve atualizar o motor ao alterar diretamente o select de motor', () => {
    const onChange = vi.fn();
    render(
      <OptionsBar
        options={defaultOptions}
        availableModels={[]}
        onChange={onChange}
        isOpen={true}
      />
    );

    const agentSelect = screen.getByTestId('options-agent-select');
    fireEvent.change(agentSelect, { target: { value: 'claude' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'claude'
      })
    );
  });
});
