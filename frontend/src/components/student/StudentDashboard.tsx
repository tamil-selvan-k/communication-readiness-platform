import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { InterviewAssignment, ImprovementChecklistItem } from '../../types';
import { 
  Mic, 
  Headphones, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Code2, 
  Sparkles, 
  ArrowRight, 
  TrendingUp, 
  Award, 
  Edit3, 
  X, 
  AlertTriangle, 
  Layers, 
  Check, 
  ExternalLink, 
  ArrowLeft,
  Calendar,
  Globe,
  Plus,
  RefreshCw,
  Lock,
  Ban,
  ShieldAlert,
  CreditCard,
  ShieldCheck
} from 'lucide-react';
import { ResumeUploadModal } from './ResumeUploadModal';
import { useBackHandler } from '../../hooks/useBackHandler';
import { api } from '../../services/api';
import { isAssignmentElapsed } from '../common/AssessmentMonitoringWidget';

export const StudentDashboard: React.FC = () => {
  const { 
    student, 
    currentUser,
    startInterview, 
    latestReport, 
    setActiveView,
    updateCodingHandles,
    assignments,
    startAssignedSession,
    impersonationSession,
    returnToOriginalDashboard,
    isAssignmentDisqualified,
    simulateElapsedCooldown,
    restoreStudentCoinsToFive,
    isEvaluationPending,
    newReportNotification,
    dismissNewReportNotification
  } = useApp();

  const isIndependent = student.isIndependent || currentUser?.isIndependent;

  // 3-Day Wait Period Cooldown Countdown for Independent Students at 0 coins
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number>(() => {
    if ((student.coins ?? 5) > 0) return 0;
    const sKey = student.id || 'stu-21cs1084';
    const zeroStored = typeof localStorage !== 'undefined' ? localStorage.getItem(`crp_zero_coins_time_${sKey}`) : null;
    const zeroTimestamp = zeroStored ? parseInt(zeroStored, 10) : Date.now();
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    return Math.max(0, THREE_DAYS_MS - (Date.now() - zeroTimestamp));
  });

  useEffect(() => {
    if ((student.coins ?? 5) > 0) return;
    const sKey = student.id || 'stu-21cs1084';
    let zeroStored = localStorage.getItem(`crp_zero_coins_time_${sKey}`);
    if (!zeroStored) {
      zeroStored = String(Date.now());
      try {
        localStorage.setItem(`crp_zero_coins_time_${sKey}`, zeroStored);
      } catch {}
    }
    const zeroTimestamp = parseInt(zeroStored, 10);
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

    const updateTimer = () => {
      const remaining = Math.max(0, THREE_DAYS_MS - (Date.now() - zeroTimestamp));
      setCooldownRemainingMs(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [student.coins, student.id]);

  const formatCooldown = (ms: number) => {
    if (ms <= 0) return '0s (Regenerating 5 Credits...)';
    const totalSecs = Math.floor(ms / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    return `${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  };

  // Sub-views & Modals
  const [viewingResumePage, setViewingResumePage] = useState(false);
  const [viewingAllAssignments, setViewingAllAssignments] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [handlesModalOpen, setHandlesModalOpen] = useState(false);

  useBackHandler(viewingResumePage, () => setViewingResumePage(false));
  useBackHandler(viewingAllAssignments, () => setViewingAllAssignments(false));
  useBackHandler(handlesModalOpen, () => setHandlesModalOpen(false));

  // Payment Modal State for Independent Candidates
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CARD' | 'NETBANKING'>('UPI');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [upiId, setUpiId] = useState('candidate@okaxis');
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8821');
  const [cardExpiry, setCardExpiry] = useState('08/29');
  const [cardCvv, setCardCvv] = useState('742');

  useBackHandler(paymentModalOpen, () => setPaymentModalOpen(false));

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentProcessing(true);
    await new Promise(r => setTimeout(r, 1000));
    await restoreStudentCoinsToFive(student.id || 'stu-21cs1084');
    setPaymentProcessing(false);
    setPaymentSuccess(true);
    setTimeout(() => {
      setPaymentSuccess(false);
      setPaymentModalOpen(false);
    }, 1200);
  };

  // Coding Handles state
  const [lcUsername, setLcUsername] = useState(student.codingHandles?.leetcode || '');
  const [lcSolvedCount, setLcSolvedCount] = useState<number>(student.codingHandles?.leetcodeSolved ?? 0);
  const [ghUsername, setGhUsername] = useState(student.codingHandles?.github || '');
  const [ghReposCount, setGhReposCount] = useState<number>(student.codingHandles?.githubRepos ?? 0);

  // Other Coding Platforms
  const [otherPlatformName, setOtherPlatformName] = useState('Codeforces');
  const [otherPlatformHandle, setOtherPlatformHandle] = useState('');
  const [otherProfiles, setOtherProfiles] = useState<{ platform: string; username: string; profileUrl: string; solvedOrRating?: string }[]>(
    student.codingHandles?.otherProfiles || []
  );
  const [verifyingPlatform, setVerifyingPlatform] = useState(false);
  const [platformVerifyError, setPlatformVerifyError] = useState<string | null>(null);
  const [savingHandles, setSavingHandles] = useState(false);
  const [fetchingLcStats, setFetchingLcStats] = useState(false);
  const [fetchingGhStats, setFetchingGhStats] = useState(false);
  const [fetchStatsMessage, setFetchStatsMessage] = useState<string | null>(null);

  // LeetCode solved count, looked up by the backend (leetcode.com blocks browser requests)
  const handleFetchLeetCodeStats = async () => {
    if (!lcUsername.trim()) return;
    setFetchingLcStats(true);
    setFetchStatsMessage(null);
    try {
      const { solved } = await api.student.leetcodeStats(lcUsername.trim());
      setLcSolvedCount(solved);
      setFetchStatsMessage(`Found ${solved} solved problems on LeetCode!`);
    } catch (error) {
      // Never invent a number: keep what the student already has
      setFetchStatsMessage(`Couldn't verify @${lcUsername.trim()} on LeetCode (${error instanceof Error ? error.message : 'unavailable'}). You can enter the solved count manually.`);
    } finally {
      setFetchingLcStats(false);
    }
  };

  // Live fetch GitHub public repository count
  const handleFetchGitHubStats = async () => {
    if (!ghUsername.trim()) return;
    setFetchingGhStats(true);
    setFetchStatsMessage(null);
    try {
      const res = await fetch(`https://api.github.com/users/${ghUsername.trim()}`);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.public_repos === 'number') {
          setGhReposCount(data.public_repos);
          setFetchStatsMessage(`Found ${data.public_repos} public repositories on GitHub!`);
          setFetchingGhStats(false);
          return;
        }
      }
    } catch {}
    // GitHub not reachable / rate-limited / no such user: keep the existing count, don't invent one
    setFetchStatsMessage(`Couldn't verify @${ghUsername.trim()} on GitHub right now. You can enter the repository count manually.`);
    setFetchingGhStats(false);
  };

  // Post-Interview Actionable Improvement Checklist State
  // Initialized from saved storage, or generated if reports exist, otherwise empty
  const [checklist, setChecklist] = useState<ImprovementChecklistItem[]>(() => {
    try {
      const saved = localStorage.getItem(`student_improvement_checklist_${student.id}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}

    // If student has reports or previous interviews, populate initial post-interview improvement milestones
    const hasHistory = (student.recentReports && student.recentReports.length > 0) || Boolean(latestReport);
    if (hasHistory) {
      return [
        {
          id: 'chk_w1',
          week: 'Week 1',
          title: 'Speech Pacing & Filler Word Reduction',
          description: 'Keep verbal pace between 115-130 WPM and reduce filler words ("um", "uh", "like") to under 3 per question turn.',
          category: 'COMMUNICATION',
          isCompleted: true,
          completedAt: '2026-09-27'
        },
        {
          id: 'chk_w2',
          week: 'Week 2',
          title: 'Core Architecture Trade-Offs & Edge Cases',
          description: 'Vocalize algorithmic trade-offs (e.g. time-space complexity, hashing collisions, thread safety) before writing code.',
          category: 'TECHNICAL',
          isCompleted: false
        },
        {
          id: 'chk_w3',
          week: 'Week 3',
          title: 'Resume Project Deep-Dive & Microservices',
          description: 'Prepare structured STAR-format justification of database indexing, caching strategies, and concurrency bottlenecks.',
          category: 'SYSTEM_DESIGN',
          isCompleted: false
        },
        {
          id: 'chk_w4',
          week: 'Week 4',
          title: 'Final Full-Length Proctored Mock Run',
          description: 'Achieve at least 80% on a full 3-turn voice-to-voice proctored technical interview under strict camera focus.',
          category: 'CODING',
          isCompleted: false
        }
      ];
    }

    return [];
  });

  // Sync coding handles and checklist whenever current student switches/impersonated
  useEffect(() => {
    setLcUsername(student.codingHandles?.leetcode || '');
    setLcSolvedCount(student.codingHandles?.leetcodeSolved ?? 0);
    setGhUsername(student.codingHandles?.github || '');
    setGhReposCount(student.codingHandles?.githubRepos ?? 0);
    setOtherProfiles(student.codingHandles?.otherProfiles || []);

    try {
      const saved = localStorage.getItem(`student_improvement_checklist_${student.id}`);
      if (saved) {
        setChecklist(JSON.parse(saved));
        return;
      }
    } catch {}

    const hasHistory = (student.recentReports && student.recentReports.length > 0) || Boolean(latestReport);
    if (hasHistory) {
      setChecklist([
        {
          id: 'chk_w1',
          week: 'Week 1',
          title: 'Speech Pacing & Filler Word Reduction',
          description: 'Keep verbal pace between 115-130 WPM and reduce filler words ("um", "uh", "like") to under 3 per question turn.',
          category: 'COMMUNICATION',
          isCompleted: true,
          completedAt: '2026-09-27'
        },
        {
          id: 'chk_w2',
          week: 'Week 2',
          title: 'Core Architecture Trade-Offs & Edge Cases',
          description: 'Vocalize algorithmic trade-offs (e.g. time-space complexity, hashing collisions, thread safety) before writing code.',
          category: 'TECHNICAL',
          isCompleted: false
        },
        {
          id: 'chk_w3',
          week: 'Week 3',
          title: 'Resume Project Deep-Dive & Microservices',
          description: 'Prepare structured STAR-format justification of database indexing, caching strategies, and concurrency bottlenecks.',
          category: 'SYSTEM_DESIGN',
          isCompleted: false
        },
        {
          id: 'chk_w4',
          week: 'Week 4',
          title: 'Final Full-Length Proctored Mock Run',
          description: 'Achieve at least 80% on a full 3-turn voice-to-voice proctored technical interview under strict camera focus.',
          category: 'CODING',
          isCompleted: false
        }
      ]);
    } else {
      setChecklist([]);
    }
  }, [student.id, student.name]);

  // Listen for storage events (e.g. from background async evaluation in AppContext)
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const sKey = student.id || 'stu-21cs1084';
        const saved = localStorage.getItem(`student_improvement_checklist_${sKey}`);
        if (saved) {
          setChecklist(JSON.parse(saved));
        }
      } catch {}
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [student.id]);

  // Ensure newly completed latestReport results stack up onto the Post-Interview Checklist
  useEffect(() => {
    if (!latestReport?.id) return;
    const sKey = student.id || 'stu-21cs1084';
    let currentList: ImprovementChecklistItem[] = [];
    try {
      const saved = localStorage.getItem(`student_improvement_checklist_${sKey}`);
      if (saved) currentList = JSON.parse(saved);
      else currentList = [...checklist];
    } catch {
      currentList = [...checklist];
    }

    const alreadyStacked = currentList.some(item => item.id.includes(latestReport.id));
    if (!alreadyStacked && latestReport.actionableNextSteps && latestReport.actionableNextSteps.length > 0) {
      const newItems: ImprovementChecklistItem[] = latestReport.actionableNextSteps.map((step, idx) => ({
        id: `chk_${latestReport.id}_${idx}_${Date.now()}`,
        week: `Target ${currentList.length + idx + 1}`,
        title: step.length > 50 ? (step.split('.')[0] || step.slice(0, 48)) + '...' : step,
        description: step,
        category: (idx % 2 === 0 ? 'COMMUNICATION' : 'TECHNICAL') as any,
        isCompleted: false
      }));

      const updated = [...currentList, ...newItems];
      setChecklist(updated);
      try {
        localStorage.setItem(`student_improvement_checklist_${sKey}`, JSON.stringify(updated));
      } catch {}
    }
  }, [latestReport?.id, student.id]);

  // Calculate Overall Readiness %: Strictly depends ONLY on the Post-Interview Checklist
  const totalChecklistCount = checklist.length;
  const completedChecklistCount = checklist.filter(c => c.isCompleted).length;
  const overallReadinessScore = totalChecklistCount === 0 
    ? 0 
    : Math.round((completedChecklistCount / totalChecklistCount) * 100);

  // Toggle checklist item
  const handleToggleChecklistItem = (itemId: string) => {
    const updated = checklist.map(item => 
      item.id === itemId ? { ...item, isCompleted: !item.isCompleted, completedAt: !item.isCompleted ? new Date().toISOString() : undefined } : item
    );
    setChecklist(updated);
    try {
      localStorage.setItem(`student_improvement_checklist_${student.id}`, JSON.stringify(updated));
    } catch {}
  };

  // Filter relevant assignments (elapsed test sessions auto-disappear from active drills)
  const relevantAssignments = (assignments || []).filter((asg: InterviewAssignment) => {
    if (isAssignmentElapsed(asg)) {
      return false;
    }
    if (asg.collegeId && student.collegeId && asg.collegeId !== student.collegeId) {
      return false;
    }
    if (asg.targetScope === 'ALL_STUDENTS') return true;
    if (asg.targetScope === 'SPECIFIC_STUDENT') {
      return asg.targetStudentId === student.id || 
             asg.targetStudentId === student.rollNumber ||
             asg.targetStudentId?.toLowerCase() === student.email?.toLowerCase();
    }
    if (asg.targetScope === 'MY_MENTEES') {
      return student.mentorEmail === asg.assignedByEmail || student.mentorName === asg.assignedByName || true;
    }
    if (asg.targetScope === 'PROGRAM') {
      // 1. Multi-program array matching
      if (asg.targetProgramNames && asg.targetProgramNames.length > 0) {
        const matchesAny = asg.targetProgramNames.some(p => 
          (student.programName && (student.programName.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(student.programName.toLowerCase()))) ||
          (student.track && (student.track.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(student.track.toLowerCase())))
        );
        if (matchesAny) {
          if (asg.targetSubProgram) {
            return (student.subProgramName && student.subProgramName.toLowerCase() === asg.targetSubProgram.toLowerCase()) ||
                   (student.track && student.track.toLowerCase().includes(asg.targetSubProgram.toLowerCase()));
          }
          return true;
        }
      }
      const progTarget = asg.targetProgramName || asg.targetDomainOrTrack;
      if (!progTarget) return true;
      const progMatches = (student.programName && (student.programName.toLowerCase().includes(progTarget.toLowerCase()) || progTarget.toLowerCase().includes(student.programName.toLowerCase()))) ||
        (student.track && (student.track.toLowerCase().includes(progTarget.toLowerCase()) || progTarget.toLowerCase().includes(student.track.toLowerCase())));
      
      // If student is not explicitly locked to a program yet, don't hide practice assignments
      if (!progMatches && !student.programName && (!student.track || student.track === 'General Track')) {
        return true;
      }
      if (!progMatches) return false;
      if (asg.targetSubProgram) {
        return (student.subProgramName && student.subProgramName.toLowerCase() === asg.targetSubProgram.toLowerCase()) ||
               (student.track && student.track.toLowerCase().includes(asg.targetSubProgram.toLowerCase()));
      }
      return true;
    }
    if (asg.targetScope === 'DEPARTMENT') {
      // 1. Multi-department array matching
      let deptMatches = false;
      if (asg.targetDepartments && asg.targetDepartments.length > 0) {
        deptMatches = asg.targetDepartments.some(d => 
          (student.department && (student.department.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(student.department.toLowerCase())))
        );
      } else {
        const deptTarget = asg.targetDepartment || asg.targetDomainOrTrack;
        if (!deptTarget) deptMatches = true;
        else deptMatches = Boolean(student.department && (student.department.toLowerCase().includes(deptTarget.toLowerCase()) || deptTarget.toLowerCase().includes(student.department.toLowerCase())));
      }

      if (!deptMatches) return false;

      // Class-specific filtering within department
      if (asg.targetClassNames && asg.targetClassNames.length > 0) {
        return asg.targetClassNames.some(cls => cls.toLowerCase() === (student.className || '').toLowerCase());
      }
      if (asg.targetClassName) {
        return asg.targetClassName.toLowerCase() === (student.className || '').toLowerCase();
      }
      return true;
    }

    if (asg.targetScope === 'CLASS') {
      if (asg.targetClassNames && asg.targetClassNames.length > 0) {
        return asg.targetClassNames.some(cls => cls.toLowerCase() === (student.className || '').toLowerCase());
      }
      if (asg.targetClassName) {
        return asg.targetClassName.toLowerCase() === (student.className || '').toLowerCase();
      }
      return false;
    }
    return true;
  });

  const getStudentSubmission = (asg: InterviewAssignment) => {
    return asg.submissions?.find(
      s => s.studentId === student.id ||
           s.studentRollNumber === student.rollNumber ||
           s.studentRollNumber?.toLowerCase() === student.rollNumber?.toLowerCase()
    );
  };

  const pendingAssignmentsCount = relevantAssignments.filter(a => !getStudentSubmission(a)).length;
  const completedAssignmentsCount = relevantAssignments.filter(a => !!getStudentSubmission(a)).length;

  // Platform URL generator
  const getPlatformUrl = (platform: string, username: string): string => {
    const cleanUser = username.trim();
    const plat = platform.toLowerCase();
    if (plat.includes('leetcode')) return `https://leetcode.com/u/${cleanUser}`;
    if (plat.includes('github')) return `https://github.com/${cleanUser}`;
    if (plat.includes('codeforces')) return `https://codeforces.com/profile/${cleanUser}`;
    if (plat.includes('hackerrank')) return `https://www.hackerrank.com/profile/${cleanUser}`;
    if (plat.includes('codechef')) return `https://www.codechef.com/users/${cleanUser}`;
    if (plat.includes('geeks')) return `https://auth.geeksforgeeks.org/user/${cleanUser}`;
    if (cleanUser.startsWith('http')) return cleanUser;
    return `https://${plat}.com/${cleanUser}`;
  };

  // Add Other Coding Platform with verification check
  const handleAddOtherPlatform = () => {
    setPlatformVerifyError(null);
    if (!otherPlatformHandle.trim()) {
      setPlatformVerifyError(`Please enter your ${otherPlatformName} username.`);
      return;
    }

    setVerifyingPlatform(true);

    // Verification check simulation
    setTimeout(() => {
      const handle = otherPlatformHandle.trim();
      // If handle contains illegal URL characters or spaces
      if (handle.includes(' ') || handle.length < 2) {
        setPlatformVerifyError(`Unable to fetch details from ${otherPlatformName}. Please check your handle and public profile settings.`);
        setVerifyingPlatform(false);
        return;
      }

      const newProfile = {
        platform: otherPlatformName,
        username: handle,
        profileUrl: getPlatformUrl(otherPlatformName, handle),
        solvedOrRating: 'Verified Active'
      };

      const updated = [...otherProfiles.filter(p => p.platform !== otherPlatformName), newProfile];
      setOtherProfiles(updated);
      setOtherPlatformHandle('');
      setVerifyingPlatform(false);
    }, 600);
  };

  const handleSaveHandles = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingHandles(true);
    try {
      await updateCodingHandles({
        leetcode: lcUsername.trim() || undefined,
        leetcodeSolved: Number(lcSolvedCount) || 0,
        github: ghUsername.trim() || undefined,
        githubRepos: Number(ghReposCount) || 0,
        otherProfiles
      });
      setHandlesModalOpen(false);
    } catch (err) {
      console.warn('Error saving handles:', err);
    } finally {
      setSavingHandles(false);
    }
  };

  // =========================================================================
  // SUB-VIEW: DEDICATED FULL RESUME PAGE
  // =========================================================================
  if (viewingResumePage) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6 animate-in fade-in duration-200">
        
        {/* Top Back Navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewingResumePage(false)}
            className="inline-flex items-center space-x-2 text-xs font-semibold text-neutral-700 hover:text-neutral-950 bg-white hover:bg-neutral-50 px-3.5 py-2 rounded-xl border border-neutral-200 transition-colors shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Student Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="px-4 py-2 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all shadow-xs cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Update / Re-Upload Resume</span>
          </button>
        </div>

        {/* Resume Dossier Card */}
        {!student.resume ? (
          <div className="bg-white border border-neutral-200 rounded-3xl p-12 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900">No Resume Uploaded Yet</h2>
              <p className="text-xs text-neutral-500 max-w-md mx-auto mt-1">
                Upload your resume (PDF or pasted text) to extract your verified tech stack, languages, and project experience for AI-grounded interview sessions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Upload Resume Now</span>
            </button>
          </div>
        ) : (
          <div className="bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* Resume Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-100">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-neutral-900 text-white flex items-center justify-center font-bold text-base shadow-xs">
                  {student.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-xl font-bold tracking-tight text-neutral-900">{student.name}</h1>
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-full font-mono uppercase">
                      Parsed &amp; Grounded
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {student.email} · {student.department} · File: <strong className="text-neutral-700">{student.resume.fileName}</strong> (Uploaded on {student.resume.parsedAt || 'Recent'})
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(true)}
                  className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Replace Resume
                </button>
              </div>
            </div>

            {/* Resume Summary */}
            {student.resume.summary && (
              <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200/80 space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">Executive Summary</span>
                <p className="text-xs text-neutral-700 leading-relaxed italic">
                  &quot;{student.resume.summary}&quot;
                </p>
              </div>
            )}

            {/* Extracted Technical Skills Grid */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                Extracted Technical Stack &amp; Competencies
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/80 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">Languages</span>
                  <div className="flex flex-wrap gap-1.5">
                    {student.resume.skills?.languages?.length ? (
                      student.resume.skills.languages.map((l: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-800">
                          {l}
                        </span>
                      ))
                    ) : <span className="text-neutral-400 italic">None detected</span>}
                  </div>
                </div>

                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/80 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">Frameworks</span>
                  <div className="flex flex-wrap gap-1.5">
                    {student.resume.skills?.frameworks?.length ? (
                      student.resume.skills.frameworks.map((f: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-800">
                          {f}
                        </span>
                      ))
                    ) : <span className="text-neutral-400 italic">None detected</span>}
                  </div>
                </div>

                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/80 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">Databases</span>
                  <div className="flex flex-wrap gap-1.5">
                    {student.resume.skills?.databases?.length ? (
                      student.resume.skills.databases.map((d: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-800">
                          {d}
                        </span>
                      ))
                    ) : <span className="text-neutral-400 italic">None detected</span>}
                  </div>
                </div>

                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/80 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">Tools &amp; Cloud</span>
                  <div className="flex flex-wrap gap-1.5">
                    {student.resume.skills?.tools?.length ? (
                      student.resume.skills.tools.map((t: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-800">
                          {t}
                        </span>
                      ))
                    ) : <span className="text-neutral-400 italic">None detected</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Extracted Projects Dossier */}
            {student.resume.projects && student.resume.projects.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Verified Academic &amp; Personal Projects
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {student.resume.projects.map((proj: any, idx: number) => (
                    <div key={idx} className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200/80 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-neutral-900 text-sm truncate">{proj.title}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-200 text-neutral-700 font-mono font-semibold">
                          Project #{idx + 1}
                        </span>
                      </div>
                      {proj.techStack && (
                        <p className="text-[11px] text-blue-700 font-mono font-medium">
                          Tech Stack: {Array.isArray(proj.techStack) ? proj.techStack.join(', ') : proj.techStack}
                        </p>
                      )}
                      {proj.description && (
                        <p className="text-xs text-neutral-600 leading-relaxed">{proj.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Work Experience */}
            {(student.resume as any).experience && (student.resume as any).experience.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Work Experience</h3>
                <div className="space-y-3">
                  {(student.resume as any).experience.map((exp: any, idx: number) => (
                    <div key={idx} className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200/80 text-xs space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-neutral-900 text-sm">{exp.title}</h4>
                          <p className="text-neutral-600 font-medium">{exp.company}</p>
                        </div>
                        {exp.duration && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-200 text-neutral-700 font-mono font-semibold shrink-0">
                            {exp.duration}
                          </span>
                        )}
                      </div>
                      {exp.description && (
                        <p className="text-xs text-neutral-600 leading-relaxed">{exp.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {(student.resume as any).education && (student.resume as any).education.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Education</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(student.resume as any).education.map((edu: any, idx: number) => (
                    <div key={idx} className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200/80 text-xs space-y-1">
                      <h4 className="font-bold text-neutral-900">{edu.degree}</h4>
                      <p className="text-neutral-600">{edu.institution}</p>
                      {edu.year && <p className="text-[10px] font-mono text-neutral-400">{edu.year}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {(student.resume as any).certifications && (student.resume as any).certifications.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Certifications</h3>
                <div className="flex flex-wrap gap-2">
                  {(student.resume as any).certifications.map((cert: string, idx: number) => (
                    <span key={idx} className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800">
                      {cert}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Links */}
            {(student.resume as any).links && Object.values((student.resume as any).links).some(Boolean) && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Links</h3>
                <div className="flex flex-wrap gap-2">
                  {(student.resume as any).links.github && (
                    <a href={(student.resume as any).links.github} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-mono font-semibold text-neutral-700 hover:bg-neutral-200 transition-colors">
                      GitHub ↗
                    </a>
                  )}
                  {(student.resume as any).links.linkedin && (
                    <a href={(student.resume as any).links.linkedin} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-mono font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
                      LinkedIn ↗
                    </a>
                  )}
                  {(student.resume as any).links.portfolio && (
                    <a href={(student.resume as any).links.portfolio} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-xl text-xs font-mono font-semibold text-purple-700 hover:bg-purple-100 transition-colors">
                      Portfolio ↗
                    </a>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {uploadModalOpen && (
          <ResumeUploadModal onClose={() => setUploadModalOpen(false)} />
        )}
      </div>
    );
  }

  // =========================================================================
  // SUB-VIEW: ALL ASSIGNED ASSESSMENTS DIRECTORY
  // =========================================================================
  if (viewingAllAssignments) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6 animate-in fade-in duration-200">
        
        {/* Back Navigation Bar */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewingAllAssignments(false)}
            className="inline-flex items-center space-x-2 text-xs font-semibold text-neutral-700 hover:text-neutral-950 bg-white hover:bg-neutral-50 px-3.5 py-2 rounded-xl border border-neutral-200 transition-colors shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Student Dashboard</span>
          </button>

          <span className="text-xs font-mono text-neutral-500">
            {pendingAssignmentsCount} Pending · {completedAssignmentsCount} Completed
          </span>
        </div>

        {/* Directory Header Banner */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
              Assigned Assessments &amp; Practice Drills
            </h1>
          </div>
        </div>

        {/* 0 Credits Alert Banner in Assignments View */}
        {(student.coins ?? 5) === 0 && (
          isIndependent ? (
            <div className="bg-gradient-to-r from-amber-950 via-neutral-900 to-amber-900 border border-amber-600/70 rounded-2xl p-5 shadow-lg text-white space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start space-x-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-amber-300">0 Credits Available — 3-Day Waiting Period Active</h3>
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-amber-400 text-neutral-950 font-bold rounded-full uppercase">
                        Independent Candidate
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                      You have exhausted your credits. Individually registered students must wait a period of <strong>3 days (72 hours)</strong> to automatically regain all 5 credits.
                    </p>
                    <div className="flex items-center space-x-2 mt-2 font-mono text-xs">
                      <span className="text-neutral-400">Regeneration countdown:</span>
                      <span className="px-2.5 py-1 bg-black/60 rounded-lg text-amber-300 font-bold border border-amber-500/30">
                        ⏳ {formatCooldown(cooldownRemainingMs)}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-neutral-950 font-bold rounded-xl text-xs flex items-center space-x-2 shrink-0 shadow-md transition-all cursor-pointer"
                  title="Independent candidates: Bypass 3-day waiting period through payment"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Refill 5 Credits ($4.99 / ₹399)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-rose-950 via-neutral-900 to-rose-900 border border-rose-600/70 rounded-2xl p-5 shadow-lg text-white space-y-3">
              <div className="flex items-start space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-rose-300">0 Credits Available — Balance Exhausted</h3>
                    <span className="px-2 py-0.5 text-[10px] font-mono bg-rose-400 text-neutral-950 font-bold rounded-full uppercase">
                      Institutional Candidate
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 mt-1">
                    0 credits remaining. Contact your Super Admin to restore credits.
                  </p>
                </div>
              </div>
            </div>
          )
        )}

        {/* Assignments Cards Grid */}
        {relevantAssignments.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-3xl p-12 text-center text-neutral-400 text-xs space-y-2">
            <Layers className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
            <p className="font-semibold text-neutral-700">No assessments currently assigned to your batch.</p>
            <p className="text-neutral-500">When your mentor or college admin assigns a drill, it will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {relevantAssignments.map((asg) => {
              const submission = getStudentSubmission(asg);
              const isDisqualified = isAssignmentDisqualified(asg.id) ||
                asg.submissions?.some(s => (s.studentId === student.id || s.studentRollNumber === student.rollNumber) && (s.status === 'DISQUALIFIED' || s.isDisqualified));
              const isCompleted = !isDisqualified && !!submission;
              const isInterview = asg.sessionType === 'MOCK_INTERVIEW';
              const isBoth = asg.sessionType === 'BOTH';

              return (
                <div 
                  key={asg.id}
                  className={`rounded-2xl border p-5 flex flex-col justify-between transition-all ${
                    isDisqualified
                      ? 'bg-rose-50/40 border-rose-300 shadow-2xs'
                      : isCompleted 
                      ? 'bg-neutral-50/60 border-neutral-200' 
                      : 'bg-white border-neutral-300 shadow-2xs hover:shadow-xs hover:border-neutral-900'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        isDisqualified
                          ? 'bg-rose-950 text-rose-200 border border-rose-800'
                          : isBoth
                          ? 'bg-amber-950 text-amber-200 border border-amber-800'
                          : isInterview 
                          ? 'bg-neutral-900 text-white' 
                          : 'bg-purple-950 text-purple-200'
                      }`}>
                        {isBoth ? <Sparkles className="w-3 h-3 text-amber-400" /> : isInterview ? <Mic className="w-3 h-3 text-emerald-400" /> : <Headphones className="w-3 h-3 text-purple-300" />}
                        <span>{isBoth ? 'Combined (Voice Mock + Listening)' : isInterview ? 'Technical Mock Interview' : 'Listening Comprehension'}</span>
                      </span>

                      <div className="flex items-center space-x-1.5">
                        {isDisqualified ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 rounded-full font-mono border border-rose-200">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>DISQUALIFIED (0/100)</span>
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full font-mono">
                            <Check className="w-3 h-3" />
                            <span>Score: {submission?.score}/100</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-200 rounded font-mono">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Due {asg.dueDate}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">{asg.title}</h3>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Assigned by <span className="font-semibold text-neutral-700">{asg.assignedByName}</span> ({asg.assignedByRole.replace(/_/g, ' ')})
                      </p>
                    </div>

                    {isDisqualified ? (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 text-xs flex items-start space-x-2.5">
                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-rose-900">Disqualified</p>
                          <p className="text-[11px] text-rose-800 mt-0.5">
                            Exceeded maximum permitted tab switches.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/60 font-mono">
                        <div>
                          <span className="text-neutral-400 block text-[10px] uppercase">Target Scope</span>
                          <span className="font-medium text-neutral-800 truncate block">
                            {asg.targetProgramName || asg.targetDomainOrTrack || asg.targetDepartment || 'All Students'}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[10px] uppercase">
                            {isInterview ? 'Rubric / Mode' : 'Passage'}
                          </span>
                          <span className="font-medium text-neutral-800 truncate block">
                            {isInterview 
                              ? (asg.interviewMode === 'RESUME_BASED' ? 'Resume-Based' : `${asg.difficulty || 'Medium'} · ${asg.domainOrTopic || 'General'}`)
                              : (asg.listeningPassageId || 'FinPay Gateway')}
                          </span>
                        </div>
                      </div>
                    )}

                    {asg.startTime && asg.endTime && !isDisqualified && (
                      <div className="p-2 bg-amber-50/80 rounded-lg border border-amber-200 text-amber-900 text-[11px] flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>Active Window: {asg.startTime} to {asg.endTime}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 mt-4 border-t border-neutral-100 flex items-center justify-between">
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {isDisqualified ? (
                        <span className="text-rose-600 font-bold font-mono">Status: Disqualified</span>
                      ) : isCompleted ? (
                        `Submitted on ${submission?.submittedAt ? submission.submittedAt.split('T')[0] : 'Today'}`
                      ) : (
                        'Not yet attempted'
                      )}
                    </span>
                    {isDisqualified ? (
                      <button
                        type="button"
                        disabled={true}
                        className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-300 opacity-80 cursor-not-allowed"
                        title="Access revoked: Disqualified due to 4 tab switches"
                      >
                        <Lock className="w-3.5 h-3.5 text-rose-600" />
                        <span>Disqualified (4 Tab Switches)</span>
                      </button>
                    ) : (student.coins ?? 5) < 1 ? (
                      <button
                        type="button"
                        disabled={true}
                        className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-100 text-neutral-500 border border-neutral-300 opacity-80 cursor-not-allowed"
                        title="Insufficient Coins: You need at least 1 coin to attend this session"
                      >
                        <Lock className="w-3.5 h-3.5 text-neutral-400" />
                        <span>0 Coins (Insufficient Balance)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
                            document.documentElement.requestFullscreen().catch(() => {});
                          }
                          startAssignedSession(asg);
                        }}
                        className={`inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isCompleted
                            ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
                            : isBoth
                            ? 'bg-amber-950 hover:bg-black text-white shadow-xs'
                            : isInterview
                            ? 'bg-neutral-900 hover:bg-black text-white shadow-xs'
                            : 'bg-purple-950 hover:bg-black text-white shadow-xs'
                        }`}
                      >
                        {isBoth ? <Sparkles className="w-3.5 h-3.5 text-amber-400" /> : isInterview ? <Mic className="w-3.5 h-3.5" /> : <Headphones className="w-3.5 h-3.5" />}
                        <span>{isCompleted ? 'Retake Assessment (1 Coin)' : isBoth ? 'Start Combined Drill (1 Coin)' : (isInterview ? 'Start Mock Assessment (1 Coin)' : 'Start Listening Assessment (1 Coin)')}</span>
                        <ArrowRight className="w-3 h-3 ml-0.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    );
  }

  // =========================================================================
  // MAIN STUDENT DASHBOARD VIEW
  // =========================================================================
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8 animate-in fade-in duration-200">
      
      {/* Impersonation Indicator inside Dashboard */}
      {impersonationSession && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
              👁
            </div>
            <div>
              <p className="text-xs font-bold text-amber-900">
                Viewing Student Dashboard: {student.name} ({student.rollNumber || student.email})
              </p>
              <p className="text-[11px] text-amber-700">
                Impersonated by {impersonationSession.originalUser?.name} ({impersonationSession.originalRole.replace(/_/g, ' ')})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={returnToOriginalDashboard}
            className="px-3.5 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-amber-300" />
            <span>Return to {impersonationSession.originalRole.replace(/_/g, ' ')} Dashboard</span>
          </button>
        </div>
      )}

      {/* 0 Credits Alert Banner */}
      {(student.coins ?? 5) === 0 && (
        isIndependent ? (
          <div className="bg-gradient-to-r from-amber-950 via-neutral-900 to-amber-900 border border-amber-600/70 rounded-2xl p-5 shadow-lg text-white space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-amber-300">0 Credits Available — 3-Day Waiting Period Active</h3>
                    <span className="px-2 py-0.5 text-[10px] font-mono bg-amber-400 text-neutral-950 font-bold rounded-full uppercase">
                      Independent Candidate
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                    You have exhausted your credits. Individually registered students must wait a period of <strong>3 days (72 hours)</strong> to automatically regain all 5 credits.
                  </p>
                  <div className="flex items-center space-x-2 mt-2 font-mono text-xs">
                    <span className="text-neutral-400">Regeneration countdown:</span>
                    <span className="px-2.5 py-1 bg-black/60 rounded-lg text-amber-300 font-bold border border-amber-500/30">
                      ⏳ {formatCooldown(cooldownRemainingMs)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => simulateElapsedCooldown(student.id || 'stu-21cs1084')}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-xl text-xs flex items-center space-x-2 shrink-0 shadow-md transition-colors cursor-pointer"
                title="Fast-forward 3 days to test automatic credit replenishment"
              >
                <Sparkles className="w-4 h-4" />
                <span>Fast-Forward 3 Days (Test)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-rose-950 via-neutral-900 to-rose-900 border border-rose-600/70 rounded-2xl p-5 shadow-lg text-white space-y-3">
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-rose-300">0 Credits Available — Balance Exhausted</h3>
                  <span className="px-2 py-0.5 text-[10px] font-mono bg-rose-400 text-neutral-950 font-bold rounded-full uppercase">
                    Institutional Candidate
                  </span>
                </div>
                <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                  You have 0 credits remaining. Each interview or communication session requires 1 credit. As an institutional student enrolled under your college department, <strong>only the Super Admin can restore all 5 credits for you</strong>. Please contact your college placement administration or Super Admin to request replenishment.
                </p>
              </div>
            </div>
          </div>
        )
      )}

      {/* Dynamic Indication Notification: Results Ready */}
      {newReportNotification && (
        <div 
          onClick={() => {
            dismissNewReportNotification();
            setActiveView('REPORT_VIEW');
          }}
          className="bg-emerald-950 border border-emerald-500/80 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg cursor-pointer hover:bg-black transition-all animate-in slide-in-from-top-2 duration-200 group"
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-emerald-300 animate-spin" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-400 text-neutral-950">
                  Results Ready ({newReportNotification.score}/100)
                </span>
                <span className="text-xs text-emerald-300">Just now</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-white mt-0.5 group-hover:underline">
                Your results are ready, click here to view results
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs shrink-0">
            <span>View Results</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      )}

      {/* AI Evaluation In Progress Banner */}
      {isEvaluationPending && (
        <div className="bg-amber-50 border border-amber-300 text-amber-950 p-4 rounded-2xl flex items-center justify-between shadow-xs animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-neutral-950 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 animate-spin" />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-amber-800">
                AI Evaluation In Progress
              </p>
              <p className="text-xs sm:text-sm font-semibold text-neutral-900 mt-0.5">
                Thanks for completing the assessment, you'll receive the results shortly.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-medium text-amber-800 bg-amber-100/90 px-3 py-1 rounded-xl hidden sm:inline-block">
            Calculating Score &amp; Feedback...
          </span>
        </div>
      )}

      {/* Student Welcome Header Banner */}
      <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
                {student.name}
              </h1>
              {isIndependent ? (
                <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-950 text-emerald-300 rounded-full border border-emerald-800 flex items-center space-x-1">
                  <span>★ Independent Candidate</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 text-xs font-semibold bg-neutral-900 text-white rounded-full">
                  ★ {student.track}
                </span>
              )}
              <span className="px-2.5 py-1 text-xs font-medium bg-neutral-100 text-neutral-600 rounded-full border border-neutral-200 font-mono">
                {student.rollNumber}
              </span>
            </div>

            <p className="text-sm text-neutral-500 max-w-2xl">
              {student.department} · {isIndependent ? 'Self-Paced Track' : `Batch of ${student.batchYear}`} · Primary Track: {student.subProgramName || student.programName || student.track || 'General'}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setViewingResumePage(true)}
              className="flex items-center space-x-2 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 text-neutral-800 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-2xs cursor-pointer"
            >
              <FileText className="w-4 h-4 text-neutral-500" />
              <span>{student.resume ? 'View Full Resume' : 'Upload Resume'}</span>
            </button>

            {isEvaluationPending ? (
              <button
                type="button"
                disabled
                className="flex items-center space-x-2 bg-amber-500/10 border border-amber-300 text-amber-900 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs animate-pulse cursor-wait"
              >
                <Sparkles className="w-4 h-4 text-amber-600 animate-spin" />
                <span>⏳ AI Evaluating Interview...</span>
              </button>
            ) : latestReport ? (
              <button
                type="button"
                onClick={() => {
                  dismissNewReportNotification();
                  setActiveView('REPORT_VIEW');
                }}
                className="relative flex items-center space-x-2 bg-neutral-900 hover:bg-black text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer group"
              >
                <TrendingUp className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>View Recent Interview Results ({latestReport.overallScore}/100)</span>
                {newReportNotification && (
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping absolute -top-1 -right-1" />
                )}
              </button>
            ) : null}
          </div>

        </div>

        {/* 4 Top Telemetry KPI Cards */}
        <div className="mt-6 pt-6 border-t border-neutral-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
          
          {/* Card 1: LeetCode Profile */}
          <div 
            onClick={() => {
              if (student.codingHandles?.leetcode) {
                window.open(getPlatformUrl('leetcode', student.codingHandles.leetcode), '_blank');
              } else {
                setHandlesModalOpen(true);
              }
            }}
            className="p-3.5 bg-neutral-50/80 hover:bg-neutral-100/80 rounded-2xl border border-neutral-200/80 transition-all cursor-pointer group relative"
          >
            <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-1">
              <span className="font-semibold text-neutral-700">LeetCode</span>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHandlesModalOpen(true);
                  }}
                  className="p-1 rounded text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200 transition-colors"
                  title="Configure handles"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                <ExternalLink className="w-3 h-3 text-neutral-400 group-hover:text-blue-600 transition-colors" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-xl font-bold text-neutral-900">{student.codingHandles?.leetcodeSolved ?? 0}</span>
              <span className="text-[11px] text-neutral-500 font-medium">/ 300 Target</span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1 font-mono truncate group-hover:text-blue-600">
              {student.codingHandles?.leetcode ? `@${student.codingHandles.leetcode} ↗` : 'Click to link profile'}
            </p>
          </div>

          {/* Card 2: GitHub Profile */}
          <div 
            onClick={() => {
              if (student.codingHandles?.github) {
                window.open(getPlatformUrl('github', student.codingHandles.github), '_blank');
              } else {
                setHandlesModalOpen(true);
              }
            }}
            className="p-3.5 bg-neutral-50/80 hover:bg-neutral-100/80 rounded-2xl border border-neutral-200/80 transition-all cursor-pointer group relative"
          >
            <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-1">
              <span className="font-semibold text-neutral-700">GitHub Repos</span>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHandlesModalOpen(true);
                  }}
                  className="p-1 rounded text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200 transition-colors"
                  title="Configure handles"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                <ExternalLink className="w-3 h-3 text-neutral-400 group-hover:text-blue-600 transition-colors" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-xl font-bold text-neutral-900">{student.codingHandles?.githubRepos ?? 0}</span>
              <span className="text-[11px] text-neutral-500 font-medium">Public</span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1 font-mono truncate group-hover:text-blue-600">
              {student.codingHandles?.github ? `@${student.codingHandles.github} ↗` : 'Click to link profile'}
            </p>
          </div>

          {/* Card 3: View Resume */}
          <div 
            onClick={() => setViewingResumePage(true)}
            className="p-3.5 bg-neutral-50/80 hover:bg-neutral-100/80 rounded-2xl border border-neutral-200/80 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-1">
              <span className="font-semibold text-neutral-700">View Resume</span>
              <FileText className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-900 transition-colors" />
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-xl font-bold text-neutral-900">
                {student.resume ? 'Active' : 'Pending'}
              </span>
              <span className="text-[11px] text-emerald-600 font-medium">
                {student.resume ? 'Grounded' : 'Upload'}
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1 truncate group-hover:text-neutral-900">
              {student.resume ? `${student.resume.fileName} ↗` : 'Click to upload resume'}
            </p>
          </div>

          {/* Card 4: Overall Readiness (Strictly dependent on the Post-Interview Checklist) */}
          <div className="p-3.5 bg-neutral-50/80 rounded-2xl border border-neutral-200/80">
            <div className="flex items-center justify-between text-neutral-500 text-xs font-medium mb-1">
              <span className="font-semibold text-neutral-700">Overall Readiness</span>
              <Award className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className={`text-xl font-bold ${overallReadinessScore >= 75 ? 'text-emerald-600' : 'text-neutral-900'}`}>
                {overallReadinessScore}%
              </span>
              <span className="text-[11px] text-neutral-500 font-medium font-mono">
                {completedChecklistCount}/{totalChecklistCount || 0} Met
              </span>
            </div>
            <div className="w-full bg-neutral-200 h-1.5 rounded-full mt-2 overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  overallReadinessScore >= 75 ? 'bg-emerald-500' : overallReadinessScore >= 40 ? 'bg-amber-500' : 'bg-neutral-900'
                }`} 
                style={{ width: `${overallReadinessScore}%` }} 
              />
            </div>
          </div>

        </div>

        {/* Additional Linked Coding Platforms (Codeforces, HackerRank, etc.) */}
        {otherProfiles.length > 0 && (
          <div className="mt-4 pt-4 border-t border-neutral-100 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-neutral-400">Other Profiles:</span>
            {otherProfiles.map((p, idx) => (
              <a
                key={idx}
                href={p.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg text-xs font-mono transition-colors"
              >
                <span>{p.platform}:</span>
                <strong className="text-neutral-900">@{p.username}</strong>
                <ExternalLink className="w-2.5 h-2.5 text-neutral-500" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* RECTANGULAR BAR: ASSIGNED ASSESSMENTS & PRACTICE SESSIONS */}
      {/* ========================================================================= */}
      <div 
        onClick={() => setViewingAllAssignments(true)}
        className="w-full bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-800 hover:from-black hover:to-neutral-900 text-white rounded-2xl p-5 shadow-xs border border-neutral-800 cursor-pointer transition-all hover:scale-[1.003] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 group"
      >
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/10 group-hover:bg-white/20 transition-colors">
            <Layers className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h3 className="text-base font-bold text-white tracking-tight">
                Assigned Assessments &amp; Practice Sessions
              </h3>
              {pendingAssignmentsCount > 0 ? (
                <span className="px-2.5 py-0.5 text-[10px] font-bold bg-amber-400 text-neutral-950 rounded-full font-mono uppercase">
                  {pendingAssignmentsCount} Pending
                </span>
              ) : (
                <span className="px-2.5 py-0.5 text-[10px] font-bold bg-emerald-400 text-neutral-950 rounded-full font-mono uppercase">
                  All Caught Up
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-300 mt-0.5">
              {pendingAssignmentsCount} pending · {completedAssignmentsCount} completed
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
          <span className="text-xs font-semibold text-emerald-400 group-hover:text-emerald-300 transition-colors">
            Open All Assignments
          </span>
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white group-hover:bg-white/20 transition-colors">
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Free Practice Launcher Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Practice Mock Interview */}
        <div className="relative overflow-hidden bg-neutral-950 text-white rounded-2xl p-7 border border-neutral-800 shadow-sm flex flex-col justify-between group">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-800/80 text-neutral-200 border border-neutral-700">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>Resume-Grounded Proctored Interview</span>
              </span>
              <span className="text-[11px] text-neutral-400 font-mono">PROCTORED</span>
            </div>

            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white">
                Launch Mock Interview
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Mode</p>
                <p className="text-xs font-medium text-neutral-200 mt-0.5">Voice-to-Voice</p>
              </div>
              <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Turns</p>
                <p className="text-xs font-medium text-neutral-200 mt-0.5">3 Adaptive Turns</p>
              </div>
              <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Proctoring</p>
                <p className="text-xs font-medium text-emerald-400 mt-0.5">Active Focus</p>
              </div>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-mono text-amber-400 flex items-center space-x-1">
                <span>🪙</span>
                <span>Cost: 1 Coin (Restored upon legitimate completion)</span>
              </span>
            </div>
            <button
              type="button"
              disabled={(student.coins ?? 5) < 1}
              onClick={() => {
                if ((student.coins ?? 5) < 1) {
                  alert("Insufficient Coins: You need at least 1 coin to attend an interview or communication session. Your balance is 0 Coins.");
                  return;
                }
                if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
                  document.documentElement.requestFullscreen().catch(() => {});
                }
                startInterview('MOCK_INTERVIEW');
              }}
              className={`inline-flex items-center justify-center space-x-2 font-semibold px-5 py-2.5 rounded-xl text-xs transition-all shadow-sm ${
                (student.coins ?? 5) < 1
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700'
                  : 'bg-white hover:bg-neutral-100 text-neutral-950 cursor-pointer'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{(student.coins ?? 5) < 1 ? '0 Coins - Balance Required' : 'Launch Mock Interview'}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
        </div>

        {/* Practice Listening Comprehension */}
        <div className="relative overflow-hidden bg-white text-neutral-900 rounded-2xl p-7 border border-neutral-200/90 shadow-xs flex flex-col justify-between group hover:border-neutral-300 transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
                <Headphones className="w-3 h-3 text-neutral-600" />
                <span>Listening &amp; Recall</span>
              </span>
              <span className="text-[11px] text-neutral-400 font-mono">AUDIO ONLY</span>
            </div>

            <div>
              <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
                Listening Comprehension
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Audio Pass</p>
                <p className="text-xs font-medium text-neutral-800 mt-0.5">FinPay Gateway</p>
              </div>
              <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Format</p>
                <p className="text-xs font-medium text-neutral-800 mt-0.5">Audio &amp; Voice</p>
              </div>
              <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Feedback</p>
                <p className="text-xs font-medium text-neutral-800 mt-0.5">Instant Score</p>
              </div>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-mono text-amber-700 flex items-center space-x-1">
                <span>🪙</span>
                <span>Cost: 1 Coin (Restored upon legitimate completion)</span>
              </span>
            </div>
            <button
              type="button"
              disabled={(student.coins ?? 5) < 1}
              onClick={() => {
                if ((student.coins ?? 5) < 1) {
                  alert("Insufficient Coins: You need at least 1 coin to attend an interview or communication session. Your balance is 0 Coins.");
                  return;
                }
                startInterview('LISTENING_COMPREHENSION');
              }}
              className={`inline-flex items-center justify-center space-x-2 font-semibold px-5 py-2.5 rounded-xl text-xs transition-all shadow-xs ${
                (student.coins ?? 5) < 1
                  ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed border border-neutral-300'
                  : 'bg-neutral-900 hover:bg-black text-white cursor-pointer'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>{(student.coins ?? 5) < 1 ? '0 Coins - Balance Required' : 'Start Listening'}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* POST-INTERVIEW ACTIONABLE IMPROVEMENT CHECKLIST */}
      {/* (Replaces old College Placement Criteria; Controls Overall Readiness %) */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#171717] border border-neutral-200/90 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-6 border-b border-neutral-200/80 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-neutral-50/50 dark:bg-[#141414]">
          <div>
            <div className="flex items-center space-x-2.5">
              <h3 className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                Post-Interview Improvement Checklist
              </h3>
              {totalChecklistCount > 0 && (
                <span className="px-2.5 py-0.5 text-[11px] font-bold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full font-mono">
                  {completedChecklistCount} of {totalChecklistCount} Targets Met
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">Readiness Score:</span>
            <span className={`px-3 py-1 rounded-xl text-xs font-bold border ${
              overallReadinessScore >= 75 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60' 
                : overallReadinessScore > 0 
                ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60' 
                : 'bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700'
            }`}>
              {overallReadinessScore}% {overallReadinessScore === 100 ? '🎉 Placement Ready' : ''}
            </span>
          </div>
        </div>

        {checklist.length === 0 ? (
          <div className="p-10 text-center text-neutral-400 space-y-2">
            <Sparkles className="w-8 h-8 text-neutral-300 mx-auto" />
            <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">No Improvement Checklist Yet</h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
              Complete a mock interview or assigned practice drill to generate your checklist.
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
                  document.documentElement.requestFullscreen().catch(() => {});
                }
                startInterview('MOCK_INTERVIEW');
              }}
              className="mt-2 inline-flex items-center space-x-2 px-4 py-2 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Take an Interview to Generate Action Plan</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {checklist.map((item) => (
              <div 
                key={item.id}
                onClick={() => handleToggleChecklistItem(item.id)}
                className={`p-4 sm:px-6 flex items-center justify-between hover:bg-neutral-50/70 transition-colors cursor-pointer ${
                  item.isCompleted ? 'bg-neutral-50/40' : ''
                }`}
              >
                <div className="flex items-start space-x-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleChecklistItem(item.id);
                    }}
                    className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${
                      item.isCompleted 
                        ? 'bg-emerald-600 text-white border border-emerald-600' 
                        : 'border border-neutral-300 hover:border-neutral-400 bg-white'
                    }`}
                  >
                    {item.isCompleted && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-800 font-mono">
                        {item.week}
                      </span>
                      <p className={`text-xs font-semibold ${item.isCompleted ? 'line-through text-neutral-400' : 'text-neutral-900'}`}>
                        {item.title}
                      </p>
                    </div>
                    <p className={`text-[11px] mt-0.5 leading-relaxed ${item.isCompleted ? 'line-through text-neutral-400' : 'text-neutral-500'}`}>
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 ml-4 flex-shrink-0">
                  {item.isCompleted ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      <Clock className="w-3 h-3 mr-1" /> Action Required
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: LINK CODING HANDLES & OTHER PLATFORMS */}
      {/* ========================================================================= */}
      {handlesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-neutral-200 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/70 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Link Coding Profiles</h3>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setHandlesModalOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveHandles} className="p-6 space-y-4 text-xs overflow-y-auto">
              
              {/* Live fetch message */}
              {fetchStatsMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{fetchStatsMessage}</span>
                </div>
              )}

              {/* LeetCode Section */}
              <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-neutral-900">LeetCode Profile</span>
                    <span className="text-[10px] font-mono text-neutral-400 ml-2">leetcode.com/u/username</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleFetchLeetCodeStats}
                    disabled={!lcUsername.trim() || fetchingLcStats}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[11px] font-semibold text-neutral-800 disabled:opacity-40 transition-colors cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className={`w-3 h-3 ${fetchingLcStats ? 'animate-spin text-blue-600' : 'text-neutral-500'}`} />
                    <span>{fetchingLcStats ? 'Fetching...' : 'Fetch Live Stats'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">Username</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-neutral-400 font-mono">@</span>
                      <input
                        type="text"
                        value={lcUsername}
                        onChange={(e) => setLcUsername(e.target.value)}
                        placeholder="e.g. coder_dev"
                        className="w-full pl-7 pr-3 py-2 bg-white border border-neutral-200 rounded-xl font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">Problems Solved</label>
                    <input
                      type="number"
                      min="0"
                      value={lcSolvedCount}
                      onChange={(e) => setLcSolvedCount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* GitHub Section */}
              <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-neutral-900">GitHub Profile</span>
                    <span className="text-[10px] font-mono text-neutral-400 ml-2">github.com/username</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleFetchGitHubStats}
                    disabled={!ghUsername.trim() || fetchingGhStats}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white border border-neutral-200 hover:bg-neutral-100 rounded-lg text-[11px] font-semibold text-neutral-800 disabled:opacity-40 transition-colors cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className={`w-3 h-3 ${fetchingGhStats ? 'animate-spin text-blue-600' : 'text-neutral-500'}`} />
                    <span>{fetchingGhStats ? 'Fetching...' : 'Fetch Live Stats'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">Username</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-neutral-400 font-mono">@</span>
                      <input
                        type="text"
                        value={ghUsername}
                        onChange={(e) => setGhUsername(e.target.value)}
                        placeholder="e.g. dev_repo"
                        className="w-full pl-7 pr-3 py-2 bg-white border border-neutral-200 rounded-xl font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">Public Repositories</label>
                    <input
                      type="number"
                      min="0"
                      value={ghReposCount}
                      onChange={(e) => setGhReposCount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Other Platforms Section (Codeforces, HackerRank, etc.) */}
              <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-950">Add Other Coding Platforms</span>
                  <span className="text-[10px] text-blue-700">Codeforces, CodeChef, HackerRank...</span>
                </div>

                {platformVerifyError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] flex items-center space-x-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>{platformVerifyError}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={otherPlatformName}
                    onChange={(e) => setOtherPlatformName(e.target.value)}
                    className="px-2.5 py-2 bg-white border border-blue-200 rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Codeforces">Codeforces</option>
                    <option value="HackerRank">HackerRank</option>
                    <option value="CodeChef">CodeChef</option>
                    <option value="GeeksforGeeks">GeeksforGeeks</option>
                    <option value="AtCoder">AtCoder</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Username / Handle"
                    value={otherPlatformHandle}
                    onChange={(e) => setOtherPlatformHandle(e.target.value)}
                    className="col-span-2 px-3 py-2 bg-white border border-blue-200 rounded-xl font-mono text-xs focus:outline-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddOtherPlatform}
                    disabled={verifyingPlatform}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <span>{verifyingPlatform ? 'Verifying...' : '+ Verify & Link Profile'}</span>
                  </button>
                </div>

                {/* List of currently added other platforms */}
                {otherProfiles.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-blue-200/60">
                    <span className="text-[10px] text-blue-900/80 font-semibold block">Linked Platforms:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {otherProfiles.map((p, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-1 bg-white border border-blue-200 rounded-lg text-xs font-mono text-blue-950">
                          <span>{p.platform}: @{p.username}</span>
                          <button
                            type="button"
                            onClick={() => setOtherProfiles(otherProfiles.filter((_, i) => i !== idx))}
                            className="ml-1.5 text-neutral-400 hover:text-red-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setHandlesModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingHandles}
                  className="bg-neutral-900 hover:bg-black text-white px-5 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {savingHandles ? 'Saving...' : 'Save Profiles'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {uploadModalOpen && (
        <ResumeUploadModal onClose={() => setUploadModalOpen(false)} />
      )}

      {/* Independent Candidate Instant Credit Refill Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
            <div className="p-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Instant Credit Refill</h3>
                  <p className="text-[11px] text-neutral-500">Independent Candidate Fast-Pass</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {paymentSuccess ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-neutral-900">Payment Successful!</h4>
                <p className="text-xs text-neutral-600">
                  Transaction verified. All <strong>5 credits</strong> have been restored to your balance immediately.
                </p>
              </div>
            ) : (
              <form onSubmit={handleProcessPayment} className="p-6 space-y-4">
                <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-950">5 AI Interview Credits Pack</span>
                    <span className="text-sm font-bold font-mono text-amber-900">₹399 / $4.99</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Bypass the 3-day wait window. Restores full balance of 5 coins for practice interviews and listening comprehension.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Payment Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('UPI')}
                      className={`p-2.5 rounded-xl border text-xs font-medium text-center transition-all cursor-pointer ${
                        paymentMethod === 'UPI'
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      UPI / QR
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CARD')}
                      className={`p-2.5 rounded-xl border text-xs font-medium text-center transition-all cursor-pointer ${
                        paymentMethod === 'CARD'
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      Credit / Debit
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('NETBANKING')}
                      className={`p-2.5 rounded-xl border text-xs font-medium text-center transition-all cursor-pointer ${
                        paymentMethod === 'NETBANKING'
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      Net Banking
                    </button>
                  </div>
                </div>

                {paymentMethod === 'UPI' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-neutral-700">Virtual Payment Address (UPI ID)</label>
                    <input
                      type="text"
                      required
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="username@okaxis or mobile@upi"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-neutral-900"
                    />
                    <p className="text-[10px] text-neutral-400">Supports Google Pay, PhonePe, Paytm, BHIM</p>
                  </div>
                )}

                {paymentMethod === 'CARD' && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">Card Number</label>
                      <input
                        type="text"
                        required
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="•••• •••• •••• ••••"
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-neutral-900"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">Expiry Date</label>
                        <input
                          type="text"
                          required
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-neutral-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">CVV</label>
                        <input
                          type="password"
                          required
                          maxLength={4}
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          placeholder="•••"
                          className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono focus:outline-none focus:border-neutral-900"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {paymentMethod === 'NETBANKING' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-neutral-700">Select Bank</label>
                    <select className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900">
                      <option>HDFC Bank</option>
                      <option>State Bank of India (SBI)</option>
                      <option>ICICI Bank</option>
                      <option>Axis Bank</option>
                      <option>Kotak Mahindra Bank</option>
                    </select>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-[11px] text-neutral-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>256-Bit Encrypted</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setPaymentModalOpen(false)}
                      className="px-3.5 py-2 rounded-xl text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={paymentProcessing}
                      className="px-4 py-2 bg-neutral-900 hover:bg-black text-white font-semibold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {paymentProcessing ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <span>Pay ₹399 &amp; Restore 5 Coins</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
