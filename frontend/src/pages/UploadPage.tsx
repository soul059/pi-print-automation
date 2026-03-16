import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePrinterStatus } from '../hooks/usePrinterStatus';
import { usePreferences } from '../hooks/usePreferences';
import { api } from '../services/api';
import PrinterStatusBadge from '../components/PrinterStatusBadge';
import {
  Upload,
  FileText,
  Loader2,
  Settings,
  CreditCard,
  X,
  Printer,
  AlertTriangle,
  IndianRupee,
  Clock,
  Eye,
} from 'lucide-react';
import { useTranslation } from '../i18n/I18nContext';

const PAPER_SIZES = ['A4', 'Letter', 'Legal', 'A3', 'A5'];
const MAX_FILES = 10;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB

export default function UploadPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { load: loadPrefs, save: savePrefs } = usePreferences();
  const { t } = useTranslation();
  const savedPrefs = useRef(loadPrefs());

  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limitInfo, setLimitInfo] = useState<{ allowed: boolean; used: number; limit: number; remaining: number } | null>(null);

  // Only connect to printer status after files are selected
  const { status } = usePrinterStatus(files.length > 0);

  // Print options (initialized from saved preferences)
  const [pageRange, setPageRange] = useState('');
  const [paperSize, setPaperSize] = useState(savedPrefs.current.paperSize ?? 'A4');
  const [copies, setCopies] = useState(savedPrefs.current.copies ?? 1);
  const [duplex, setDuplex] = useState(savedPrefs.current.duplex ?? false);
  const [color, setColor] = useState<'grayscale' | 'color'>(savedPrefs.current.color ?? 'grayscale');
  const [printMode, setPrintMode] = useState<'now' | 'later'>(savedPrefs.current.printMode ?? 'now');
  const [scheduleForLater, setScheduleForLater] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [selectedPrinter, setSelectedPrinter] = useState('auto');
  const [printers, setPrinters] = useState<Array<{ name: string; online: boolean; status: string; accepting: boolean; queueDepth?: number; estimatedWait?: string }>>([]);
  const [pricingConfig, setPricingConfig] = useState<{ bwPerPage: number; colorPerPage: number; duplexDiscount: number } | null>(null);
  const [supplyLevels, setSupplyLevels] = useState<Array<{ name: string; level: number; type: string }>>([]);

  // Fetch pricing config and supply levels on mount
  useEffect(() => {
    api.getPricingConfig().then(setPricingConfig).catch(() => {});
    api.getSupplyLevels().then((data: any) => {
      if (data.supplies) setSupplyLevels(data.supplies);
    }).catch(() => {});
  }, []);

  // Fetch available printers when files are selected
  useEffect(() => {
    if (files.length === 0) return;
    api.getPrinters().then((data: any) => {
      if (data.printers) setPrinters(data.printers);
    }).catch(() => {});
  }, [files.length]);

  // Fetch daily print limit
  useEffect(() => {
    if (!token) return;
    api.getUserLimit(token).then((data: any) => {
      if (typeof data.allowed === 'boolean') setLimitInfo(data);
    }).catch(() => {});
  }, [token]);

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
        printer: selectedPrinter !== 'auto' ? selectedPrinter : undefined,
        scheduledAt: scheduleForLater && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      };

      const result = await api.uploadFile(files, config, token);

      if (result.error) {
        if (result.error === 'daily_limit_exceeded') {
          setLimitInfo({ allowed: false, used: result.used, limit: result.limit, remaining: result.remaining });
          setError(`Daily print limit exceeded. You've used ${result.used} of ${result.limit} pages today. Contact admin for more pages.`);
        } else {
          setError(result.error);
        }
        return;
      }

      savePrefs({ paperSize, copies, duplex, color, printMode });
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

  // Client-side price estimation
  const estimatedPrice = pricingConfig ? (() => {
    // Without file page count, we can't estimate accurately; show per-page price
    const pricePerPage = color === 'color' ? pricingConfig.colorPerPage : pricingConfig.bwPerPage;
    const duplexMul = duplex ? pricingConfig.duplexDiscount : 1;
    return { pricePerPage, duplexMul, copies, perPageFinal: Math.ceil(pricePerPage * duplexMul) };
  })() : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-white">{t('upload.title')}</h1>
      </div>

      <PrinterStatusBadge enabled={files.length > 0} />

      {status && status.queueDepth > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
          <Clock size={14} />
          <span>{status.queueDepth} job{status.queueDepth > 1 ? 's' : ''} in queue · Estimated wait: {status.estimatedWait}</span>
        </div>
      )}

      {status?.operatingHours && !status.operatingHours.allowed && (
        <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{status.operatingHours.message || 'Service is currently closed'}</span>
        </div>
      )}

      {supplyLevels.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Supply Levels</p>
          <div className="flex flex-wrap gap-3">
            {supplyLevels.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="dark:text-gray-300">{s.name}</span>
                <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      s.level > 50 ? 'bg-green-500' : s.level > 20 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${s.level >= 0 ? s.level : 0}%` }}
                  />
                </div>
                <span className="text-gray-400 dark:text-gray-500 w-8">{s.level >= 0 ? `${s.level}%` : '?'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {limitInfo && (
        <div className={`flex items-start gap-2 text-sm px-4 py-3 rounded-lg ${
          limitInfo.allowed
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
        }`}>
          {!limitInfo.allowed && <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
          <div>
            <p className="font-medium">
              {limitInfo.allowed
                ? `You've printed ${limitInfo.used}/${limitInfo.limit} pages today. ${limitInfo.remaining} remaining.`
                : `Daily limit reached: ${limitInfo.used}/${limitInfo.limit} pages used.`}
            </p>
            {!limitInfo.allowed && (
              <p className="text-xs mt-1">Request more pages from an administrator to continue printing.</p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* File Upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
            files.length > 0
              ? 'border-primary-300 bg-primary-50 dark:bg-primary-900/30 dark:border-primary-700'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800'
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
                <div key={i} className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border dark:border-gray-700">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={18} className="text-primary-600 shrink-0" />
                    <span className="text-sm font-medium text-primary-700 dark:text-primary-300 truncate">{f.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {(f.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = URL.createObjectURL(f);
                        window.open(url, '_blank');
                      }}
                      className="text-gray-400 hover:text-primary-600 transition p-1"
                      title="Preview"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="text-gray-400 hover:text-red-500 transition p-1"
                    >
                      <X size={16} />
                    </button>
                  </div>
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
              <p className="font-medium text-gray-600 dark:text-gray-300">{t('upload.dropzone')}</p>
              <p className="text-sm text-gray-400 mt-1">Max {MAX_FILES} files, 50 MB total</p>
            </div>
          )}
        </div>

        {/* Print Options */}
        {files.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 space-y-5">
            <div className="flex items-center gap-2 mb-4">
              <Settings size={20} className="text-gray-500" />
              <h2 className="text-lg font-semibold">{t('upload.options')}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Page Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('upload.pageRange')}
                </label>
                <input
                  type="text"
                  value={pageRange}
                  onChange={(e) => setPageRange(e.target.value)}
                  placeholder="All pages (e.g., 1-5, 8)"
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                />
              </div>

              {/* Paper Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('upload.paperSize')}
                </label>
                <select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                >
                  {availablePaperSizes.map((s: string) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Copies */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('upload.copies')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('upload.color')}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setColor('grayscale')}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      color === 'grayscale'
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
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
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                    } ${!canColor ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Color
                  </button>
                </div>
              </div>

              {/* Printer Selection */}
              {printers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <span className="flex items-center gap-1"><Printer size={14} /> {t('upload.printer')}</span>
                  </label>
                  <select
                    value={selectedPrinter}
                    onChange={(e) => setSelectedPrinter(e.target.value)}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="auto">{t('upload.printerAuto')} (Least Busy)</option>
                    {printers
                      .sort((a, b) => (a.queueDepth || 0) - (b.queueDepth || 0))
                      .map((p, idx) => (
                      <option key={p.name} value={p.name} disabled={!p.online}>
                        {p.name} {p.online ? '🟢' : '🔴'} {p.queueDepth !== undefined && p.queueDepth > 0 ? `(${p.queueDepth} jobs, ~${p.estimatedWait})` : '(idle)'}{idx === 0 && p.online && p.queueDepth !== undefined ? ' ⭐' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Duplex */}
            <div className="flex items-center justify-between py-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('upload.duplex')}
                {!canDuplex && <span className="text-gray-400 ml-1">(not available)</span>}
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={duplex}
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('upload.mode')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPrintMode('now')}
                  className={`p-3 rounded-lg border text-left transition ${
                    printMode === 'now'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-2 ring-primary-200'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-600'
                  }`}
                >
                  <p className="font-medium text-sm">{t('upload.mode.now')}</p>
                  <p className="text-xs text-gray-500 mt-1">Get your printout immediately</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMode('later')}
                  className={`p-3 rounded-lg border text-left transition ${
                    printMode === 'later'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-2 ring-primary-200'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-600'
                  }`}
                >
                  <p className="font-medium text-sm">{t('upload.mode.later')}</p>
                  <p className="text-xs text-gray-500 mt-1">Pick up when convenient</p>
                </button>
              </div>
            </div>

            {/* Schedule for Later */}
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Schedule print for later
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={scheduleForLater}
                  onClick={() => { setScheduleForLater(!scheduleForLater); if (scheduleForLater) setScheduledAt(''); }}
                  className={`relative w-11 h-6 rounded-full transition ${
                    scheduleForLater ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition ${
                      scheduleForLater ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              {scheduleForLater && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Print at
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    max={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Must be within the next 7 days. Your job will auto-print at this time.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* Cost Estimator */}
        {files.length > 0 && estimatedPrice && (
          <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-xl border border-primary-200 dark:border-primary-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <IndianRupee size={18} className="text-primary-600" />
              <h3 className="text-sm font-semibold text-primary-800 dark:text-primary-300">Estimated Cost</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Per page</p>
                <p className="font-semibold text-gray-800 dark:text-gray-200">
                  ₹{(estimatedPrice.pricePerPage / 100).toFixed(2)}
                </p>
              </div>
              {duplex && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Duplex discount</p>
                  <p className="font-semibold text-green-600 dark:text-green-400">
                    {Math.round((1 - estimatedPrice.duplexMul) * 100)}% off
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Effective rate</p>
                <p className="font-semibold text-gray-800 dark:text-gray-200">
                  ₹{(estimatedPrice.perPageFinal / 100).toFixed(2)}/pg
                  {copies > 1 && ` × ${copies} copies`}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Mode</p>
                <p className="font-semibold text-gray-800 dark:text-gray-200">
                  {color === 'color' ? 'Color' : 'B&W'}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Final price calculated after upload based on page count
            </p>
          </div>
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
            {loading ? 'Uploading...' : t('upload.submit')}
          </button>
        )}
      </form>
    </div>
  );
}
