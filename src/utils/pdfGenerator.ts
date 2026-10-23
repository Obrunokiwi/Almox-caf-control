import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  Movimentacao,
  Requisicao,
  ItemRequisicao,
  HistoricoRequisicao,
  Emprestimo,
  Usuario,
  EmpresaUnidade,
  NotaFiscal,
  NotaFiscalItem,
} from '../types/index.ts';
import { formatDateTimeBrasilia, formatDateBrasilia } from './dateUtils.ts';

export type PdfOutputMode = 'download' | 'print';

export interface PdfGeneratedDocument {
  blobUrl: string;
  filename: string;
  title: string;
  doc: jsPDF;
}

// Carrega o logotipo institucional em Base64 para inclusão no cabeçalho do PDF
export async function loadLogoBase64(): Promise<string | null> {
  try {
    const response = await fetch('/logo.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Aciona impressão direta de um documento jsPDF via iframe oculto ou download
export function finalizeJsPDF(
  doc: jsPDF,
  filename: string,
  title: string,
  mode: PdfOutputMode
): PdfGeneratedDocument {
  if (mode === 'print') {
    doc.autoPrint();
  }

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  if (mode === 'download') {
    doc.save(filename);
  } else {
    triggerDirectIframePrint(blobUrl);
  }

  return {
    blobUrl,
    filename,
    title,
    doc,
  };
}

export function triggerDirectIframePrint(blobUrl: string) {
  try {
    const existing = document.getElementById('jspdf-direct-print-frame') as HTMLIFrameElement | null;
    if (existing) {
      existing.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'jspdf-direct-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0.01';
    iframe.src = blobUrl;

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // Caso o navegador exija interação no preview modal, o modal já estará visível
        }
      }, 250);
    };

    document.body.appendChild(iframe);
  } catch (err) {
    console.error('Erro ao acionar impressão direta via iframe:', err);
  }
}

// Desenha cabeçalho institucional padrão Salutem / Santa Casa no documento jsPDF
async function drawInstitutionalHeader(
  doc: jsPDF,
  options: {
    titulo: string;
    subtitulo: string;
    protocolo?: string;
    activeUnidade?: EmpresaUnidade | null;
    currentUser?: Usuario | null;
  }
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const logoBase64 = await loadLogoBase64();

  // Faixa superior azul institucional
  doc.setFillColor(0, 35, 125);
  doc.rect(12, 10, pageWidth - 24, 24, 'F');

  let textStartX = 16;
  if (logoBase64) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(15, 12.5, 19, 19, 2, 2, 'F');
      doc.addImage(logoBase64, 'PNG', 16, 13.5, 17, 17);
      textStartX = 38;
    } catch {
      textStartX = 16;
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('IRMANDADE DA SANTA CASA DE MISERICÓRDIA DE BIRIGUI', textStartX, 17.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const nomeUnidade = options.activeUnidade
    ? `${options.activeUnidade.codigo} - ${options.activeUnidade.nome}`
    : '001 - Hospital Central - Almoxarifado Central';
  doc.text(`Unidade Operacional: ${nomeUnidade}`, textStartX, 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(options.titulo.toUpperCase(), textStartX, 29.5);

  // Metadados à direita no cabeçalho
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const dataEmissao = new Date().toLocaleString('pt-BR');
  doc.text(`Emissão: ${dataEmissao}`, pageWidth - 15, 17.5, { align: 'right' });
  doc.text(`Operador: ${options.currentUser?.nome || 'Administrador'}`, pageWidth - 15, 23, {
    align: 'right',
  });
  if (options.protocolo) {
    doc.setFont('helvetica', 'bold');
    doc.text(options.protocolo, pageWidth - 15, 29.5, { align: 'right' });
  }

  // Subtítulo abaixo da faixa
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.text(options.subtitulo, 12, 40);

  return 44;
}

// Desenha numeração de páginas e rodapé institucional em todas as páginas
function drawInstitutionalFooters(doc: jsPDF, codigoAutenticacao?: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const leftFooter = codigoAutenticacao
      ? `AlmoxControl Salutem • Autenticação: ${codigoAutenticacao} • Desenvolvido por Bruno Rocha - DPO`
      : 'AlmoxControl Salutem • Controle de Almoxarifado & Rastreabilidade Hospitalar • Desenvolvido por Bruno Rocha - DPO';
    doc.text(leftFooter, 12, pageHeight - 7.5);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 12, pageHeight - 7.5, {
      align: 'right',
    });
  }
}

