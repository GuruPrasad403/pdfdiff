import React, { useEffect, useState } from 'react';
import { Project, AnnotationStatus, Annotation } from '../types';
import { Button } from './Button';
import axios from 'axios';
import { renderPageToImage } from '../services/pdfUtils';

interface ReportViewProps {
  project: Project;
  onClose: () => void;
}

export const ReportView: React.FC<ReportViewProps> = ({ project, onClose }) => {
  const [reportData, setReportData] = useState<{ann: Annotation, image?: string}[]>([]);
  const [isGenerating, setIsGenerating] = useState(true);

  useEffect(() => {
    const generateData = async () => {
      const data = [];
      for (const ann of project.annotations) {
        let image;
        // Generate screenshot only for missed comments
        if (ann.status === AnnotationStatus.NOT_IMPLEMENTED || ann.status === AnnotationStatus.PARTIAL) {
          try {
             image = await renderPageToImage(project.oldPdfUrl, ann.pageNumber, ann.rect, true, 1000);
          } catch (e) {
             console.error("Failed to snapshot", e);
          }
        }
        data.push({ ann, image });
      }
      setReportData(data);
      setIsGenerating(false);

      // Trigger file deletion on the backend to save storage!
      try {
         await axios.delete(`/api/project/${project._id}`);
      } catch(e) {
         console.error("Failed to delete backend files", e);
      }
    };
    generateData();
  }, [project]);

  if (isGenerating) {
     return (
       <div className="flex flex-col items-center justify-center h-full bg-white">
           <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
           <h2 className="text-xl font-bold text-gray-700">Generating Report & Screenshots...</h2>
           <p className="text-gray-500 text-sm mt-2">Please wait while we prepare your print-ready report.</p>
       </div>
     );
  }

  const implemented = reportData.filter(d => d.ann.status === AnnotationStatus.IMPLEMENTED);
  const notImplemented = reportData.filter(d => d.ann.status === AnnotationStatus.NOT_IMPLEMENTED || d.ann.status === AnnotationStatus.PARTIAL);

  return (
    <div className="bg-white p-8 max-w-5xl mx-auto h-full overflow-y-auto print:p-0">
      <div className="flex justify-between items-center mb-8 pb-4 border-b print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Verification Report</h1>
          <p className="text-gray-500">Project ID: {project._id}</p>
        </div>
        <div className="space-x-3">
          <Button onClick={() => window.print()} variant="outline" className="border-gray-300">🖨️ Print PDF</Button>
          <Button onClick={onClose} className="bg-red-500 hover:bg-red-600 text-white">Close & Exit</Button>
        </div>
      </div>

      {/* Print View Header */}
      <div className="hidden print:block mb-8 pb-4 border-b border-gray-300">
        <h1 className="text-2xl font-bold text-black">Verification Report</h1>
        <p className="text-sm text-gray-600">Generated on: {new Date().toLocaleString()}</p>
      </div>

      <div className="mb-8 bg-green-50 border border-green-200 p-6 rounded-xl print:break-inside-avoid print:bg-white print:border-gray-300">
        <h2 className="text-xl font-bold text-green-800 mb-4 print:text-black">✅ Successfully Implemented ({implemented.length})</h2>
        <ul className="list-disc pl-5 space-y-3">
          {implemented.map(({ann}) => (
             <li key={ann.id} className="text-sm text-green-900 print:text-black">
               <span className="font-bold mr-2">Page {ann.pageNumber}:</span> 
               <span>{ann.text}</span>
               {ann.replies && ann.replies.length > 0 && (
                 <p className="text-xs text-green-700 mt-1 italic">
                   Thread: {ann.replies.map((r: any) => r.text).join(' → ')}
                 </p>
               )}
             </li>
          ))}
        </ul>
        {implemented.length === 0 && <p className="text-sm text-green-700">None</p>}
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold text-red-800 mb-4 bg-red-50 p-4 rounded-t-xl border border-red-200 border-b-0 print:bg-white print:border-gray-300 print:text-black">
           ❌ Missing / Partial Changes ({notImplemented.length})
        </h2>
        <div className="border border-red-200 rounded-b-xl overflow-visible print:border-gray-300">
          {notImplemented.map(({ann, image}) => (
            <div key={ann.id} className="p-5 border-b border-red-100 last:border-0 bg-white print:border-b-2 print:border-gray-300 print:break-inside-avoid print:page-break-inside-avoid">
               <div className="flex flex-col md:flex-row gap-6 items-start print:flex-col print:gap-4">
                 <div className="flex-1 w-full print:w-full">
                   <div className="flex items-center gap-2 mb-3">
                     <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded print:border print:bg-white print:text-black">
                       Page {ann.pageNumber}
                     </span>
                     {ann.author && <span className="text-xs text-gray-500 font-medium">By: {ann.author}</span>}
                   </div>
                   
                   <p className="font-medium text-gray-800 text-base mb-4 bg-gray-50 p-3 rounded border border-gray-100">
                     {ann.text}
                   </p>
                   
                   {ann.replies && ann.replies.length > 0 && (
                     <div className="mb-4 pl-3 border-l-2 border-red-200">
                       <p className="text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Conversation Thread</p>
                       {ann.replies.map((r: any) => (
                         <div key={r.id} className="text-sm text-gray-700 mb-1">{r.author}: {r.text}</div>
                       ))}
                     </div>
                   )}
                   
                   {ann.aiReason && (
                     <div className="text-sm bg-red-50/50 p-3 border border-red-100 rounded-md text-red-900 mt-auto print:bg-white print:border-dashed">
                       <strong className="text-red-800 font-bold block mb-1">🤖 AI Analysis Conclusion:</strong> 
                       {ann.aiReason}
                     </div>
                   )}
                 </div>
                 
                 {image && (
                   <div className="w-full md:w-5/12 shrink-0 print:w-full print:mt-4 print:mb-2">
                      <p className="text-[10px] text-gray-500 mb-2 text-center font-bold uppercase tracking-wide">Screenshot of Unimplemented Area</p>
                      <img src={image} alt="Reference Screenshot" className="w-full max-h-[600px] object-contain border shadow-sm rounded-lg print:shadow-none print:border-2 print:border-gray-100 print:max-w-full" />
                   </div>
                 )}
               </div>
            </div>
          ))}
          {notImplemented.length === 0 && <p className="p-5 text-sm text-gray-600">All comments implemented successfully!</p>}
        </div>
      </div>
    </div>
  );
};
