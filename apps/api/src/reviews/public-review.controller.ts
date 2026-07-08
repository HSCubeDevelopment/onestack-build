import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PublicReviewPage, ReviewService } from './review.service';
import { SubmitReviewDto } from './dto/review.dto';

/**
 * PUBLIC review submission (Phase 3) — NO auth guard: the endpoint the tokenised review link opens.
 * Untrusted input, so the DTO length-caps every field and the tenant is resolved from the unguessable
 * token via the BYPASSRLS admin connection (never a client id) — the same pattern as public lead capture.
 */
@Controller('public/review')
export class PublicReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get(':token')
  page(@Param('token') token: string): Promise<PublicReviewPage> {
    return this.reviews.publicPage(token);
  }

  @Post(':token')
  submit(@Param('token') token: string, @Body() dto: SubmitReviewDto): Promise<{ thanks: true }> {
    return this.reviews.submit(token, dto);
  }
}
