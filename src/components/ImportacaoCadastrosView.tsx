import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Printer,
  Download,
  ArrowLeft,
  Search,
  Package,
  Truck,
  Building2,
  FileText,
  RotateCcw,
  ShieldAlert,
  HelpCircle,
  Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Usuario, Produto, Fornecedor, Area } from '../types/index.ts';
import { AutocompleteSelect } from './AutocompleteSelect.tsx';
import { useToast } from '../context/ToastContext.tsx';

interface ImportacaoCadastrosViewProps {
  currentUser: Usuario | null;
  onRefresh: () => void;
  onVoltar: () => void;
}

// Estrutura de Produto parsed da planilha
interface ProdutoImportItem {
  id_temp: string;
  codigo: string;
  nome: string;
  descricao?: string;
  grupo_nome: string;
  unidade_medida: string;
  tipo: 'consumivel' | 'nao_consumivel';
  custo_unitario: number;
  valido: boolean;
  motivo_invalido?: string;
  ja_existe_no_banco?: boolean;
}

// Estrutura de Fornecedor parsed da planilha
interface FornecedorImportItem {
  id_temp: string;
  codigo: string;
  razao_social: string;
  nome_fantasia?: string;
  cnpj?: string;
  inscricao_estadual?: string;
  telefone?: string;
  email?: string;
  contato_responsavel?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  tipo_entidade?: 'fornecedor_comercial' | 'entidade_parceira';
  observacoes?: string;
  valido: boolean;
  motivo_invalido?: string;
  ja_existe_no_banco?: boolean;
  tem_conflito?: boolean;
  conflito_detalhes?: string;
  conflito_opcoes?: any[];
}

// Utilitário para decodificar arquivos CSV suportando UTF-8 e Windows-1252 / Latin-1
function decodeCsvBuffer(buffer: ArrayBuffer): string {
  let text = new TextDecoder('utf-8').decode(buffer);
  if (text.includes('\uFFFD')) {
    try {
      text = new TextDecoder('windows-1252').decode(buffer);
    } catch {
      // fallback
    }
  }
  return text;
}

// Utilitário para conversão de custo mantendo a precisão decimal original (suporta número, vírgula e ponto)
function parseCustoValue(rawCustoCell: any): number {
  if (rawCustoCell === undefined || rawCustoCell === null || rawCustoCell === '') return 0;
  if (typeof rawCustoCell === 'number') return rawCustoCell;
  let str = String(rawCustoCell).replace('R$', '').trim();
  // Se contiver tanto ponto quanto vírgula (ex: 1.250,50), ponto é milhar e vírgula é decimal
  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    // Apenas vírgula (ex: 1,50 ou 1250,50): vírgula é separador decimal
    str = str.replace(',', '.');
  }
  // Se contiver apenas ponto (ex: 5.25 ou 1250.50): ponto já é decimal legítimo
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

