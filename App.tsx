import React, { useState, useRef } from 'react';
import { Button } from './components/Button';
import { PdfViewer } from './components/PdfViewer';
import { FeedbackList } from './components/FeedbackList';
import { ReportView } from './components/ReportView';
import { Annotation, Project, AnnotationStatus } from './types';
import { renderPageToImage } from './services/pdfUtils';
import { extractAnnotations } from './services/pdfExtract';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

const App: React.FC = () => {
  const [project, setProject] = useState<Project | null>(null);
  const [oldFile, setOldFile] = useState<File | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  
  // State for highlighting specific annotation
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Sync Scroll Refs
  const leftViewerRef = useRef<HTMLDivElement>(null);
  const rightViewerRef = useRef<HTMLDivElement>(null);
  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);

  const handleUpload = async () => {
    if (!oldFile || !newFile) return;

    setIsUploading(true);
    setStatusMessage("Extracting PDF annotations locally...");
    setUploadProgress(20);

    try {
      // 1. Create fully local, instant object URLs (No server needed, no 4.5MB Vercel limits!)
      const oldPdfUrl = URL.createObjectURL(oldFile);
      const newPdfUrl = URL.createObjectURL(newFile);
      
      // 2. Extract feedback strictly in the browser using the frontend pdfExtract service
      const extractedAnnotations = await extractAnnotations(oldFile);
      setUploadProgress(60);
      setStatusMessage("Saving project workspace...");

      // 3. Send ONLY the JSON annotations to the database (saving massively on network & storage)
      const res = await axios.post(`${API_URL}/project`, {
        filename: oldFile.name,
        annotations: extractedAnnotations
      });

      setUploadProgress(100);
      setStatusMessage("Complete!");
      
      // 4. Inject the local super-fast Blob URLs into the transient state for rendering!
      const activeProject = {
          ...res.data.project,
          oldPdfUrl,
          newPdfUrl
      };
      
      setProject(activeProject);
    } catch (error) {
      console.error("Upload failed", error);
      setStatusMessage('Failed to upload files.');
      alert("Failed to upload files. Ensure backend is running.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const verifySingleAnnotation = async (annotationId: string) => {
     if (!project) return;
     
     // Find annotation to get page number
     const ann = project.annotations.find(a => a.id === annotationId);
     if (!ann) return;

     try {
        // Render images on client side
        // We crop with 100px padding as requested by the user, drastically lowering the payload size vs full page
        const oldImage = await renderPageToImage(project.oldPdfUrl, ann.pageNumber, ann.rect, true, 100);
        
        // We do NOT draw the box on the new image, so the AI compares "Boxed Content" vs "Clean Content".
        const newImage = await renderPageToImage(project.newPdfUrl, ann.pageNumber, ann.rect, true, 100);

        const response = await axios.post(`${API_URL}/compare`, {
            projectId: project._id,
            annotationId,
            oldImage, 
            newImage  
        });

        const { status, confidence, reason } = response.data;

        setProject((prev: Project | null) => {
            if (!prev) return null;
            return {
            ...prev,
            annotations: prev.annotations.map((a: Annotation) => 
                a.id === annotationId 
                ? { ...a, status, aiConfidence: confidence, aiReason: reason } 
                : a
            )
            };
        });
     } catch (error) {
         console.error(`Verification failed for ${annotationId}`, error);
         alert("Verification failed. Check console for details.");
     }
  };

  const handleAiVerification = async (annotationId: string) => {
    if (!project) return;
    setIsAnalyzing(true);
    setSelectedAnnotationId(annotationId);

    await verifySingleAnnotation(annotationId);

    setIsAnalyzing(false);
  };

  const handleVerifyAll = async () => {
    if (!project) return;
    setIsAnalyzing(true);

    // Create a list to iterate over, filtering only those that are PENDING 
    // AND contain the word "fixed" in either the main text or the replies.
    const annotationsToVerify = project.annotations.filter((ann: Annotation) => {
        if (ann.status !== AnnotationStatus.PENDING) return false;
        const allText = [ann.text, ...(ann.replies?.map((r: any) => r.text) || [])].join(' ').toLowerCase();
        return allText.includes('fixed');
    });

    // Verify sequentially so the UI can clearly highlight the active comment
    for (const ann of annotationsToVerify) {
        // Highlight the current one being processed
        setSelectedAnnotationId(ann.id);
        
        // Give React a tiny moment to render the highlighted UI before the async work begins
        await new Promise(resolve => setTimeout(resolve, 50));
        
        await verifySingleAnnotation(ann.id);
    }

    setIsAnalyzing(false);
    setSelectedAnnotationId(null);
  };

  const handleAnnotationSelect = (page: number, id: string) => {
    setPageNumber(page);
    setSelectedAnnotationId(id);
  };

  const resetApp = async () => {
    if (project) {
        try {
            // Because we don't upload files to the server anymore, we just delete the Project DB entry!
            axios.delete(`${API_URL}/project/${project._id}`).catch(() => {});
        } catch (e) {
            console.error("Cleanup failed", e);
        }
    }
    setProject(null);
    setOldFile(null);
    setNewFile(null);
    setShowReport(false);
    setSelectedAnnotationId(null);
  };

  // Synchronized Scrolling Handlers
  const handleLeftScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingLeft.current) {
        isSyncingLeft.current = false;
        return;
    }
    if (rightViewerRef.current) {
        isSyncingRight.current = true;
        rightViewerRef.current.scrollTop = e.currentTarget.scrollTop;
        rightViewerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleRightScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingRight.current) {
        isSyncingRight.current = false;
        return;
    }
    if (leftViewerRef.current) {
        isSyncingLeft.current = true;
        leftViewerRef.current.scrollTop = e.currentTarget.scrollTop;
        leftViewerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 text-gray-900 font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 z-30 px-4 md:px-6 py-3 flex justify-between items-center shrink-0 h-16">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-lg flex items-center justify-center text-white font-bold shadow-md">PD</div>
          <h1 className="text-xl font-bold tracking-tight text-gray-800 hidden md:block">PDFDiff <span className="text-gray-400 font-normal">| AI Verifier</span></h1>
        </div>
        
        {project && (
           <div className="flex items-center gap-4">
             <div className="hidden sm:block text-xs bg-gray-100 px-3 py-1.5 rounded-full text-gray-600 border border-gray-200">
               Project: <span className="font-mono text-gray-800 font-semibold">{project._id.substring(0,8)}</span>
             </div>
             <Button variant="outline" className="text-sm py-1.5" onClick={resetApp}>New Project</Button>
           </div>
        )}
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative">
      {!project ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 overflow-y-auto bg-gray-50/50">
          <div className="bg-white p-10 rounded-2xl shadow-xl max-w-2xl w-full border border-gray-100">
            <div className="text-center mb-10">
                <div className="h-16 w-16 bg-indigo-100 text-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 text-2xl">📄</div>
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Start Verification</h2>
                <p className="text-gray-500">Upload both versions of your document to begin AI-powered comparison.</p>
            </div>
            
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`group border-2 border-dashed rounded-xl p-8 transition-all duration-300 text-center cursor-pointer ${oldFile ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200 hover:border-indigo-400 hover:bg-gray-50'}`}>
                  <input 
                    type="file" 
                    accept=".pdf" 
                    id="oldFile"
                    className="hidden"
                    key={oldFile ? oldFile.name : 'empty-old'}
                    onChange={e => setOldFile(e.target.files?.[0] || null)} 
                  />
                  <label htmlFor="oldFile" className="cursor-pointer block w-full h-full">
                    <div className="mb-3 text-4xl opacity-50 group-hover:opacity-100 transition-opacity">📝</div>
                    <p className="font-semibold text-gray-700 mb-1">Feedback PDF</p>
                    <p className="text-xs text-gray-500 truncate px-2">{oldFile ? oldFile.name : 'Click to browse'}</p>
                  </label>
                </div>

                <div className={`group border-2 border-dashed rounded-xl p-8 transition-all duration-300 text-center cursor-pointer ${newFile ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200 hover:border-indigo-400 hover:bg-gray-50'}`}>
                  <input 
                    type="file" 
                    accept=".pdf" 
                    id="newFile"
                    className="hidden"
                    key={newFile ? newFile.name : 'empty-new'}
                    onChange={e => setNewFile(e.target.files?.[0] || null)} 
                  />
                  <label htmlFor="newFile" className="cursor-pointer block w-full h-full">
                     <div className="mb-3 text-4xl opacity-50 group-hover:opacity-100 transition-opacity">✨</div>
                    <p className="font-semibold text-gray-700 mb-1">New Version</p>
                    <p className="text-xs text-gray-500 truncate px-2">{newFile ? newFile.name : 'Click to browse'}</p>
                  </label>
                </div>
              </div>

              {isUploading && (
                <div className="w-full bg-gray-100 rounded-full h-3 mb-4 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                  <p className="text-center text-xs text-indigo-600 mt-2 font-medium animate-pulse">{statusMessage}</p>
                </div>
              )}

              <Button 
                onClick={handleUpload} 
                isLoading={isUploading} 
                disabled={!oldFile || !newFile} 
                className="w-full py-4 text-lg font-bold shadow-lg shadow-indigo-200"
              >
                {isUploading ? 'Uploading...' : 'Compare Documents'}
              </Button>
            </div>
          </div>
        </div>
      ) : showReport ? (
        <ReportView project={project} onClose={resetApp} />
      ) : (
        <div className="flex flex-col md:flex-row h-full">
          {/* PDF Viewer Area */}
          <div className="flex-1 flex flex-col md:flex-row gap-0 overflow-hidden bg-gray-200">
            <div className="flex-1 min-h-[400px] h-full overflow-hidden border-r border-gray-300 relative">
              <PdfViewer 
                ref={leftViewerRef}
                url={project.oldPdfUrl} 
                pageNumber={pageNumber} 
                onPageChange={setPageNumber}
                annotations={project.annotations}
                label="Original Feedback"
                selectedAnnotationId={selectedAnnotationId}
                onScroll={handleLeftScroll}
              />
            </div>
            <div className="flex-1 min-h-[400px] h-full overflow-hidden relative">
               <PdfViewer 
                ref={rightViewerRef}
                url={project.newPdfUrl} 
                pageNumber={pageNumber} 
                onPageChange={setPageNumber}
                label="New Implementation"
                onScroll={handleRightScroll}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-gray-200 bg-white flex-shrink-0 h-[35%] md:h-full z-20 shadow-xl flex flex-col">
            <FeedbackList 
              annotations={project.annotations} 
              onRunAi={handleAiVerification}
              isAnalyzing={isAnalyzing}
              onSelect={handleAnnotationSelect}
              selectedAnnotationId={selectedAnnotationId}
              onVerifyAll={handleVerifyAll}
              onGenerateReport={() => setShowReport(true)}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default App;