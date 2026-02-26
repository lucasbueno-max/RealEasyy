import { useState, useEffect } from 'react';
import api from '../services/api';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { templateSchema, type Template, type TemplateInput } from '../types';
import { 
  FileText, 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  X, 
  Loader2,
  Code
} from 'lucide-react';

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<TemplateInput>({
    resolver: zodResolver(templateSchema),
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await api.get('/templates');
      setTemplates(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const onSubmit = async (data: TemplateInput) => {
    setIsLoading(true);
    try {
      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.id}`, data);
      } else {
        await api.post('/templates', data);
      }
      fetchTemplates();
      closeModal();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const openModal = (template?: Template) => {
    if (template) {
      setEditingTemplate(template);
      reset(template);
    } else {
      setEditingTemplate(null);
      reset({ name: '', subject: '', body: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
    reset();
  };

  const handleDelete = async (id: number) => {
    console.log('Attempting to delete template with ID:', id);
    if (window.confirm('Tem certeza que deseja excluir este modelo?')) {
      try {
        setIsLoading(true);
        await api.delete(`/templates/${id}`);
        console.log('Template deleted successfully');
        fetchTemplates();
      } catch (err) {
        console.error('Error deleting template:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const variables = [
    'razao_social', 'nome_fantasia', 'cnpj', 'data_aporte', 'data_debito', 'valor', 'mes_referencia'
  ];

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Modelos de Relatórios</h2>
          <p className="text-slate-500">Configure os padrões de e-mail com variáveis dinâmicas.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors self-start"
        >
          <Plus className="w-5 h-5" />
          Novo Modelo
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar modelos..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <div key={template.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="bg-orange-50 p-3 rounded-xl text-orange-600">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex gap-1">
                <button onClick={() => openModal(template)} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(template.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <h3 className="font-bold text-slate-900 mb-1">{template.name}</h3>
            <p className="text-xs text-slate-500 mb-4 line-clamp-1">Assunto: {template.subject}</p>
            <div className="mt-auto pt-4 border-t border-slate-50">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Prévia do corpo</p>
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">{template.body.replace(/<[^>]*>/g, '')}</p>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-xl font-bold text-slate-900">
                {editingTemplate ? 'Editar Modelo' : 'Novo Modelo'}
              </h3>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome do Modelo</label>
                  <input
                    {...register('name')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    placeholder="Ex: Relatório Mensal de Aportes"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Assunto do E-mail</label>
                  <input
                    {...register('subject')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    placeholder="Ex: Relatório Mensal - {{nome_fantasia}}"
                  />
                  {errors.subject && <p className="mt-1 text-xs text-red-600">{errors.subject.message}</p>}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-slate-700">Corpo do E-mail (HTML)</label>
                    <div className="flex flex-wrap gap-1">
                      {variables.map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            const currentBody = (document.getElementById('body-textarea') as HTMLTextAreaElement).value;
                            setValue('body', currentBody + `{{${v}}}`);
                          }}
                          className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-mono"
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    id="body-textarea"
                    {...register('body')}
                    rows={10}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all font-mono text-sm"
                    placeholder="Olá {{nome_fantasia}}, segue o relatório..."
                  />
                  {errors.body && <p className="mt-1 text-xs text-red-600">{errors.body.message}</p>}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2.5 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingTemplate ? 'Salvar Alterações' : 'Criar Modelo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
