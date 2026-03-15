import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface LocalPdfPreviewProps {
  file: File;
}

export default function LocalPdfPreview({ file }: LocalPdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setCurrentPage(1);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const doc = await pdfjs.getDocument({ data }).promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setTotalPages(doc.numPages);
        }
      } catch {
        if (!cancelled) setError('Failed to load PDF preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    reader.onerror = () => {
      if (!cancelled) {
        setError('Failed to read file');
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);

    return () => { cancelled = true; };
  }, [file]);

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
      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 size={24} className="animate-spin text-primary-500" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading preview…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 flex items-center justify-center min-h-[100px]">
        <AlertCircle size={18} className="text-red-500 mr-2" />
        <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Document Preview</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">{totalPages} page{totalPages !== 1 ? 's' : ''}</span>
      </div>
      <div className="border dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900">
        <canvas ref={canvasRef} className="w-full" />
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-gray-600 dark:text-gray-400">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
