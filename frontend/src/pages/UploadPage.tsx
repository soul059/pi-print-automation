import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePrinterStatus } from '../hooks/usePrinterStatus';
import { api } from '../services/api';
import PrinterStatusBadge from '../components/PrinterStatusBadge';
import {
  Upload,
  FileText,
  Loader2,
  Settings,
  CreditCard,
  X,
} from 'lucide-react';

const PAPER_SIZES = ['A4', 'Letter', 'Legal', 'A3', 'A5'];
const MAX_FILES = 10;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB

export default function UploadPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Only connect to printer status after files are selected
  const { status } = usePrinterStatus(files.length > 0);

  // Print options
  const [pageRange, setPageRange] = useState('');
  const [paperSize, setPaperSize] = useState('A4');
  const [copies, setCopies] = useState(1);
  const [duplex, setDuplex] = useState(false);
  const [color, setColor] = useState<'grayscale' | 'color'>('grayscale');
  const [printMode, setPrintMode] = useState<'now' | 'later'>('now');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    const combined = [...files, ...selected];

    if (combined.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    for (const f of selected) {
      if (f.type !== 'application/pdf') {
        setError(`"${f.name}" is not a PDF file`);
        return;
      }
    }

    const totalSize = combined.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      setError('Total file size must be under 50 MB');
      return;
    }

    setFiles(combined);
    setError('');
    // Reset input so the same file(s) can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || !token) return;

    setLoading(true);
    setError('');

    try {
      const config = {
        pageRange: pageRange || undefined,
        paperSize,
        copies,
        duplex,
        color,
        printMode,
      };

      const result = await api.uploadFile(files, config, token);

      if (result.error) {
        setError(result.error);
        return;
      }

      navigate(`/payment/${result.jobId}`);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const availablePaperSizes = status?.capabilities?.paperSizes || PAPER_SIZES;
  const canDuplex = status?.capabilities?.duplex ?? true;
  const canColor = status?.capabilities?.color ?? true;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Print a Document</h1>
      </div>

      <PrinterStatusBadge enabled={files.length > 0} />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* File Upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
            files.length > 0
              ? 'border-primary-300 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          {files.length > 0 ? (
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={18} className="text-primary-600 shrink-0" />
                    <span className="text-sm font-medium text-primary-700 truncate">{f.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {(f.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="text-gray-400 hover:text-red-500 transition shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <p className="text-xs text-gray-500 mt-2">
                {files.length} file{files.length > 1 ? 's' : ''} · {(totalSize / 1024 / 1024).toFixed(2)} MB total
                {files.length < MAX_FILES && ' · Click to add more'}
              </p>
            </div>
          ) : (
            <div>
              <Upload size={32} className="mx-auto mb-2 text-gray-400" />
              <p className="font-medium text-gray-600">Click to upload PDFs</p>
              <p className="text-sm text-gray-400 mt-1">Max {MAX_FILES} files, 50 MB total</p>
            </div>
          )}
        </div>

        {/* Print Options */}
        {files.length > 0 && (
          <div className="bg-white rounded-xl border p-6 space-y-5">
            <div className="flex items-center gap-2 mb-4">
              <Settings size={20} className="text-gray-500" />
              <h2 className="text-lg font-semibold">Print Options</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Page Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Page Range
                </label>
                <input
                  type="text"
                  value={pageRange}
                  onChange={(e) => setPageRange(e.target.value)}
                  placeholder="All pages (e.g., 1-5, 8)"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>

              {/* Paper Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Paper Size
                </label>
                <select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  {availablePaperSizes.map((s: string) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Copies */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Copies
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setColor('grayscale')}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      color === 'grayscale'
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    B&W
                  </button>
                  <button
                    type="button"
                    onClick={() => canColor && setColor('color')}
                    disabled={!canColor}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      color === 'color'
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    } ${!canColor ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Color
                  </button>
                </div>
              </div>
            </div>

            {/* Duplex */}
            <div className="flex items-center justify-between py-2">
              <label className="text-sm font-medium text-gray-700">
                Double-sided printing
                {!canDuplex && <span className="text-gray-400 ml-1">(not available)</span>}
              </label>
              <button
                type="button"
                onClick={() => canDuplex && setDuplex(!duplex)}
                disabled={!canDuplex}
                className={`relative w-11 h-6 rounded-full transition ${
                  duplex ? 'bg-primary-600' : 'bg-gray-300'
                } ${!canDuplex ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition ${
                    duplex ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Print Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Print Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPrintMode('now')}
                  className={`p-3 rounded-lg border text-left transition ${
                    printMode === 'now'
                      ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-sm">Print Now</p>
                  <p className="text-xs text-gray-500 mt-1">Get your printout immediately</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMode('later')}
                  className={`p-3 rounded-lg border text-left transition ${
                    printMode === 'later'
                      ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-sm">Collect Later</p>
                  <p className="text-xs text-gray-500 mt-1">Pick up when convenient</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* Submit */}
        {files.length > 0 && (
          <button
            type="submit"
            disabled={loading || !status?.online}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white py-3 rounded-xl font-medium text-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <CreditCard size={20} />
            )}
            {loading ? 'Uploading...' : 'Continue to Payment'}
          </button>
        )}
      </form>
    </div>
  );
}
