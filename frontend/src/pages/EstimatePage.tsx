import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, IndianRupee, ArrowRight } from 'lucide-react';
import { api } from '../services/api';

export default function EstimatePage() {
  const navigate = useNavigate();
  const [pricingConfig, setPricingConfig] = useState<any>(null);
  const [pageCount, setPageCount] = useState<number>(1);
  const [copies, setCopies] = useState<number>(1);
  const [color, setColor] = useState<'grayscale' | 'color'>('grayscale');
  const [duplex, setDuplex] = useState<boolean>(false);

  useEffect(() => {
    api.getPricingConfig().then(setPricingConfig).catch(() => {});
  }, []);

  if (!pricingConfig) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-500">Loading pricing...</p>
      </div>
    );
  }

  const pricePerPage = color === 'color' ? pricingConfig.colorPerPage : pricingConfig.bwPerPage;
  const duplexMultiplier = duplex ? pricingConfig.duplexDiscount : 1;
  const subtotal = pageCount * pricePerPage * copies;
  const total = Math.ceil(subtotal * duplexMultiplier);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-primary-100 dark:bg-primary-900 p-3 rounded-xl">
          <Calculator size={28} className="text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cost Estimator</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Calculate printing costs before uploading</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6 space-y-6">
        {/* Page Count */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Number of Pages
          </label>
          <input
            type="number"
            min="1"
            value={pageCount}
            onChange={(e) => setPageCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-4 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Copies */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Number of Copies
          </label>
          <input
            type="number"
            min="1"
            max="50"
            value={copies}
            onChange={(e) => setCopies(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-full px-4 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Maximum 50 copies per job</p>
        </div>

        {/* Color Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Color Mode
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setColor('grayscale')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition ${
                color === 'grayscale'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              Black & White
            </button>
            <button
              onClick={() => setColor('color')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition ${
                color === 'color'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              Color
            </button>
          </div>
        </div>

        {/* Duplex */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={duplex}
              onChange={(e) => setDuplex(e.target.checked)}
              className="w-5 h-5 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Double-sided (Duplex)
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Save {Math.round((1 - pricingConfig.duplexDiscount) * 100)}% on paper
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-2xl border border-primary-200 dark:border-primary-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <IndianRupee size={20} className="text-primary-600 dark:text-primary-400" />
          <h3 className="text-lg font-semibold text-primary-800 dark:text-primary-300">Cost Breakdown</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Per page rate ({color === 'color' ? 'Color' : 'B&W'})</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              ₹{(pricePerPage / 100).toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Pages × Copies</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {pageCount} × {copies} = {pageCount * copies} pages
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              ₹{(subtotal / 100).toFixed(2)}
            </span>
          </div>

          {duplex && (
            <div className="flex justify-between text-sm">
              <span className="text-green-600 dark:text-green-400">Duplex discount ({Math.round((1 - pricingConfig.duplexDiscount) * 100)}% off)</span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                -₹{((subtotal - subtotal * pricingConfig.duplexDiscount) / 100).toFixed(2)}
              </span>
            </div>
          )}

          <div className="border-t border-primary-300 dark:border-primary-700 pt-3 mt-3">
            <div className="flex justify-between">
              <span className="text-lg font-bold text-gray-900 dark:text-white">Total</span>
              <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                ₹{(total / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => navigate('/')}
        className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white py-4 rounded-xl font-medium hover:bg-primary-700 transition"
      >
        Print Now <ArrowRight size={18} />
      </button>

      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
        Final price will be calculated based on your actual document when uploaded
      </p>
    </div>
  );
}
