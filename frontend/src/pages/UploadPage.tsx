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
} from 'lucide-react';

const PAPER_SIZES = ['A4', 'Letter', 'Legal', 'A3', 'A5'];

export default function UploadPage() {
  const { token } = useAuth();
  const { status } = usePrinterStatus();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Print options
  const [pageRange, setPageRange] = useState('');
  const [paperSize, setPaperSize] = useState('A4');
  const [copies, setCopies] = useState(1);
  const [duplex, setDuplex] = useState(false);
  const [color, setColor] = useState<'grayscale' | 'color'>('grayscale');
  const [printMode, setPrintMode] = useState<'now' | 'later'>('now');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.type !== 'application/pdf') {
      setError('Only PDF files are allowed');
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError('File size must be under 10 MB');
      return;
    }

    setFile(selected);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !token) return;

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

      const result = await api.uploadFile(file, config, token);

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

      <PrinterStatusBadge />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* File Upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
            file
              ? 'border-primary-300 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText size={24} className="text-primary-600" />
              <div className="text-left">
                <p className="font-medium text-primary-700">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
          ) : (
            <div>
              <Upload size={32} className="mx-auto mb-2 text-gray-400" />
              <p className="font-medium text-gray-600">Click to upload PDF</p>
              <p className="text-sm text-gray-400 mt-1">Max 10 MB</p>
            </div>
          )}
        </div>

        {/* Print Options */}
        {file && (
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
        {file && (
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
