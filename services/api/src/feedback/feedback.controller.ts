import { BadRequestException, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { ApiSuccessEnvelope, FeedbackSubmissionResponse } from '@icao/contracts';
import type { Multipart } from '@fastify/multipart';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { feedbackImageLimits, validateFeedbackImage, type FeedbackImage } from './feedback-image';
import { feedbackSubmissionSchema } from './feedback.schemas';
import { FeedbackService } from './feedback.service';

type MultipartRequest = AuthenticatedRequest & {
  headers: AuthenticatedRequest['headers'] & { 'user-agent'?: string };
  isMultipart(): boolean;
  parts(options?: object): AsyncIterableIterator<Multipart>;
};

@Controller('v1/feedback')
@UseGuards(RequireAuthGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  async submit(@Req() request: MultipartRequest): Promise<ApiSuccessEnvelope<FeedbackSubmissionResponse>> {
    if (!request.isMultipart()) throw new BadRequestException('feedback_multipart_required');
    let rawPayload: unknown;
    const images: FeedbackImage[] = [];

    try {
      for await (const part of request.parts({
        limits: {
          fieldSize: 16 * 1024,
          fields: 1,
          fileSize: feedbackImageLimits.fileSize,
          files: feedbackImageLimits.count,
          parts: feedbackImageLimits.count + 1,
        },
      })) {
        if (part.type === 'field') {
          if (part.fieldname !== 'payload' || typeof part.value !== 'string' || rawPayload !== undefined) {
            throw new BadRequestException('invalid_feedback_payload');
          }
          rawPayload = JSON.parse(part.value);
          continue;
        }
        if (part.fieldname !== 'images' || images.length >= feedbackImageLimits.count) {
          throw new BadRequestException('invalid_feedback_image_count');
        }
        const image = validateFeedbackImage(await part.toBuffer(), part.mimetype, part.filename);
        if (!image) throw new BadRequestException('invalid_feedback_image');
        images.push(image);
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'FST_REQ_FILE_TOO_LARGE') throw new BadRequestException('feedback_image_too_large');
      if (code === 'FST_FILES_LIMIT') throw new BadRequestException('invalid_feedback_image_count');
      throw new BadRequestException('invalid_feedback_multipart');
    }

    const parsed = feedbackSubmissionSchema.safeParse(rawPayload);
    if (!parsed.success) throw new BadRequestException('invalid_feedback_payload');
    return {
      requestId: request.id,
      data: await this.feedback.submit(
        request.user!.id,
        parsed.data,
        images,
        request.headers['user-agent'],
      ),
    };
  }
}

