import { IsIn } from 'class-validator';

/** PUBLIC: the customer approves or declines a quote from their portal. */
export class QuoteDecisionDto {
  @IsIn(['accept', 'decline'])
  decision!: 'accept' | 'decline';
}
