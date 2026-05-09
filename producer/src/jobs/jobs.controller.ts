import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  Res,
  Body,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { JobsService } from './jobs.service';
import { ExtractorRegistryService } from '../extractors/extractor-registry.service';
import { KafkaService } from '../kafka/kafka.service';
import { streamToBuffer } from '../streaming/utils';

const BODY_LIMIT = 50 * 1024 * 1024;

interface JsonUnredactBody {
  key?: string;
  text?: string;
}

@Controller()
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly extractor: ExtractorRegistryService,
    private readonly kafka: KafkaService,
  ) {}

  @Get('health')
  health(): { status: string } {
    if (!this.kafka.isConnected()) {
      throw new ServiceUnavailableException({ status: 'degraded', kafka: 'disconnected' });
    }
    return { status: 'ok' };
  }

  @Post('redact')
  async redact(@Req() req: FastifyRequest): Promise<{ jobId: string }> {
    const keywords = req.headers['x-keywords'] as string | undefined;
    if (!keywords) throw new BadRequestException('X-Keywords header is required');
    const stream = req.body as NodeJS.ReadableStream;
    return this.jobs.redactStream(stream, keywords);
  }

  @Post('unredact')
  async unredact(
    @Req() req: FastifyRequest,
    @Body() body: JsonUnredactBody,
  ): Promise<{ jobId: string }> {
    const ct = (req.headers['content-type'] ?? '').split(';')[0].trim();
    if (ct === 'application/octet-stream') {
      const key = req.headers['x-key'] as string | undefined;
      if (!key) throw new BadRequestException('X-Key header is required');
      const stream = req.body as NodeJS.ReadableStream;
      const buf = await streamToBuffer(stream, Buffer.alloc(0), BODY_LIMIT);
      let text: string;
      try {
        text = await this.extractor.extractText(buf);
      } catch (err: unknown) {
        throw new BadRequestException(
          'Failed to parse document: ' + (err instanceof Error ? err.message : String(err)),
        );
      }
      return this.jobs.unredact(buf, key, text);
    }
    if (!body?.key || !body?.text) throw new BadRequestException('key and text are required');
    return this.jobs.unredact(null, body.key, body.text);
  }

  @Get('result/:jobId')
  async result(
    @Param('jobId') jobId: string,
    @Query('format') format: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!format) {
      reply.send(await this.jobs.getResult(jobId));
      return;
    }
    const { buf, mime, ext, type } = await this.jobs.download(jobId, format);
    reply.header('Content-Type', mime);
    reply.header('Content-Disposition', `attachment; filename="${type}-${jobId}.${ext}"`);
    reply.send(buf);
  }
}
