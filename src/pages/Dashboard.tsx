import { useState, useEffect } from 'react';
import api from '../services/api';
import { Building2, Send, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, logsRes] = await Promise.all([
          api.get('/stats'),
          api.get('/logs?limit=5')
        ]);
        setStats(statsRes.data);
        setRecentLogs(logsRes.data.slice(0, 5));
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  const cards = [
    { 
      label: 'Empresas Cadastradas', 
      value: stats?.totalCompanies || 0, 
      icon: Building2, 
      color: 'bg-blue-500' 
    },
    { 
      label: 'Enviados este mês', 
      value: stats?.sentThisMonth || 0, 
      icon: Send, 
      color: 'bg-emerald-500' 
    },
    { 
      label: 'Taxa de Sucesso', 
      value: '98%', 
      icon: TrendingUp, 
      color: 'bg-orange-500' 
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-500">Bem-vindo ao RelEasy. Aqui está o resumo das suas atividades.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`${card.color} p-3 rounded-xl text-white`}>
                <card.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-slate-500 text-sm font-medium">{card.label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{card.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Atividades Recentes</h3>
          <button className="text-orange-600 text-sm font-medium hover:text-orange-700">Ver tudo</button>
        </div>
        <div className="divide-y divide-slate-100">
          {recentLogs.length > 0 ? (
            recentLogs.map((log) => (
              <div key={log.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={log.status === 'success' ? 'text-emerald-500' : 'text-red-500'}>
                    {log.status === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Relatório "{log.template_name}" enviado para <span className="font-bold">{log.company_name}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(log.sent_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  log.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}>
                  {log.status === 'success' ? 'Sucesso' : 'Erro'}
                </span>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-500">
              Nenhuma atividade registrada ainda.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
