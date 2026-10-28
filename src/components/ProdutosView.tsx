import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
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
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Tag,
  Boxes,
  MapPin,
  TrendingDown,
  DollarSign,
  Trash2,
  Truck,
  PackagePlus,
  Layers,
  Sparkles,
  FolderTree,
  X
} from 'lucide-react';
import type { Produto, Fornecedor, ProdutoFornecedor, Usuario, UnidadeMedida, TipoProduto, GrupoProduto, SubgrupoProduto } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import { ConfirmDeleteModal } from './ConfirmDeleteModal.tsx';
import { HelpFloatingModal } from './HelpFloatingModal.tsx';
import { SearchableSelect, type SearchableOption } from './SearchableSelect.tsx';
import { getAuthHeaders } from '../utils/apiUtils.ts';
import { GruposSubgruposModal } from './GruposSubgruposModal.tsx';

interface ProdutosViewProps {
  produtos: Produto[];
  fornecedores?: Fornecedor[];
  currentUser: Usuario | null;
  onRefresh: () => void;
  onVoltar?: () => void;
  onNavigate?: (tab: string) => void;
}

// Unidades de medida oficiais utilizadas
const UNIDADES_MEDIDA_OFICIAIS: Array<{ sigla: string; nome: string }> = [
  { sigla: 'UN', nome: 'UN - Unidade' },
  { sigla: 'UI', nome: 'UI - Unidade Internacional' },
  { sigla: 'RO', nome: 'RO - Rolo' },
  { sigla: 'PC', nome: 'PC - Peça' },
  { sigla: 'BOBINA', nome: 'BOBINA - Bobina' },
  { sigla: 'MT', nome: 'MT - Metro' },
  { sigla: 'CA', nome: 'CA - Caixa' },
  { sigla: 'CX', nome: 'CX - Caixa Padrão' },
  { sigla: 'RESMA', nome: 'RESMA - Resma' },
  { sigla: 'GL', nome: 'GL - Galão' },
  { sigla: 'FR', nome: 'FR - Frasco' },
  { sigla: 'LT', nome: 'LT - Litro' },
  { sigla: 'PCT', nome: 'PCT - Pacote' },
  { sigla: 'KIT', nome: 'KIT - Kit Procedimento' },
  { sigla: 'BIS', nome: 'BIS - Bisnaga' },
  { sigla: 'CT', nome: 'CT - Cartela' },
  { sigla: 'KG', nome: 'KG - Quilograma' },
  { sigla: 'L', nome: 'L - Litro' },
  { sigla: 'AMP', nome: 'AMP - Ampola' },
  { sigla: 'ROLO', nome: 'ROLO - Rolo Hospitalar' },
];

