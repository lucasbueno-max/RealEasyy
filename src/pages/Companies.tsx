import { useState, useEffect } from 'react';
import api from '../services/api';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { companySchema, type Company, type CompanyInput } from '../types';
import { 
  Building2, 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  X, 
  Loader2,
  Mail,
  MoreVertical
} from 'lucide-react';

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CompanyInput>({
    resolver: zodResolver(companySchema),
    defaultValues: { emails: [''], manager_id: null }
  });

  const emails = watch('emails');

  useEffect(() => {
    fetchCompanies();
    fetchUsers();
  }, []);

  const fetchCompanies = async () => {
    try {
      const res = await api.get('/companies');
      setCompanies(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const onSubmit = async (data: CompanyInput) => {
    setIsLoading(true);
    try {
      if (editingCompany) {
        await api.put(`/companies/${editingCompany.id}`, data);
      } else {
        await api.post('/companies', data);
      }
      fetchCompanies();
      closeModal();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const openModal = (company?: Company) => {
    if (company) {
      setEditingCompany(company);
      reset({
        razao_social: company.razao_social,
        nome_fantasia: company.nome_fantasia,
        cnpj: company.cnpj,
        emails: company.emails,
        manager_id: company.manager_id
      });
    } else {
      setEditingCompany(null);
      reset({ razao_social: '', nome_fantasia: '', cnpj: '', emails: [''], manager_id: null });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCompany(null);
    reset();
  };

  const handleDelete = async (id: number) => {
    console.log('Attempting to delete company with ID:', id);
    if (window.confirm('Tem certeza que deseja excluir esta empresa?')) {
      try {
        setIsLoading(true);
        await api.delete(`/companies/${id}`);
        console.log('Company deleted successfully');
        fetchCompanies();
      } catch (err) {
        console.error('Error deleting company:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const filteredCompanies = companies.filter(c => 
    c.razao_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.nome_fantasia.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cnpj.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Empresas</h2>
          <p className="text-slate-500">Gerencie seus clientes e seus contatos.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors self-start"
        >
          <Plus className="w-5 h-5" />
          Nova Empresa
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por Razão Social, Nome Fantasia ou CNPJ..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
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
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">CNPJ</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Gestor</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">E-mails</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCompanies.map((company) => (
                <tr key={company.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{company.nome_fantasia}</p>
                        <p className="text-xs text-slate-500">{company.razao_social}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{company.cnpj}</td>
                  <td className="px-6 py-4">
                    {company.manager_name ? (
                      <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                        {company.manager_name}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Sem gestor</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {company.emails.map((email, idx) => (
                        <span key={idx} className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full border border-orange-100">
                          {email}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openModal(company)}
                        className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(company.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-xl font-bold text-slate-900">
                {editingCompany ? 'Editar Empresa' : 'Nova Empresa'}
              </h3>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Razão Social</label>
                  <input
                    {...register('razao_social')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    placeholder="Ex: Empresa de Serviços LTDA"
                  />
                  {errors.razao_social && <p className="mt-1 text-xs text-red-600">{errors.razao_social.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome Fantasia</label>
                  <input
                    {...register('nome_fantasia')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    placeholder="Ex: Nome da Empresa"
                  />
                  {errors.nome_fantasia && <p className="mt-1 text-xs text-red-600">{errors.nome_fantasia.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">CNPJ</label>
                  <input
                    {...register('cnpj')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    placeholder="00.000.000/0000-00"
                  />
                  {errors.cnpj && <p className="mt-1 text-xs text-red-600">{errors.cnpj.message}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Gestor Responsável</label>
                  <select
                    {...register('manager_id', { 
                      setValueAs: v => v === "" ? null : Number(v) 
                    })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                  >
                    <option value="">Selecione um gestor...</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                  {errors.manager_id && <p className="mt-1 text-xs text-red-600">{errors.manager_id.message}</p>}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-slate-700">E-mails para Envio</label>
                  <button
                    type="button"
                    onClick={() => setValue('emails', [...emails, ''])}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Adicionar E-mail
                  </button>
                </div>
                <div className="space-y-3">
                  {emails.map((_, index) => (
                    <div key={index} className="flex gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          {...register(`emails.${index}`)}
                          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                          placeholder="contato@empresa.com"
                        />
                      </div>
                      {emails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setValue('emails', emails.filter((__, i) => i !== index))}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {errors.emails && <p className="mt-1 text-xs text-red-600">{errors.emails.message}</p>}
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
                  {editingCompany ? 'Salvar Alterações' : 'Cadastrar Empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
