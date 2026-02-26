import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Settings as SettingsIcon, 
  Mail, 
  Shield, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ExternalLink,
  Key,
  Save
} from 'lucide-react';

export default function Settings() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [creds, setCreds] = useState({ clientId: '', clientSecret: '', tenantId: 'common', globalCc: '', redirectUri: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    checkStatus();
    fetchCreds();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await api.get('/auth/microsoft/status');
      setIsConnected(res.data.connected);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCreds = async () => {
    try {
      const res = await api.get('/settings/microsoft');
      setCreds({
        clientId: res.data.clientId,
        clientSecret: res.data.clientSecret,
        tenantId: res.data.tenantId || 'common',
        globalCc: res.data.globalCc || '',
        redirectUri: res.data.redirectUri || `${window.location.origin}/auth/callback`
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      await api.post('/settings/microsoft', creds);
      setMessage({ type: 'success', text: 'Credenciais salvas com sucesso!' });
      fetchCreds(); // Refresh to get updated redirectUri if it changed
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Erro ao salvar credenciais.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await api.get('/auth/microsoft/url');
      const authWindow = window.open(res.data.url, 'microsoft_auth', 'width=600,height=700');
      
      if (!authWindow) {
        setMessage({ type: 'error', text: 'O popup foi bloqueado pelo navegador. Por favor, permita popups para este site.' });
        setIsLoading(false);
        return;
      }

      const checkWindow = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkWindow);
          checkStatus();
          setIsLoading(false);
        }
      }, 1000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao iniciar conexão.' });
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Configurações</h2>
        <p className="text-slate-500">Gerencie as integrações e segurança do sistema.</p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-4">
          <div className="bg-orange-50 p-3 rounded-xl text-orange-600">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Credenciais Microsoft Azure</h3>
            <p className="text-sm text-slate-500">Configure o Client ID, Client Secret e Tenant ID do seu aplicativo no Azure Portal.</p>
          </div>
        </div>
        <form onSubmit={handleSaveCreds} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Client ID</label>
              <input
                type="text"
                value={creds.clientId}
                onChange={e => setCreds({ ...creds, clientId: e.target.value })}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Client Secret</label>
              <input
                type="password"
                value={creds.clientSecret}
                onChange={e => setCreds({ ...creds, clientSecret: e.target.value })}
                placeholder="••••••••••••••••"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all font-mono text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tenant ID</label>
              <input
                type="text"
                value={creds.tenantId}
                onChange={e => setCreds({ ...creds, tenantId: e.target.value })}
                placeholder="common ou seu-tenant-id"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all font-mono text-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                * Use o seu **ID do Diretório (locatário)** se o seu aplicativo for "Single Tenant". Use **common** se for "Multi-tenant".
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail Global em Cópia (CC)</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={creds.globalCc}
                  onChange={e => setCreds({ ...creds, globalCc: e.target.value })}
                  placeholder="exemplo@empresa.com"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all text-sm"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                * Este e-mail será incluído como cópia (CC) em todos os relatórios enviados pelo sistema.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Redirect URI para o Azure Portal:</p>
            <code className="text-[10px] text-orange-600 break-all">{creds.redirectUri}</code>
            <p className="text-[10px] text-slate-500 mt-2 italic">
              * Copie esta URL e cole no campo "Redirect URIs" (Web) nas configurações do seu aplicativo no Azure.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-slate-900 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Credenciais
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-4">
          <div className="bg-orange-50 p-3 rounded-xl text-orange-600">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Integração com Outlook</h3>
            <p className="text-sm text-slate-500">Necessário para o envio automático de e-mails via Microsoft Graph API.</p>
          </div>
        </div>
        <div className="p-6">
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            isConnected ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3">
              {isConnected ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-slate-400" />
              )}
              <div>
                <p className={`text-sm font-bold ${isConnected ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {isConnected ? 'Conta Conectada' : 'Conta não conectada'}
                </p>
                <p className="text-xs text-slate-500">
                  {isConnected 
                    ? 'O sistema está pronto para enviar e-mails.' 
                    : 'Conecte sua conta Microsoft para habilitar o envio de relatórios.'}
                </p>
              </div>
            </div>
            <button
              onClick={handleConnect}
              disabled={isLoading || !creds.clientId}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                isConnected 
                  ? 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50' 
                  : 'bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50'
              }`}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              {isConnected ? 'Reconectar' : 'Conectar Agora'}
            </button>
          </div>
          {!creds.clientId && (
            <p className="text-[10px] text-amber-600 mt-2 font-medium">
              * Configure o Client ID acima antes de tentar conectar.
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-4">
          <div className="bg-slate-50 p-3 rounded-xl text-slate-600">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Segurança</h3>
            <p className="text-sm text-slate-500">Configurações de acesso e senha.</p>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Alterar Senha</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="password"
                placeholder="Nova senha"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
              />
              <input
                type="password"
                placeholder="Confirmar nova senha"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
              />
            </div>
            <button className="mt-4 bg-slate-900 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors">
              Atualizar Senha
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
