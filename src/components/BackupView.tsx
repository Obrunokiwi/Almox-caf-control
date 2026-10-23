import React, { useState, useEffect, useCallback } from 'react';
import { 
  Database, 
  Download, 
  FileCode, 
  FileSpreadsheet, 
  ShieldCheck, 
  ArrowLeft, 
  Server, 
  HardDriveDownload, 
  RefreshCw, 
  CheckCircle2, 
  Layers,
  Archive,
  Info,
  Clock
} from 'lucide-react';
import type { Usuario } from '../types/index.ts';
import { BackupConfirmationModal, type ExportFormat } from './BackupConfirmationModal.tsx';

interface BackupViewProps {
  currentUser: Usuario;
  onVoltar: () => void;
}

interface BackupInfo {
  sistema: string;
  versao: string;
  padrao: string;
  database_file: string;
  tamanho_bytes: number;
  tamanho_formatado: string;
  total_tabelas: number;
  total_registros: number;
  contagens: Record<string, number>;
  data_servidor: string;
  modo_wal: boolean;
}

export const BackupView: React.FC<BackupViewProps> = ({
  currentUser,
  onVoltar,
}) => {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalFormat, setModalFormat] = useState<ExportFormat>('db');

  const fetchBackupInfo = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('multi_almox_token') || localStorage.getItem('token') || '';
      const res = await fetch('/api/backup/info', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': currentUser.area_sigla || 'ALM',
        },
      });
      if (res.ok) {
        const data = await res.json();
        setInfo(data);
      }
    } catch (err) {
      console.error('Erro ao consultar estatísticas do banco:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchBackupInfo();
  }, [fetchBackupInfo]);

  const handleOpenExport = (format: ExportFormat) => {
    setModalFormat(format);
    setIsModalOpen(true);
  };

  const getTableFriendlyName = (tableName: string): string => {
    switch (tableName) {
      case 'empresas_unidades': return 'Empresas / Unidades Hospitalares';
      case 'centros_custo': return 'Centros de Custo (Setores)';
      case 'usuarios': return 'Operadores & Usuários do Sistema';
      case 'produtos': return 'Catálogo de Produtos & Materiais';
      case 'requisicoes': return 'Requisições Assistenciais de Saída';
      case 'itens_requisicao': return 'Itens Detalhados de Requisição';
      case 'movimentacoes': return 'Livro-Caixa de Movimentações Auditáveis';
      case 'emprestimos': return 'Empréstimos & Custódia de Equipamentos';
      default: return tableName;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-2 sm:p-4">
      {/* =========================================================================
          BARRA DE TÍTULO (Título, Atualizar e Botão VOLTAR)
         ========================================================================= */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-[#00237D] rounded-lg border border-blue-100">
            <HardDriveDownload className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                Backup & Exportação do Banco de Dados
              </h1>
              <span className="px-2 py-0.5 bg-blue-100 text-[#00237D] font-bold text-[10px] rounded uppercase tracking-wider">
                Exclusivo Admin
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Download seguro de cópias físicas SQLite (.db), scripts SQL (.sql) e dados em JSON para conformidade e contingência.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchBackupInfo}
            disabled={loading}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Recarregar estatísticas"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={onVoltar}
            className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>VOLTAR</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          CARDS DE ESTATÍSTICA DO BANCO DE DADOS EM TEMPO REAL
         ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Arquivo do Banco</span>
            <Database className="w-4 h-4 text-teal-600" />
          </div>
          <div className="font-mono text-lg font-bold text-slate-800 truncate">
            {info ? info.database_file : 'almoxarifado.db'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Tamanho físico: <strong className="text-slate-700">{info ? info.tamanho_formatado : '...'}</strong>
          </p>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total de Tabelas</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-800">
            {info ? info.total_tabelas : '8'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Mapeamento relacional completo DDL
          </p>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total de Registros</span>
            <Archive className="w-4 h-4 text-amber-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-800">
            {info ? info.total_registros : '0'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Dados operacionais cadastrados
          </p>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Modo de Operação</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-base font-bold text-slate-800">
            SQLite WAL
          </div>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Integridade Transacional ACID
          </p>
        </div>
      </div>

      {/* =========================================================================
          OPÇÕES DE EXPORTAÇÃO (3 CARDS DE AÇÃO)
         ========================================================================= */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
          Opções de Exportação Disponíveis
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: SQLite Nativo (.db) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between hover:border-teal-500 transition-all">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-base">Arquivo SQLite (.db)</h3>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                    Recomendado
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Gera um snapshot físico atômico via <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-teal-800">VACUUM INTO</code> com flush do log de transações (WAL).
                </p>
              </div>

              <div className="pt-2 text-[11px] text-slate-500 space-y-1 border-t border-slate-100">
                <div>• Cópia bit a bit fiel do banco original</div>
                <div>• Pronto para restauração direta no servidor</div>
                <div>• Nome gerado: <code className="text-slate-600 font-mono text-[10px]">backup_almoxarifado_YYYYMMDD_HHMMSS.db</code></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenExport('db')}
              className="mt-6 w-full py-2.5 px-4 bg-[#00237D] hover:bg-[#001c66] active:bg-[#00144d] text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-950/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar SQLite (.db)</span>
            </button>
          </div>

          {/* Card 2: Script SQL Dump (.sql) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between hover:border-blue-500 transition-all">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <FileCode className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-base">Script SQL Dump (.sql)</h3>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                    Universal
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Gera script texto com a definição completa das tabelas (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-blue-800">DDL</code>) e comandos <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-blue-800">INSERT</code> para todos os registros.
                </p>
              </div>

              <div className="pt-2 text-[11px] text-slate-500 space-y-1 border-t border-slate-100">
                <div>• Compatível com PostgreSQL, MySQL e MariaDB</div>
                <div>• Código legível para auditoria externa</div>
                <div>• Nome gerado: <code className="text-slate-600 font-mono text-[10px]">backup_almoxarifado_YYYYMMDD_HHMMSS.sql</code></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenExport('sql')}
              className="mt-6 w-full py-2.5 px-4 bg-[#192641] hover:bg-[#0f172a] active:bg-black text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Script (.sql)</span>
            </button>
          </div>

          {/* Card 3: Estrutura JSON (.json) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between hover:border-amber-500 transition-all">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-base">Tabelas em JSON (.json)</h3>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                    APIs & BI
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Exporta todos os dados organizados por tabela em objeto JSON padronizado com metadados de execução, versão e operador.
                </p>
              </div>

              <div className="pt-2 text-[11px] text-slate-500 space-y-1 border-t border-slate-100">
                <div>• Integração simples com APIs e planilhas</div>
                <div>• Metadados e cabeçalho de auditoria</div>
                <div>• Nome gerado: <code className="text-slate-600 font-mono text-[10px]">backup_almoxarifado_YYYYMMDD_HHMMSS.json</code></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenExport('json')}
              className="mt-6 w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 active:bg-black text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar JSON (.json)</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          DETALHAMENTO DE REGISTROS POR TABELA
         ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              Contagem de Registros por Tabela Operacional
            </h3>
            <p className="text-xs text-slate-500">
              Todos os registros abaixo serão consolidados nos arquivos de exportação.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase font-bold tracking-wider">
                <th className="py-2.5 px-3">Nome Técnico da Tabela</th>
                <th className="py-2.5 px-3">Descrição Funcional</th>
                <th className="py-2.5 px-3 text-right">Qtd. de Registros</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {info && info.contagens ? (
                Object.entries(info.contagens).map(([tableName, count]) => (
                  <tr key={tableName} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono font-bold text-teal-800">
                      {tableName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {getTableFriendlyName(tableName)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                      {count}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        count > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {count > 0 ? 'Com Dados' : 'Vazia'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-400">
                    Carregando dados das tabelas...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Confirmação */}
      <BackupConfirmationModal
        currentUser={currentUser}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialFormat={modalFormat}
      />
    </div>
  );
};
