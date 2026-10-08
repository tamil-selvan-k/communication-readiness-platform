export type UserRole = 
  | 'PLATFORM_OWNER'
  | 'SUPER_ADMIN'
  | 'DEPARTMENT_ADMIN'
  | 'COUNSELLOR'
  | 'PROGRAM_ADMIN'
  | 'FACULTY_MENTOR'
  | 'PLACEMENT_COORDINATOR'
  | 'STUDENT';

export type StudentTrack = string;

export type AdminPermission = 
  | 'CAN_VIEW_STUDENT_PROGRESS'
  | 'CAN_ASSIGN_INTERVIEWS'
  | 'CAN_ASSIGN_LISTENING'
  | 'CAN_MANAGE_STUDENTS';

export interface College {
  id: string;
  name: string;
  code: string;
  campusCity: string;
  createdAt: string;
  superAdminEmail?: string;
  superAdminName?: string;
  superAdminStatus?: 'PENDING_INVITE' | 'ACTIVE';
}

export interface DynamicProgram {
  id: string;
  collegeId: string;
  name: string;
  code: string;
  hasSubPrograms?: boolean;
  subPrograms?: string[];
  description?: string;
  assignedAdminEmail?: string;
  assignedAdminName?: string;
  adminPermissions: AdminPermission[];
  createdAt: string;
  // Program Schedule & Time
  startDate?: string;
  endDate?: string;
  durationWeeks?: number;
  dailyStartTime?: string;
  dailyEndTime?: string;
  scheduleType?: 'FLEXIBLE' | 'SCHEDULED_HOURS';
  // Program Rules & Governance
  minAttendancePercent?: number;
  minPassScore?: number;
  strictProctoring?: boolean;
  targetDepartment?: string;
  customRules?: string[];
}

export interface DynamicDepartment {
  id: string;
  collegeId: string;
  name: string;
  code: string;
  assignedAdminEmail?: string;
  assignedAdminName?: string;
  adminPermissions: AdminPermission[];
}

export interface PendingInvite {
  token: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name: string;
  role: UserRole;
  collegeId?: string;
  collegeName?: string;
  programId?: string;
  department?: string;
  permissions?: AdminPermission[];
  createdAt: string;
  expiresAt?: string;
  status: 'PENDING' | 'ACCEPTED';
}

export type Difficulty = 'EASY' | 'MEDIUM' | 'ADVANCED';

export interface CodingHandles {
  github?: string;
  leetcode?: string;
  hackerrank?: string;
  codeforces?: string;
  codechef?: string;
  leetcodeSolved?: number;
  githubRepos?: number;
  otherProfiles?: { platform: string; username: string; profileUrl: string; solvedOrRating?: string }[];
}

export interface ParsedResume {
  fileName: string;
  parsedAt: string;
  summary: string;
  skills: {
    languages: string[];
    frameworks: string[];
    databases: string[];
    tools: string[];
  };
  projects: {
    title: string;
    techStack: string[];
    description: string;
  }[];
  experience?: {
    title: string;
    company: string;
    duration: string;
    description: string;
  }[];
  education?: {
    degree: string;
    institution: string;
    year: string;
  }[];
  certifications?: string[];
  phone?: string;
  email?: string;
  links?: {
    github?: string | null;
    linkedin?: string | null;
    portfolio?: string | null;
  };
}

export interface CriteriaTask {
  id: string;
  title: string;
  description: string;
  targetTrack: string;
  isCompleted: boolean;
  verifiedByMentor: boolean;
  verifiedAt?: string;
}

export interface QuestionTurn {
  id: string;
  questionNumber: number;
  questionText: string;
  difficulty: Difficulty;
  category?: string;
  studentAnswer?: string;
  technicalScore?: number;
  communicationScore?: number;
  wpm?: number;
  fillerWords?: number;
  feedback?: string;
  strengths?: string;
  weaknesses?: string;
  // Rubric points this answer missed (live interview)
  keyPointsMissed?: string[];
}

export interface DiagnosticReport {
  id: string;
  date: string;
  sessionType: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION';
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  averageWpm: number;
  totalFillerWords: number;
  fillerWordBreakdown: { [word: string]: number };
  skillBreakdown: {
    skill: string;
    score: number;
    status: 'STRONG' | 'MODERATE' | 'NEEDS_WORK';
    recommendation: string;
  }[];
  actionableNextSteps: string[];
  tabSwitches: number;
  isFlagged: boolean;
  isDisqualified?: boolean;
  disqualificationReason?: string;
  // Present on reports built by the live interview server
  coins?: number; // wallet after this session's completion reward
  fluencyScore?: number;
  clarityScore?: number;
  paceLabel?: string | null;
  longPauses?: number;
  averageResponseLatencySec?: number | null;
  questionsAnswered?: number;
  questionsPlanned?: number;
  scoringMethod?: string[];
  turns?: {
    turn: number;
    question: string;
    difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
    technicalScore: number;
    communicationScore: number;
    overallScore: number;
    wpm: number | null;
    fillerCount: number;
    pauseCount: number | null;
    feedback: string;
    pointsCovered: string[];
    pointsMissed: string[];
  }[];
}

