import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  FileUp, 
  Trash2, 
  Loader2, 
  FileText,
  Building2,
  Calendar,
  X,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ImportedFile {
  id: number;
  file_name: string;
  company_id: number | null;
  company_name: string | null;
  uploaded_at: string;
}

export default function ImportFiles() {
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/imported-files');
      setFiles(res.data);
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(files.map(f => f.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectFile = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Tem certeza que deseja excluir os ${selectedIds.length} arquivos selecionados?`)) return;
    
    setIsClearing(true);
    try {
      await api.delete('/imported-files-batch', { data: { ids: selectedIds } });
      setFiles(prev => prev.filter(f => !selectedIds.includes(f.id)));
      setSelectedIds([]);
      setMessage({ type: 'success', text: 'Arquivos selecionados foram removidos.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Erro ao excluir arquivos selecionados.' });
    } finally {
      setIsClearing(false);
    }
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    setMessage(null);
    try {
      await api.post('/upload/zip', formData);
      setMessage({ type: 'success', text: 'Arquivo ZIP processado com sucesso!' });
      fetchFiles();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Erro ao processar arquivo ZIP.' });
    } finally {
      setIsUploading(false);
      // Clear input
      e.target.value = '';
    }
  };

  const handleDeleteFile = async (id: number) => {
    try {
      await api.delete(`/imported-files/${id}`);
      setFiles(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir arquivo');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Tem certeza que deseja excluir TODOS os arquivos importados?')) return;
    setIsClearing(true);
    try {
      await api.delete('/imported-files-clear');
      setFiles([]);
      setMessage({ type: 'success', text: 'Todos os arquivos foram removidos.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Erro ao limpar arquivos.' });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Importar Arquivos</h2>
          <p className="text-slate-500">Faça o upload de arquivos PDF (via ZIP) para serem usados nos relatórios.</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={isClearing}
              className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Excluir Selecionados ({selectedIds.length})
            </button>
          )}
          <button
            onClick={handleClearAll}
            disabled={files.length === 0 || isClearing}
            className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isClearing && <Loader2 className="w-4 h-4 animate-spin" />}
            Limpar Tudo
          </button>
          <label className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-sm shadow-orange-200">
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
            Importar ZIP
            <input type="file" accept=".zip" className="hidden" onChange={handleZipUpload} disabled={isUploading} />
          </label>
        </div>
      </div>

      {message && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl border flex items-center gap-3 text-sm ${
            message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto p-1 hover:bg-black/5 rounded">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    checked={files.length > 0 && selectedIds.length === files.length}
                    onChange={handleSelectAll}
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Arquivo PDF</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Empresa Identificada</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Data Importação</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-orange-600 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : files.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    Nenhum arquivo importado ainda.
                  </td>
                </tr>
              ) : (
                files.map((file) => (
                  <tr key={file.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.includes(file.id) ? 'bg-orange-50/30' : ''}`}>
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(file.id)}
                        onChange={() => handleSelectFile(file.id)}
                        className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                          <FileText className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium text-slate-900">{file.file_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {file.company_name ? (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          {file.company_name}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Não identificada</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {new Date(file.uploaded_at).toLocaleString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
