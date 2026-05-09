import { ConsumerDeserializer, IncomingEvent } from '@nestjs/microservices';

export class KafkaJobDeserializer implements ConsumerDeserializer {
  // NestJS Kafka passes the full KafkaJS message: { key, value: Buffer, headers, topic, partition }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deserialize(message: any): IncomingEvent {
    const rawValue = message?.value ?? message;
    let data: unknown;
    if (Buffer.isBuffer(rawValue)) {
      data = JSON.parse(rawValue.toString());
    } else if (typeof rawValue === 'string') {
      data = JSON.parse(rawValue);
    } else {
      data = rawValue;
    }
    return { pattern: 'incoming-orders', data };
  }
}
