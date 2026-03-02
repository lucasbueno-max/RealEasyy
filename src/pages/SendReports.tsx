import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Send, 
  FileUp, 
  Upload,
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FileText,
  X,
  Building2,
  Calendar,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SendItem {
  companyId: number;
  companyName: string;
  cnpj: string;
  managerId?: number;
  managerName?: string;
  dataAporte: string;
  dataDebito: string;
  valor: string;
  pdfBase64: string | null;
  pdfName: string | null;
  status: 'pending' | 'ready' | 'sending' | 'success' | 'error';
  selected: boolean;
  error?: string;
}

export default function SendReports() {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = ['24', '25', '26', '27', '28', '29', '30'];
  const periods = years.flatMap(y => months.map(m => `${m}.${y}`));
  
  const currentMonthIdx = new Date().getMonth();
  const currentYearShort = new Date().getFullYear().toString().slice(-2);
  const defaultPeriod = `${months[currentMonthIdx]}.${currentYearShort}`;

  const [templates, setTemplates] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [importedFiles, setImportedFiles] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [refPeriod, setRefPeriod] = useState<string>(defaultPeriod);
  const [globalDataAporte, setGlobalDataAporte] = useState<string>('');
  const [globalDataDebito, setGlobalDataDebito] = useState<string>('');
  const [items, setItems] = useState<SendItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGraphConnected, setIsGraphConnected] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const fetchTemplates = api.get('/templates').catch(e => { console.error('Templates fail:', e); return { data: [] }; });
        const fetchCompanies = api.get('/companies').catch(e => { console.error('Companies fail:', e); return { data: [] }; });
        const fetchStatus = api.get('/auth/microsoft/status').catch(e => { console.error('Status fail:', e); return { data: { connected: false } }; });
        const fetchUsers = api.get('/users').catch(e => { console.error('Users fail:', e); return { data: [] }; });
        const fetchFiles = api.get('/imported-files').catch(e => { console.error('Files fail:', e); return { data: [] }; });

        const [templatesRes, companiesRes, statusRes, usersRes, filesRes] = await Promise.all([
          fetchTemplates,
          fetchCompanies,
          fetchStatus,
          fetchUsers,
          fetchFiles
        ]);

        setTemplates(templatesRes.data);
        setIsGraphConnected(statusRes.data.connected);
        setUsers(usersRes.data);
        setImportedFiles(filesRes.data);
        
        setItems(companiesRes.data.map((c: any) => {
          // Try to find a matching file automatically
          let matchedFile = filesRes.data.find((f: any) => f.company_id === c.id);
          
          if (!matchedFile) {
            // Fallback: search by name in files
            const nomeFantasiaLower = c.nome_fantasia.toLowerCase();
            const cnpjClean = c.cnpj.replace(/\D/g, '');
            
            matchedFile = filesRes.data.find((f: any) => {
              const fileNameLower = f.file_name.toLowerCase();
              return (cnpjClean && f.file_name.includes(cnpjClean)) || 
                     (nomeFantasiaLower && fileNameLower.includes(nomeFantasiaLower));
            });
          }
          
          return {
            companyId: c.id,
            companyName: c.nome_fantasia,
            cnpj: c.cnpj,
            managerId: c.manager_id,
            managerName: c.manager_name,
            dataAporte: '',
            dataDebito: '',
            valor: matchedFile ? (matchedFile.extracted_value || '') : '',
            pdfBase64: matchedFile ? matchedFile.content : null,
            pdfName: matchedFile ? matchedFile.file_name : null,
            status: matchedFile ? 'ready' : 'pending',
            selected: true
          };
        }));
      } catch (err) {
        console.error(err);
      }
    };
    init();
  }, []);

  const handleFileSelect = (companyId: number, fileId: string) => {
    const selectedFile = importedFiles.find(f => f.id.toString() === fileId);
    setItems(prev => prev.map(item => 
      item.companyId === companyId 
        ? { 
            ...item, 
            pdfBase64: selectedFile ? selectedFile.content : null, 
            pdfName: selectedFile ? selectedFile.file_name : null, 
            valor: selectedFile ? (selectedFile.extracted_value || item.valor) : item.valor,
            status: selectedFile ? 'ready' : 'pending' 
          } 
        : item
    ));
  };

  const handleManualPdf = async (companyId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      // Extract value from PDF
      const formData = new FormData();
      formData.append('file', file);
      const extractRes = await api.post('/pdf/extract', formData);
      const extractedValor = extractRes.data.valor;

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setItems(prev => prev.map(item => 
          item.companyId === companyId 
            ? { 
                ...item, 
                pdfBase64: base64, 
                pdfName: file.name, 
                valor: extractedValor || item.valor,
                status: 'ready' 
              } 
            : item
        ));
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Error extracting PDF value:', err);
      // Still allow the PDF but without extracted value
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setItems(prev => prev.map(item => 
          item.companyId === companyId 
            ? { ...item, pdfBase64: base64, pdfName: file.name, status: 'ready' } 
            : item
        ));
      };
      reader.readAsDataURL(file);
    } finally {
      setIsLoading(false);
    }
  };

  const updateItem = (companyId: number, field: keyof SendItem, value: string) => {
    setItems(prev => prev.map(item => 
      item.companyId === companyId ? { ...item, [field]: value } : item
    ));
  };

  const handleSend = async () => {
    if (!selectedTemplateId) return alert('Selecione um modelo de relatório');
    // Removed mandatory check for globalDataAporte and globalDataDebito
    if (!isGraphConnected) return alert('Conecte sua conta Microsoft nas configurações');

    const itemsToSend = filteredItems.filter(item => item.selected && item.status !== 'success');
    if (itemsToSend.length === 0) return alert('Nenhuma empresa selecionada para envio');

    setIsSending(true);
    try {
      // Update status to sending for filtered items only
      setItems(prev => prev.map(item => {
        const isFilteredAndSelected = filteredItems.some(fi => fi.companyId === item.companyId && fi.selected && fi.status !== 'success');
        return isFilteredAndSelected ? { ...item, status: 'sending' } : item;
      }));

      console.log('Sending reports with period:', refPeriod);
      const res = await api.post('/reports/send', {
        templateId: selectedTemplateId,
        mesReferencia: refPeriod,
        items: itemsToSend.map(i => ({
          companyId: i.companyId,
          dataAporte: globalDataAporte,
          dataDebito: globalDataDebito,
          valor: i.valor,
          pdfBase64: i.pdfBase64
        }))
      });

      const results = res.data;
      setItems(prev => prev.map(item => {
        const result = results.find((r: any) => r.companyId === item.companyId);
        if (result) {
          return {
            ...item,
            status: result.status,
            error: result.error
          };
        }
        return item;
      }));
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar relatórios');
    } finally {
      setIsSending(false);
    }
  };

  const filteredItems = items.filter(item => {
    if (!selectedManagerId) return true;
    return item.managerId === Number(selectedManagerId);
  });

  const readyCount = items.filter(i => i.status === 'ready' || i.status === 'success').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Enviar Relatórios</h2>
          <p className="text-slate-500">Prepare e envie os relatórios mensais para as empresas.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={isSending || items.length === 0}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm shadow-orange-200"
          >
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Enviar Relatórios
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">1. Selecione o Modelo</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                >
                  <option value="">Escolha um modelo...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Mês/Ano Ref.</label>
                <select
                  value={refPeriod}
                  onChange={(e) => setRefPeriod(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                >
                  {periods.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">Filtrar por Gestor</label>
                <select
                  value={selectedManagerId}
                  onChange={(e) => setSelectedManagerId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                >
                  <option value="">Todos os gestores</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-50">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Data Aporte (Geral)</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Ex: 10/03/2024"
                    value={globalDataAporte}
                    onChange={(e) => setGlobalDataAporte(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Data Débito (Geral)</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Ex: 15/03/2024"
                    value={globalDataDebito}
                    onChange={(e) => setGlobalDataDebito(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="font-bold text-slate-900 text-sm">2. Dados das Empresas</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const filteredIds = filteredItems.map(i => i.companyId);
                      setItems(prev => prev.map(item => filteredIds.includes(item.companyId) ? { ...item, selected: true } : item));
                    }}
                    className="text-[10px] text-orange-600 hover:underline font-medium"
                  >
                    Selecionar Todos Filtrados
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => {
                      const filteredIds = filteredItems.map(i => i.companyId);
                      setItems(prev => prev.map(item => filteredIds.includes(item.companyId) ? { ...item, selected: false } : item));
                    }}
                    className="text-[10px] text-slate-500 hover:underline font-medium"
                  >
                    Desmarcar Todos Filtrados
                  </button>
                </div>
              </div>
              <span className="text-xs font-medium text-slate-500">{filteredItems.length} empresas filtradas</span>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <div key={item.companyId} className={`p-4 space-y-4 transition-colors ${item.selected ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) => updateItem(item.companyId, 'selected', e.target.checked as any)}
                        className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                      />
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${item.selected ? 'text-slate-900' : 'text-slate-400'}`}>{item.companyName}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-slate-500">{item.cnpj}</p>
                          {item.managerName && (
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase font-bold">
                              Gestor: {item.managerName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.status === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                      {item.status === 'error' && (
                        <div className="group relative">
                          <AlertCircle className="w-5 h-5 text-red-500 cursor-help" />
                          <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2 bg-slate-900 text-white text-[10px] rounded shadow-xl z-10">
                            {item.error}
                          </div>
                        </div>
                      )}
                      {item.status === 'sending' && <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />}
                      <div className="flex items-center gap-2">
                        <select
                          onChange={(e) => handleFileSelect(item.companyId, e.target.value)}
                          value={importedFiles.find(f => f.file_name === item.pdfName)?.id || ''}
                          className={`text-xs px-2 py-1.5 rounded-lg border outline-none transition-all max-w-[150px] ${
                            item.pdfBase64 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          <option value="">Selecionar PDF...</option>
                          {importedFiles.map(f => (
                            <option key={f.id} value={f.id}>{f.file_name}</option>
                          ))}
                        </select>
                        <label className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          item.pdfBase64 && !importedFiles.some(f => f.file_name === item.pdfName) 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                            : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                        }`}>
                          <Upload className="w-3.5 h-3.5" />
                          <input type="file" accept=".pdf" className="hidden" onChange={(e) => handleManualPdf(item.companyId, e)} />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="relative">
                      <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Valor"
                        value={item.valor}
                        onChange={(e) => updateItem(item.companyId, 'valor', e.target.value)}
                        className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  {item.pdfName && (
                    <div className="flex items-center gap-2 text-[10px] text-emerald-600 font-medium">
                      <FileText className="w-3 h-3" />
                      {item.pdfName}
                      <button onClick={() => updateItem(item.companyId, 'pdfBase64', '')} className="text-red-400 hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4">Resumo do Envio</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total de Empresas</span>
                <span className="font-bold text-slate-900">{items.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Selecionadas</span>
                <span className="font-bold text-orange-600">{items.filter(i => i.selected).length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Prontas para envio</span>
                <span className="font-bold text-emerald-600">{readyCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Pendentes</span>
                <span className="font-bold text-amber-600">{items.length - readyCount}</span>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-100">
              {!isGraphConnected && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-2 text-amber-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Sua conta Microsoft não está conectada. Vá em seu perfil para conectar.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[70]">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex items-center gap-4">
            <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
            <p className="font-bold text-slate-900">Processando arquivos...</p>
          </div>
        </div>
      )}
    </div>
  );
}
