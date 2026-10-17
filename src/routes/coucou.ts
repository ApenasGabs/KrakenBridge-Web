import { Router, Request, Response } from 'express';
import { coucouPhoneLinkService } from '../services/coucouPhoneLinkService.js';

export const coucouRouter = Router();

// Obter status da conexão móvel e QR code de pareamento
coucouRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const info = await coucouPhoneLinkService.getPairingInfo();
    res.json({
      success: true,
      ...info
    });
  } catch (err: any) {
    console.error('[CoucouRoute] Erro ao obter status:', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro interno ao consultar Coucou Link' });
  }
});

// Resetar token de pareamento (desconecta dispositivos e gera novo QR Code)
coucouRouter.post('/reset-token', async (_req: Request, res: Response) => {
  try {
    const result = await coucouPhoneLinkService.resetPairingToken();
    res.json({
      success: true,
      ...result
    });
  } catch (err: any) {
    console.error('[CoucouRoute] Erro ao resetar token:', err);
    res.status(500).json({ success: false, error: err?.message || 'Erro ao redefinir pareamento' });
  }
});

// Endpoint de fallback para responder aprovação pendente (caso usuário responda via Web UI)
coucouRouter.post('/decision', (req: Request, res: Response) => {
  try {
    const { fingerprint, decision } = req.body;
    if (!fingerprint || !['allow', 'deny'].includes(decision)) {
      res.status(400).json({ success: false, error: 'Parâmetros inválidos. Forneça fingerprint e decision ("allow" ou "deny").' });
      return;
    }

    coucouPhoneLinkService.resolveApproval(fingerprint);
    res.json({ success: true, message: `Decisão "${decision}" registrada com sucesso.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao registrar decisão' });
  }
});
