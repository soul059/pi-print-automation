import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  jobId: string;
  token: string;
  totalPages: number;
}

export default function PdfPreview({ jobId, token, totalPages }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    const loadPdf = async () => {
      try {
        setLoading(true);
        setError('');
        const url = api.getPreviewUrl(jobId, token);
        const doc = await pdfjs.getDocument(url).promise;
        if (!cancelled) {
          setPdfDoc(doc);
        }
      } catch {
        if (!cancelled) setError('Failed to load PDF preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadPdf();
    return () => { cancelled = true; };
  }, [jobId, token]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const containerWidth = canvas.parentElement?.clientWidth || 400;
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: scaledViewport, canvas }).promise;
      } catch {
        if (!cancelled) setError('Failed to render page');
      }
    };
    renderPage();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 size={24} className="animate-spin text-primary-500" />
        <span className="ml-2 text-sm text-gray-500">Loading preview…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border p-6 flex items-center justify-center min-h-[100px]">
        <AlertCircle size={18} className="text-red-500 mr-2" />
        <span className="text-sm text-red-600">{error}</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      <h2 className="text-lg font-semibold">Document Preview</h2>
      <div className="border rounded-lg overflow-hidden bg-gray-50">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
