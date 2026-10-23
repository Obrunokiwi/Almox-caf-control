import React, { useState, useMemo } from 'react';
import { SearchableSelect } from './SearchableSelect.tsx';
import {
  Truck,
  Plus,
  Search,
  RotateCcw,
  Edit2,
  Eye,
  Save,
  ArrowLeft,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  CheckCircle2,
  XCircle,
  Trash2,
  Package,
  PackagePlus,
  Phone,
  Building2
} from 'lucide-react';
import type { Fornecedor, Usuario } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import { ConfirmDeleteModal } from './ConfirmDeleteModal.tsx';
import { HelpFloatingModal } from './HelpFloatingModal.tsx';

interface FornecedoresViewProps {
  fornecedores: Fornecedor[];
  currentUser: Usuario | null;
  onRefresh: () => void;
  onVoltar?: () => void;
  onNavigate?: (tab: string) => void;
}

export const FornecedoresView: React.FC<FornecedoresViewProps> = ({
  fornecedores,
  currentUser,
  onRefresh,
  onVoltar,
  onNavigate,
}) => {
  // Filtros de busca
  const [filtroCodigoCnpj, setFiltroCodigoCnpj] = useState('');
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroTipoEntidade, setFiltroTipoEntidade] = useState<'todos' | 'fornecedor_comercial' | 'entidade_parceira'>('todos');
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | '1' | '0'>('todos');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filtroCodigoCnpj.trim()) count++;
    if (filtroNome.trim()) count++;
    if (filtroTipoEntidade !== 'todos') count++;
    if (filtroAtivo !== 'todos') count++;
    return count;
  }, [filtroCodigoCnpj, filtroNome, filtroTipoEntidade, filtroAtivo]);

  const handleLimparFiltros = () => {
    setFiltroCodigoCnpj('');
    setFiltroNome('');
    setFiltroTipoEntidade('todos');
    setFiltroAtivo('todos');
    setCurrentPage(1);
  };

  // Controle de Formulário em Abas
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'view'>('create');
  const [activeFormTab, setActiveFormTab] = useState<'dados_cadastrais' | 'contato_endereco'>('dados_cadastrais');
  const [editingId, setEditingId] = useState<number | null>(null);

  // Campos do Formulário
  const [formCodigo, setFormCodigo] = useState('');
  const [formTipoEntidade, setFormTipoEntidade] = useState<'fornecedor_comercial' | 'entidade_parceira'>('fornecedor_comercial');
  const [formRazaoSocial, setFormRazaoSocial] = useState('');
  const [formNomeFantasia, setFormNomeFantasia] = useState('');
  const [formCnpj, setFormCnpj] = useState('');
  const [formInscricaoEstadual, setFormInscricaoEstadual] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formContatoResponsavel, setFormContatoResponsavel] = useState('');
  const [formEndereco, setFormEndereco] = useState('');
  const [formCidade, setFormCidade] = useState('São Bernardo do Campo');
  const [formUf, setFormUf] = useState('SP');
  const [formObservacoes, setFormObservacoes] = useState('');
  const [formAtivo, setFormAtivo] = useState<number>(1);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingFornecedor, setDeletingFornecedor] = useState<Fornecedor | null>(null);

  const { toast } = useToast();
  const canEdit = currentUser && (currentUser.perfil === 'admin' || currentUser.perfil === 'almoxarife');

  // Filtragem dos fornecedores
  const filteredFornecedores = useMemo(() => {
    return fornecedores.filter((f) => {
      if (
        filtroCodigoCnpj &&
        !f.codigo.toLowerCase().includes(filtroCodigoCnpj.toLowerCase()) &&
        !(f.cnpj || '').toLowerCase().includes(filtroCodigoCnpj.toLowerCase())
      ) {
        return false;
      }
      if (
        filtroNome &&
        !f.razao_social.toLowerCase().includes(filtroNome.toLowerCase()) &&
        !(f.nome_fantasia || '').toLowerCase().includes(filtroNome.toLowerCase())
      ) {
        return false;
      }
      if (filtroTipoEntidade !== 'todos') {
        const tipoAtual = f.tipo_entidade || 'fornecedor_comercial';
        if (tipoAtual !== filtroTipoEntidade) return false;
      }
      if (filtroAtivo !== 'todos') {
        const val = filtroAtivo === '1' ? 1 : 0;
        if (f.ativo !== val) return false;
      }
      return true;
    });
  }, [fornecedores, filtroCodigoCnpj, filtroNome, filtroTipoEntidade, filtroAtivo]);

  const totalPages = Math.ceil(filteredFornecedores.length / pageSize) || 1;
  const paginatedFornecedores = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFornecedores.slice(start, start + pageSize);
  }, [filteredFornecedores, currentPage, pageSize]);

  const handleNovo = (tipoInicial: 'fornecedor_comercial' | 'entidade_parceira' = 'fornecedor_comercial') => {
    setFormMode('create');
    setEditingId(null);
    setFormTipoEntidade(tipoInicial);
    const prefix = tipoInicial === 'entidade_parceira' ? 'ENT' : 'FORN';
    setFormCodigo(`${prefix}-${String(fornecedores.length + 1).padStart(4, '0')}`);
    setFormRazaoSocial('');
    setFormNomeFantasia('');
    setFormCnpj('');
    setFormInscricaoEstadual('');
    setFormTelefone('');
    setFormEmail('');
    setFormContatoResponsavel('');
    setFormEndereco('');
    setFormCidade('São Bernardo do Campo');
    setFormUf('SP');
    setFormObservacoes('');
    setFormAtivo(1);
    setActiveFormTab('dados_cadastrais');
    setErrorMsg(null);
    setIsFormOpen(true);
  };

  const handleEditar = (f: Fornecedor) => {
    setFormMode('edit');
    setEditingId(f.id);
    setFormCodigo(f.codigo);
    setFormTipoEntidade(f.tipo_entidade || 'fornecedor_comercial');
    setFormRazaoSocial(f.razao_social);
    setFormNomeFantasia(f.nome_fantasia || '');
    setFormCnpj(f.cnpj || '');
    setFormInscricaoEstadual(f.inscricao_estadual || '');
    setFormTelefone(f.telefone || '');
    setFormEmail(f.email || '');
    setFormContatoResponsavel(f.contato_responsavel || '');
    setFormEndereco(f.endereco || '');
    setFormCidade(f.cidade || '');
    setFormUf(f.uf || 'SP');
    setFormObservacoes(f.observacoes || '');
    setFormAtivo(f.ativo);
    setActiveFormTab('dados_cadastrais');
    setErrorMsg(null);
    setIsFormOpen(true);
  };

  const handleVisualizar = (f: Fornecedor) => {
    handleEditar(f);
    setFormMode('view');
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formMode === 'view') {
      setIsFormOpen(false);
      return;
    }

    if (!formCodigo.trim() || !formRazaoSocial.trim()) {
      const msg = 'Código e Razão Social/Nome da Entidade são obrigatórios.';
      setErrorMsg(msg);
      toast.error('Campos Obrigatórios', msg);
      setActiveFormTab('dados_cadastrais');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const payload = {
        codigo: formCodigo.trim().toUpperCase(),
        tipo_entidade: formTipoEntidade,
        razao_social: formRazaoSocial.trim(),
        nome_fantasia: formNomeFantasia ? formNomeFantasia.trim() : null,
        cnpj: formCnpj ? formCnpj.trim() : null,
        inscricao_estadual: formInscricaoEstadual ? formInscricaoEstadual.trim() : null,
        telefone: formTelefone ? formTelefone.trim() : null,
        email: formEmail ? formEmail.trim() : null,
        contato_responsavel: formContatoResponsavel ? formContatoResponsavel.trim() : null,
        endereco: formEndereco ? formEndereco.trim() : null,
        cidade: formCidade ? formCidade.trim() : null,
        uf: formUf ? formUf.trim().toUpperCase() : null,
        observacoes: formObservacoes ? formObservacoes.trim() : null,
        ativo: formAtivo,
      };

      const url = formMode === 'create' ? '/api/fornecedores' : `/api/fornecedores/${editingId}`;
      const method = formMode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `user:${currentUser?.id}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar fornecedor.');
      }

      if (formMode === 'create') {
        toast.success(
          'Fornecedor Cadastrado com Sucesso',
          `O fornecedor "${payload.codigo} - ${payload.razao_social}" está disponível para vínculo de produtos e entrada de NF.`
        );
      } else {
        toast.success(
          'Fornecedor Atualizado com Sucesso',
          `Os dados de "${payload.codigo} - ${payload.razao_social}" foram atualizados.`
        );
      }

      setIsFormOpen(false);
      onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Erro ao salvar fornecedor.';
      setErrorMsg(msg);
      toast.error(
        formMode === 'create' ? 'Erro ao Cadastrar Fornecedor' : 'Erro ao Editar Fornecedor',
        msg
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingFornecedor) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/fornecedores/${deletingFornecedor.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `user:${currentUser?.id}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir fornecedor.');
      }

      toast.success(
        'Fornecedor Excluído',
        data.message || `O fornecedor "${deletingFornecedor.codigo} - ${deletingFornecedor.razao_social}" foi removido.`
      );
      if (editingId === deletingFornecedor.id) {
        setIsFormOpen(false);
      }
      setDeletingFornecedor(null);
      onRefresh();
    } catch (err: any) {
      toast.error('Erro ao Excluir Fornecedor', err.message || 'Não foi possível excluir o fornecedor.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho Compacto */}
      <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 text-teal-800 rounded-lg">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">Fornecedores / Entidades Parceiras</h1>
            <p className="text-xs text-slate-500">
              Cadastro de Fornecedores Comerciais e Outros Hospitais / Entidades Parceiras
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HelpFloatingModal
            title="Ajuda & Fluxo — Fornecedores e Entidades Parceiras"
            subtitle="Passo 1 do Cadastro • Fornecedores Comerciais e Hospitais Parceiros"
            currentStep={1}
            onNavigate={onNavigate}
            sections={[
              {
                title: 'Fluxo Padrão do Almoxarifado (3 Etapas)',
                badge: 'Etapa 1 de 3',
                tone: 'teal',
                description:
                  '1º Cadastre o Fornecedor ou Hospital Parceiro aqui • 2º Cadastre o Produto no Catálogo (Código Único de Estoque) • 3º Lance a Entrada por Nota Fiscal ou Empréstimo Institucional.',
              },
              {
                title: 'Fornecedor Comercial vs. Outro Hospital / Entidade Parceira',
                badge: 'Classificação',
                tone: 'blue',
                description:
                  'Fornecedores Comerciais são utilizados nas Entradas por Nota Fiscal. Já a classificação "Outro Hospital / Entidade Parceira" permite selecionar a instituição tanto em Entradas como nas operações de Socorro / Empréstimo Institucional.',
              },
              {
                title: 'Regra de Código Único de Produto (Multifornecedor)',
                badge: 'Mesmo Código',
                tone: 'indigo',
                description:
                  'Fornecedores diferentes que entregam o mesmo produto mantêm sempre o mesmo código interno no estoque, independentemente de marca comercial ou nomenclatura descrita na Nota Fiscal.',
              },
            ]}
          />

          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>VOLTAR AO PAINEL</span>
            </button>
          )}
        </div>
      </div>

      {/* Formulário em Abas */}
      {isFormOpen && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden animate-fadeIn">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-0.5 rounded">
                {formMode === 'create'
                  ? 'Novo Fornecedor'
                  : formMode === 'edit'
                  ? 'Edição de Fornecedor'
                  : 'Visualização de Fornecedor'}
              </span>
              <h2 className="text-base font-bold text-slate-800 mt-1">
                {formMode === 'create'
                  ? 'Cadastrar Novo Fornecedor / Distribuidora'
                  : `Fornecedor: ${formRazaoSocial} (${formCodigo})`}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para Listagem</span>
            </button>
          </div>

          {errorMsg && (
            <div className="mx-6 mt-4 p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Abas */}
          <div className="flex border-b border-slate-200 px-6 pt-2 bg-slate-50/50">
            <button
              type="button"
              onClick={() => setActiveFormTab('dados_cadastrais')}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'dados_cadastrais'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              1. Dados Cadastrais & CNPJ
            </button>

            <button
              type="button"
              onClick={() => setActiveFormTab('contato_endereco')}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'contato_endereco'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              2. Contato, Endereço & Observações
            </button>
          </div>

          <form onSubmit={handleSalvar} className="p-6 space-y-6">
            {activeFormTab === 'dados_cadastrais' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Tipo de Cadastro *
                  </label>
                  <SearchableSelect
                    options={[
                      { value: 'fornecedor_comercial', label: 'Fornecedor Comercial (Distribuidora / Fabricante)' },
                      { value: 'entidade_parceira', label: 'Outro Hospital / Entidade Parceira (Empréstimos / Trocas)' },
                    ]}
                    value={formTipoEntidade}
                    onChange={(val) => {
                      const novoTipo = (val || 'fornecedor_comercial') as 'fornecedor_comercial' | 'entidade_parceira';
                      setFormTipoEntidade(novoTipo);
                      if (formMode === 'create') {
                        const prefix = novoTipo === 'entidade_parceira' ? 'ENT' : 'FORN';
                        setFormCodigo(`${prefix}-${String(fornecedores.length + 1).padStart(4, '0')}`);
                      }
                    }}
                    disabled={formMode === 'view'}
                    allowClear={false}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Código *
                  </label>
                  <input
                    type="text"
                    value={formCodigo}
                    onChange={(e) => setFormCodigo(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="ex: FORN-0001 ou ENT-0001"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    CNPJ / CPF
                  </label>
                  <input
                    type="text"
                    value={formCnpj}
                    onChange={(e) => setFormCnpj(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="ex: 12.345.678/0001-90"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Razão Social / Nome da Entidade *
                  </label>
                  <input
                    type="text"
                    value={formRazaoSocial}
                    onChange={(e) => setFormRazaoSocial(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder={
                      formTipoEntidade === 'entidade_parceira'
                        ? 'ex: Hospital de Clínicas Municipal de SBC'
                        : 'ex: Distribuidora Hospitalar MedFarma Ltda'
                    }
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Nome Fantasia / Sigla
                  </label>
                  <input
                    type="text"
                    value={formNomeFantasia}
                    onChange={(e) => setFormNomeFantasia(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="ex: Hospital Clínicas / MedFarma"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Inscrição Estadual / CNES / ANVISA
                  </label>
                  <input
                    type="text"
                    value={formInscricaoEstadual}
                    onChange={(e) => setFormInscricaoEstadual(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="ex: 110.042.490.114"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Status do Cadastro
                  </label>
                  <SearchableSelect
                    options={[
                      { value: 1, label: 'Ativo (Habilitado para Entradas e Empréstimos)', badge: 'Ativo', badgeVariant: 'regular' },
                      { value: 0, label: 'Inativo / Bloqueado', badge: 'Inativo', badgeVariant: 'danger' },
                    ]}
                    value={formAtivo}
                    onChange={(val) => setFormAtivo(Number(val))}
                    disabled={formMode === 'view'}
                    allowClear={false}
                  />
                </div>
              </div>
            )}

            {activeFormTab === 'contato_endereco' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Representante / Contato Responsável
                  </label>
                  <input
                    type="text"
                    value={formContatoResponsavel}
                    onChange={(e) => setFormContatoResponsavel(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="ex: Carlos Mendes"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Telefone / WhatsApp Comercial
                  </label>
                  <input
                    type="text"
                    value={formTelefone}
                    onChange={(e) => setFormTelefone(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="ex: (11) 4123-9000"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    E-mail de Pedidos / Faturamento
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="ex: vendas@medfarma.com.br"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Endereço Comercial
                  </label>
                  <input
                    type="text"
                    value={formEndereco}
                    onChange={(e) => setFormEndereco(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="Rua, Número, Bairro, CEP..."
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={formCidade}
                      onChange={(e) => setFormCidade(e.target.value)}
                      disabled={formMode === 'view'}
                      className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      UF
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      value={formUf}
                      onChange={(e) => setFormUf(e.target.value.toUpperCase())}
                      disabled={formMode === 'view'}
                      className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-teal-500 shadow-inner text-center"
                    />
                  </div>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Observações Comerciais / Prazo de Entrega
                  </label>
                  <textarea
                    rows={2}
                    value={formObservacoes}
                    onChange={(e) => setFormObservacoes(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="Condições comerciais, marcas distribuídas, observações de recebimento..."
                  />
                </div>
              </div>
            )}

            {/* Rodapé: SALVAR e VOLTAR */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <div>
                {formMode === 'edit' && canEdit && editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = fornecedores.find((item) => item.id === editingId);
                      if (target) setDeletingFornecedor(target);
                    }}
                    disabled={isProcessing}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all uppercase tracking-wide cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>EXCLUIR FORNECEDOR</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>VOLTAR</span>
                </button>

                {formMode !== 'view' && (
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-5 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isProcessing ? 'SALVANDO...' : 'SALVAR FORNECEDOR'}</span>
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Top Action Bar: + NOVO e 🔍 FILTROS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-teal-50 text-teal-800 rounded-lg">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Fornecedores & Entidades Parceiras</h2>
            <p className="text-[11px] text-slate-500">Gestão de distribuidores e hospitais parceiros</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
              activeFiltersCount > 0
                ? 'bg-teal-50 border-teal-300 text-teal-800 shadow-2xs'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Search className="w-4 h-4 text-teal-600" />
            <span>FILTROS</span>
            {activeFiltersCount > 0 && (
              <span className="ml-1 bg-teal-600 text-white rounded-full px-1.5 py-0.2 text-[10px] font-bold">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => handleNovo('fornecedor_comercial')}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wide cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ FORNECEDOR</span>
              </button>
              <button
                type="button"
                onClick={() => handleNovo('entidade_parceira')}
                className="bg-[#00237D] hover:bg-blue-900 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wide cursor-pointer"
              >
                <Building2 className="w-4 h-4" />
                <span>+ HOSPITAL PARCEIRO</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Painel de Filtros Retrátil (Colapsável) */}
      {isFilterOpen && (
        <div className="bg-white p-4 rounded-xl border border-teal-200 shadow-md space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Painel de Pesquisa e Filtros</span>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
            >
              ✕ Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Código ou CNPJ/CPF
              </label>
              <input
                type="text"
                value={filtroCodigoCnpj}
                onChange={(e) => {
                  setFiltroCodigoCnpj(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="ex: FORN-0001, ENT-0001 ou CNPJ..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Razão Social / Nome Fantasia
              </label>
              <input
                type="text"
                value={filtroNome}
                onChange={(e) => {
                  setFiltroNome(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Pesquisar por fornecedor ou hospital..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Tipo de Entidade
              </label>
              <SearchableSelect
                options={[
                  { value: 'todos', label: 'TODOS (COMERCIAIS + PARCEIROS)' },
                  { value: 'fornecedor_comercial', label: 'FORNECEDORES COMERCIAIS' },
                  { value: 'entidade_parceira', label: 'OUTRO HOSPITAL / ENTIDADE PARCEIRA' },
                ]}
                value={filtroTipoEntidade}
                onChange={(val) => {
                  setFiltroTipoEntidade((val || 'todos') as any);
                  setCurrentPage(1);
                }}
                placeholder="Filtrar por tipo..."
                allowClear={false}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Situação Cadastral
              </label>
              <SearchableSelect
                options={[
                  { value: 'todos', label: 'TODOS' },
                  { value: '1', label: 'ATIVOS', badge: 'Ativo', badgeVariant: 'regular' },
                  { value: '0', label: 'INATIVOS', badge: 'Inativo', badgeVariant: 'danger' },
                ]}
                value={filtroAtivo}
                onChange={(val) => {
                  setFiltroAtivo((val || 'todos') as any);
                  setCurrentPage(1);
                }}
                placeholder="Filtrar por status..."
                allowClear={false}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleLimparFiltros}
              className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>LIMPAR FILTROS</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              className="py-1.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer uppercase tracking-wider shadow-sm"
            >
              <Search className="w-3.5 h-3.5" />
              <span>APLICAR / PESQUISAR</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="py-1.5 px-4 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer uppercase tracking-wider shadow-sm"
            >
              <span>FECHAR</span>
            </button>
          </div>
        </div>
      )}

      {/* Grid de Resultados Zebrada */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Código</th>
                <th className="py-2.5 px-3">Razão Social / Nome Fantasia</th>
                <th className="py-2.5 px-3 text-center">Tipo</th>
                <th className="py-2.5 px-3">CNPJ / CPF</th>
                <th className="py-2.5 px-3">Contato / Telefone</th>
                <th className="py-2.5 px-3 text-center">Cidade / UF</th>
                <th className="py-2.5 px-3 text-center">Produtos Vinculados</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedFornecedores.length > 0 ? (
                paginatedFornecedores.map((f) => (
                  <tr key={f.id} className="odd:bg-white even:bg-slate-50/70 hover:bg-teal-50/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{f.codigo}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800">{f.razao_social}</div>
                      {f.nome_fantasia && (
                        <div className="text-[11px] text-slate-500">Fantasia: {f.nome_fantasia}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {f.tipo_entidade === 'entidade_parceira' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-[10px] uppercase tracking-wider">
                          <Building2 className="w-3 h-3" />
                          <span>Hospital / Entidade Parceira</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-bold text-[10px] uppercase tracking-wider">
                          <Truck className="w-3 h-3" />
                          <span>Fornecedor Comercial</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{f.cnpj || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {f.contato_responsavel && <div className="font-medium text-slate-700">{f.contato_responsavel}</div>}
                      {f.telefone ? (
                        <div className="flex items-center gap-1 text-[11px] text-slate-500">
                          <Phone className="w-3 h-3" />
                          <span>{f.telefone}</span>
                        </div>
                      ) : (
                        !f.contato_responsavel && '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-600">
                      {f.cidade ? `${f.cidade}${f.uf ? '/' + f.uf : ''}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-mono font-bold text-[11px]">
                        {f.total_produtos_vinculados ?? 0}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {f.ativo === 1 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>ATIVO</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-600 font-bold bg-slate-100 px-2 py-0.5 rounded text-[10px] border border-slate-300">
                          <XCircle className="w-3 h-3" />
                          <span>INATIVO</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleVisualizar(f)}
                          className="p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          title="Visualizar"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEditar(f)}
                              className="p-1.5 rounded hover:bg-teal-100 text-teal-700 transition-colors cursor-pointer"
                              title="Editar fornecedor"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingFornecedor(f)}
                              className="p-1.5 rounded hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer"
                              title="Excluir fornecedor"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    Nenhum fornecedor cadastrado para os filtros informados. Clique em &ldquo;+ NOVO FORNECEDOR&rdquo; para iniciar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Consulta */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            <strong>{filteredFornecedores.length}</strong> fornecedor(es) encontrado(s)
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-semibold text-slate-700">
              Página {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={!!deletingFornecedor}
        title="Excluir Fornecedor"
        entityCode={deletingFornecedor?.codigo}
        entityName={deletingFornecedor?.razao_social || ''}
        description="Esta ação removerá o cadastro do fornecedor e seus vínculos de equivalência, mantendo intacto o saldo dos produtos já recebidos no estoque."
        isProcessing={isProcessing}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingFornecedor(null)}
      />
    </div>
  );
};
