import { eventBus } from '../../shared/events/eventBus';
import { Events, UserRegisteredPayload, AttemptCompletedPayload } from '../../shared/events/events';
import { CreditService } from './credits.service';
import { rewardCompletion } from '../../services/coinService';
import { EligibilityService } from '../placement/eligibility.service';

export function registerM4EventHandlers(): void {
  // USER_REGISTERED → create credit account with initial balance from global policy
  eventBus.on(Events.USER_REGISTERED, async (payload: UserRegisteredPayload) => {
    if (!payload.studentId) return;
    try {
      await CreditService.createAccount(payload.studentId);
    } catch (err) {
      console.error('[M4] USER_REGISTERED handler error:', (err as Error).message);
    }
  });

  // ATTEMPT_COMPLETED → earn credits + recalculate placement eligibility
  eventBus.on(Events.ATTEMPT_COMPLETED, async (payload: AttemptCompletedPayload) => {
    if (!payload.studentId) return;
    try {
      // Fair completion: the session's coin back plus a bonus, capped at the wallet size
      // (only for attempts that were charged when they started).
      await rewardCompletion(payload.studentId, payload.attemptId);
    } catch (err) {
      console.error('[M4] ATTEMPT_COMPLETED credit earn error:', (err as Error).message);
    }

    try {
      await EligibilityService.recalculate(payload.studentId);
    } catch (err) {
      console.error('[M4] ATTEMPT_COMPLETED eligibility recalculate error:', (err as Error).message);
    }
  });
}
