import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth.routes';
import { studentRouter } from './student.routes';
import { interviewRouter, liveInterviewRouter } from './interview.routes';
import { portalRouter } from './portal.routes';
import { orgRouter } from './org.routes';
import { ownerRouter } from './owner.routes';
import { mentorRouter } from './mentor.routes';
import { trainerRouter } from './trainer.routes';
import { adminRouter } from './admin.routes';
import { skillsRouter } from './skills.routes';
import { performanceRouter } from './performance.routes';
import { listeningRouter } from './listening.routes';
import { learningRouter } from './learning.routes';
import { authenticate } from '../middleware/authenticate';
import { coinsRouter } from './coins.routes';

// Module 2 — assessments, attempts, sessions, responses, reports, question bank
import { assessmentsRouter } from '../modules/assessments/assessments.routes';
import { attemptsRouter } from '../modules/attempts/attempts.routes';
import { sessionsRouter } from '../modules/sessions/sessions.routes';
import { responsesRouter } from '../modules/responses/responses.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { questionBankRouter } from '../modules/question-bank/question-bank.routes';
// Module 4 — credits, checklist, verifications, placement eligibility
import { creditsRouter } from '../modules/credits/credits.routes';
import { creditPoliciesRouter } from '../modules/credits/credit-policies.routes';
import { checklistRouter } from '../modules/checklist/checklist.routes';
import { verificationsRouter } from '../modules/verifications/verifications.routes';
import { placementRouter } from '../modules/placement/placement.routes';

export const router = Router();

// Public
router.use('/health', healthRouter);
router.use('/auth', authRouter);

// Org lookup endpoints are read-only and needed before login (e.g. batch list on registration form).
router.use('/org', orgRouter);

// Platform Owner routes — protected, requires PLATFORM_OWNER role
router.use('/owner', authenticate, ownerRouter);

// Protected — authenticate on every request; individual routes add authorize() as needed
router.use('/students', authenticate, studentRouter);
router.use('/interview', authenticate, liveInterviewRouter);
router.use('/portals', authenticate, portalRouter);
router.use('/mentors', authenticate, mentorRouter);
router.use('/trainers', authenticate, trainerRouter);
router.use('/admin', authenticate, adminRouter);
router.use('/coins', authenticate, coinsRouter);

// Module 2 (each router authenticates its own routes)
router.use('/assessments', assessmentsRouter);
router.use('/attempts', attemptsRouter);
router.use('/sessions', sessionsRouter);
router.use('/sessions', authenticate, interviewRouter);
router.use('/responses', responsesRouter);
router.use('/reports', reportsRouter);
router.use('/question-bank', questionBankRouter);

// Module 3 — Skills, Performance, Listening, Learning & Agent
router.use('/skills', authenticate, skillsRouter);
router.use('/performance', authenticate, performanceRouter);
router.use('/listening', authenticate, listeningRouter);
router.use('/learning', authenticate, learningRouter);

// Module 4 (each router authenticates its own routes)
router.use('/credits', creditsRouter);
router.use('/credit-policies', creditPoliciesRouter);
router.use('/checklist', checklistRouter);
router.use('/verifications', verificationsRouter);
router.use('/placement-eligibility', placementRouter);