// ============================================================================
// 1. COMPROVANTE INDIVIDUAL DE MOVIMENTAÇÃO DE ESTOQUE (PDF / IMPRESSÃO DIRETA)
// ============================================================================
export async function generateComprovanteMovimentacaoPDF(params: {
  mov: Movimentacao;
  currentUser?: Usuario | null;
  activeUnidade?: EmpresaUnidade | null;
  mode: PdfOutputMode;
}): Promise<PdfGeneratedDocument> {
  const { mov, currentUser, activeUnidade, mode } = params;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const tipoLabels: Record<string, string> = {
    entrada: 'ENTRADA DE ESTOQUE (RECEBIMENTO)',
    saida: 'SAÍDA / DISPENSAÇÃO AO SETOR',
    estorno_entrada: 'ESTORNO COMPENSATÓRIO DE ENTRADA',
    estorno_saida: 'ESTORNO COMPENSATÓRIO DE SAÍDA',
  };

  const tipoLabel = tipoLabels[mov.tipo] || mov.tipo.toUpperCase();
  const protocolo = `LANC-#${String(mov.id).padStart(6, '0')}`;
  const hashAuditoria = `ALM-${mov.id}-${new Date(mov.data_movimentacao || Date.now()).getTime().toString(16).toUpperCase()}`;

  let currentY = await drawInstitutionalHeader(doc, {
    titulo: 'Comprovante Oficial de Movimentação de Estoque',
    subtitulo: 'Documento auditável de registro transacional imutável do livro-caixa hospitalar',
    protocolo,
    activeUnidade,
    currentUser,
  });

  // Faixa de Destaque do Tipo de Movimento
  const isPositive = mov.tipo === 'entrada' || mov.tipo === 'estorno_saida';
  if (mov.tipo.startsWith('estorno_')) {
    doc.setFillColor(243, 232, 255);
    doc.setDrawColor(192, 132, 252);
    doc.setTextColor(107, 33, 168);
  } else if (isPositive) {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(110, 231, 183);
    doc.setTextColor(6, 95, 70);
  } else {
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(147, 197, 253);
    doc.setTextColor(30, 64, 175);
  }

  doc.roundedRect(12, currentY, pageWidth - 24, 14, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`NATUREZA DA OPERAÇÃO: ${tipoLabel}`, 16, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Lançamento Nº #${mov.id}   |   Data/Hora Registro: ${mov.data_movimentacao}   |   Documento Ref.: ${mov.documento_referencia || 'S/D'}`,
    16,
    currentY + 11.5
  );

  currentY += 20;

  // Bloco 1: Dados do Material / Produto Movimentado
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('1. IDENTIFICAÇÃO DO INSUMO / MATERIAL MOVIMENTADO', 12, currentY);
  currentY += 3;

  const valorUnitario = Number(mov.valor_unitario || 0);
  const valorTotal = valorUnitario * Number(mov.quantidade || 0);
  const sinal = isPositive ? '+' : '-';

  autoTable(doc, {
    startY: currentY,
    head: [
      [
        'Código',
        'Descrição do Material / Produto',
        'UN',
        'Qtd Movimentada',
        'Lote',
        'Validade',
        'Vlr. Unitário',
        'Vlr. Total',
      ],
    ],
    body: [
      [
        mov.produto_codigo || `ID-${mov.produto_id}`,
        mov.produto_nome || 'Material do Almoxarifado',
        mov.unidade_medida || 'UN',
        `${sinal}${mov.quantidade} ${mov.unidade_medida || ''}`.trim(),
        mov.numero_lote || 'N/A',
        mov.data_validade
          ? new Date(mov.data_validade).toLocaleDateString('pt-BR')
          : 'N/A',
        valorUnitario > 0
          ? valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : '—',
        valorTotal > 0
          ? valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : '—',
      ],
    ],
    margin: { left: 12, right: 12 },
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [13, 148, 136],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 24 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 28 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 24 },
      7: { halign: 'right', fontStyle: 'bold', cellWidth: 24 },
    },
  });

  currentY = ((doc as any).lastAutoTable?.finalY || currentY + 25) + 8;

  // Bloco 2: Origem / Destino, Operador e Rastreabilidade
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('2. ORIGEM / DESTINO, RESPONSÁVEL E OBSERVAÇÕES DE AUDITORIA', 12, currentY);
  currentY += 3;

  const setorDestino = mov.centro_custo_nome
    ? `${mov.centro_custo_codigo ? mov.centro_custo_codigo + ' - ' : ''}${mov.centro_custo_nome}`
    : 'Almoxarifado Central (Estoque Geral)';

  autoTable(doc, {
    startY: currentY,
    body: [
      ['Centro de Custo / Setor Vinculado:', setorDestino],
      ['Documento de Referência (NF / Requisição / Termo):', mov.documento_referencia || 'Não informado'],
      ['Operador Responsável pelo Registro:', `${mov.usuario_nome || currentUser?.nome || 'Operador'} (${(mov.usuario_perfil || currentUser?.perfil || 'almoxarife').toUpperCase()})`],
      ['Data e Hora Exata do Lançamento:', String(mov.data_movimentacao)],
      ['Observações / Histórico / Justificativa:', mov.observacao || 'Lançamento regular conferido fisicamente no almoxarifado.'],
      ['Código Único de Verificação Contábil:', hashAuditoria],
    ],
    margin: { left: 12, right: 12 },
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: {
        fontStyle: 'bold',
        fillColor: [248, 250, 252],
        cellWidth: 68,
        textColor: [51, 65, 85],
      },
      1: {
        cellWidth: 'auto',
      },
    },
  });

  currentY = ((doc as any).lastAutoTable?.finalY || currentY + 45) + 10;

  // Termo de Declaração
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(12, currentY, pageWidth - 24, 16, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'DECLARAÇÃO DE CONFERÊNCIA: Declaramos para fins de controle interno e auditoria hospitalar que o(s) insumo(s) descritos neste comprovante foram conferidos fisicamente quanto à especificação, quantidade, integridade de embalagem, lote e validade.',
    15,
    currentY + 6,
    { maxWidth: pageWidth - 30 }
  );

  currentY += 34;

  // Linhas de Assinatura
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.line(22, currentY, 92, currentY);
  doc.line(pageWidth - 92, currentY, pageWidth - 22, currentY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(mov.usuario_nome || currentUser?.nome || 'Operador do Almoxarifado', 57, currentY + 4.5, {
    align: 'center',
  });
  doc.text('Responsável do Setor / Recebedor', pageWidth - 57, currentY + 4.5, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Conferente / Almoxarifado Central', 57, currentY + 8.5, { align: 'center' });
  doc.text(setorDestino, pageWidth - 57, currentY + 8.5, { align: 'center' });

  drawInstitutionalFooters(doc, hashAuditoria);

  const filename = `comprovante_movimentacao_${mov.id}_${Date.now()}.pdf`;
  return finalizeJsPDF(doc, filename, `Comprovante de Movimentação #${mov.id}`, mode);
}

// ============================================================================
// 2. RELATÓRIO / EXTRATO DE MOVIMENTAÇÕES DA TELA (LIVRO-CAIXA OU ENTRADAS NF)
// ============================================================================
export async function generateRelatorioMovimentacoesTelaPDF(params: {
  movimentacoes: Movimentacao[];
  titulo?: string;
  subtitulo?: string;
  filtroDescricao?: string;
  currentUser?: Usuario | null;
  activeUnidade?: EmpresaUnidade | null;
  mode: PdfOutputMode;
}): Promise<PdfGeneratedDocument> {
  const {
    movimentacoes,
    titulo = 'Extrato do Livro-Caixa de Movimentações de Estoque',
    subtitulo = 'Relatório auditável gerado diretamente a partir dos dados filtrados em tela',
    filtroDescricao = 'Todos os lançamentos visíveis na tela',
    currentUser,
    activeUnidade,
    mode,
  } = params;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = await drawInstitutionalHeader(doc, {
    titulo,
    subtitulo: `${subtitulo}  •  Filtro ativo: ${filtroDescricao}`,
    protocolo: `REGISTROS: ${movimentacoes.length}`,
    activeUnidade,
    currentUser,
  });

  // Indicadores Rápidos (KPIs da listagem em tela)
  const totalEntradas = movimentacoes.filter((m) => m.tipo === 'entrada').length;
  const qtdEntradas = movimentacoes
    .filter((m) => m.tipo === 'entrada')
    .reduce((acc, m) => acc + Number(m.quantidade || 0), 0);
  const totalSaidas = movimentacoes.filter((m) => m.tipo === 'saida').length;
  const qtdSaidas = movimentacoes
    .filter((m) => m.tipo === 'saida')
    .reduce((acc, m) => acc + Number(m.quantidade || 0), 0);
  const totalEstornos = movimentacoes.filter((m) => m.tipo.startsWith('estorno_')).length;

  const kpiCards = [
    { label: 'TOTAL DE LANÇAMENTOS', value: `${movimentacoes.length} registro(s)` },
    { label: 'ENTRADAS NO PERÍODO', value: `${totalEntradas} op. (+${qtdEntradas} un)` },
    { label: 'SAÍDAS / DISPENSAÇÕES', value: `${totalSaidas} op. (-${qtdSaidas} un)` },
    { label: 'ESTORNOS AUDITADOS', value: `${totalEstornos} lançamento(s)` },
  ];

  const gap = 4;
  const cardWidth = (pageWidth - 24 - gap * 3) / 4;
  kpiCards.forEach((card, idx) => {
    const x = 12 + idx * (cardWidth + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, currentY, cardWidth, 13, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, x + 3, currentY + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(card.value, x + 3, currentY + 10.5);
  });

  currentY += 17;

  const bodyRows = movimentacoes.map((m) => {
    const isPositive = m.tipo === 'entrada' || m.tipo === 'estorno_saida';
    const sinal = isPositive ? '+' : '-';
    return [
      `#${m.id}`,
      String(m.data_movimentacao || ''),
      m.tipo.replace('_', ' ').toUpperCase(),
      `${m.produto_codigo || ''} - ${m.produto_nome || ''}`,
      `${sinal}${m.quantidade} ${m.unidade_medida || ''}`.trim(),
      m.centro_custo_nome
        ? `${m.centro_custo_codigo ? m.centro_custo_codigo + ' - ' : ''}${m.centro_custo_nome}`
        : 'Almoxarifado Central',
      m.documento_referencia || '—',
      m.usuario_nome || '—',
      m.observacao || '—',
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [
      [
        '# ID',
        'Data / Hora',
        'Tipo',
        'Código / Produto',
        'Qtd',
        'Centro de Custo / Destino',
        'Doc. Ref.',
        'Operador',
        'Observações',
      ],
    ],
    body:
      bodyRows.length > 0
        ? bodyRows
        : [['—', '—', '—', 'Nenhuma movimentação encontrada para os filtros atuais', '0', '—', '—', '—', '—']],
    margin: { left: 12, right: 12, bottom: 18 },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [13, 148, 136],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 14, fontStyle: 'bold' },
      1: { cellWidth: 28 },
      2: { cellWidth: 26, fontStyle: 'bold' },
      3: { cellWidth: 55 },
      4: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 42 },
      6: { cellWidth: 24 },
      7: { cellWidth: 28 },
    },
  });

  drawInstitutionalFooters(doc);

  const filename = `relatorio_movimentacoes_${Date.now()}.pdf`;
  return finalizeJsPDF(doc, filename, titulo, mode);
}

