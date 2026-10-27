import React, { useState } from 'react';
import { 
  Database, 
  Download, 
  FileCode, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  X,
  HardDriveDownload,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import type { Usuario } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';

export type ExportFormat = 'db' | 'sql' | 'json';

interface BackupConfirmationModalProps {
  currentUser: Usuario;
  isOpen: boolean;
  onClose: () => void;
  initialFormat?: ExportFormat;
}

export const BackupConfirmationModal: React.FC<BackupConfirmationModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  initialFormat = 'db',
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(initialFormat);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleDownload = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    let endpoint = '/api/backup/download-db';
    let defaultExtension = 'db';

    if (selectedFormat === 'sql') {
      endpoint = '/api/backup/download-sql';
      defaultExtension = 'sql';
    } else if (selectedFormat === 'json') {
      endpoint = '/api/backup/download-json';
      defaultExtension = 'json';
    }

    try {
      const token = localStorage.getItem('multi_almox_token') || localStorage.getItem('token') || '';
      const res = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': currentUser.area_sigla || 'ALM',
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro HTTP ${res.status} ao gerar exportação.`);
      }

      // Extrai nome do arquivo retornado pelo header Content-Disposition
      let filename = `backup_almoxarifado_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}.${defaultExtension}`;
      const disposition = res.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      setSuccessMsg(`Download de "${filename}" concluído com sucesso!`);
      toast.success('Backup Exportado', `O arquivo "${filename}" foi baixado com sucesso.`);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      const msg = err.message || 'Falha ao processar exportação do banco de dados.';
      setErrorMsg(msg);
      toast.error('Erro na Exportação de Backup', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scaleUp">
        {/* Cabeçalho no padrão Santa Casa SBC */}
        <div className="bg-gradient-to-r from-[#00237D] via-[#102456] to-[#1e3f9a] p-5 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white p-1 flex items-center justify-center shadow-xs shrink-0">
              <img src="/logo.png" alt="Logo Santa Casa S.B.C - Multihospital" className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Exportação do Banco de Dados</h3>
              <p className="text-xs text-blue-100 mt-0.5">Backup e snapshot físico seguro do SQLite</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-4">
          {/* Pergunta de Confirmação Exigida */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
            <p className="font-semibold text-sm text-slate-800 leading-snug">
              Deseja gerar e baixar o backup completo do banco de dados agora?
            </p>
            <p className="text-slate-500 mt-1 text-[11px] leading-relaxed">
              O sistema executará um checkpoint seguro (flush de WAL) para consolidar todas as tabelas em um snapshot consistente sem interromper o atendimento do almoxarifado.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Seleção de Formato de Exportação */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Selecione o Formato Desejado:
            </label>

            <div className="grid grid-cols-1 gap-2.5">
              {/* Opção 1: Arquivo SQLite (.db) */}
              <label 
                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  selectedFormat === 'db'
                    ? 'border-teal-600 bg-teal-50/60 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value="db"
                  checked={selectedFormat === 'db'}
                  onChange={() => setSelectedFormat('db')}
                  className="mt-1 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-teal-700" />
                    <span className="text-xs font-bold text-slate-800">
                      Arquivo SQLite Nativo (.db)
                    </span>
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Snapshot físico exato (VACUUM). Ideal para restauração imediata no servidor, contingência e cópia fiel.
                  </p>
                </div>
              </label>

              {/* Opção 2: Script SQL Dump (.sql) */}
              <label 
                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  selectedFormat === 'sql'
                    ? 'border-teal-600 bg-teal-50/60 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value="sql"
                  checked={selectedFormat === 'sql'}
                  onChange={() => setSelectedFormat('sql')}
                  className="mt-1 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-blue-700" />
                    <span className="text-xs font-bold text-slate-800">
                      Script SQL Completo / Dump (.sql)
                    </span>
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                      Multi-Banco
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Código SQL padrão com DDL de criação de tabelas e comandos INSERT. Compatível com PostgreSQL, MySQL e MariaDB.
                  </p>
                </div>
              </label>

              {/* Opção 3: Dados em JSON (.json) */}
              <label 
                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  selectedFormat === 'json'
                    ? 'border-teal-600 bg-teal-50/60 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value="json"
                  checked={selectedFormat === 'json'}
                  onChange={() => setSelectedFormat('json')}
                  className="mt-1 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-amber-700" />
                    <span className="text-xs font-bold text-slate-800">
                      Tabelas Estruturadas em JSON (.json)
                    </span>
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                      APIs & Integração
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Todos os registros tabulares com metadados de sistema para integração externa ou relatórios em scripts.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Segurança / Permissão */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
            <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
            <span>Operação restrita e auditada pelo perfil: <strong className="text-slate-700">{currentUser.nome} (admin)</strong></span>
          </div>

          {/* Botões de Ação */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs tracking-wider uppercase transition-all cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={loading || !!successMsg}
              className="py-2.5 px-5 bg-[#00237D] hover:bg-[#001c66] active:bg-[#00144d] text-white font-bold rounded-lg text-xs tracking-wider uppercase transition-all shadow-md shadow-blue-950/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gerando Snapshot...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Confirmar Exportação</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