export const ProdutosView: React.FC<ProdutosViewProps> = ({
  produtos,
  fornecedores = [],
  currentUser,
  onRefresh,
  onVoltar,
  onNavigate,
}) => {
  // Grupos e Subgrupos de Produtos do Banco
  const [grupos, setGrupos] = useState<GrupoProduto[]>([]);
  const [subgrupos, setSubgrupos] = useState<SubgrupoProduto[]>([]);
  const [isGruposModalOpen, setIsGruposModalOpen] = useState(false);

  // Filtros de busca
  const [filtroCodigo, setFiltroCodigo] = useState('');
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroGrupoId, setFiltroGrupoId] = useState<string>('todos');
  const [filtroSubgrupoId, setFiltroSubgrupoId] = useState<string>('todos');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'consumivel' | 'nao_consumivel'>('todos');
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | '1' | '0'>('todos');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filtroCodigo.trim()) count++;
    if (filtroNome.trim()) count++;
    if (filtroGrupoId !== 'todos') count++;
    if (filtroSubgrupoId !== 'todos') count++;
    if (filtroTipo !== 'todos') count++;
    if (filtroAtivo !== 'todos') count++;
    return count;
  }, [filtroCodigo, filtroNome, filtroGrupoId, filtroSubgrupoId, filtroTipo, filtroAtivo]);

  const handleLimparFiltros = () => {
    setFiltroCodigo('');
    setFiltroNome('');
    setFiltroGrupoId('todos');
    setFiltroSubgrupoId('todos');
    setFiltroTipo('todos');
    setFiltroAtivo('todos');
    setCurrentPage(1);
  };

  // Controle de Formulário em Abas
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'view'>('create');
  const [activeFormTab, setActiveFormTab] = useState<'dados_principais' | 'controle_estoque' | 'lotes_validade' | 'fornecedores_marcas' | 'historico'>('dados_principais');
  const [editingId, setEditingId] = useState<number | null>(null);

  // Campos de vínculo de Fornecedor/Marca no mesmo código de produto
  const [vincFornecedorId, setVincFornecedorId] = useState<number>(0);
  const [vincMarca, setVincMarca] = useState('');
  const [vincNomenclatura, setVincNomenclatura] = useState('');
  const [vincCodigoRef, setVincCodigoRef] = useState('');
  const [isLinkingForn, setIsLinkingForn] = useState(false);

  // Campos do Formulário
  const [formCodigo, setFormCodigo] = useState('');
  const [formNome, setFormNome] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formGrupoId, setFormGrupoId] = useState<number | null>(null);
  const [formSubgrupoId, setFormSubgrupoId] = useState<number | null>(null);
  const [formSubgrupoNome, setFormSubgrupoNome] = useState<string>('');
  const [formUnidadeMedida, setFormUnidadeMedida] = useState<UnidadeMedida>('UN');
  const [formTipo, setFormTipo] = useState<TipoProduto>('consumivel');
  const [formCustoUnitario, setFormCustoUnitario] = useState<number>(0);
  const [formControlaValidade, setFormControlaValidade] = useState<number>(1);
  const [formEstoqueMinimo, setFormEstoqueMinimo] = useState<number>(10);
  const [formEstoqueMaximo, setFormEstoqueMaximo] = useState<number>(100);
  const [formQuantidadeAtual, setFormQuantidadeAtual] = useState<number>(0);
  const [formLocalizacao, setFormLocalizacao] = useState<string>('PRAT-01');
  const [formAtivo, setFormAtivo] = useState<number>(1);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingProduto, setDeletingProduto] = useState<Produto | null>(null);

  const { toast } = useToast();
  const canEdit = currentUser && (currentUser.perfil === 'admin' || currentUser.perfil === 'almoxarife');

  // Carrega lista de grupos e subgrupos oficiais do backend para a área ativa
  const carregarGruposESubgrupos = async () => {
    try {
      const [resG, resSg] = await Promise.all([
        fetch('/api/grupos-produtos', { headers: getAuthHeaders() }),
        fetch('/api/subgrupos-produtos', { headers: getAuthHeaders() }),
      ]);
      if (resG.ok) {
        const dataG = await resG.json();
        if (Array.isArray(dataG)) setGrupos(dataG);
      }
      if (resSg.ok) {
        const dataSg = await resSg.json();
        if (Array.isArray(dataSg)) setSubgrupos(dataSg);
      }
    } catch (err) {
      console.error('Erro ao carregar grupos/subgrupos:', err);
    }
  };

  useEffect(() => {
    carregarGruposESubgrupos();
  }, [currentUser?.area_sigla]);

  const grupoFormOptions: SearchableOption[] = useMemo(() => [
    { value: '', label: 'Selecione o Grupo de Produto...' },
    ...grupos.map((g) => ({
      value: g.id,
      label: `${g.codigo ? `${g.codigo} - ` : ''}${g.nome} (${g.tipo_padrao === 'consumivel' ? 'Consumível' : 'Não Consumível'})`,
    })),
  ], [grupos]);

  const subgrupoFormOptions: SearchableOption[] = useMemo(() => {
    const list = formGrupoId
      ? subgrupos.filter((sg) => !sg.grupo_id || sg.grupo_id === formGrupoId)
      : subgrupos;
    return [
      { value: '', label: 'Sem Subgrupo / Geral' },
      ...list.map((sg) => ({
        value: sg.id,
        label: `${sg.codigo ? `${sg.codigo} - ` : ''}${sg.nome}${sg.grupo_nome ? ` [${sg.grupo_nome}]` : ''}`,
      })),
    ];
  }, [subgrupos, formGrupoId]);

  const tipoItemOptions: SearchableOption[] = [
    { value: 'consumivel', label: 'Consumível (Dispensação / Requisição)' },
    { value: 'nao_consumivel', label: 'Não Consumível (Equipamento / Empréstimo)' },
  ];

  const unidadeMedidaOptions: SearchableOption[] = UNIDADES_MEDIDA_OFICIAIS.map((u) => ({
    value: u.sigla,
    label: u.nome,
  }));

  const ativoOptions: SearchableOption[] = [
    { value: 1, label: 'SIM (Ativo)' },
    { value: 0, label: 'NÃO (Inativo / Bloqueado)' },
  ];

  const controlaValidadeOptions: SearchableOption[] = [
    { value: 1, label: 'SIM — Obrigatório Lote e Validade na Entrada' },
    { value: 0, label: 'NÃO — Item Permanente / Não Perecível' },
  ];

  const fornecedorVincOptions: SearchableOption[] = useMemo(() => [
    { value: 0, label: 'Selecione o Fornecedor...' },
    ...fornecedores.map((f) => ({
      value: f.id,
      label: `${f.codigo} — ${f.nome_fantasia || f.razao_social}`,
      secondaryLabel: f.cnpj || undefined,
    })),
  ], [fornecedores]);

  const filtroGrupoOptions: SearchableOption[] = useMemo(() => [
    { value: 'todos', label: 'TODOS OS GRUPOS' },
    ...grupos.map((g) => ({
      value: String(g.id),
      label: `${g.codigo ? `${g.codigo} - ` : ''}${g.nome}`,
    })),
  ], [grupos]);

  const filtroSubgrupoOptions: SearchableOption[] = useMemo(() => [
    { value: 'todos', label: 'TODOS OS SUBGRUPOS' },
    ...subgrupos
      .filter((sg) => filtroGrupoId === 'todos' || String(sg.grupo_id) === String(filtroGrupoId))
      .map((sg) => ({
        value: String(sg.id),
        label: `${sg.codigo ? `${sg.codigo} - ` : ''}${sg.nome}`,
      })),
  ], [subgrupos, filtroGrupoId]);

  const filtroTipoOptions: SearchableOption[] = [
    { value: 'todos', label: 'TODOS' },
    { value: 'consumivel', label: 'Consumível' },
    { value: 'nao_consumivel', label: 'Não Consumível' },
  ];

  const filtroAtivoOptions: SearchableOption[] = [
    { value: 'todos', label: 'TODOS' },
    { value: '1', label: 'SIM (Ativo)' },
    { value: '0', label: 'NÃO (Inativo)' },
  ];

  // Filtragem dos produtos
  const filteredProdutos = useMemo(() => {
    return produtos.filter((p) => {
      if (filtroCodigo && !p.codigo.toLowerCase().includes(filtroCodigo.toLowerCase().trim())) {
        return false;
      }
      if (filtroNome && !p.nome.toLowerCase().includes(filtroNome.toLowerCase().trim())) {
        return false;
      }
      if (filtroGrupoId !== 'todos') {
        if (String(p.grupo_id || '') !== String(filtroGrupoId)) {
          return false;
        }
      }
      if (filtroSubgrupoId !== 'todos') {
        if (
          String(p.subgrupo_id || '') !== String(filtroSubgrupoId) &&
          String(p.subgrupo_nome || '').toUpperCase() !== String(filtroSubgrupoId).toUpperCase()
        ) {
          return false;
        }
      }
      if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) {
        return false;
      }
      if (filtroAtivo !== 'todos') {
        const val = filtroAtivo === '1' ? 1 : 0;
        if (p.ativo !== val) return false;
      }
      return true;
    });
  }, [produtos, filtroCodigo, filtroNome, filtroGrupoId, filtroSubgrupoId, filtroTipo, filtroAtivo]);

  const totalPages = Math.ceil(filteredProdutos.length / pageSize) || 1;
  const paginatedProdutos = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProdutos.slice(start, start + pageSize);
  }, [filteredProdutos, currentPage, pageSize]);

  // Ao selecionar um Grupo no formulário, sugere o tipo_padrao correspondente
  const handleGrupoChange = (novoGrupoId: number | null) => {
    setFormGrupoId(novoGrupoId);
    setFormSubgrupoId(null);
    setFormSubgrupoNome('');
    if (novoGrupoId) {
      const g = grupos.find((item) => item.id === novoGrupoId);
      if (g) {
        setFormTipo(g.tipo_padrao);
        setFormControlaValidade(g.tipo_padrao === 'consumivel' ? 1 : 0);
      }
    }
  };

  const handleNovo = async () => {
    setFormMode('create');
    setEditingId(null);

    // Sugere código sequencial numérico de 7 dígitos no padrão 414XXXX
    let codigoSugerido = '4140001';
    try {
      const res = await fetch('/api/produtos/sugestao-codigo', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.codigo) codigoSugerido = data.codigo;
      }
    } catch {
      codigoSugerido = '4140001';
    }

    setFormCodigo(codigoSugerido);
    setFormNome('');
    setFormDescricao('');
    setFormGrupoId(1); // 1 = ALMOXARIFADO CENTRAL (consumivel)
    setFormSubgrupoId(null);
    setFormSubgrupoNome('');
    setFormUnidadeMedida('UN');
    setFormTipo('consumivel');
    setFormCustoUnitario(0);
    setFormControlaValidade(1);
    setFormEstoqueMinimo(10);
    setFormEstoqueMaximo(100);
    setFormQuantidadeAtual(0);
    setFormLocalizacao('PRAT-A1');
    setFormAtivo(1);
    setActiveFormTab('dados_principais');
    setErrorMsg(null);
    setIsFormOpen(true);
  };

  const handleEditar = (p: Produto) => {
    setFormMode('edit');
    setEditingId(p.id);
    setFormCodigo(p.codigo);
    setFormNome(p.nome);
    setFormDescricao(p.descricao || '');
    setFormGrupoId(p.grupo_id || null);
    setFormSubgrupoId(p.subgrupo_id || null);
    setFormSubgrupoNome(p.subgrupo_nome || '');
    setFormUnidadeMedida(p.unidade_medida);
    setFormTipo(p.tipo);
    setFormCustoUnitario(p.custo_unitario ?? p.valor_unitario ?? 0);
    setFormControlaValidade(p.controla_validade === undefined ? (p.tipo === 'consumivel' ? 1 : 0) : p.controla_validade);
    setFormEstoqueMinimo(p.estoque_minimo);
    setFormEstoqueMaximo(p.estoque_maximo);
    setFormQuantidadeAtual(p.quantidade_atual);
    setFormLocalizacao(p.localizacao || 'Almox. Central');
    setFormAtivo(p.ativo);
    setActiveFormTab('dados_principais');
    setErrorMsg(null);
    setIsFormOpen(true);
  };

  const handleVisualizar = (p: Produto) => {
    handleEditar(p);
    setFormMode('view');
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formMode === 'view') {
      setIsFormOpen(false);
      return;
    }

    if (!formNome.trim() || !formUnidadeMedida || !formTipo) {
      const msg = 'Descrição do Produto, Unidade de Medida e Tipo são obrigatórios.';
      setErrorMsg(msg);
      toast.error('Campos Obrigatórios', msg);
      setActiveFormTab('dados_principais');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const payload = {
        codigo: formCodigo ? formCodigo.trim() : '',
        nome: formNome.trim().toUpperCase(),
        descricao: formDescricao ? formDescricao.trim() : null,
        grupo_id: formGrupoId ? Number(formGrupoId) : null,
        subgrupo_id: formSubgrupoId ? Number(formSubgrupoId) : null,
        subgrupo_nome: formSubgrupoNome ? formSubgrupoNome.trim().toUpperCase() : null,
        unidade_medida: formUnidadeMedida.trim().toUpperCase(),
        tipo: formTipo,
        custo_unitario: Number(formCustoUnitario) || 0,
        valor_unitario: Number(formCustoUnitario) || 0,
        controla_validade: Number(formControlaValidade),
        estoque_minimo: Number(formEstoqueMinimo) || 0,
        estoque_maximo: Number(formEstoqueMaximo) || 0,
        localizacao: formLocalizacao ? formLocalizacao.trim().toUpperCase() : null,
        ativo: formAtivo,
      };

      const url = formMode === 'create' ? '/api/produtos' : `/api/produtos/${editingId}`;
      const method = formMode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar produto.');
      }

      if (formMode === 'create') {
        toast.success(
          'Produto Cadastrado com Sucesso',
          `O item "${data.codigo || payload.codigo} - ${payload.nome}" foi registrado no catálogo.`
        );
      } else {
        toast.success(
          'Produto Atualizado com Sucesso',
          `As alterações no item "${payload.codigo} - ${payload.nome}" foram salvas.`
        );
      }

      setIsFormOpen(false);
      onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Erro ao processar catálogo.';
      setErrorMsg(msg);
      toast.error(
        formMode === 'create' ? 'Erro ao Cadastrar Produto' : 'Erro ao Editar Produto',
        msg
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduto) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/produtos/${deletingProduto.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível excluir o produto.');
      }
      toast.success('Produto Excluído', data.message || `Produto "${deletingProduto.nome}" removido do catálogo.`);
      setDeletingProduto(null);
      if (editingId === deletingProduto.id) {
        setIsFormOpen(false);
      }
      onRefresh();
    } catch (err: any) {
      toast.error('Erro ao Excluir Produto', err.message || 'Não foi possível excluir o produto.');
    } finally {
      setIsProcessing(false);
    }
  };

  const editingProdutoObj = useMemo(
    () => (editingId ? produtos.find((item) => item.id === editingId) || null : null),
    [produtos, editingId]
  );

  const handleVincularFornecedor = async () => {
    if (!editingId || !vincFornecedorId) {
      toast.error('Fornecedor Obrigatório', 'Selecione um fornecedor cadastrado para vincular a este código de produto.');
      return;
    }
    setIsLinkingForn(true);
    try {
      const res = await fetch(`/api/produtos/${editingId}/fornecedores`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          fornecedor_id: vincFornecedorId,
          marca: vincMarca ? vincMarca.trim().toUpperCase() : null,
          nomenclatura_fornecedor: vincNomenclatura ? vincNomenclatura.trim().toUpperCase() : null,
          codigo_referencia_fornecedor: vincCodigoRef ? vincCodigoRef.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao vincular fornecedor.');
      }
      toast.success('Fornecedor Vinculado', 'O fornecedor e a marca foram vinculados ao código do produto.');
      setVincFornecedorId(0);
      setVincMarca('');
      setVincNomenclatura('');
      setVincCodigoRef('');
      onRefresh();
    } catch (err: any) {
      toast.error('Erro ao Vincular', err.message || 'Não foi possível vincular o fornecedor.');
    } finally {
      setIsLinkingForn(false);
    }
  };

  const handleRemoverVinculoFornecedor = async (vinculoId: number) => {
    if (!editingId) return;
    setIsLinkingForn(true);
    try {
      const res = await fetch(`/api/produtos/${editingId}/fornecedores/${vinculoId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        toast.info('Vínculo Removido', 'O vínculo de fornecedor/marca foi removido deste produto.');
        onRefresh();
      }
    } finally {
      setIsLinkingForn(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho Compacto */}
      <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 text-teal-800 rounded-lg">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">
              Consulta de Produtos & Catálogo
            </h1>
            <p className="text-xs text-slate-500">
              Códigos numéricos originais, grupos de produtos, custo unitário e classificação contábil
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HelpFloatingModal
            title="Ajuda & Regras — Catálogo de Produtos"
            subtitle="Padrão Numérico de 7 Dígitos • Grupos Oficiais • Base de Custo para Curva ABC"
            currentStep={2}
            onNavigate={onNavigate}
            sections={[
              {
                title: 'Código Interno Numérico (7 Dígitos)',
                badge: 'Padrão 414XXXX / 415XXXX',
                tone: 'blue',
                description:
                  'O sistema aceita diretamente códigos numéricos puros (ex: 4149881, 4149745) sem impor prefixos alfanuméricos. Ao deixar o código em branco, o próximo número sequencial será gerado automaticamente.',
              },
              {
                title: 'Grupos Oficiais e Sugestão de Tipo',
                badge: '15 Grupos Oficiais',
                tone: 'teal',
                description:
                  'Ao selecionar um dos 15 Grupos de Produtos, o tipo (Consumível vs Não Consumível) é sugerido de forma automática com base na diretriz do grupo, permitindo alteração manual se necessário.',
              },
              {
                title: 'Custo Unitário e Curva ABC',
                badge: 'Precificação Oficial',
                tone: 'amber',
                description:
                  'O Custo Unitário registrado no cadastro serve como base contábil para o cálculo da Curva ABC por valor financeiro de consumo (Qtd Dispensada × Custo Unitário).',
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

      {/* Formulário em Abas: Cadastro / Edição / Visualização */}
      {isFormOpen && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden animate-fadeIn">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-0.5 rounded">
                {formMode === 'create' ? 'Novo Produto' : formMode === 'edit' ? 'Alteração de Cadastro' : 'Visualização'}
              </span>
              <h2 className="text-base font-bold text-slate-800 mt-1">
                {formMode === 'create' ? 'Cadastrar Novo Item no Catálogo' : `Material: ${formNome} (${formCodigo})`}
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

          {/* Abas do Formulário */}
          <div className="flex flex-wrap border-b border-slate-200 px-6 pt-2 bg-slate-50/50">
            <button
              type="button"
              onClick={() => setActiveFormTab('dados_principais')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'dados_principais'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              1. Código, Grupo & Descrição
            </button>

            <button
              type="button"
              onClick={() => setActiveFormTab('controle_estoque')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'controle_estoque'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              2. Custos & Estoque Mín/Máx
            </button>

            <button
              type="button"
              onClick={() => setActiveFormTab('lotes_validade')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeFormTab === 'lotes_validade'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>3. Lotes & Validade</span>
              {editingProdutoObj?.lotes && (
                <span className="bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded-full text-[10px]">
                  {editingProdutoObj.lotes.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveFormTab('fornecedores_marcas')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeFormTab === 'fornecedores_marcas'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>4. Fornecedores & Marcas</span>
              {editingProdutoObj?.fornecedores_vinculados && (
                <span className="bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded-full text-[10px]">
                  {editingProdutoObj.fornecedores_vinculados.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveFormTab('historico')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'historico'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              5. Rastreabilidade
            </button>
          </div>

          <form onSubmit={handleSalvar} className="p-6 space-y-6">
            {/* ABA 1: DADOS PRINCIPAIS */}
            {activeFormTab === 'dados_principais' && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Código */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Código Interno *
                    </label>
                    <span className="text-[10px] text-teal-700 font-medium">Ex: 4149881</span>
                  </div>
                  <input
                    type="text"
                    value={formCodigo}
                    onChange={(e) => setFormCodigo(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono font-bold focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="Deixe em branco para gerar automático"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Código numérico legados de 7 dígitos ou sequencial.
                  </p>
                </div>

                {/* Grupo de Produto */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Grupo de Produto *
                  </label>
                  <SearchableSelect
                    options={grupoFormOptions}
                    value={formGrupoId || ''}
                    onChange={(val) => handleGrupoChange(val ? Number(val) : null)}
                    disabled={formMode === 'view'}
                    placeholder="Selecione o Grupo..."
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Sugere automaticamente o tipo.
                  </p>
                </div>

                {/* Subgrupo de Produto */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Subgrupo de Produto
                  </label>
                  <SearchableSelect
                    options={subgrupoFormOptions}
                    value={formSubgrupoId || ''}
                    onChange={(val) => {
                      const idNum = val ? Number(val) : null;
                      setFormSubgrupoId(idNum);
                      const found = subgrupos.find((sg) => sg.id === idNum);
                      setFormSubgrupoNome(found ? found.nome : '');
                    }}
                    disabled={formMode === 'view'}
                    placeholder="Selecione o Subgrupo..."
                    allowClear={true}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Subclassificação vinculada ao grupo.
                  </p>
                </div>

                {/* Tipo / Classificação */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Tipo de Item *
                  </label>
                  <SearchableSelect
                    options={tipoItemOptions}
                    value={formTipo}
                    onChange={(val) => {
                      const novoTipo = (val as TipoProduto) || 'consumivel';
                      setFormTipo(novoTipo);
                      setFormControlaValidade(novoTipo === 'consumivel' ? 1 : 0);
                    }}
                    disabled={formMode === 'view'}
                    placeholder="Selecione o Tipo..."
                  />
                </div>

                {/* Descrição Padrão (Caixa Alta) */}
                <div className="md:col-span-4">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Descrição do Produto (Caixa Alta) *
                  </label>
                  <textarea
                    rows={2}
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value.toUpperCase())}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner font-mono font-medium uppercase"
                    placeholder="EX: CANULA ENDOSCÓPICA P/ INJEÇÃO (CATETER PARA ESCLEROTERAPIA) 2.3MM X 2300MM"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Campo amplo suportando descrições padronizadas completas e especificações em caixa alta.
                  </p>
                </div>

                {/* Unidade de Medida */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Unidade de Medida (UND) *
                  </label>
                  <SearchableSelect
                    options={unidadeMedidaOptions}
                    value={formUnidadeMedida}
                    onChange={(val) => setFormUnidadeMedida(val as UnidadeMedida)}
                    disabled={formMode === 'view'}
                    placeholder="Selecione a Unidade..."
                  />
                </div>

                {/* Custo Unitário */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Custo Unitário (R$) — Base Curva ABC *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-500">R$</span>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={formCustoUnitario}
                      onChange={(e) => setFormCustoUnitario(Number(e.target.value))}
                      disabled={formMode === 'view'}
                      className="w-full pl-9 pr-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono font-bold focus:bg-white focus:border-teal-500 shadow-inner"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Base oficial para cálculo financeiro do consumo na Curva ABC.
                  </p>
                </div>

                {/* Ativo (SIM / NÃO) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Item Ativo no Catálogo? *
                  </label>
                  <SearchableSelect
                    options={ativoOptions}
                    value={formAtivo}
                    onChange={(val) => setFormAtivo(Number(val))}
                    disabled={formMode === 'view'}
                    placeholder="Selecione..."
                  />
                </div>

                {/* Localização */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Localização no Almoxarifado
                  </label>
                  <input
                    type="text"
                    value={formLocalizacao}
                    onChange={(e) => setFormLocalizacao(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="ex: Prateleira B-04 / Gaveta 02"
                  />
                </div>

                {/* Controle de Lote */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Controle de Lote e Validade
                  </label>
                  <SearchableSelect
                    options={controlaValidadeOptions}
                    value={formControlaValidade}
                    onChange={(val) => setFormControlaValidade(Number(val))}
                    disabled={formMode === 'view'}
                    placeholder="Selecione..."
                  />
                </div>

                {/* Observações / Especificação Técnica */}
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Observações / Especificação Adicional
                  </label>
                  <textarea
                    rows={2}
                    value={formDescricao}
                    onChange={(e) => setFormDescricao(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="Observações complementares, marcas preferenciais, registro ANVISA..."
                  />
                </div>
              </div>
            )}

            {/* ABA 2: CONTROLE DE ESTOQUE & CAPACIDADES */}
            {activeFormTab === 'controle_estoque' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Estoque Mínimo (Ponto de Reposição) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formEstoqueMinimo}
                    onChange={(e) => setFormEstoqueMinimo(Number(e.target.value))}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-teal-500 shadow-inner"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Dispara alerta gerencial de reposição quando o saldo for menor ou igual.</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Estoque Máximo (Capacidade Física)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formEstoqueMaximo}
                    onChange={(e) => setFormEstoqueMaximo(Number(e.target.value))}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-teal-500 shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Custo Unitário Oficial (R$)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={formCustoUnitario}
                    onChange={(e) => setFormCustoUnitario(Number(e.target.value))}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono font-bold focus:bg-white focus:border-teal-500 shadow-inner"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Valor de referência para precificação e Curva ABC.</p>
                </div>

                <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-lg md:col-span-3 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-teal-900 uppercase tracking-wider">Saldo Físico Atual no Almoxarifado</span>
                    <p className="text-xs text-teal-700">Calculado rigorosamente por entradas fiscais, inventários e saídas/baixas atendidas.</p>
                  </div>
                  <div className="text-2xl font-black text-teal-900 font-mono">
                    {formQuantidadeAtual} {formUnidadeMedida}
                  </div>
                </div>
              </div>
            )}

            {/* ABA 3: LOTES EM ESTOQUE & CONTROLE DE VALIDADE */}
            {activeFormTab === 'lotes_validade' && (
              <div className="space-y-3">
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Nº Lote</th>
                        <th className="py-2 px-3 text-center">Validade</th>
                        <th className="py-2 px-3 text-center">Status / Alerta</th>
                        <th className="py-2 px-3">Fornecedor / Marca NF</th>
                        <th className="py-2 px-3 text-right">Saldo do Lote</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(editingProdutoObj?.lotes || []).length > 0 ? (
                        (editingProdutoObj?.lotes || []).map((lt) => {
                          const st = lt.status_validade;
                          return (
                            <tr key={lt.id} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono font-bold text-slate-800">{lt.numero_lote}</td>
                              <td className="py-2 px-3 text-center font-mono text-slate-700">
                                {lt.data_validade ? lt.data_validade.split('-').reverse().join('/') : 'Indeterminada'}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {st === 'vencido' ? (
                                  <span className="px-2 py-0.5 rounded bg-red-900 text-white font-bold text-[10px] uppercase">
                                    VENCIDO (BLOQUEADO)
                                  </span>
                                ) : st === 'critico_30d' ? (
                                  <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px] uppercase">
                                    CRÍTICO (≤30 DIAS)
                                  </span>
                                ) : st === 'alerta_60d' ? (
                                  <span className="px-2 py-0.5 rounded bg-amber-500 text-white font-bold text-[10px] uppercase">
                                    ALERTA (≤60 DIAS)
                                  </span>
                                ) : st === 'atencao_90d' ? (
                                  <span className="px-2 py-0.5 rounded bg-yellow-400 text-slate-900 font-bold text-[10px] uppercase">
                                    ATENÇÃO (≤90 DIAS)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px] uppercase">
                                    REGULAR (&gt;90 DIAS)
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-slate-600">
                                {lt.fornecedor_nome || lt.marca || 'Padrão Almoxarifado'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                                {lt.quantidade_atual} {editingProdutoObj?.unidade_medida || 'UN'}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400">
                            Nenhum lote com saldo registrado para este produto. Os lotes são criados na confirmação da Nota Fiscal de Entrada ou Ajuste de Inventário.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ABA 4: FORNECEDORES & MARCAS */}
            {activeFormTab === 'fornecedores_marcas' && (
              <div className="space-y-4">
                {formMode !== 'create' && (
                  <>
                    {canEdit && formMode === 'edit' && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-teal-700" />
                          <span>Vincular Novo Fornecedor / Marca ao Código</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                          <div className="md:col-span-4">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              Fornecedor Cadastrado *
                            </label>
                            <SearchableSelect
                              options={fornecedorVincOptions}
                              value={vincFornecedorId}
                              onChange={(val) => setVincFornecedorId(Number(val))}
                              placeholder="Selecione o Fornecedor..."
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              Marca / Fabricante
                            </label>
                            <input
                              type="text"
                              value={vincMarca}
                              onChange={(e) => setVincMarca(e.target.value)}
                              placeholder="ex: BD, Descarpack, Chamex..."
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs text-slate-800 focus:border-teal-500"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              Nomenclatura na NF do Fornecedor
                            </label>
                            <input
                              type="text"
                              value={vincNomenclatura}
                              onChange={(e) => setVincNomenclatura(e.target.value)}
                              placeholder="Descrição usada na NF..."
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs text-slate-800 focus:border-teal-500"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <button
                              type="button"
                              disabled={isLinkingForn || !vincFornecedorId}
                              onClick={handleVincularFornecedor}
                              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-3 rounded text-xs flex items-center justify-center gap-1 uppercase tracking-wide transition-all shadow cursor-pointer disabled:opacity-50"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>VINCULAR</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">Fornecedor</th>
                            <th className="py-2 px-3">Marca</th>
                            <th className="py-2 px-3">Nomenclatura na NF</th>
                            <th className="py-2 px-3 text-right">Último Valor (R$)</th>
                            {formMode === 'edit' && canEdit && <th className="py-2 px-3 text-right">Ação</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {(editingProdutoObj?.fornecedores_vinculados || []).length > 0 ? (
                            (editingProdutoObj?.fornecedores_vinculados || []).map((vf: ProdutoFornecedor) => (
                              <tr key={vf.id} className="hover:bg-slate-50">
                                <td className="py-2 px-3 font-medium text-slate-800">
                                  <span className="font-mono font-bold text-teal-800">{vf.fornecedor_codigo}</span> —{' '}
                                  {vf.fornecedor_nome_fantasia || vf.fornecedor_razao_social}
                                </td>
                                <td className="py-2 px-3 text-slate-700 font-semibold">{vf.marca || 'Padrão'}</td>
                                <td className="py-2 px-3 text-slate-600">{vf.nomenclatura_fornecedor || formNome}</td>
                                <td className="py-2 px-3 text-right font-mono text-slate-700">
                                  {vf.ultimo_valor_unitario
                                    ? `R$ ${Number(vf.ultimo_valor_unitario).toFixed(2)}`
                                    : '—'}
                                </td>
                                {formMode === 'edit' && canEdit && (
                                  <td className="py-2 px-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoverVinculoFornecedor(vf.id)}
                                      className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                      title="Remover vínculo"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-slate-400">
                                Nenhum fornecedor/marca vinculado ainda. Os vínculos também são criados automaticamente ao lançar uma Nota Fiscal.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ABA 5: HISTÓRICO */}
            {activeFormTab === 'historico' && (
              <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-2 max-w-xl">
                <div className="text-xs font-bold text-slate-700">Rastreabilidade no Livro Razão</div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para auditar todas as entradas por nota fiscal, saídas dispensadas para Centros de Custo e eventuais estornos
                  deste produto, utilize o módulo <strong>&ldquo;Livro Razão / Movimentações&rdquo;</strong> ou o módulo de <strong>&ldquo;Inventário do Estoque&rdquo;</strong>.
                </p>
              </div>
            )}

            {/* Rodapé do Formulário: SALVAR e VOLTAR */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <div>
                {formMode === 'edit' && canEdit && editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = produtos.find((item) => item.id === editingId);
                      if (target) setDeletingProduto(target);
                    }}
                    disabled={isProcessing}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all uppercase tracking-wide cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>EXCLUIR ITEM</span>
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
                    <span>{isProcessing ? 'SALVANDO...' : 'SALVAR'}</span>
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Top Action Bar: + NOVO e 🔍 FILTROS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-teal-50 text-teal-800 rounded-lg">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Catálogo de Produtos / Insumos</h2>
            <p className="text-[11px] text-slate-500">Gestão de materiais, código único, lotes e custos</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            <button
              type="button"
              onClick={() => setIsGruposModalOpen(true)}
              className="bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-medium px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wide cursor-pointer"
              title="Gerenciar Grupos e Subgrupos de Produtos"
            >
              <FolderTree className="w-4 h-4" />
              <span>GRUPOS & SUBGRUPOS</span>
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={handleNovo}
              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wide cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ NOVO</span>
            </button>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 1. Código */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Código
              </label>
              <input
                type="text"
                value={filtroCodigo}
                onChange={(e) => { setFiltroCodigo(e.target.value); setCurrentPage(1); }}
                placeholder="ex: 4149881..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            {/* 2. Descrição */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Descrição / Termo
              </label>
              <input
                type="text"
                value={filtroNome}
                onChange={(e) => { setFiltroNome(e.target.value); setCurrentPage(1); }}
                placeholder="Pesquisar por descrição..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            {/* 3. Grupo de Produto */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Grupo
              </label>
              <SearchableSelect
                options={filtroGrupoOptions}
                value={filtroGrupoId}
                onChange={(val) => { setFiltroGrupoId(val ? String(val) : 'todos'); setCurrentPage(1); }}
                placeholder="Todos os grupos..."
              />
            </div>

            {/* 4. Subgrupo de Produto */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Subgrupo
              </label>
              <SearchableSelect
                options={filtroSubgrupoOptions}
                value={filtroSubgrupoId}
                onChange={(val) => { setFiltroSubgrupoId(val ? String(val) : 'todos'); setCurrentPage(1); }}
                placeholder="Todos os subgrupos..."
              />
            </div>

            {/* 5. Tipo */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Tipo
              </label>
              <SearchableSelect
                options={filtroTipoOptions}
                value={filtroTipo}
                onChange={(val) => { setFiltroTipo((val as any) || 'todos'); setCurrentPage(1); }}
                placeholder="Todos os tipos..."
              />
            </div>

            {/* 6. Ativo */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Ativo
              </label>
              <SearchableSelect
                options={filtroAtivoOptions}
                value={filtroAtivo}
                onChange={(val) => { setFiltroAtivo((val as any) || 'todos'); setCurrentPage(1); }}
                placeholder="Todos os status..."
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

      {/* Grid de Resultados Conforme Especificação:
          Código | Descrição do Produto | Grupo | UND | Custo (R$) | Saldo Atual | Tipo | Ativo | Ações */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Código</th>
                <th className="py-2.5 px-3">Descrição do Produto</th>
                <th className="py-2.5 px-3">Grupo / Subgrupo</th>
                <th className="py-2.5 px-3 text-center">UND</th>
                <th className="py-2.5 px-3 text-right">Custo (R$)</th>
                <th className="py-2.5 px-3 text-right">Saldo Atual</th>
                <th className="py-2.5 px-3 text-center">Tipo</th>
                <th className="py-2.5 px-3 text-center">Ativo</th>
                <th className="py-2.5 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedProdutos.length > 0 ? (
                paginatedProdutos.map((p) => {
                  const custo = Number(p.custo_unitario ?? p.valor_unitario ?? 0);
                  return (
                    <tr key={p.id} className="odd:bg-white even:bg-slate-50/70 hover:bg-teal-50/40 transition-colors">
                      {/* Código */}
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">{p.codigo}</td>

                      {/* Descrição do Produto */}
                      <td className="py-2 px-3 font-medium text-slate-800 max-w-md">
                        <div className="truncate font-semibold uppercase">{p.nome}</div>
                        {p.descricao && (
                          <div className="text-[10px] text-slate-500 truncate">{p.descricao}</div>
                        )}
                      </td>

                      {/* Grupo / Subgrupo */}
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px]">
                            <Layers className="w-3 h-3 text-slate-400" />
                            <span>{p.grupo_nome || 'ALMOXARIFADO CENTRAL'}</span>
                          </span>
                          {(p.subgrupo_nome || p.subgrupo_codigo) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-semibold text-[9px] border border-teal-200">
                              <FolderTree className="w-2.5 h-2.5 text-teal-600" />
                              <span>{p.subgrupo_nome || p.subgrupo_codigo}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* UND */}
                      <td className="py-2 px-3 text-center font-mono font-semibold text-slate-700">{p.unidade_medida}</td>

                      {/* Custo (R$) */}
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        {custo > 0 ? `R$ ${custo.toFixed(2)}` : 'R$ 0,00'}
                      </td>

                      {/* Saldo Atual */}
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                        <span className={p.quantidade_atual <= p.estoque_minimo ? 'text-rose-600 font-black' : 'text-slate-800'}>
                          {p.quantidade_atual}
                        </span>
                      </td>

                      {/* Tipo */}
                      <td className="py-2 px-3 text-center">
                        {p.tipo === 'consumivel' ? (
                          <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-medium text-[10px]">
                            Consumível
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium text-[10px]">
                            Não Consumível
                          </span>
                        )}
                      </td>

                      {/* Ativo */}
                      <td className="py-2 px-3 text-center">
                        {p.ativo === 1 ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            SIM
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                            NÃO
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleVisualizar(p)}
                            className="p-1 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded transition-all cursor-pointer"
                            title="Visualizar Detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleEditar(p)}
                              className="p-1 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded transition-all cursor-pointer"
                              title="Editar Produto"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setDeletingProduto(p)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-all cursor-pointer"
                              title="Excluir Produto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Nenhum produto localizado com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Tabela com Paginação */}
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-600">
            Mostrando <strong>{paginatedProdutos.length}</strong> de <strong>{filteredProdutos.length}</strong> produto(s) encontrado(s)
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
        isOpen={!!deletingProduto}
        title="Excluir Produto do Catálogo"
        entityCode={deletingProduto?.codigo}
        entityName={deletingProduto?.nome || ''}
        description="Esta ação removerá o produto do catálogo e os registros de movimentação vinculados, desde que não existam empréstimos ativos pendentes."
        isProcessing={isProcessing}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingProduto(null)}
      />

      <GruposSubgruposModal
        isOpen={isGruposModalOpen}
        onClose={() => setIsGruposModalOpen(false)}
        grupos={grupos}
        subgrupos={subgrupos}
        onUpdated={() => {
          carregarGruposESubgrupos();
          onRefresh();
        }}
        canEdit={Boolean(canEdit)}
      />
    </div>
  );
};
