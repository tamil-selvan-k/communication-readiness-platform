import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { X, UploadCloud, CheckCircle2, FileText, Sparkles, ArrowRight, Clipboard, AlertCircle } from 'lucide-react';
import { useBackHandler } from '../../hooks/useBackHandler';

interface ResumeUploadModalProps {
  onClose: () => void;
}

export const ResumeUploadModal: React.FC<ResumeUploadModalProps> = ({ onClose }) => {
  useBackHandler(true, onClose);
  const { student, uploadResumeData } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'text'>('file');
  const [pastedText, setPastedText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'extracted'>(student.resume ? 'extracted' : 'upload');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFile = async (file: File) => {
    setErrorMessage(null);
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('resume', file);
      await uploadResumeData(formData);
      setActiveTab('extracted');
    } catch (err: any) {
      console.error('Resume upload error:', err);
      setErrorMessage(err.message || 'Failed to parse resume. Please try pasting the text instead.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handlePastedTextSubmit = async () => {
    if (!pastedText.trim() || pastedText.trim().length < 20) {
      setErrorMessage('Please paste at least 20 characters of resume content.');
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    try {
      await uploadResumeData({
        resumeText: pastedText,
        fileName: 'Pasted_Resume_Profile.txt'
      });
      setActiveTab('extracted');
    } catch (err: any) {
      console.error('Text parsing error:', err);
      setErrorMessage(err.message || 'Failed to parse text. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        
        <div className="p-5 border-b border-neutral-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-neutral-900">Student Resume Upload &amp; Profile</h3>
              <p className="text-xs text-neutral-500">Extracts your technical stack to personalize mock interview questions</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-neutral-200 px-6 pt-3 bg-neutral-50/50 shrink-0">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 text-xs font-medium border-b-2 mr-6 transition-colors ${
              activeTab === 'upload' 
                ? 'border-neutral-900 text-neutral-900 font-semibold' 
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            Upload / Paste Resume
          </button>
          <button
            onClick={() => setActiveTab('extracted')}
            disabled={!student.resume}
            className={`pb-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'extracted' 
                ? 'border-neutral-900 text-neutral-900 font-semibold' 
                : 'border-transparent text-neutral-500 hover:text-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            Parsed Technical Profile {student.resume && '✓'}
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {activeTab === 'upload' ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 bg-neutral-100 p-1 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setUploadMode('file')}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                    uploadMode === 'file' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                  PDF / Document
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('text')}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                    uploadMode === 'text' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <Clipboard className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                  Paste Text
                </button>
              </div>

              {uploadMode === 'file' ? (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,.txt,.docx"
                    className="hidden"
                  />
                  <div 
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                      isDragging 
                        ? 'border-neutral-900 bg-neutral-50' 
                        : 'border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50/50'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-neutral-100 text-neutral-600 flex items-center justify-center mx-auto mb-3">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-semibold text-neutral-800">
                      Click to choose your resume file or drag & drop here
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      Supports PDF, TXT, DOCX (Max 10MB)
                    </p>

                    {isProcessing && (
                      <div className="mt-4 flex items-center justify-center space-x-2 text-xs text-neutral-800 font-medium bg-neutral-100 py-2 px-3 rounded-lg w-fit mx-auto">
                        <Sparkles className="w-4 h-4 animate-spin text-neutral-900" />
                        <span>Extracting skills & projects...</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <textarea
                    rows={6}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste your complete resume text here (experience, technical projects, languages, frameworks, education)..."
                    className="w-full text-xs font-mono p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900 transition-colors"
                  />
                  <button
                    type="button"
                    disabled={isProcessing || !pastedText.trim()}
                    onClick={handlePastedTextSubmit}
                    className="w-full bg-neutral-900 hover:bg-black text-white text-xs font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {isProcessing ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                        <span>Parsing Resume...</span>
                      </>
                    ) : (
                      <>
                        <span>Extract Technical Profile</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {student.resume && (
                <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-7 h-7 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-700">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-neutral-800">{student.resume.fileName}</p>
                      <p className="text-[10px] text-neutral-400 font-mono">Parsed {student.resume.parsedAt} · Active Grounding</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('extracted')}
                    className="text-xs font-medium text-neutral-700 hover:text-black flex items-center"
                  >
                    <span>View parsed details</span>
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {student.resume?.summary && (
                <div>
                  <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1.5 font-mono">
                    Candidate Technical Profile Summary
                  </p>
                  <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 text-xs text-neutral-700 leading-relaxed">
                    {student.resume.summary}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2 font-mono">
                  Extracted Technical Stack
                </p>
                <div className="space-y-2">
                  {student.resume?.skills.languages && student.resume.skills.languages.length > 0 && (
                    <div className="flex items-start space-x-2">
                      <span className="text-[11px] font-mono text-neutral-500 w-24 shrink-0 pt-1">Languages:</span>
                      <div className="flex flex-wrap gap-1">
                        {student.resume.skills.languages.map((skill, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-200 font-mono">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {student.resume?.skills.frameworks && student.resume.skills.frameworks.length > 0 && (
                    <div className="flex items-start space-x-2">
                      <span className="text-[11px] font-mono text-neutral-500 w-24 shrink-0 pt-1">Frameworks:</span>
                      <div className="flex flex-wrap gap-1">
                        {student.resume.skills.frameworks.map((skill, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200 font-mono">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {student.resume?.skills.databases && student.resume.skills.databases.length > 0 && (
                    <div className="flex items-start space-x-2">
                      <span className="text-[11px] font-mono text-neutral-500 w-24 shrink-0 pt-1">Databases:</span>
                      <div className="flex flex-wrap gap-1">
                        {student.resume.skills.databases.map((skill, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {student.resume?.skills.tools && student.resume.skills.tools.length > 0 && (
                    <div className="flex items-start space-x-2">
                      <span className="text-[11px] font-mono text-neutral-500 w-24 shrink-0 pt-1">Tools / Cloud:</span>
                      <div className="flex flex-wrap gap-1">
                        {student.resume.skills.tools.map((skill, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-800 border border-purple-200 font-mono">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2 font-mono">
                  Extracted Projects ({student.resume?.projects.length || 0})
                </p>
                <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
                  {student.resume?.projects.map((proj, idx) => (
                    <div key={idx} className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-neutral-900">{proj.title}</span>
                        <div className="flex flex-wrap gap-1">
                          {proj.techStack?.map((t, i) => (
                            <span key={i} className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-neutral-200 text-neutral-600">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="text-neutral-600 text-[11px] leading-relaxed">{proj.description}</p>
                    </div>
                  ))}
                  {(!student.resume?.projects || student.resume.projects.length === 0) && (
                    <p className="text-xs text-neutral-400 italic">No specific projects detected. Found general technical coursework.</p>
                  )}
                </div>
              </div>

              {/* Experience */}
              {(student.resume as any)?.experience?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2 font-mono">
                    Work Experience ({(student.resume as any).experience.length})
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {(student.resume as any).experience.map((exp: any, idx: number) => (
                      <div key={idx} className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 text-xs space-y-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-semibold text-neutral-900">{exp.title}</span>
                            {exp.company && <span className="text-neutral-500 ml-1">@ {exp.company}</span>}
                          </div>
                          {exp.duration && <span className="text-[10px] font-mono text-neutral-400 shrink-0">{exp.duration}</span>}
                        </div>
                        {exp.description && <p className="text-neutral-600 text-[11px] leading-relaxed">{exp.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Education */}
              {(student.resume as any)?.education?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2 font-mono">Education</p>
                  <div className="space-y-2">
                    {(student.resume as any).education.map((edu: any, idx: number) => (
                      <div key={idx} className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 text-xs">
                        <span className="font-semibold text-neutral-900">{edu.degree}</span>
                        {edu.institution && <span className="text-neutral-500 ml-1">— {edu.institution}</span>}
                        {edu.year && <span className="text-[10px] font-mono text-neutral-400 ml-2">{edu.year}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Certifications */}
              {(student.resume as any)?.certifications?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2 font-mono">Certifications</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(student.resume as any).certifications.map((cert: string, idx: number) => (
                      <span key={idx} className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] font-medium text-emerald-800">
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Links */}
              {(student.resume as any)?.links && Object.values((student.resume as any).links).some(Boolean) && (
                <div>
                  <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2 font-mono">Links</p>
                  <div className="flex flex-wrap gap-2">
                    {(student.resume as any).links.github && (
                      <a href={(student.resume as any).links.github} target="_blank" rel="noopener noreferrer"
                        className="px-2.5 py-1 bg-neutral-100 border border-neutral-200 rounded-lg text-[11px] font-mono text-neutral-700 hover:bg-neutral-200 transition-colors">
                        GitHub ↗
                      </a>
                    )}
                    {(student.resume as any).links.linkedin && (
                      <a href={(student.resume as any).links.linkedin} target="_blank" rel="noopener noreferrer"
                        className="px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-[11px] font-mono text-blue-700 hover:bg-blue-100 transition-colors">
                        LinkedIn ↗
                      </a>
                    )}
                    {(student.resume as any).links.portfolio && (
                      <a href={(student.resume as any).links.portfolio} target="_blank" rel="noopener noreferrer"
                        className="px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-lg text-[11px] font-mono text-purple-700 hover:bg-purple-100 transition-colors">
                        Portfolio ↗
                      </a>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-200 bg-neutral-50/50 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-neutral-500 font-medium flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1.5" /> 
            {student.resume ? 'Resume Linked to Interview Engine' : 'Select a file to begin'}
          </span>
          <div className="flex items-center space-x-2">
            {activeTab === 'extracted' && (
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className="text-xs font-medium px-3 py-2 text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                Upload Different File
              </button>
            )}
            <button
              onClick={onClose}
              className="bg-neutral-900 hover:bg-black text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shadow-xs"
            >
              Done
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
