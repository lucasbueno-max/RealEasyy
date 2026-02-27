import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { 
  User, 
  Mail, 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ExternalLink,
  Signature
} from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
    fetchProfile();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkStatus();
        setMessage({ type: 'success', text: 'Conta Microsoft conectada com sucesso!' });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkStatus = async () => {
    try {
      const res = await api.get('/auth/microsoft/status');
      setIsConnected(res.data.connected);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await api.get('/users/me');
      setSignature(res.data.signature);
    } catch (err) {
      console.error(err);
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

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        await api.post('/users/signature', { signature: base64 });
        setSignature(base64);
        setMessage({ type: 'success', text: 'Assinatura atualizada com sucesso!' });
      } catch (err) {
        setMessage({ type: 'error', text: 'Erro ao salvar assinatura.' });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Meu Perfil</h2>
        <p className="text-slate-500">Gerencie suas informações pessoais e integrações.</p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Microsoft Connection */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center gap-4">
            <div className="bg-orange-50 p-3 rounded-xl text-orange-600">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Integração Microsoft</h3>
              <p className="text-sm text-slate-500">Conecte seu e-mail para enviar relatórios.</p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                <span className="text-sm font-medium text-slate-700">
                  {isConnected ? 'Conta Conectada' : 'Não Conectado'}
                </span>
              </div>
              <button
                onClick={handleConnect}
                disabled={isLoading}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  isConnected 
                    ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50' 
                    : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                {isConnected ? 'Reconectar Conta' : 'Conectar Agora'}
              </button>
            </div>
            <p className="text-xs text-slate-500 italic">
              * Ao conectar, você permitirá que o sistema envie e-mails em seu nome usando a Microsoft Graph API.
            </p>
          </div>
        </div>

        {/* Personal Signature */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center gap-4">
            <div className="bg-orange-50 p-3 rounded-xl text-orange-600">
              <Signature className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Minha Assinatura</h3>
              <p className="text-sm text-slate-500">Sua assinatura pessoal para os e-mails.</p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              {signature ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center gap-4">
                  <img src={signature} alt="Assinatura" className="max-h-24 object-contain" />
                  <label className="text-xs font-bold text-orange-600 hover:underline cursor-pointer">
                    Alterar Assinatura
                    <input type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} />
                  </label>
                </div>
              ) : (
                <div className="p-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center gap-3 text-center">
                  <Signature className="w-8 h-8 text-slate-300" />
                  <p className="text-sm text-slate-500">Nenhuma assinatura cadastrada.</p>
                  <label className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                    Fazer Upload
                    <input type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-4">
          <div className="bg-orange-50 p-3 rounded-xl text-orange-600">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Informações da Conta</h3>
            <p className="text-sm text-slate-500">Seus dados básicos de acesso.</p>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome Completo</label>
            <p className="text-slate-900 font-medium">{user?.name}</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">E-mail de Acesso</label>
            <p className="text-slate-900 font-medium">{user?.email}</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nível de Acesso</label>
            <span className="inline-block px-2 py-1 rounded bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
              {user?.role === 'admin' ? 'Administrador' : 'Usuário'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
