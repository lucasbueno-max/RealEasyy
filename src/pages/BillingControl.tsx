import { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Building2, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  History,
  Loader2,
  RefreshCw,
  Search,
  Check
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import type { BillingControl, BillingHistory } from '../types';

export default function BillingControlPage() {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = ['2024', '2025', '2026'];
  
  const currentMonthIdx = new Date().getMonth();
  const currentYear = new Date().getFullYear().toString();
  const [selectedMonth, setSelectedMonth] = useState((currentMonthIdx + 1).toString().padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [searchTerm, setSearchTerm] = useState('');
  const [controls, setControls] = useState<BillingControl[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<BillingHistory[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<{id: number, name: string} | null>(null);

  const monthYear = `${selectedYear}-${selectedMonth}`;

  const fetchControls = async () => {
    setIsLoading(true);
    try {
      const res = await api.get(`/billing-control?month=${monthYear}`);
      setControls(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchControls();
  }, [monthYear]);

  const handleToggle = async (companyId: number, field: 'billing_sent' | 'nf_issued') => {
    try {
      await api.post('/billing-control/toggle', {
        company_id: companyId,
        month: monthYear,
        field
      });
      fetchControls();
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar status');
    }
  };

  const openHistory = async (companyId: number, companyName: string) => {
    setSelectedCompany({ id: companyId, name: companyName });
    setIsHistoryModalOpen(true);
    try {
      const res = await api.get(`/billing-control/history?company_id=${companyId}&month=${monthYear}`);
      setHistory(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredControls = controls.filter(c => 
    c.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Controle de Faturamento</h2>
          <p className="text-slate-500">Acompanhe o status de faturamento e emissão de NF por empresa.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent px-3 py-1.5 text-sm font-medium outline-none border-r border-slate-100"
            >
              {months.map((m, i) => (
                <option key={m} value={(i + 1).toString().padStart(2, '0')}>{m}</option>
              ))}
            </select>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent px-3 py-1.5 text-sm font-medium outline-none"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button 
            onClick={fetchControls}
            className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-5 h-5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar empresa..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Empresa</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Faturamento Enviado</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">NF</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && controls.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-2" />
                    <p className="text-slate-500">Carregando dados...</p>
                  </td>
                </tr>
              ) : filteredControls.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <p className="text-slate-500">Nenhuma empresa encontrada.</p>
                  </td>
                </tr>
              ) : filteredControls.map((control) => (
                <tr key={control.company_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{control.company_name}</p>
                        <p className="text-xs text-slate-500">Ref: {monthYear}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => handleToggle(control.company_id, 'billing_sent')}
                        className={`p-2 rounded-full transition-all ${
                          control.billing_sent 
                            ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' 
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {control.billing_sent ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                      </button>
                      {control.billing_sent && (
                        <div className="text-[10px] text-slate-500 text-center">
                          <p className="font-bold">{control.billing_sent_by_name}</p>
                          <p>{control.billing_sent_at ? format(new Date(control.billing_sent_at), 'dd/MM HH:mm') : ''}</p>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => handleToggle(control.company_id, 'nf_issued')}
                        className={`p-2 rounded-full transition-all ${
                          control.nf_issued 
                            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' 
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {control.nf_issued ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                      </button>
                      {control.nf_issued && (
                        <div className="text-[10px] text-slate-500 text-center">
                          <p className="font-bold">{control.nf_issued_by_name}</p>
                          <p>{control.nf_issued_at ? format(new Date(control.nf_issued_at), 'dd/MM HH:mm') : ''}</p>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openHistory(control.company_id, control.company_name || '')}
                      className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                      title="Ver Histórico"
                    >
                      <History className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Histórico de Faturamento</h3>
                  <p className="text-sm text-slate-500">{selectedCompany?.name} - {monthYear}</p>
                </div>
                <button 
                  onClick={() => setIsHistoryModalOpen(false)} 
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <XCircle className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {history.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-500">Nenhum histórico registrado para este mês.</p>
                  </div>
                ) : (
                  <div className="space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                    {history.map((h, idx) => (
                      <div key={idx} className="relative pl-10">
                        <div className={`absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center border-4 border-white shadow-sm ${
                          h.action.includes('Enviado') ? 'bg-emerald-500' : 'bg-blue-500'
                        }`}>
                          <Check className="w-4 h-4 text-white" />
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <p className="text-sm font-bold text-slate-900">{h.action}</p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-slate-600">Por: {h.user_name}</p>
                            <p className="text-[10px] text-slate-400">
                              {format(new Date(h.created_at), "dd 'de' MMMM, HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
