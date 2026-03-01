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
  const [creds, setCreds] = useState({ 
    clientId: '', 
    clientSecret: '', 
    tenantId: 'common', 
    globalCc: '', 
    redirectUri: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceRoleKey: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchCreds();
  }, []);

  const fetchCreds = async () => {
    try {
      const res = await api.get('/settings/microsoft');
      setCreds({
        clientId: res.data.clientId,
        clientSecret: res.data.clientSecret,
        tenantId: res.data.tenantId || 'common',
        globalCc: res.data.globalCc || '',
        redirectUri: res.data.redirectUri || `${window.location.origin}/auth/callback`,
        supabaseUrl: res.data.supabaseUrl || '',
        supabaseAnonKey: res.data.supabaseAnonKey || '',
        supabaseServiceRoleKey: res.data.supabaseServiceRoleKey || ''
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
            <div className="md:col-span-2">
              <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">Microsoft Azure</h4>
            </div>
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

            <div className="md:col-span-2 mt-4">
              <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">Supabase</h4>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Supabase URL</label>
              <input
                type="text"
                value={creds.supabaseUrl}
                onChange={e => setCreds({ ...creds, supabaseUrl: e.target.value })}
                placeholder="https://your-project.supabase.co"
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all font-mono text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Supabase Anon Key</label>
              <input
                type="password"
                value={creds.supabaseAnonKey}
                onChange={e => setCreds({ ...creds, supabaseAnonKey: e.target.value })}
                placeholder="ey..."
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all font-mono text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Supabase Service Role Key (Recomendado para o Servidor)</label>
              <input
                type="password"
                value={creds.supabaseServiceRoleKey}
                onChange={e => setCreds({ ...creds, supabaseServiceRoleKey: e.target.value })}
                placeholder="ey..."
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all font-mono text-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                * A Service Role Key permite que o servidor ignore as políticas de RLS. Mantenha em segredo!
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
