import React, { useState } from 'react';
import { Lock, KeyRound, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';

interface PinModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export const PinModal: React.FC<PinModalProps> = ({ isOpen, onSuccess }) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await api.verifyPin(pin.trim());
      if (res.success && res.token) {
        api.setPinToken(res.token);
        onSuccess();
      } else {
        setError(res.error || 'PIN incorreto. Tente novamente.');
      }
    } catch {
      setError('Falha ao validar PIN com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-sm bg-base-100 border border-base-300 rounded-2xl shadow-2xl p-6 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-14 h-14 bg-primary/10 text-primary mx-auto rounded-2xl flex items-center justify-center">
          <Lock className="w-7 h-7" />
        </div>

        <div>
          <h2 className="text-lg font-bold text-base-content flex items-center justify-center gap-2">
            <span>KrakenBridge Seguro</span>
            <ShieldCheck className="w-4 h-4 text-success" />
          </h2>
          <p className="text-xs text-base-content/60 mt-1">
            Digite o PIN de segurança configurado no ambiente para desbloquear o estúdio.
          </p>
        </div>

        {error && (
          <div className="alert alert-error text-xs py-2 px-3 flex items-center gap-2 rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              inputMode="numeric"
              placeholder="Digite o PIN (ex: 0000)"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              className="input input-bordered w-full text-center font-mono tracking-widest text-lg font-bold bg-base-200/60 focus:bg-base-100"
            />
            <KeyRound className="w-4 h-4 text-base-content/40 absolute left-3 top-3.5 pointer-events-none" />
          </div>

          <button
            type="submit"
            disabled={loading || !pin.trim()}
            className="btn btn-primary w-full gap-2 shadow-lg shadow-primary/20"
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <>
                <span>Desbloquear Acesso</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-[10px] text-base-content/40 font-mono">
          Variável: KRAKEN_PIN no container Docker
        </p>
      </div>
    </div>
  );
};
