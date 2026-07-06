import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { BoardCard, BoardService, BoardView } from './board.service';

class MoveCardDto {
  @IsString()
  @MinLength(1)
  targetState!: string;
}

/**
 * Job board API (card #22). A new view of Work Items grouped by workflow state; "drag to column" is a
 * guarded workflow transition under the hood. Type defaults to the automotive "job".
 */
@Controller('board')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BoardController {
  constructor(private readonly board: BoardService) {}

  @Get()
  get(@CurrentUser() user: AuthContext, @Query('type') type = 'job'): Promise<BoardView> {
    return this.board.getBoard(user.tenantId, type);
  }

  /** Drag a card to another column → move the job to that state (if a transition allows it). */
  @Post('cards/:id/move')
  move(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: MoveCardDto,
  ): Promise<BoardCard> {
    return this.board.moveToState(user.tenantId, id, dto.targetState);
  }
}