export const ImportacaoCadastrosView: React.FC<ImportacaoCadastrosViewProps> = ({
  currentUser,
  onRefresh,
  onVoltar,
}) => {
  const { toast } = useToast();
  const isAdmin = currentUser?.perfil === 'admin';

  // Áreas ativas do sistema e Área de Destino da Importação
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedTargetSigla, setSelectedTargetSigla] = useState<string>(currentUser?.area_sigla || 'ALM');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [confirmImportType, setConfirmImportType] = useState<'produtos' | 'fornecedores' | null>(null);

  // Base existente no banco da área de destino (para checagem em tempo real na prévia)
  const [bancoProdutos, setBancoProdutos] = useState<Produto[]>([]);
  const [bancoFornecedores, setBancoFornecedores] = useState<Fornecedor[]>([]);
  const [carregandoBase, setCarregandoBase] = useState(false);

  // Estados Card 1 - Produtos
  const [arquivoProdNome, setArquivoProdNome] = useState<string>('');
  const [produtosParsed, setProdutosParsed] = useState<ProdutoImportItem[]>([]);
  const [isPreviaProdAberta, setIsPreviaProdAberta] = useState(false);
  const [isGravandoProd, setIsGravandoProd] = useState(false);
  const [relatorioProd, setRelatorioProd] = useState<any | null>(null);

  // Estados Card 2 - Fornecedores
  const [arquivoFornNome, setArquivoFornNome] = useState<string>('');
  const [fornecedoresParsed, setFornecedoresParsed] = useState<FornecedorImportItem[]>([]);
  const [isPreviaFornAberta, setIsPreviaFornAberta] = useState(false);
  const [isGravandoForn, setIsGravandoForn] = useState(false);
  const [relatorioForn, setRelatorioForn] = useState<any | null>(null);

  // Carrega lista de áreas ativas
  useEffect(() => {
    const fetchAreas = async () => {
      try {
        const token = localStorage.getItem('multi_almox_token') || localStorage.getItem('token') || '';
        const res = await fetch('/api/areas/publicas', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: Area[] = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setAreas(data);
            if (!data.some((a) => a.sigla.toUpperCase() === selectedTargetSigla.toUpperCase())) {
              setSelectedTargetSigla(data[0].sigla);
            }
          }
        }
      } catch (err) {
        console.error('Erro ao carregar lista de áreas:', err);
      }
    };
    fetchAreas();
  }, []);

  const targetArea = areas.find((a) => a.sigla.toUpperCase() === selectedTargetSigla.toUpperCase()) || {
    id: 1,
    sigla: selectedTargetSigla || 'ALM',
    nome: selectedTargetSigla === 'CAF' ? 'Farmácia / CAF' : 'Almoxarifado',
    arquivo_db: selectedTargetSigla === 'CAF' ? 'caf.db' : 'almoxarifado.db',
  };

  // Carrega produtos e fornecedores cadastrados na ÁREA DE DESTINO selecionada
  const carregarBaseExistente = async (siglaAlvo?: string) => {
    const sigla = siglaAlvo || selectedTargetSigla;
    setCarregandoBase(true);
    try {
      const token = localStorage.getItem('multi_almox_token') || localStorage.getItem('token') || '';
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'X-Area-Sigla': sigla,
      };
      const [resProd, resForn] = await Promise.all([
        fetch('/api/produtos?apenas_ativos=false', { headers }),
        fetch('/api/fornecedores?apenas_ativos=false', { headers }),
      ]);
      if (resProd.ok) setBancoProdutos(await resProd.json());
      if (resForn.ok) setBancoFornecedores(await resForn.json());
    } catch (err) {
      console.error('Erro ao buscar base existente:', err);
    } finally {
      setCarregandoBase(false);
    }
  };

  useEffect(() => {
    carregarBaseExistente();
  }, [selectedTargetSigla]);

  const handleTargetAreaChange = (novaSigla: string) => {
    if (novaSigla === selectedTargetSigla) return;
    setSelectedTargetSigla(novaSigla);
    carregarBaseExistente(novaSigla);

    if (produtosParsed.length > 0 || fornecedoresParsed.length > 0) {
      toast.info(
        'Área de Destino Alterada',
        `Área alterada para ${novaSigla}. A validação de duplicidades será realizada contra o banco desta área.`
      );
    }
  };

  // Se o usuário não for administrador
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 inline-block text-amber-700">
          <ShieldAlert className="w-12 h-12 mx-auto" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Acesso Restrito ao Administrador</h2>
        <p className="text-sm text-slate-600">
          Apenas usuários com perfil de Administrador possuem permissão para executar importações de cadastros (.xls / .xlsx / .csv).
        </p>
        <button
          type="button"
          onClick={onVoltar}
          className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
        >
          Voltar ao Painel
        </button>
      </div>
    );
  }

  // =========================================================================
  // LEITURA DO ARQUIVO DE PRODUTOS (.XLS / .XLSX / .CSV)
  // =========================================================================
  const handleArquivoProdutos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArquivoProdNome(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        let workbook: XLSX.WorkBook;

        if (isCsv) {
          const csvText = decodeCsvBuffer(buffer);
          workbook = XLSX.read(csvText, { type: 'string', raw: true });
        } else {
          workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: true });
        }

        // Procura a aba "saldo_estoque_data" (case-insensitive) ou usa a primeira aba (padrão em CSVs)
        const sheetNameFound =
          workbook.SheetNames.find((s) => s.toLowerCase().trim() === 'saldo_estoque_data') ||
          workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetNameFound];
        if (!worksheet) {
          toast.error('Aba não encontrada', 'Não foi possível encontrar a aba no arquivo.');
          return;
        }

        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          raw: true,
        });

        if (rawRows.length === 0) {
          toast.error('Arquivo Vazio', 'A planilha não contém dados legíveis.');
          return;
        }

        let currentGrupo = 'GERAL';
        let colCod = -1;
        let colDesc = -1;
        let colUnd = -1;
        let colCusto = -1;

        const itens: ProdutoImportItem[] = [];
        const codigosNoBanco = new Set(bancoProdutos.map((p) => String(p.codigo).toUpperCase().trim()));

        for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex++) {
          const row = rawRows[rowIndex];
          if (!row || row.length === 0) continue;

          const rowString = row.map((cell) => String(cell || '').trim()).join(' ');

          // 1. Detecta linha de grupo: "GRUPO DE PRODUTO: ..."
          if (rowString.toUpperCase().includes('GRUPO DE PRODUTO:') || rowString.toUpperCase().includes('GRUPO:')) {
            let grupoTexto = '';
            for (let c = 0; c < row.length; c++) {
              const cellVal = String(row[c] || '').trim();
              if (/GRUPO(?:\s+DE\s+PRODUTO)?:\s*/i.test(cellVal)) {
                const after = cellVal.replace(/GRUPO(?:\s+DE\s+PRODUTO)?:\s*/i, '').trim();
                if (after) {
                  grupoTexto = after;
                } else if (row[c + 1]) {
                  grupoTexto = String(row[c + 1] || '').trim();
                }
                break;
              }
            }
            if (!grupoTexto) {
              const match = rowString.match(/GRUPO(?:\s+DE\s+PRODUTO)?:\s*(.+)$/i);
              if (match && match[1]) {
                grupoTexto = match[1].replace(/^[;,\s]+|[;,\s]+$/g, '').trim();
              }
            }
            if (grupoTexto) {
              currentGrupo = grupoTexto;
            }
            continue;
          }

          // 2. Detecta cabeçalhos repetidos e define colunas
          const isHeaderRow = row.some((c) => {
            const s = String(c || '').toUpperCase();
            return s === 'COD' || s === 'CÓD' || s === 'CODIGO' || s === 'CÓDIGO';
          }) && row.some((c) => {
            const s = String(c || '').toUpperCase();
            return s.includes('DESC') || s.includes('PRODUTO');
          });

          if (isHeaderRow) {
            for (let c = 0; c < row.length; c++) {
              const val = String(row[c] || '').toUpperCase().trim();
              if (val === 'COD' || val === 'CÓD' || val === 'CODIGO' || val === 'CÓDIGO') {
                colCod = c;
              } else if (val.includes('DESC')) {
                colDesc = c;
              } else if (val === 'UND' || val === 'UN' || val === 'UNIDADE') {
                colUnd = c;
              } else if (val === 'CUSTO' || val.includes('CUSTO')) {
                colCusto = c;
              }
            }
            continue; // Ignora a linha do cabeçalho
          }

          // Se as colunas ainda não foram mapeadas pelo cabeçalho, assume índices padrão
          const cCodIdx = colCod >= 0 ? colCod : 0;
          const cDescIdx = colDesc >= 0 ? colDesc : 1;
          const cUndIdx = colUnd >= 0 ? colUnd : 2;
          const cCustoIdx = colCusto >= 0 ? colCusto : 3;

          const rawCod = String(row[cCodIdx] !== undefined ? row[cCodIdx] : '').trim();
          const rawDesc = String(row[cDescIdx] !== undefined ? row[cDescIdx] : '').trim();
          const rawUnd = String(row[cUndIdx] !== undefined ? row[cUndIdx] : 'UN').trim().toUpperCase() || 'UN';
          const rawCustoCell = row[cCustoIdx];

          // Ignora linhas totalmente vazias
          if (!rawCod && !rawDesc) continue;

          // Validações
          let valido = true;
          let motivoInvalido = '';

          if (!rawCod) {
            valido = false;
            motivoInvalido = 'Código (COD) ausente';
          } else if (!rawDesc) {
            valido = false;
            motivoInvalido = 'Descrição do Produto ausente';
          }

          // Conversão de custo mantendo a precisão decimal original sem arredondamento
          const custoNum = parseCustoValue(rawCustoCell);

          // Mapeamento de tipo conforme grupo (equipamento/imobilizado = nao_consumivel, demais = consumivel)
          const upperG = currentGrupo.toUpperCase();
          const isNaoConsumivel = upperG.includes('EQUIPAMENTO') || upperG.includes('IMOBILIZADO');
          const tipo: 'consumivel' | 'nao_consumivel' = isNaoConsumivel ? 'nao_consumivel' : 'consumivel';

          const jaExiste = codigosNoBanco.has(rawCod.toUpperCase());

          itens.push({
            id_temp: `prod-${rowIndex}-${rawCod}`,
            codigo: rawCod, // Preservado exatamente como texto original, sem zeros adicionados
            nome: rawDesc,
            descricao: rawDesc,
            grupo_nome: currentGrupo || 'GERAL',
            unidade_medida: rawUnd,
            tipo,
            custo_unitario: custoNum,
            valido,
            motivo_invalido: motivoInvalido,
            ja_existe_no_banco: jaExiste,
          });
        }

        setProdutosParsed(itens);
        setIsPreviaProdAberta(true);
        setRelatorioProd(null);
        toast.info('Planilha Lida', `${itens.length} registros identificados no arquivo de produtos.`);
      } catch (err: any) {
        console.error('Erro ao ler arquivo de produtos:', err);
        toast.error('Erro na Leitura', 'Não foi possível interpretar a planilha selecionada: ' + err.message);
      }
    };

    reader.readAsArrayBuffer(file);
    // Limpa o valor do input para permitir selecionar o mesmo arquivo novamente se desejar
    e.target.value = '';
  };

  // Confirmar Importação de Produtos no Banco de Destino
  const handleConfirmarImportacaoProdutos = async () => {
    // Apenas registros válidos e que NÃO existem no banco
    const registrosParaGravar = produtosParsed.filter((p) => p.valido && !p.ja_existe_no_banco);

    if (registrosParaGravar.length === 0) {
      toast.warning('Nada a Gravar', 'Todos os registros válidos já existem no catálogo da área selecionada ou estão inválidos.');
      return;
    }

    setIsGravandoProd(true);
    try {
      const token = localStorage.getItem('multi_almox_token') || localStorage.getItem('token') || '';
      const res = await fetch(`/api/importacao/${selectedTargetSigla}/produtos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Area-Sigla': selectedTargetSigla,
        },
        body: JSON.stringify({ produtos: registrosParaGravar, targetSigla: selectedTargetSigla }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao processar gravação no banco de destino.');
      }

      // Constrói relatório consolidado
      const incluidos = data.incluidos || [];
      const ignoradosBanco = produtosParsed.filter((p) => p.ja_existe_no_banco);
      const invalidos = produtosParsed.filter((p) => !p.valido);

      setRelatorioProd({
        tipo: 'produtos',
        area: data.area || targetArea,
        dataHora: new Date(),
        arquivo: arquivoProdNome,
        totalLidos: produtosParsed.length,
        totalIncluidos: incluidos.length,
        totalIgnoradosBanco: ignoradosBanco.length,
        totalInvalidos: invalidos.length,
        incluidos,
        ignoradosBanco,
        invalidos,
        avisos: data.avisos || [],
      });

      setIsPreviaProdAberta(false);
      setProdutosParsed([]);
      setIsConfirmModalOpen(false);
      toast.success(
        'Importação Concluída',
        `${incluidos.length} produtos cadastrados com sucesso no banco da área ${targetArea.nome} (${targetArea.arquivo_db}).`
      );
      onRefresh();
      carregarBaseExistente();
    } catch (err: any) {
      toast.error('Erro na Gravação', err.message);
    } finally {
      setIsGravandoProd(false);
    }
  };

  // =========================================================================
  // LEITURA DO ARQUIVO DE FORNECEDORES / ENTIDADES (.XLS / .XLSX / .CSV)
  // =========================================================================
  const handleArquivoFornecedores = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArquivoFornNome(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        let workbook: XLSX.WorkBook;

        if (isCsv) {
          const csvText = decodeCsvBuffer(buffer);
          workbook = XLSX.read(csvText, { type: 'string', raw: true });
        } else {
          workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: true });
        }

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        if (!worksheet) {
          toast.error('Aba não encontrada', 'A planilha não contém abas legíveis.');
          return;
        }

        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          raw: true,
        });

        if (rawRows.length === 0) {
          toast.error('Arquivo Vazio', 'A planilha não possui linhas.');
          return;
        }

        // Detecta cabeçalhos da planilha
        let colCod = -1;
        let colNome = -1;
        let colFantasia = -1;
        let colCnpj = -1;
        let colTel = -1;
        let colEmail = -1;
        let colEnd = -1;
        let colCid = -1;
        let colUf = -1;
        let colIe = -1;
        let colTipo = -1;
        let colContato = -1;

        let startRow = 0;

        for (let r = 0; r < Math.min(10, rawRows.length); r++) {
          const row = rawRows[r];
          if (!row) continue;
          let hits = 0;
          for (let c = 0; c < row.length; c++) {
            const v = String(row[c] || '').toUpperCase().trim();
            if (v === 'COD' || v === 'CODIGO' || v === 'CÓDIGO' || v === 'ID') {
              colCod = c;
              hits++;
            } else if (v.includes('RAZAO') || v.includes('RAZÃO') || v === 'NOME' || v === 'FORNECEDOR') {
              colNome = c;
              hits++;
            } else if (v.includes('FANTASIA')) {
              colFantasia = c;
              hits++;
            } else if (v.includes('CNPJ') || v.includes('CPF')) {
              colCnpj = c;
              hits++;
            } else if (v.includes('TEL') || v.includes('FONE')) {
              colTel = c;
              hits++;
            } else if (v.includes('EMAIL') || v.includes('E-MAIL')) {
              colEmail = c;
              hits++;
            } else if (v.includes('END') || v.includes('LOGRADOURO')) {
              colEnd = c;
              hits++;
            } else if (v.includes('CIDADE') || v.includes('MUNICIPIO')) {
              colCid = c;
              hits++;
            } else if (v === 'UF' || v === 'ESTADO') {
              colUf = c;
              hits++;
            } else if (v.includes('INSCRIC') || v === 'IE') {
              colIe = c;
              hits++;
            } else if (v.includes('TIPO')) {
              colTipo = c;
              hits++;
            } else if (v.includes('CONTATO') || v.includes('RESP')) {
              colContato = c;
              hits++;
            }
          }

          if (hits >= 2) {
            startRow = r + 1;
            break;
          }
        }

        // Se não achou colunas específicas, usa mapeamento posicional seguro
        if (colCod === -1) colCod = 0;
        if (colNome === -1) colNome = 1;

        const codigosNoBanco = new Set(bancoFornecedores.map((f) => String(f.codigo).toUpperCase().trim()));

        // Agrupamento para detecção de códigos repetidos no mesmo arquivo
        const gruposPorCodigo = new Map<string, any[]>();

        for (let r = startRow; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row) continue;

          const rawCod = String(row[colCod] !== undefined ? row[colCod] : '').trim();
          const rawNome = String(row[colNome] !== undefined ? row[colNome] : '').trim();
          const rawFantasia = colFantasia >= 0 ? String(row[colFantasia] || '').trim() : '';
          const rawCnpj = colCnpj >= 0 ? String(row[colCnpj] || '').trim() : '';
          const rawTel = colTel >= 0 ? String(row[colTel] || '').trim() : '';
          const rawEmail = colEmail >= 0 ? String(row[colEmail] || '').trim() : '';
          const rawEnd = colEnd >= 0 ? String(row[colEnd] || '').trim() : '';
          const rawCid = colCid >= 0 ? String(row[colCid] || '').trim() : '';
          const rawUf = colUf >= 0 ? String(row[colUf] || '').trim().toUpperCase() : '';
          const rawIe = colIe >= 0 ? String(row[colIe] || '').trim() : '';
          const rawTipoStr = colTipo >= 0 ? String(row[colTipo] || '').trim().toLowerCase() : '';
          const rawContato = colContato >= 0 ? String(row[colContato] || '').trim() : '';

          if (!rawCod && !rawNome) continue;

          const itemObj = {
            linha: r + 1,
            codigo: rawCod,
            razao_social: rawNome,
            nome_fantasia: rawFantasia || undefined,
            cnpj: rawCnpj || undefined,
            telefone: rawTel || undefined,
            email: rawEmail || undefined,
            endereco: rawEnd || undefined,
            cidade: rawCid || undefined,
            uf: rawUf || undefined,
            inscricao_estadual: rawIe || undefined,
            contato_responsavel: rawContato || undefined,
            tipo_entidade: rawTipoStr.includes('parceir') ? ('entidade_parceira' as const) : ('fornecedor_comercial' as const),
          };

          const key = rawCod.toUpperCase();
          const list = gruposPorCodigo.get(key) || [];
          list.push(itemObj);
          gruposPorCodigo.set(key, list);
        }

        const parsedList: FornecedorImportItem[] = [];

        for (const [keyCod, rowsDoCodigo] of gruposPorCodigo.entries()) {
          const primeiro = rowsDoCodigo[0];
          let valido = true;
          let motivoInvalido = '';

          if (!primeiro.codigo) {
            valido = false;
            motivoInvalido = 'Código do Fornecedor obrigatório ausente';
          } else if (!primeiro.razao_social) {
            valido = false;
            motivoInvalido = 'Razão Social / Nome obrigatório ausente';
          }

          let temConflito = false;
          let conflitoDetalhes = '';

          // Verifica se existem múltiplos registros com o mesmo código e dados divergentes
          if (rowsDoCodigo.length > 1) {
            // Compara os campos relevantes
            const divergencias: string[] = [];
            const r0 = rowsDoCodigo[0];
            for (let i = 1; i < rowsDoCodigo.length; i++) {
              const ri = rowsDoCodigo[i];
              if (ri.razao_social !== r0.razao_social) divergencias.push('Razão Social divergente');
              if (ri.telefone !== r0.telefone) divergencias.push('Telefones diferentes');
              if (ri.cnpj !== r0.cnpj) divergencias.push('CNPJs diferentes');
              if (ri.endereco !== r0.endereco) divergencias.push('Endereços divergentes');
            }

            if (divergencias.length > 0) {
              temConflito = true;
              conflitoDetalhes = `Código duplicado no arquivo (${rowsDoCodigo.length} ocorrências) com conflito: ${Array.from(new Set(divergencias)).join(', ')}.`;
            }
          }

          const jaExiste = codigosNoBanco.has(keyCod);

          parsedList.push({
            id_temp: `forn-${primeiro.linha}-${primeiro.codigo}`,
            codigo: primeiro.codigo,
            razao_social: primeiro.razao_social,
            nome_fantasia: primeiro.nome_fantasia,
            cnpj: primeiro.cnpj,
            telefone: primeiro.telefone,
            email: primeiro.email,
            endereco: primeiro.endereco,
            cidade: primeiro.cidade,
            uf: primeiro.uf,
            inscricao_estadual: primeiro.inscricao_estadual,
            contato_responsavel: primeiro.contato_responsavel,
            tipo_entidade: primeiro.tipo_entidade,
            valido,
            motivo_invalido: motivoInvalido,
            ja_existe_no_banco: jaExiste,
            tem_conflito: temConflito,
            conflito_detalhes: conflitoDetalhes,
            conflito_opcoes: temConflito ? rowsDoCodigo : undefined,
          });
        }

        setFornecedoresParsed(parsedList);
        setIsPreviaFornAberta(true);
        setRelatorioForn(null);
        toast.info('Planilha Lida', `${parsedList.length} entidades identificadas no arquivo de fornecedores.`);
      } catch (err: any) {
        console.error('Erro ao ler arquivo de fornecedores:', err);
        toast.error('Erro na Leitura', 'Falha ao processar arquivo de fornecedores: ' + err.message);
      }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Resolução manual de conflito de fornecedor na prévia
  const handleEscolherOpcaoConflito = (idTemp: string, opcaoEscolhida: any) => {
    setFornecedoresParsed((prev) =>
      prev.map((item) => {
        if (item.id_temp === idTemp) {
          return {
            ...item,
            razao_social: opcaoEscolhida.razao_social,
            nome_fantasia: opcaoEscolhida.nome_fantasia,
            cnpj: opcaoEscolhida.cnpj,
            telefone: opcaoEscolhida.telefone,
            endereco: opcaoEscolhida.endereco,
            cidade: opcaoEscolhida.cidade,
            uf: opcaoEscolhida.uf,
            tem_conflito: false,
            conflito_detalhes: undefined,
          };
        }
        return item;
      })
    );
    toast.success('Conflito Resolvido', `Dados da ocorrência selecionada aplicados para o código ${opcaoEscolhida.codigo}.`);
  };

  // Confirmar Importação de Fornecedores no Banco de Destino
  const handleConfirmarImportacaoFornecedores = async () => {
    // Apenas válidos, sem conflito e que não existem no banco
    const registrosParaGravar = fornecedoresParsed.filter(
      (f) => f.valido && !f.ja_existe_no_banco && !f.tem_conflito
    );

    if (registrosParaGravar.length === 0) {
      toast.warning('Nada a Gravar', 'Nenhum fornecedor pronto para importação sem conflitos ou pendências na área selecionada.');
      return;
    }

    setIsGravandoForn(true);
    try {
      const token = localStorage.getItem('multi_almox_token') || localStorage.getItem('token') || '';
      const res = await fetch(`/api/importacao/${selectedTargetSigla}/fornecedores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Area-Sigla': selectedTargetSigla,
        },
        body: JSON.stringify({ fornecedores: registrosParaGravar, targetSigla: selectedTargetSigla }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar importação de fornecedores no banco de destino.');
      }

      const incluidos = data.incluidos || [];
      const ignoradosBanco = fornecedoresParsed.filter((f) => f.ja_existe_no_banco);
      const pendenciasConflito = fornecedoresParsed.filter((f) => f.tem_conflito);
      const invalidos = fornecedoresParsed.filter((f) => !f.valido);

      setRelatorioForn({
        tipo: 'fornecedores',
        area: data.area || targetArea,
        dataHora: new Date(),
        arquivo: arquivoFornNome,
        totalLidos: fornecedoresParsed.length,
        totalIncluidos: incluidos.length,
        totalIgnoradosBanco: ignoradosBanco.length,
        totalPendenciasConflito: pendenciasConflito.length,
        totalInvalidos: invalidos.length,
        incluidos,
        ignoradosBanco,
        pendenciasConflito,
        invalidos,
        avisos: data.avisos || [],
      });

      setIsPreviaFornAberta(false);
      setFornecedoresParsed([]);
      setIsConfirmModalOpen(false);
      toast.success(
        'Fornecedores Importados',
        `${incluidos.length} entidades cadastradas com sucesso no banco da área ${targetArea.nome} (${targetArea.arquivo_db}).`
      );
      onRefresh();
      carregarBaseExistente();
    } catch (err: any) {
      toast.error('Erro na Gravação', err.message);
    } finally {
      setIsGravandoForn(false);
    }
  };

  // =========================================================================
  // GERAÇÃO DE PDF E IMPRESSÃO DE RELATÓRIO PÓS-IMPORTAÇÃO
  // =========================================================================
  const handleExportarRelatorioPDF = (rel: any) => {
    if (!rel) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Cabeçalho institucional
    doc.setFillColor(12, 24, 54); // Azul Salutem #0c1836
    doc.rect(0, 0, 210, 28, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('ALMOXCONTROL • RELATÓRIO PÓS-IMPORTAÇÃO DE CADASTROS', 14, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(200, 220, 255);
    const tipoLabel = rel.tipo === 'produtos' ? 'Catálogo de Produtos' : 'Fornecedores e Entidades';
    doc.text(
      `Tipo: ${tipoLabel} | Arquivo: ${rel.arquivo || 'N/A'} | Gerado em: ${new Date(rel.dataHora).toLocaleString('pt-BR')}`,
      14,
      19
    );
    doc.text(`Operador: ${currentUser?.nome || 'Administrador'} (DPO / Auditoria)`, 14, 24);

    // Resumo Estatístico em Box
    doc.setDrawColor(200, 210, 220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 33, 182, 24, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text('Resumo da Operação:', 18, 40);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`• Total de registros lidos no arquivo: ${rel.totalLidos}`, 18, 46);
    doc.text(`• Incluídos com sucesso no banco: ${rel.totalIncluidos}`, 18, 51);

    doc.text(`• Ignorados por código já existente: ${rel.totalIgnoradosBanco}`, 110, 46);
    if (rel.tipo === 'fornecedores') {
      doc.text(`• Pendências não importadas (conflitos): ${rel.totalPendenciasConflito}`, 110, 51);
    } else {
      doc.text(`• Registros inválidos / campos ausentes: ${rel.totalInvalidos}`, 110, 51);
    }

    let startY = 62;

    // Tabela 1: Registros Incluídos com Sucesso
    if (rel.incluidos && rel.incluidos.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 118, 110);
      doc.text(`1. Registros Incluídos com Sucesso (${rel.incluidos.length})`, 14, startY);

      const tableData = rel.incluidos.map((item: any) => {
        if (rel.tipo === 'produtos') {
          return [
            item.codigo,
            item.nome,
            item.grupo || '-',
            item.unidade || 'UN',
            item.tipo === 'nao_consumivel' ? 'Não Consumível' : 'Consumível',
            Number(item.custo || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          ];
        }
        return [
          item.codigo,
          item.razao_social,
          item.cnpj || 'Sem CNPJ',
          item.telefone || '-',
          item.tipo === 'entidade_parceira' ? 'Entidade Parceira' : 'Fornecedor Comercial',
        ];
      });

      const tableHeaders =
        rel.tipo === 'produtos'
          ? [['Código', 'Descrição do Produto', 'Grupo', 'UND', 'Tipo', 'Custo Unit.']]
          : [['Código', 'Razão Social / Entidade', 'CNPJ', 'Telefone', 'Classificação']];

      autoTable(doc, {
        startY: startY + 3,
        head: tableHeaders,
        body: tableData,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
      });

      startY = (doc as any).lastAutoTable.finalY + 8;
    }

    // Tabela 2: Registros Ignorados por Já Existirem
    if (rel.ignoradosBanco && rel.ignoradosBanco.length > 0 && startY < 250) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(100, 116, 139);
      doc.text(`2. Registros Ignorados (Código Já Existente no Banco) (${rel.ignoradosBanco.length})`, 14, startY);

      const tableData = rel.ignoradosBanco.map((item: any) => [
        item.codigo,
        item.nome || item.razao_social,
        'Código já cadastrado no banco. Registro mantido intacto sem alteração.',
      ]);

      autoTable(doc, {
        startY: startY + 3,
        head: [['Código', 'Descrição / Razão Social', 'Motivo da Não Inclusão']],
        body: tableData,
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [100, 116, 139], textColor: [255, 255, 255], fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
      });

      startY = (doc as any).lastAutoTable.finalY + 8;
    }

    // Tabela 3: Pendências e Avisos
    if (rel.avisos && rel.avisos.length > 0 && startY < 260) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(180, 83, 9);
      doc.text('3. Avisos Gerais e Observações da Importação', 14, startY);

      const avisosData = rel.avisos.map((av: string, idx: number) => [`#${idx + 1}`, av]);

      autoTable(doc, {
        startY: startY + 3,
        head: [['Item', 'Mensagem / Alerta']],
        body: avisosData,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
      });
    }

    // Rodapé de auditoria
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Desenvolvido por Bruno Rocha - DPO • Relatório de Conformidade e Auditoria', 14, 290);
      doc.text(`Página ${i} de ${pageCount}`, 190, 290, { align: 'right' });
    }

    doc.save(`relatorio_importacao_${rel.tipo}_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('PDF Gerado', 'Relatório exportado em PDF com sucesso.');
  };

  const handleImprimirRelatorio = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 text-indigo-800 rounded-lg">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                Administração &gt; Importação de Cadastros
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Arquivos .XLS / .XLSX / .CSV
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight mt-1">
              Importação de Cadastros
            </h1>
            <p className="text-xs text-slate-500">
              Importação em massa de Catálogo de Produtos e Fornecedores/Entidades com validação, detecção de conflitos e prévia
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => carregarBaseExistente()}
            disabled={carregandoBase}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer border border-slate-300 flex items-center gap-1.5 transition-all"
            title={`Atualizar contadores da área ${targetArea.nome} (${targetArea.arquivo_db})`}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${carregandoBase ? 'animate-spin' : ''}`} />
            <span>Atualizar Base ({bancoProdutos.length} prods / {bancoFornecedores.length} forns em {targetArea.sigla})</span>
          </button>

          <button
            type="button"
            onClick={onVoltar}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer border border-slate-300 flex items-center gap-1.5 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>VOLTAR</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          SELETOR OBRIGATÓRIO DE ÁREA DE DESTINO DA IMPORTAÇÃO
         ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-5 rounded-xl text-white shadow-md border border-indigo-900/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30 shrink-0">
            <Building2 className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded border border-amber-400/30">
                Área de Destino Obrigatória
              </span>
              <span className="text-[11px] font-medium text-slate-300">
                Banco Afetado: <strong className="text-white font-mono">{targetArea.arquivo_db}</strong>
              </span>
            </div>
            <h2 className="text-base font-bold text-white tracking-tight mt-0.5">
              Destino Selecionado: <span className="text-amber-300">{targetArea.nome} ({targetArea.sigla})</span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Os registros de produtos e fornecedores serão gravados EXCLUSIVAMENTE na base desta área selecionada.
            </p>
          </div>
        </div>

        <div className="w-full md:w-80 shrink-0 bg-white/10 p-2.5 rounded-xl border border-white/15 flex flex-col gap-1.5">
          <label htmlFor="target-area-select" className="text-xs font-bold text-amber-300 uppercase tracking-wider whitespace-nowrap">
            Área de Destino:
          </label>
          <AutocompleteSelect
            id="target-area-select"
            options={areas.map((a) => ({
              value: a.sigla,
              label: `${a.sigla} — ${a.nome}`,
              secondaryLabel: `Banco: ${a.arquivo_db}`,
            }))}
            value={selectedTargetSigla}
            onChange={(val) => handleTargetAreaChange(String(val || ''))}
            allowClear={false}
            placeholder="Selecione a Área..."
          />
        </div>
      </div>

      {/* Grid Principal com os DOIS CARDS DISTINTOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* =========================================================================
            CARD 1 — IMPORTAR PRODUTOS
           ========================================================================= */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between hover:border-indigo-300 transition-all">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-teal-50 text-teal-700 rounded-xl border border-teal-200">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      Card 1
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-mono">
                      Destino: {targetArea.nome} ({targetArea.arquivo_db})
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-800 mt-1">Importar Produtos</h2>
                  <p className="text-xs text-slate-500">
                    Catálogo com código único interno, grupo FEFO, unidade e custo oficial na base {targetArea.sigla}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 text-xs text-slate-600 space-y-2">
              <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-teal-600" />
                <span>Regras de Leitura do Arquivo de Produtos:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                <li>
                  Lê a aba <strong>saldo_estoque_data</strong> (colunas COD, DESCRIÇÃO DO PRODUTO, UND, CUSTO) ou arquivo <strong>.CSV</strong>.
                </li>
                <li>
                  Associa o produto ao grupo da linha anterior com <strong>GRUPO DE PRODUTO:</strong>.
                </li>
                <li>
                  <strong>Código original preservado:</strong> como texto (4 a 7 dígitos), sem preencher zeros à esquerda.
                </li>
                <li>
                  Custo com precisão decimal original (produtos com custo zero são válidos).
                </li>
                <li>
                  <strong>Sem quantidade inicial:</strong> o cadastro de produto não gera saldo nem lotes automaticamente.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <label className="flex-1">
              <input
                type="file"
                accept=".xls,.xlsx,.csv"
                onChange={handleArquivoProdutos}
                className="hidden"
                disabled={isGravandoProd}
              />
              <span className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer shadow transition-all uppercase tracking-wider text-center">
                <Upload className="w-4 h-4" />
                <span>SELECIONAR ARQUIVO DE PRODUTOS (.XLS / .XLSX / .CSV)</span>
              </span>
            </label>
          </div>
        </div>

        {/* =========================================================================
            CARD 2 — IMPORTAR FORNECEDORES / ENTIDADES
           ========================================================================= */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between hover:border-indigo-300 transition-all">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-700 rounded-xl border border-blue-200">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Card 2
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-mono">
                      Destino: {targetArea.nome} ({targetArea.arquivo_db})
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-800 mt-1">Importar Fornecedores / Entidades</h2>
                  <p className="text-xs text-slate-500">
                    Fornecedores comerciais e parceiros na base {targetArea.sigla} com detecção de duplicidades
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 text-xs text-slate-600 space-y-2">
              <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Regras de Leitura de Fornecedores / Entidades:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                <li>
                  Lê código, razão social, CNPJ, telefone, endereço, cidade e UF (.xls, .xlsx ou .csv).
                </li>
                <li>
                  <strong>Código original preservado</strong> como texto; nomes iguais com códigos diferentes são entidades distintas (ex: filiais).
                </li>
                <li>
                  <strong>Detecção de conflitos:</strong> se o mesmo código tiver dados conflitantes (ex: telefones diferentes), gera pendência para decisão manual.
                </li>
                <li>
                  Campos ausentes ficam em branco (não preenche com dados presumidos).
                </li>
                <li>
                  Não cria vínculos automáticos entre fornecedores e produtos.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <label className="flex-1">
              <input
                type="file"
                accept=".xls,.xlsx,.csv"
                onChange={handleArquivoFornecedores}
                className="hidden"
                disabled={isGravandoForn}
              />
              <span className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer shadow transition-all uppercase tracking-wider text-center">
                <Upload className="w-4 h-4" />
                <span>SELECIONAR ARQUIVO DE FORNECEDORES (.XLS / .XLSX / .CSV)</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PRÉVIA ANTES DE CONFIRMAR — PRODUTOS
         ========================================================================= */}
      {isPreviaProdAberta && (
        <div className="bg-white rounded-xl border border-teal-300 shadow-md p-6 space-y-5 animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-100 text-teal-800 rounded-lg">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Painel de Prévia da Importação de Produtos
                </h3>
                <p className="text-xs text-slate-500">
                  Arquivo: <strong>{arquivoProdNome}</strong> • Revise os números antes da gravação transacional
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPreviaProdAberta(false)}
                disabled={isGravandoProd}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs cursor-pointer border border-slate-300"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  setConfirmImportType('produtos');
                  setIsConfirmModalOpen(true);
                }}
                disabled={isGravandoProd || produtosParsed.filter((p) => p.valido && !p.ja_existe_no_banco).length === 0}
                className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg text-xs cursor-pointer shadow flex items-center gap-1.5 disabled:opacity-50"
              >
                {isGravandoProd ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>Gravando no Banco...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>CONFIRMAR GRAVAÇÃO ({targetArea.sigla})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Aviso Explícito de Destino na Prévia */}
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900 font-medium flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-700 shrink-0" />
            <span>
              Os dados abaixo serão gravados exclusivamente na base de dados da área: <strong>{targetArea.nome}</strong> (<code className="font-bold text-indigo-950 font-mono">{targetArea.arquivo_db}</code>).
            </span>
          </div>

          {/* Cards de Resumo da Prévia */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium block">Total lidos no arquivo</span>
              <span className="text-lg font-bold text-slate-800">{produtosParsed.length}</span>
            </div>

            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
              <span className="text-emerald-700 font-medium block">Válidos prontos p/ gravar</span>
              <span className="text-lg font-bold text-emerald-800">
                {produtosParsed.filter((p) => p.valido && !p.ja_existe_no_banco).length}
              </span>
            </div>

            <div className="bg-slate-100 p-3 rounded-lg border border-slate-300">
              <span className="text-slate-600 font-medium block">Já no banco (serão ignorados)</span>
              <span className="text-lg font-bold text-slate-700">
                {produtosParsed.filter((p) => p.ja_existe_no_banco).length}
              </span>
            </div>

            <div className="bg-rose-50 p-3 rounded-lg border border-rose-200">
              <span className="text-rose-700 font-medium block">Campos obrigatórios ausentes</span>
              <span className="text-lg font-bold text-rose-800">
                {produtosParsed.filter((p) => !p.valido).length}
              </span>
            </div>
          </div>

          {/* Tabela de Amostragem da Prévia */}
          <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-80">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 sticky top-0 border-b border-slate-200 text-slate-700 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-2 px-3">Código</th>
                  <th className="py-2 px-3">Descrição do Produto</th>
                  <th className="py-2 px-3">Grupo</th>
                  <th className="py-2 px-2 text-center">UND</th>
                  <th className="py-2 px-3">Tipo</th>
                  <th className="py-2 px-3 text-right">Custo Unit.</th>
                  <th className="py-2 px-3 text-center">Status da Prévia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {produtosParsed.slice(0, 100).map((p) => (
                  <tr
                    key={p.id_temp}
                    className={
                      !p.valido
                        ? 'bg-rose-50/70 text-rose-900'
                        : p.ja_existe_no_banco
                        ? 'bg-slate-50 text-slate-500'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2 px-3 font-mono font-bold">{p.codigo}</td>
                    <td className="py-2 px-3 font-medium">{p.nome}</td>
                    <td className="py-2 px-3 text-slate-600">{p.grupo_nome}</td>
                    <td className="py-2 px-2 text-center font-bold">{p.unidade_medida}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          p.tipo === 'nao_consumivel'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-teal-100 text-teal-800'
                        }`}
                      >
                        {p.tipo === 'nao_consumivel' ? 'Não Consumível' : 'Consumível'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {p.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      {!p.valido ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                          <XCircle className="w-3 h-3" />
                          <span>{p.motivo_invalido}</span>
                        </span>
                      ) : p.ja_existe_no_banco ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                          <Clock className="w-3 h-3" />
                          <span>Já cadastrado (Ignorado)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Pronto para Gravar</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {produtosParsed.length > 100 && (
            <p className="text-[11px] text-slate-500 italic text-center">
              Mostrando os primeiros 100 registros de um total de {produtosParsed.length}.
            </p>
          )}
        </div>
      )}

      {/* =========================================================================
          PRÉVIA ANTES DE CONFIRMAR — FORNECEDORES / ENTIDADES
         ========================================================================= */}
      {isPreviaFornAberta && (
        <div className="bg-white rounded-xl border border-blue-300 shadow-md p-6 space-y-5 animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Painel de Prévia da Importação de Fornecedores / Entidades
                </h3>
                <p className="text-xs text-slate-500">
                  Arquivo: <strong>{arquivoFornNome}</strong> • Conflitos identificados requerem decisão manual
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPreviaFornAberta(false)}
                disabled={isGravandoForn}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs cursor-pointer border border-slate-300"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  setConfirmImportType('fornecedores');
                  setIsConfirmModalOpen(true);
                }}
                disabled={
                  isGravandoForn ||
                  fornecedoresParsed.filter((f) => f.valido && !f.ja_existe_no_banco && !f.tem_conflito).length === 0
                }
                className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg text-xs cursor-pointer shadow flex items-center gap-1.5 disabled:opacity-50"
              >
                {isGravandoForn ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>Gravando no Banco...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>CONFIRMAR GRAVAÇÃO ({targetArea.sigla})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Aviso Explícito de Destino na Prévia de Fornecedores */}
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900 font-medium flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-700 shrink-0" />
            <span>
              Os dados de fornecedores/entidades abaixo serão gravados exclusivamente na base de dados da área: <strong>{targetArea.nome}</strong> (<code className="font-bold text-indigo-950 font-mono">{targetArea.arquivo_db}</code>).
            </span>
          </div>

          {/* Cards de Resumo da Prévia */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium block">Total lidos no arquivo</span>
              <span className="text-lg font-bold text-slate-800">{fornecedoresParsed.length}</span>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <span className="text-blue-700 font-medium block">Prontos p/ importar</span>
              <span className="text-lg font-bold text-blue-800">
                {fornecedoresParsed.filter((f) => f.valido && !f.ja_existe_no_banco && !f.tem_conflito).length}
              </span>
            </div>

            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
              <span className="text-amber-700 font-medium block">Pendências com Conflito</span>
              <span className="text-lg font-bold text-amber-800">
                {fornecedoresParsed.filter((f) => f.tem_conflito).length}
              </span>
            </div>

            <div className="bg-slate-100 p-3 rounded-lg border border-slate-300">
              <span className="text-slate-600 font-medium block">Já no banco (serão ignorados)</span>
              <span className="text-lg font-bold text-slate-700">
                {fornecedoresParsed.filter((f) => f.ja_existe_no_banco).length}
              </span>
            </div>
          </div>

          {/* Destaque Visual para Conflitos Identificados */}
          {fornecedoresParsed.some((f) => f.tem_conflito) && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>
                  Conflitos de Código Duplicado com Dados Divergentes (Decisão Manual do Administrador):
                </span>
              </div>
              <p className="text-[11px] text-amber-800">
                Conforme a regra do sistema, registros com o mesmo código e dados conflitantes são marcados como pendência e NÃO são gravados automaticamente. Você pode escolher qual ocorrência utilizar abaixo:
              </p>

              <div className="space-y-3">
                {fornecedoresParsed
                  .filter((f) => f.tem_conflito)
                  .map((item) => (
                    <div
                      key={item.id_temp}
                      className="bg-white p-3 rounded-lg border border-amber-200 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-900">Código: {item.codigo}</span>
                        <span className="text-[11px] text-rose-700 font-semibold">{item.conflito_detalhes}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                        {item.conflito_opcoes?.map((op, opIdx) => (
                          <div
                            key={opIdx}
                            className="p-2.5 bg-slate-50 rounded border border-slate-200 flex flex-col justify-between gap-2"
                          >
                            <div className="space-y-0.5 text-[11px]">
                              <div className="font-bold text-slate-800">
                                Opção #{opIdx + 1} (Linha {op.linha}): {op.razao_social}
                              </div>
                              <div className="text-slate-600">CNPJ: {op.cnpj || 'Não informado'}</div>
                              <div className="text-slate-600">Telefone: {op.telefone || 'Não informado'}</div>
                              <div className="text-slate-500">
                                Endereço: {op.endereco || '-'} ({op.cidade || '-'}/{op.uf || '-'})
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleEscolherOpcaoConflito(item.id_temp, op)}
                              className="mt-1 py-1 px-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold cursor-pointer transition-colors self-end"
                            >
                              Utilizar esta opção
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Tabela de Fornecedores */}
          <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-80">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 sticky top-0 border-b border-slate-200 text-slate-700 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-2 px-3">Código</th>
                  <th className="py-2 px-3">Razão Social / Entidade</th>
                  <th className="py-2 px-3">CNPJ</th>
                  <th className="py-2 px-3">Telefone</th>
                  <th className="py-2 px-3">Cidade/UF</th>
                  <th className="py-2 px-3 text-center">Status da Prévia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fornecedoresParsed.slice(0, 100).map((f) => (
                  <tr
                    key={f.id_temp}
                    className={
                      f.tem_conflito
                        ? 'bg-amber-50 text-amber-950 font-medium'
                        : !f.valido
                        ? 'bg-rose-50 text-rose-900'
                        : f.ja_existe_no_banco
                        ? 'bg-slate-50 text-slate-500'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2 px-3 font-mono font-bold">{f.codigo}</td>
                    <td className="py-2 px-3 font-medium">{f.razao_social}</td>
                    <td className="py-2 px-3 font-mono text-slate-600">{f.cnpj || '-'}</td>
                    <td className="py-2 px-3 text-slate-600">{f.telefone || '-'}</td>
                    <td className="py-2 px-3 text-slate-600">
                      {f.cidade ? `${f.cidade}/${f.uf || ''}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      {f.tem_conflito ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Pendência: Conflito de Dados</span>
                        </span>
                      ) : !f.valido ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                          <XCircle className="w-3 h-3" />
                          <span>{f.motivo_invalido}</span>
                        </span>
                      ) : f.ja_existe_no_banco ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                          <Clock className="w-3 h-3" />
                          <span>Já cadastrado (Ignorado)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Pronto para Gravar</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          RELATÓRIO PÓS-IMPORTAÇÃO (PRODUTOS OU FORNECEDORES)
         ========================================================================= */}
      {(relatorioProd || relatorioForn) && (
        (() => {
          const rel = relatorioProd || relatorioForn;
          return (
            <div className="bg-white rounded-xl border border-slate-300 shadow-lg p-6 space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-lg">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">
                      Relatório Pós-Importação • {rel.tipo === 'produtos' ? 'Produtos' : 'Fornecedores/Entidades'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Arquivo: <strong>{rel.arquivo}</strong> • Processado em{' '}
                      {new Date(rel.dataHora).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleImprimirRelatorio}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer border border-slate-300 flex items-center gap-1.5 transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    <span>IMPRIMIR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportarRelatorioPDF(rel)}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold cursor-pointer shadow flex items-center gap-1.5 transition-all uppercase tracking-wider"
                  >
                    <Download className="w-4 h-4" />
                    <span>EXPORTAR EM PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (relatorioProd) setRelatorioProd(null);
                      if (relatorioForn) setRelatorioForn(null);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                    title="Fechar Relatório"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Box de Estatísticas Finais */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                  <span className="text-emerald-700 font-semibold block">Incluídos com sucesso</span>
                  <span className="text-2xl font-bold text-emerald-900">{rel.totalIncluidos}</span>
                </div>

                <div className="bg-slate-100 p-4 rounded-xl border border-slate-300">
                  <span className="text-slate-600 font-semibold block">Ignorados (já no banco)</span>
                  <span className="text-2xl font-bold text-slate-800">{rel.totalIgnoradosBanco}</span>
                </div>

                {rel.tipo === 'fornecedores' ? (
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                    <span className="text-amber-700 font-semibold block">Pendências (conflitos)</span>
                    <span className="text-2xl font-bold text-amber-900">{rel.totalPendenciasConflito}</span>
                  </div>
                ) : (
                  <div className="bg-rose-50 p-4 rounded-xl border border-rose-200">
                    <span className="text-rose-700 font-semibold block">Campos ausentes</span>
                    <span className="text-2xl font-bold text-rose-900">{rel.totalInvalidos}</span>
                  </div>
                )}

                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200">
                  <span className="text-indigo-700 font-semibold block">Total processado</span>
                  <span className="text-2xl font-bold text-indigo-900">{rel.totalLidos}</span>
                </div>
              </div>

              {/* Lista de Itens Incluídos */}
              {rel.incluidos.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Registros Incluídos com Sucesso no Catálogo:</span>
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-60">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-bold text-[10px]">
                        <tr>
                          <th className="py-2 px-3">Código</th>
                          <th className="py-2 px-3">Nome / Descrição</th>
                          {rel.tipo === 'produtos' && <th className="py-2 px-3">Grupo</th>}
                          {rel.tipo === 'produtos' && <th className="py-2 px-2 text-center">UND</th>}
                          {rel.tipo === 'produtos' && <th className="py-2 px-3 text-right">Custo Unitário</th>}
                          {rel.tipo === 'fornecedores' && <th className="py-2 px-3">CNPJ</th>}
                          {rel.tipo === 'fornecedores' && <th className="py-2 px-3">Telefone</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rel.incluidos.slice(0, 50).map((it: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono font-bold text-teal-800">{it.codigo}</td>
                            <td className="py-2 px-3 font-medium text-slate-800">{it.nome || it.razao_social}</td>
                            {rel.tipo === 'produtos' && <td className="py-2 px-3 text-slate-600">{it.grupo}</td>}
                            {rel.tipo === 'produtos' && <td className="py-2 px-2 text-center font-bold">{it.unidade}</td>}
                            {rel.tipo === 'produtos' && (
                              <td className="py-2 px-3 text-right font-mono">
                                {Number(it.custo || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </td>
                            )}
                            {rel.tipo === 'fornecedores' && <td className="py-2 px-3 font-mono">{it.cnpj || '-'}</td>}
                            {rel.tipo === 'fornecedores' && <td className="py-2 px-3">{it.telefone || '-'}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rel.incluidos.length > 50 && (
                    <p className="text-[11px] text-slate-400 italic text-center">
                      Exibindo 50 de {rel.incluidos.length} itens. Todos os registros constam no PDF exportável.
                    </p>
                  )}
                </div>
              )}

              {/* Lista de Registros Ignorados por Já Existirem */}
              {rel.ignoradosBanco.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span>Registros Ignorados por Já Existirem no Banco (Sem Alterações):</span>
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-40 bg-slate-50/50">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase font-bold text-[10px]">
                        <tr>
                          <th className="py-2 px-3">Código</th>
                          <th className="py-2 px-3">Descrição / Razão Social</th>
                          <th className="py-2 px-3">Motivo da Não Inclusão</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rel.ignoradosBanco.map((it: any, idx: number) => (
                          <tr key={idx} className="text-slate-600">
                            <td className="py-1.5 px-3 font-mono font-bold">{it.codigo}</td>
                            <td className="py-1.5 px-3">{it.nome || it.razao_social}</td>
                            <td className="py-1.5 px-3 text-[11px] text-slate-500">
                              Código já cadastrado no banco. Registro mantido intacto.
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pendências não importadas e o motivo */}
              {rel.pendenciasConflito && rel.pendenciasConflito.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Pendências Não Importadas por Conflito:</span>
                  </h4>
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-1.5 text-xs">
                    {rel.pendenciasConflito.map((p: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-900">
                          {p.codigo} - {p.razao_social}
                        </span>
                        <span className="text-[11px] text-amber-800">{p.conflito_detalhes}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Avisos Gerais */}
              {rel.avisos && rel.avisos.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>Avisos Gerais da Importação:</span>
                  </h4>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 text-[11px] text-slate-600 max-h-36 overflow-y-auto font-mono">
                    {rel.avisos.map((av: string, idx: number) => (
                      <div key={idx}>• {av}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      )}
      {/* =========================================================================
          MODAL DE CONFIRMAÇÃO DEFINITIVA DE IMPORTAÇÃO
         ========================================================================= */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-100 text-amber-800 rounded-xl border border-amber-200 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-800">
                  Confirmação Definitiva de Importação em Massa
                </h3>
                <p className="text-xs text-slate-500">
                  Validação de segurança e área de destino da gravação.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-600 font-semibold">Tipo de Cadastro:</span>
                <span className="font-bold text-indigo-900 uppercase">
                  {confirmImportType === 'produtos' ? 'Catálogo de Produtos' : 'Fornecedores / Entidades'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-600 font-semibold">Área de Destino:</span>
                <span className="font-bold text-slate-800">
                  {targetArea.nome} ({targetArea.sigla})
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-600 font-semibold">Banco SQLite Afetado:</span>
                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {targetArea.arquivo_db}
                </span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600 font-semibold">Registros a Inserir:</span>
                <span className="font-bold text-teal-800 text-sm">
                  {confirmImportType === 'produtos'
                    ? produtosParsed.filter((p) => p.valido && !p.ja_existe_no_banco).length
                    : fornecedoresParsed.filter((f) => f.valido && !f.ja_existe_no_banco && !f.tem_conflito).length}{' '}
                  registros válidos
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p>
                Os registros serão inseridos exclusivamente na base <strong>{targetArea.arquivo_db}</strong> utilizando transação atômica no SQLite. Apenas cadastros serão criados (0 saldo e sem estoque).
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isGravandoProd || isGravandoForn}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs cursor-pointer border border-slate-300"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirmImportType === 'produtos') {
                    handleConfirmarImportacaoProdutos();
                  } else if (confirmImportType === 'fornecedores') {
                    handleConfirmarImportacaoFornecedores();
                  }
                }}
                disabled={isGravandoProd || isGravandoForn}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg text-xs cursor-pointer shadow flex items-center gap-2"
              >
                {isGravandoProd || isGravandoForn ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Gravando no Banco...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>CONFIRMAR GRAVAÇÃO DEFINITIVA</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