// ============================================================================
// 3. GUIA DE REQUISIÇÃO, COMPROVANTE DE DISPENSAÇÃO E LOG DE AUDITORIA (PDF)
// ============================================================================
// Formatação de data e hora para Brasília (dd/mm/aaaa HH:mm:ss, sem fuso)
export function formatDataHoraBrasilia(dateInput?: string | Date | null): string {
  if (!dateInput) return '—';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    return String(dateInput);
  }
}

export function formatDataValidade(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const clean = String(dateStr).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return clean;
}

// Rodapé único e limpo para requisições
function drawCleanInstitutionalFooters(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(12, pageHeight - 10, pageWidth - 12, pageHeight - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Desenvolvido por Bruno Rocha - DPO', 12, pageHeight - 6);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 12, pageHeight - 6, {
      align: 'right',
    });
  }
}

// ============================================================================
// 3. GUIA DE REQUISIÇÃO (PADRÃO LIMPO + OPÇÃO COM HISTÓRICO)
// ============================================================================
export async function generateComprovanteRequisicaoPDF(params: {
  requisicao: Requisicao;
  itens?: ItemRequisicao[];
  historico?: HistoricoRequisicao[];
  currentUser?: Usuario | null;
  activeUnidade?: EmpresaUnidade | null;
  mode: PdfOutputMode;
  comHistorico?: boolean;
}): Promise<PdfGeneratedDocument> {
  const { requisicao, itens = [], historico = [], activeUnidade, mode, comHistorico = false } = params;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const nomeUnidade = activeUnidade
    ? `${activeUnidade.codigo} - ${activeUnidade.nome}`
    : 'Hospital Central - Almoxarifado Central';

  const logoBase64 = await loadLogoBase64();

  // Cabeçalho Enxuto e Limpo (Fundo branco, economia de tinta, sem faixa escura pesada)
  let headerStartY = 12;
  let textStartX = 14;

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 14, headerStartY, 14, 14);
      textStartX = 32;
    } catch {
      textStartX = 14;
    }
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('IRMANDADE DA SANTA CASA DE MISERICÓRDIA DE BIRIGUI', textStartX, headerStartY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Unidade: ${nomeUnidade}`, textStartX, headerStartY + 8.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(13, 148, 136); // teal-600
  const tituloDoc = comHistorico
    ? `Requisição ${requisicao.numero_requisicao}, via com histórico`
    : `Requisição ${requisicao.numero_requisicao}`;
  doc.text(tituloDoc, textStartX, headerStartY + 13.5);

  // Linha divisória sutil
  let currentY = headerStartY + 17;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(14, currentY, pageWidth - 14, currentY);
  currentY += 4;

  // Quadro de Identificação da Requisição
  const statusMap: Record<string, string> = {
    pendente: 'PENDENTE (EM ANÁLISE)',
    aprovada_atendida: 'APROVADA E ATENDIDA (BAIXA EFETUADA)',
    rejeitada: 'REJEITADA COM PARECER TÉCNICO',
    cancelada: 'CANCELADA',
  };

  const centroCustoStr = `${requisicao.centro_custo_codigo ? requisicao.centro_custo_codigo + ' - ' : ''}${requisicao.centro_custo_nome || ''}`;
  const dataAtendimentoStr = formatDataHoraBrasilia(requisicao.data_atendimento);

  let metaBody: any[][];

  if (!comHistorico) {
    // 4.1 Impressão padrão (limpa):
    // Mantém: Número, Centro de Custo, Solicitante, Almoxarife e Data/Hora do Atendimento em linha única (sem fuso).
    // Remove: Prioridade, Status Atual, Data Solicitação, Data Atendimento duplicada, Emissão, Operador.
    metaBody = [
      [
        'Nº da Requisição:',
        requisicao.numero_requisicao,
        'Centro de Custo:',
        centroCustoStr,
      ],
      [
        'Solicitante:',
        requisicao.solicitante_nome || '—',
        'Almoxarife Responsável:',
        requisicao.almoxarife_nome || 'Aguardando Análise',
      ],
      [
        'Data/Hora do Atendimento:',
        { content: dataAtendimentoStr, colSpan: 3 },
      ],
    ];
    if (requisicao.observacao) {
      metaBody.push([
        'Observação:',
        { content: requisicao.observacao, colSpan: 3 },
      ]);
    }
  } else {
    // 4.2 Impressão com histórico:
    // Acrescenta dados de acompanhamento: Prioridade, Status, Data Solicitação, Data Atendimento.
    metaBody = [
      [
        'Nº da Requisição:',
        requisicao.numero_requisicao,
        'Status Atual:',
        statusMap[requisicao.status] || requisicao.status.toUpperCase(),
      ],
      [
        'Centro de Custo:',
        centroCustoStr,
        'Prioridade:',
        requisicao.prioridade === 'urgente' ? 'URGENTE (ALTA PRIORIDADE)' : 'Normal (Rotina)',
      ],
      [
        'Solicitante:',
        requisicao.solicitante_nome || '—',
        'Data Solicitação:',
        formatDataHoraBrasilia(requisicao.data_solicitacao),
      ],
      [
        'Almoxarife Responsável:',
        requisicao.almoxarife_nome || 'Aguardando Análise',
        'Data Atendimento:',
        dataAtendimentoStr,
      ],
    ];
    if (requisicao.observacao || requisicao.motivo_rejeicao) {
      metaBody.push([
        'Observação / Parecer:',
        { content: [requisicao.observacao, requisicao.motivo_rejeicao].filter(Boolean).join(' | '), colSpan: 3 },
      ]);
    }
  }

  autoTable(doc, {
    startY: currentY,
    body: metaBody,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 38 },
      1: { cellWidth: 58 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 38 },
      3: { cellWidth: 48 },
    },
  });

  currentY = ((doc as any).lastAutoTable?.finalY || currentY + 22) + 5;

  // Montagem das Linhas dos Itens (Item 3: Código / Produto | UND | Qtd Solicitada | Qtd Atendida | Lote(s) | Validade)
  const itemRows: any[] = [];

  for (const it of itens) {
    let lotes: any[] = [];
    if (Array.isArray(it.lotes_atendidos)) {
      lotes = it.lotes_atendidos;
    } else if (typeof it.lotes_atendidos === 'string') {
      try {
        lotes = JSON.parse(it.lotes_atendidos);
      } catch {
        lotes = [];
      }
    }

    const prodDesc = `${it.produto_codigo || ''} - ${it.produto_nome || ''}`.trim();
    const und = it.unidade_medida || 'UN';
    const qtdSolic = String(it.quantidade_solicitada);
    const parecer = it.motivo_decisao || (it.status_item === 'negado' ? 'Item Negado' : 'Item Aprovado');
    const auditadoPor = it.analisado_por_nome || requisicao.almoxarife_nome || '—';

    if (lotes.length > 0) {
      // Se dispensado de mais de um lote, listar uma linha por lote com a quantidade de cada um
      lotes.forEach((l: any, index: number) => {
        const isFirst = index === 0;
        const row: any[] = [
          isFirst ? prodDesc : `↳ ${it.produto_nome || it.produto_codigo || ''} (lote adicional)`,
          und,
          isFirst ? qtdSolic : '—',
          String(l.quantidade),
          l.numero_lote || 'N/A',
          formatDataValidade(l.data_validade),
        ];
        if (comHistorico) {
          row.push(isFirst ? parecer : '—');
          row.push(isFirst ? auditadoPor : '—');
        }
        itemRows.push(row);
      });
    } else {
      const row: any[] = [
        prodDesc,
        und,
        qtdSolic,
        String(it.quantidade_atendida ?? 0),
        '—',
        '—',
      ];
      if (comHistorico) {
        row.push(parecer);
        row.push(auditadoPor);
      }
      itemRows.push(row);
    }
  }

  const tableHead = !comHistorico
    ? [['Código / Produto', 'UND', 'Qtd Solicitada', 'Qtd Atendida', 'Lote(s)', 'Validade']]
    : [
        [
          'Código / Produto',
          'UND',
          'Qtd Solicitada',
          'Qtd Atendida',
          'Lote(s)',
          'Validade',
          'Parecer / Decisão',
          'Auditado Por',
        ],
      ];

  const columnStylesMap: Record<number, any> = !comHistorico
    ? {
        0: { cellWidth: 70 },
        1: { halign: 'center', cellWidth: 14 },
        2: { halign: 'right', cellWidth: 24 },
        3: { halign: 'right', fontStyle: 'bold', cellWidth: 24 },
        4: { halign: 'center', fontStyle: 'bold', cellWidth: 26 },
        5: { halign: 'center', cellWidth: 24 },
      }
    : {
        0: { cellWidth: 50 },
        1: { halign: 'center', cellWidth: 12 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'right', fontStyle: 'bold', cellWidth: 18 },
        4: { halign: 'center', fontStyle: 'bold', cellWidth: 22 },
        5: { halign: 'center', cellWidth: 20 },
        6: { cellWidth: 26 },
        7: { cellWidth: 16 },
      };

  autoTable(doc, {
    startY: currentY,
    head: tableHead,
    body: itemRows.length > 0 ? itemRows : [['Nenhum item adicionado', '—', '0', '0', '—', '—']],
    margin: { left: 14, right: 14 },
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: columnStylesMap,
  });

  currentY = ((doc as any).lastAutoTable?.finalY || currentY + 30) + 6;

  // 4.2: Se comHistorico, adiciona a seção de histórico e auditoria de alterações
  if (comHistorico && historico.length > 0) {
    if (currentY > 215) {
      doc.addPage();
      currentY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('HISTÓRICO E AUDITORIA DE ALTERAÇÕES', 14, currentY);
    currentY += 2;

    const histRows = historico.map((ev) => [
      formatDataHoraBrasilia(ev.data_registro),
      `${ev.usuario_nome} (@${ev.usuario_login})`,
      ev.acao.replace(/_/g, ' ').toUpperCase(),
      ev.detalhes + (ev.justificativa ? ` | Justificativa: ${ev.justificativa}` : ''),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Data / Hora (Brasília)', 'Usuário / Operador', 'Ação', 'Detalhes da Alteração']],
      body: histRows,
      margin: { left: 14, right: 14, bottom: 25 },
      styles: { fontSize: 7, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.15 },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 36, fontStyle: 'bold' },
        2: { cellWidth: 28 },
      },
    });

    currentY = ((doc as any).lastAutoTable?.finalY || currentY + 25) + 6;
  }

  // Bloco de Assinaturas e Avaliação (ÓTIMO / BOM / RUIM)
  if (currentY > 235) {
    doc.addPage();
    currentY = 24;
  }

  currentY += 8;

  // Linhas de assinatura
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);

  // Assinatura 1: Solicitante / Recebedor
  doc.line(16, currentY + 14, 96, currentY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(requisicao.solicitante_nome || 'Solicitante / Recebedor', 56, currentY + 18, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Assinatura do Recebedor do Setor', 56, currentY + 22, { align: 'center' });

  // 3 Perguntas / Avaliação de Atendimento na área de assinatura do recebedor
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Avaliação do Atendimento:   [   ] ÓTIMO      [   ] BOM      [   ] RUIM', 56, currentY + 27, {
    align: 'center',
  });

  // Assinatura 2: Almoxarife
  doc.line(pageWidth - 96, currentY + 14, pageWidth - 16, currentY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(requisicao.almoxarife_nome || 'Almoxarife Responsável', pageWidth - 56, currentY + 18, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Conferência e Baixa — Almoxarifado', pageWidth - 56, currentY + 22, { align: 'center' });

  // Rodapé único em todas as páginas: "Desenvolvido por Bruno Rocha - DPO"
  drawCleanInstitutionalFooters(doc);

  const filename = `${comHistorico ? 'requisicao_com_historico' : 'requisicao'}_${requisicao.numero_requisicao.toLowerCase()}_${Date.now()}.pdf`;
  return finalizeJsPDF(doc, filename, tituloDoc, mode);
}

// ============================================================================
// 4. TERMO DE CAUTELA E COMPROVANTE DE EMPRÉSTIMO / DEVOLUÇÃO (PDF)
// ============================================================================
export async function generateComprovanteEmprestimoPDF(params: {
  emprestimo: Emprestimo;
  currentUser?: Usuario | null;
  activeUnidade?: EmpresaUnidade | null;
  mode: PdfOutputMode;
}): Promise<PdfGeneratedDocument> {
  const { emprestimo, currentUser, activeUnidade, mode } = params;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const codigoTermo = emprestimo.codigo_emprestimo || `EMP-${String(emprestimo.id).padStart(4, '0')}`;

  let currentY = await drawInstitutionalHeader(doc, {
    titulo: `Termo de Cautela e Empréstimo Patrimonial — ${codigoTermo}`,
    subtitulo: 'Comprovante de responsabilidade, retirada e devolução de equipamento não consumível',
    protocolo: codigoTermo,
    activeUnidade,
    currentUser,
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Dados do Termo de Cautela e Equipamento Patrimonial', 'Informação Registrada']],
    body: [
      ['Número do Termo de Cautela:', codigoTermo],
      ['Equipamento / Patrimônio:', `${emprestimo.produto_codigo || ''} - ${emprestimo.produto_nome || ''}`],
      ['Quantidade Cautelada:', `${emprestimo.quantidade} ${emprestimo.unidade_medida || 'UN'}`],
      ['Centro de Custo Destino:', `${emprestimo.centro_custo_codigo || ''} ${emprestimo.centro_custo_nome || ''}`.trim()],
      ['Profissional Responsável (Solicitante):', emprestimo.solicitante_nome || '—'],
      ['Almoxarife Responsável pela Liberação:', emprestimo.almoxarife_liberacao_nome || currentUser?.nome || 'Almoxarifado Central'],
      ['Data de Saída / Empréstimo:', new Date(emprestimo.data_emprestimo).toLocaleString('pt-BR')],
      ['Prazo Limite para Devolução:', new Date(emprestimo.data_prevista_devolucao).toLocaleDateString('pt-BR')],
      ['Situação Atual do Termo:', emprestimo.status.toUpperCase()],
      ['Estado de Conservação na Saída:', emprestimo.condicao_saida || 'Em perfeito estado de uso e funcionamento'],
      ['Data de Devolução Efetiva:', emprestimo.data_devolucao ? new Date(emprestimo.data_devolucao).toLocaleString('pt-BR') : 'Pendente (Equipamento em posse do setor)'],
      ['Estado de Conservação na Devolução:', emprestimo.condicao_devolucao || '—'],
      ['Observações Técnicas:', emprestimo.observacao || '—'],
    ],
    margin: { left: 12, right: 12 },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 68 },
    },
  });

  currentY = ((doc as any).lastAutoTable?.finalY || currentY + 80) + 10;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(12, currentY, pageWidth - 24, 18, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'TERMO DE RESPONSABILIDADE: O profissional solicitante declara receber o equipamento acima identificado em perfeitas condições de uso, comprometendo-se a zelar pela sua integridade e efetuar a devolução ao Almoxarifado Central até a data prevista.',
    15,
    currentY + 6,
    { maxWidth: pageWidth - 30 }
  );

  currentY += 36;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.line(20, currentY, 90, currentY);
  doc.line(pageWidth - 90, currentY, pageWidth - 20, currentY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(emprestimo.solicitante_nome || 'Responsável pela Retirada', 55, currentY + 4.5, {
    align: 'center',
  });
  doc.text(
    emprestimo.almoxarife_liberacao_nome || currentUser?.nome || 'Almoxarifado Central',
    pageWidth - 55,
    currentY + 4.5,
    { align: 'center' }
  );

  drawInstitutionalFooters(doc, codigoTermo);

  const filename = `termo_cautela_${codigoTermo.toLowerCase()}_${Date.now()}.pdf`;
  return finalizeJsPDF(doc, filename, `Termo de Cautela ${codigoTermo}`, mode);
}

// ============================================================================
// 8. COMPROVANTE DE ENTRADA POR NOTA FISCAL (PDF / IMPRESSÃO DIRETA)
// ============================================================================
export async function generateComprovanteNotaFiscalPDF(params: {
  nota: NotaFiscal;
  itens: NotaFiscalItem[];
  currentUser?: Usuario | null;
  activeUnidade?: EmpresaUnidade | null;
  mode?: PdfOutputMode;
}): Promise<PdfGeneratedDocument> {
  const { nota, itens, currentUser, activeUnidade, mode = 'print' } = params;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const protocol = `NF-${nota.numero_documento}`;

  // Formatação de data/hora no padrão Brasília (dd/mm/aaaa HH:mm:ss, sem fuso)
  const formatBrasiliaDateTime = (dateStr?: string | null): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch {
      return String(dateStr);
    }
  };

  const formatValidade = (dateStr?: string | null): string => {
    if (!dateStr) return '—';
    try {
      const clean = dateStr.slice(0, 10);
      const [y, m, d] = clean.split('-');
      if (y && m && d) return `${d}/${m}/${y}`;
      return clean;
    } catch {
      return String(dateStr);
    }
  };

  // Cabeçalho institucional limpo
  let currentY = 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('IRMANDADE DA SANTA CASA DE MISERICÓRDIA DE BIRIGUI', 14, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const nomeUnidade = activeUnidade ? `${activeUnidade.codigo} - ${activeUnidade.nome}` : 'Almoxarifado Central';
  doc.text(`Unidade: ${nomeUnidade}`, 14, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 35, 125);
  doc.text(`NOTA FISCAL DE ENTRADA: ${nota.numero_documento}`, 14, currentY);

  // Linha divisória fina
  currentY += 4;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(14, currentY, pageWidth - 14, currentY);

  // Bloco de metadados da Nota Fiscal
  currentY += 6;
  doc.setFontSize(8.5);

  // Linha 1: Fornecedor e Centro de Custo
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Fornecedor:', 14, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  const fornLabel = nota.fornecedor_nome || '—';
  doc.text(fornLabel, 34, currentY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Centro de Custo:', pageWidth / 2 + 5, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(nota.centro_custo_nome || 'Almoxarifado Geral', pageWidth / 2 + 32, currentY);

  // Linha 2: Responsável e Data/Hora de Lançamento
  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Responsável:', 14, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(nota.responsavel_nome || currentUser?.nome || 'Almoxarife', 34, currentY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Lançamento:', pageWidth / 2 + 5, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(formatBrasiliaDateTime(nota.data_emissao), pageWidth / 2 + 27, currentY);

  // Linha 3: Situação e Fechamento
  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Situação:', 14, currentY);
  doc.setFont('helvetica', 'bold');
  if (nota.situacao === 'FECHADA') {
    doc.setTextColor(22, 101, 52); // verde
    doc.text('FECHADA', 34, currentY);
  } else {
    doc.setTextColor(180, 83, 9); // âmbar
    doc.text('ABERTA', 34, currentY);
  }

  if (nota.situacao === 'FECHADA' && nota.fechada_em) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    const fechamentoTexto = `Nota fechada em ${formatBrasiliaDateTime(nota.fechada_em)} por ${nota.fechada_por_nome || 'Almoxarife'}`;
    doc.text(fechamentoTexto, 52, currentY);
  }

  // Observações se houver
  if (nota.observacao) {
    currentY += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Obs:', 14, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(nota.observacao, 24, currentY, { maxWidth: pageWidth - 38 });
    currentY += 2;
  }

  currentY += 6;

  // Tabela de itens da Nota Fiscal
  const tableData = (itens || []).map((it) => {
    const unitCost = Number(it.valor_unitario || 0);
    const totalItem = unitCost * Number(it.quantidade);
    return [
      it.produto_codigo || '—',
      it.produto_nome || '—',
      it.numero_lote || '—',
      formatValidade(it.data_validade),
      it.unidade_medida || 'UN',
      String(it.quantidade),
      it.marca || it.nomenclatura_fornecedor || '—',
      unitCost > 0 ? unitCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—',
      totalItem > 0 ? totalItem.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—',
    ];
  });

  const totalGeral = (itens || []).reduce(
    (acc, it) => acc + Number(it.quantidade) * Number(it.valor_unitario || 0),
    0
  );

  autoTable(doc, {
    startY: currentY,
    head: [[
      'Código',
      'Produto',
      'Lote',
      'Validade',
      'UN',
      'Qtd',
      'Marca / NF',
      'Custo Unit. (R$)',
      'Total (R$)',
    ]],
    body: tableData,
    foot: totalGeral > 0 ? [[
      '',
      'TOTAL DA NOTA FISCAL',
      '',
      '',
      '',
      String((itens || []).reduce((a, b) => a + Number(b.quantidade), 0)),
      '',
      '',
      `R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ]] : undefined,
    theme: 'plain',
    margin: { left: 14, right: 14, bottom: 25 },
    styles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      font: 'helvetica',
    },
    headStyles: {
      fontStyle: 'bold',
      textColor: [15, 23, 42],
      fillColor: [248, 250, 252],
      lineWidth: 0.3,
      lineColor: [203, 213, 225],
    },
    footStyles: {
      fontStyle: 'bold',
      textColor: [15, 23, 42],
      fillColor: [241, 245, 249],
      lineWidth: 0.3,
      lineColor: [203, 213, 225],
    },
    columnStyles: {
      0: { cellWidth: 20, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 10, halign: 'center' },
      5: { cellWidth: 14, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 28 },
      7: { cellWidth: 22, halign: 'right' },
      8: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage: (_data) => {
      // Repete cabeçalho limpo em páginas subsequentes se quebrar
    },
  });

  currentY = (doc as any).lastAutoTable?.finalY || currentY + 40;

  // Área de Assinaturas (Conferente e Almoxarife)
  if (currentY + 35 > pageHeight - 20) {
    doc.addPage();
    currentY = 25;
  } else {
    currentY += 15;
  }

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(20, currentY, 85, currentY);
  doc.line(pageWidth - 85, currentY, pageWidth - 20, currentY);

  currentY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(nota.responsavel_nome || 'Conferente / Recebedor', 52.5, currentY, { align: 'center' });
  doc.text(currentUser?.nome || 'Almoxarife Responsável', pageWidth - 52.5, currentY, { align: 'center' });

  // Rodapé único em todas as páginas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Desenvolvido por Bruno Rocha - DPO', 14, pageHeight - 10);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }

  const filename = `comprovante_nf_${nota.numero_documento.toLowerCase()}_${Date.now()}.pdf`;
  return finalizeJsPDF(doc, filename, `Nota Fiscal ${nota.numero_documento}`, mode);
}