export interface ImprovementChecklistItem {
  id: string;
  week: string; // e.g. 'Week 1', 'Week 2', 'Week 3', 'Week 4'
  title: string;
  description: string;
  category?: 'COMMUNICATION' | 'TECHNICAL' | 'SYSTEM_DESIGN' | 'CODING';
  isCompleted: boolean;
  completedAt?: string;
}

export interface StudentProfile {
  id: string;
  name: string;
  rollNumber: string;
  email: string;
  collegeId?: string;
  collegeName?: string;
  department: string;
  batchYear: number;
  className?: string;
  track: StudentTrack;
  programId?: string;
  programName?: string;
  subProgramName?: string;
  isIndependent?: boolean;
  specialization?: string;
  mentorName: string;
  mentorEmail: string;
  codingHandles: CodingHandles;
  resume: ParsedResume | null;
  criteriaTasks: CriteriaTask[];
  improvementChecklist?: ImprovementChecklistItem[];
  recentReports: DiagnosticReport[];
  overallReadiness?: number;
  score?: number;
  domain?: string;
  status?: string;
  checklist?: string;
  coins?: number;
  zeroCoinsAt?: string;
}

export interface TrainerTenure {
  id: string;
  userId?: string;
  trainerName: string;
  trainerEmail: string;
  companyOrInstitute: string;
  domain: string;
  programId?: string;
  isCommonTrainer?: boolean;
  associatedProgramNames?: string[];
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface AssignmentSubmission {
  studentId: string;
  studentName: string;
  studentRollNumber: string;
  score: number;
  submittedAt: string;
  sessionType: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION' | 'BOTH';
  status?: 'COMPLETED' | 'FLAGGED' | 'DISQUALIFIED';
  technicalScore?: number;
  communicationScore?: number;
  fluencyScore?: number;
  department?: string;
  recommendation?: 'PLACEMENT_READY' | 'ON_TRACK' | 'NEEDS_PRACTICE' | 'AT_RISK' | 'DISQUALIFIED';
  isDisqualified?: boolean;
  disqualificationReason?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'ASSIGNMENT_CREATED' | 'SESSION_COMPLETED' | 'SYSTEM_ALERT';
  assignmentId?: string;
  reportId?: string;
  createdAt: string;
  read: boolean;
}

export interface DepartmentClass {
  id: string;
  name: string; // e.g. "2nd Year IT - Section A"
  department: string;
  batchYear: number;
  semester?: string;
  facultyInCharge?: string;
  enrolledStudentCount: number;
  studentIds?: string[];
  createdAt: string;
}

export interface DepartmentStaffMember {
  id: string;
  name: string;
  email: string;
  designation: string; // e.g. "Assistant Professor", "Associate Professor", "Professor"
  staffId?: string; // e.g. "IT-FAC-012"
  department: string;
  collegeId?: string;
  status: 'ACTIVE' | 'PENDING_ACTIVATION';
  activationToken: string;
  assignedClasses?: string[];
  createdAt: string;
}

export interface InterviewAssignment {
  id: string;
  title: string;
  sessionType: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION' | 'BOTH';
  assignedByRole: 'SUPER_ADMIN' | 'PLACEMENT_COORDINATOR' | 'PROGRAM_ADMIN' | 'FACULTY_MENTOR' | 'DEPARTMENT_ADMIN' | 'COUNSELLOR';
  assignedByName: string;
  assignedByEmail?: string;
  assignedById?: string;
  collegeId?: string;

  // Targeting scope
  targetScope: 'ALL_STUDENTS' | 'PROGRAM' | 'DEPARTMENT' | 'MY_MENTEES' | 'SPECIFIC_STUDENT' | 'CLASS';
  targetDomainOrTrack?: string;
  targetProgramName?: string;
  targetProgramNames?: string[];
  targetSubProgram?: string;
  targetDepartment?: string;
  targetDepartments?: string[];
  targetClassName?: string;
  targetClassNames?: string[];
  targetStudentId?: string;
  targetStudentName?: string;

  // Configuration
  interviewMode?: 'TOPIC' | 'RESUME_BASED';
  domainOrTopic?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'ADVANCED' | 'FAANG';
  listeningPassageId?: string;
  customInstructions?: string;

  // Schedule & Timer Window
  dueDate: string;
  startTime?: string;
  endTime?: string;
  hasTimeWindow?: boolean;
  isMandatory: boolean;
  createdAt: string;

  submissions?: AssignmentSubmission[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  collegeId?: string;
  collegeName?: string;
  rollNumber?: string;
  department?: string;
  batchYear?: number;
  className?: string;
  assignedClassName?: string;
  assignedClasses?: string[];
  programId?: string;
  programName?: string;
  subProgramName?: string;
  track?: StudentTrack;
  studentId?: string;
  isIndependent?: boolean;
  permissions?: AdminPermission[];
}


