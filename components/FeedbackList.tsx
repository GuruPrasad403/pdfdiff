import React from 'react';
import { Annotation, AnnotationStatus } from '../types';
import { Button } from './Button';

interface FeedbackListProps {
  annotations: Annotation[];
  onRunAi: (annotationId: string) => void;
  isAnalyzing: boolean;
  onSelect: (page: number, id: string) => void;
  selectedAnnotationId?: string | null;
  onVerifyAll: () => void;
  onGenerateReport: () => void;
}

export const FeedbackList: React.FC<FeedbackListProps> = ({ 
  annotations, 
  onRunAi, 
  isAnalyzing, 
  onSelect,
  selectedAnnotationId,
  onVerifyAll,
  onGenerateReport
}) => {
  const getStatusColor = (status: AnnotationStatus) => {
    switch (status) {
      case AnnotationStatus.IMPLEMENTED: return 'text-green-600 bg-green-50 border-green-200';
      case AnnotationStatus.NOT_IMPLEMENTED: return 'text-red-600 bg-red-50 border-red-200';
      case AnnotationStatus.PARTIAL: return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatDate = (rawDate?: string) => {
    if (!rawDate) return '';
    let clean = rawDate.replace('D:', '').replace(/['"]/g, '').trim();
    if (clean.length >= 14) {
      const yr = clean.substring(0,4);
      const mo = clean.substring(4,6);
      const da = clean.substring(6,8);
      const hr = clean.substring(8,10);
      const mi = clean.substring(10,12);
      return `${yr}-${mo}-${da} ${hr}:${mi}`;
    }
    return clean;
  };

  const isVerifiable = (ann: Annotation) => {
    const allText = [ann.text, ...(ann.replies?.map(r => r.text) || [])].join(' ').toLowerCase();
    return allText.includes('fixed');
  };

  const verifiableCount = annotations.filter(isVerifiable).length;
  const pendingCount = annotations.filter(a => a.status === AnnotationStatus.PENDING && isVerifiable(a)).length;

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 w-full h-full">
      <div className="p-4 border-b border-gray-200 flex-shrink-0 flex justify-between items-center bg-gray-50">
        <div>
            <h2 className="font-bold text-gray-800">Review Feedback</h2>
            <p className="text-xs text-gray-500">{verifiableCount} ready • {pendingCount} pending</p>
        </div>
        {annotations.length > 0 && (
            <div className="flex gap-2">
              <Button 
                  onClick={onGenerateReport} 
                  className="text-xs px-3 py-1.5 h-8 bg-green-600 hover:bg-green-700 text-white shadow-sm"
              >
                  Finish & Report
              </Button>
              <Button 
                  onClick={onVerifyAll} 
                  disabled={isAnalyzing} 
                  className="text-xs px-3 py-1.5 h-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                  isLoading={isAnalyzing}
              >
                  {isAnalyzing ? 'Processing...' : 'Verify All'}
              </Button>
            </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {annotations.map((ann) => {
          const isSelected = selectedAnnotationId === ann.id;
          return (
            <div 
              key={ann.id} 
              className={`p-4 rounded-lg border transition-all cursor-pointer relative ${getStatusColor(ann.status)} ${
                isSelected ? 'ring-2 ring-indigo-500 shadow-md bg-white z-10' : 'hover:shadow-md hover:bg-white'
              }`}
              onClick={() => onSelect(ann.pageNumber, ann.id)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${getStatusColor(ann.status)}`}>
                  {ann.status.replace('_', ' ')}
                </span>
                <span className="text-xs text-gray-400 font-mono">Pg {ann.pageNumber}</span>
              </div>
              
              {ann.author && (
                <div className="flex justify-between items-center mb-1 text-xs text-gray-500">
                   <span className="font-semibold text-gray-700">{ann.author}</span>
                   {ann.date && <span className="text-[10px] opacity-75">{formatDate(ann.date)}</span>}
                </div>
              )}
              
              <p className="text-sm font-medium mb-3 text-gray-800 break-words leading-relaxed">{ann.text}</p>
              
              {/* Threaded Replies section */}
              {ann.replies && ann.replies.length > 0 && (
                <div className="mb-3 space-y-2 border-l-2 border-indigo-200 pl-3 ml-1">
                  {ann.replies.map(reply => (
                    <div key={reply.id} className="text-xs text-gray-700 bg-gray-50/80 p-2 rounded-md">
                      {(reply.author || reply.date) && (
                         <div className="flex justify-between items-center mb-1">
                           <span className="font-semibold text-gray-600">{reply.author || 'Unknown'}</span>
                           <span className="text-[9px] text-gray-400">{formatDate(reply.date)}</span>
                         </div>
                      )}
                      <p className="break-words leading-relaxed">{reply.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {ann.aiReason && (
                <div className="mb-3 text-xs bg-slate-50 p-2.5 rounded-md border border-gray-200 text-gray-700">
                  <div className="font-semibold text-indigo-900 mb-1 flex items-center gap-1">
                    🤖 AI Analysis
                    <span className="text-gray-400 font-normal ml-auto text-[10px]">
                        {(ann.aiConfidence! * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  {ann.aiReason}
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <Button 
                  variant="outline" 
                  className="w-full text-xs py-1 h-7 border-gray-300" 
                  onClick={(e) => {
                    e.stopPropagation();
                    // Select logic first
                    onSelect(ann.pageNumber, ann.id);
                    onRunAi(ann.id);
                  }}
                  isLoading={isAnalyzing && isSelected} // Only show spinner on the specific item if analyzing
                  disabled={isAnalyzing}
                >
                  {ann.status === AnnotationStatus.PENDING ? 'Verify' : 'Re-verify'}
                </Button>
              </div>
            </div>
          );
        })}

        {annotations.length === 0 && (
          <div className="text-center text-gray-400 mt-10 p-4 border-2 border-dashed border-gray-200 rounded-xl mx-4">
            <p>No annotations detected.</p>
          </div>
        )}
      </div>
    </div>
  );
};