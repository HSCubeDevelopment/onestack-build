import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ReputationSummary } from './review';
import { InviteResult } from './review-invite-sender';
import { ReviewService, ReviewView } from './review.service';
import { PublishReviewDto, RequestReviewDto } from './dto/review.dto';

/**
 * Reviews & reputation — owner (Phase 3). Request a review for a job (tokenised link), list reviews,
 * read the reputation summary, and show/hide a review. Tenant-scoped. Emailing the invite is a vendor
 * boundary; external Google/Facebook reviews are deferred.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Post('work-items/:jobId/review-request')
  request(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: RequestReviewDto,
  ): Promise<{ review: ReviewView; invite: InviteResult }> {
    return this.reviews.request(user.tenantId, jobId, dto.contactId, user.userId);
  }

  @Get('reviews')
  list(@CurrentUser() user: AuthContext): Promise<ReviewView[]> {
    return this.reviews.list(user.tenantId);
  }

  @Get('reviews/summary')
  summary(@CurrentUser() user: AuthContext): Promise<ReputationSummary> {
    return this.reviews.summary(user.tenantId);
  }

  @Post('reviews/:id/publish')
  publish(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: PublishReviewDto,
  ): Promise<ReviewView> {
    return this.reviews.setPublished(user.tenantId, id, dto.published);
  }
}
