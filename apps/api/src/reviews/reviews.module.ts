import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { PublicReviewController } from './public-review.controller';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import {
  NoopReviewInviteSender,
  REVIEW_INVITE_SENDER,
  ReviewInviteSender,
} from './review-invite-sender';

/**
 * Reviews & reputation (Phase 3). Owner review requests + reputation summary, and the public tokenised
 * submit. Reuses WorkItemModule (job exists) + ContactsModule (customer exists); PrismaService (BYPASSRLS
 * token resolve) + TenantService come from the global TenantModule. Invite delivery is a vendor boundary.
 */
@Module({
  imports: [WorkItemModule, ContactsModule],
  controllers: [ReviewController, PublicReviewController],
  providers: [
    ReviewService,
    {
      provide: REVIEW_INVITE_SENDER,
      useFactory: (): ReviewInviteSender => new NoopReviewInviteSender(),
    },
  ],
})
export class ReviewsModule {}
