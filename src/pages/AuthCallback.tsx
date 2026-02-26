import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const errorParam = params.get('error');
    const errorDescription = params.get('error_description');

    if (errorParam) {
      console.error('[OAuth Callback] Error from Microsoft:', errorParam, errorDescription);
      setError(`Erro da Microsoft: ${errorDescription || errorParam}`);
      return;
    }

    if (code) {
      console.log('[OAuth Callback] Exchanging code for tokens...');
      api.post('/auth/microsoft/callback', { code })
        .then(() => {
          console.log('[OAuth Callback] Success! Closing window.');
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
            window.close();
          } else {
            window.location.href = '/settings';
          }
        })
        .catch(err => {
          console.error('[OAuth Callback] API Error:', err);
          const msg = err.response?.data?.details || err.response?.data?.error || 'Erro na comunicação com o servidor';
          setError(msg);
        });
    } else {
      setError('Código de autorização não encontrado na URL.');
    }
  }, [location]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="text-center max-w-md w-full">
        {error ? (
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-red-100">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Falha na Autenticação</h1>
            <p className="text-slate-500 text-sm mb-6">{error}</p>
            <button 
              onClick={() => window.close()}
              className="w-full bg-slate-900 text-white py-2 rounded-xl font-bold hover:bg-slate-800 transition-colors"
            >
              Fechar Janela
            </button>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600 font-medium">Finalizando autenticação com Microsoft...</p>
            <p className="text-xs text-slate-400 mt-2">Isso deve levar apenas alguns segundos.</p>
          </>
        )}
      </div>
    </div>
  );
}
