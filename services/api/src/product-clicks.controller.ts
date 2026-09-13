import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { RequireAuthGuard } from './auth/require-auth.guard';
import type { AuthenticatedRequest } from './auth/auth.types';
import { DatabaseService } from './database/database.service';
import { productClickEvents } from './database/schema';
const eventSchema = z.object({ id: z.uuid(),
  event: z.enum(['bank_open', 'feature_open', 'audio_play', 'record', 'highlight', 'tag', 'dictionary', 'transcription', 'analysis', 'membership_open', 'purchase']),
  context: z.string().max(100).regex(/^[a-zA-Z0-9_/-]*$/),
}).strict();
const category = (event: string) => event === 'bank_open' ? '题库入口' : event === 'feature_open' ? '附加功能' :
  ['transcription', 'analysis'].includes(event) ? 'AI功能' : ['membership_open', 'purchase'].includes(event) ? '会员' : '学习工具';
@Controller('v1/product-clicks')
@UseGuards(RequireAuthGuard)
export class ProductClicksController {
  constructor(private readonly database: DatabaseService) {}
  @Post()
  async capture(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = z.array(eventSchema).min(1).max(30).safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_click_events');
    await this.database.db.insert(productClickEvents).values(parsed.data.map((event) => ({ ...event,
      accountId: request.user!.id, category: category(event.event) }))).onConflictDoNothing();
    return { requestId: request.id, data: { received: parsed.data.length } };
  }
}