export async function generateComprovanteDevolucaoSetorPDF(
  devolucao: {
    documento_referencia: string;
    data_movimentacao?: string;
    setor_nome: string;
    requisicao_origem?: string | null;
    responsavel_setor?: string | null;
    responsavel_almoxarifado?: string | null;
    observacao?: string | null;
    itens: Array<{
      produto_codigo: string;
      produto_nome: string;
      unidade_medida: string;
      numero_lote?: string | null;
      data_validade?: string | null;
      quantidade: number;
    }>;
  },
  currentUser: Usuario | null,
  activeUnidade: EmpresaUnidade | null,
  mode: PdfOutputMode = 'print'
): Promise<PdfGeneratedDocument> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let currentY = 14;

  const logoBase64 = await loadLogoBase64();
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 14, currentY - 2, 22, 22);
    } catch {}
  }

  const headerLeftX = logoBase64 ? 40 : 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('SANTA CASA DE MISERICÓRDIA', headerLeftX, currentY + 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${activeUnidade?.nome || 'Unidade Principal'} | Sistema Integrado de Almoxarifado`,
    headerLeftX,
    currentY + 8
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 35, 125);
  doc.text('COMPROVANTE DE DEVOLUÇÃO DE SETOR', headerLeftX, currentY + 14);

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(pageWidth - 65, currentY - 2, 51, 18, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Nº COMPROVANTE', pageWidth - 60, currentY + 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(devolucao.documento_referencia, pageWidth - 60, currentY + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(formatDateTimeBrasilia(devolucao.data_movimentacao || new Date().toISOString()), pageWidth - 60, currentY + 13.5);

  currentY += 24;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(14, currentY, pageWidth - 14, currentY);

  currentY += 6;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Setor Devolvente:', 14, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(devolucao.setor_nome, 45, currentY);

  if (devolucao.requisicao_origem) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('Req. de Origem:', pageWidth / 2 + 5, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(devolucao.requisicao_origem, pageWidth / 2 + 33, currentY);
  }

  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Almoxarife Recebedor:', 14, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(devolucao.responsavel_almoxarifado || currentUser?.nome || 'Almoxarife', 52, currentY);

  if (devolucao.observacao) {
    currentY += 5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('Observação:', 14, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(devolucao.observacao, 35, currentY, { maxWidth: pageWidth - 49 });
  }

  currentY += 7;

  const tableData = devolucao.itens.map((it) => [
    it.produto_codigo || '—',
    it.produto_nome || '—',
    it.numero_lote || '—',
    formatDateBrasilia(it.data_validade),
    it.unidade_medida || 'UN',
    String(it.quantidade),
  ]);

  const totalQtd = devolucao.itens.reduce((acc, it) => acc + Number(it.quantidade || 0), 0);

  autoTable(doc, {
    startY: currentY,
    head: [[
      'Código',
      'Descrição do Produto / Insumo',
      'Lote Retornado',
      'Validade',
      'UN',
      'Qtd Devolvida',
    ]],
    body: tableData,
    foot: [[
      '',
      'TOTAL DE ITENS DEVOLVIDOS AO ESTOQUE',
      '',
      '',
      '',
      String(totalQtd),
    ]],
    theme: 'plain',
    margin: { left: 14, right: 14, bottom: 25 },
    styles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 2.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      font: 'helvetica',
    },
    headStyles: {
      fontStyle: 'bold',
      textColor: [15, 23, 42],
      fillColor: [248, 250, 252],
      lineWidth: 0.3,
      lineColor: [203, 213, 225],
    },
    footStyles: {
      fontStyle: 'bold',
      textColor: [15, 23, 42],
      fillColor: [241, 245, 249],
      lineWidth: 0.3,
      lineColor: [203, 213, 225],
    },
    columnStyles: {
      0: { cellWidth: 24, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
  });

  currentY = (doc as any).lastAutoTable?.finalY || currentY + 30;

  if (currentY + 35 > pageHeight - 20) {
    doc.addPage();
    currentY = 30;
  } else {
    currentY += 20;
  }

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(20, currentY, 85, currentY);
  doc.line(pageWidth - 85, currentY, pageWidth - 20, currentY);

  currentY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(devolucao.responsavel_setor || 'Entregador (Setor / Centro de Custo)', 52.5, currentY, { align: 'center' });
  doc.text(devolucao.responsavel_almoxarifado || currentUser?.nome || 'Recebedor (Almoxarifado)', pageWidth - 52.5, currentY, { align: 'center' });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Desenvolvido por Bruno Rocha - DPO', 14, pageHeight - 10);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }

  const filename = `comprovante_devolucao_setor_${devolucao.documento_referencia.toLowerCase()}_${Date.now()}.pdf`;
  return finalizeJsPDF(doc, filename, `Comprovante de Devolução ${devolucao.documento_referencia}`, mode);
}

export async function generateComprovanteConsumoPDF(
  consumo: {
    numero_consumo: string;
    data_consumo: string;
    centro_custo_nome?: string;
    centro_custo_codigo?: string;
    responsavel_recebimento: string;
    usuario_nome?: string;
    observacao?: string | null;
    itens?: Array<{
      produto_codigo?: string;
      produto_nome: string;
      unidade_medida?: string;
      numero_lote?: string;
      data_validade?: string | null;
      quantidade: number;
    }>;
  },
  areaInfo?: { sigla: string; nome: string },
  mode: PdfOutputMode = 'download'
): Promise<PdfGeneratedDocument> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const sigla = areaInfo?.sigla || 'ALM';
  const areaNome = areaInfo?.nome || 'Almoxarifado';

  const logoBase64 = await loadLogoBase64();
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 14, 10, 16, 16);
    } catch (_e) {}
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 35, 125);
  doc.text('COMPROVANTE DE CONSUMO DIRETO', logoBase64 ? 34 : 14, 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`ÁREA OPERACIONAL: ${sigla} — ${areaNome.toUpperCase()}`, logoBase64 ? 34 : 14, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 35, 125);
  doc.text(consumo.numero_consumo, pageWidth - 14, 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Emissão: ${formatDateTimeBrasilia(consumo.data_consumo)}`, pageWidth - 14, 22, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(14, 30, pageWidth - 14, 30);

  let currentY = 36;
  doc.setFillColor(248, 250, 252);
  doc.rect(14, currentY, pageWidth - 28, 20, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, currentY, pageWidth - 28, 20, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('SETOR ASSISTENCIAL ATENDIDO:', 18, currentY + 6);
  doc.text('RESPONSÁVEL PELO RECEBIMENTO:', pageWidth / 2 + 5, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  const setorTexto = consumo.centro_custo_codigo 
    ? `${consumo.centro_custo_codigo} - ${consumo.centro_custo_nome || 'Setor'}`
    : (consumo.centro_custo_nome || 'Setor Hospitalar');
  doc.text(setorTexto, 18, currentY + 13);
  doc.text(consumo.responsavel_recebimento, pageWidth / 2 + 5, currentY + 13);

  currentY += 26;

  if (consumo.observacao && consumo.observacao.trim()) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Obs: ${consumo.observacao.trim()}`, 14, currentY);
    currentY += 6;
  }

  const tableRows = (consumo.itens || []).map((it) => [
    it.produto_codigo || '—',
    it.produto_nome,
    it.numero_lote || 'SEM LOTE',
    it.data_validade ? formatDateBrasilia(it.data_validade) : 'S/V',
    it.unidade_medida || 'UN',
    String(it.quantidade),
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Código', 'Descrição do Item / Material', 'Lote', 'Validade', 'UN', 'Qtd Entregue']],
    body: tableRows,
    theme: 'plain',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [30, 41, 59],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { cellWidth: 24, font: 'courier' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 26, font: 'courier', halign: 'center' },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
  });

  currentY = (doc as any).lastAutoTable?.finalY || currentY + 30;

  if (currentY + 40 > pageHeight - 20) {
    doc.addPage();
    currentY = 30;
  } else {
    currentY += 25;
  }

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(20, currentY, 85, currentY);
  doc.line(pageWidth - 85, currentY, pageWidth - 20, currentY);

  currentY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(consumo.usuario_nome || 'Dispensador (Almoxarifado)', 52.5, currentY, { align: 'center' });
  doc.text(consumo.responsavel_recebimento, pageWidth - 52.5, currentY, { align: 'center' });

  currentY += 4;
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Assinatura do Entregador', 52.5, currentY, { align: 'center' });
  doc.text('Assinatura do Recebedor', pageWidth - 52.5, currentY, { align: 'center' });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Desenvolvido por Bruno Rocha - DPO', 14, pageHeight - 10);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }

  const filename = `comprovante_consumo_${consumo.numero_consumo.toLowerCase()}_${Date.now()}.pdf`;
  return finalizeJsPDF(doc, filename, `Comprovante de Consumo ${consumo.numero_consumo}`, mode);
}


