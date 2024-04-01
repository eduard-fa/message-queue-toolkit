import type { Either } from '@lokalise/node-core'
import type {
  BarrierResult,
  MessageInvalidFormatError,
  MessageValidationError,
  QueuePublisherOptions,
  SyncPublisher,
} from '@message-queue-toolkit/core'
import { MessageSchemaContainer, objectToBuffer } from '@message-queue-toolkit/core'
import type { ZodSchema } from 'zod'

import type { AMQPLocator, AMQPCreationConfig, AMQPDependencies } from './AbstractAmqpService'
import { AbstractAmqpService } from './AbstractAmqpService'

export type AMQPPublisherOptions<MessagePayloadType extends object> = QueuePublisherOptions<
  AMQPCreationConfig,
  AMQPLocator,
  MessagePayloadType
>

export abstract class AbstractAmqpPublisher<MessagePayloadType extends object>
  extends AbstractAmqpService<MessagePayloadType>
  implements SyncPublisher<MessagePayloadType>
{
  private readonly messageSchemaContainer: MessageSchemaContainer<MessagePayloadType>

  constructor(dependencies: AMQPDependencies, options: AMQPPublisherOptions<MessagePayloadType>) {
    super(dependencies, options)

    const messageSchemas = options.messageSchemas
    this.messageSchemaContainer = new MessageSchemaContainer<MessagePayloadType>({
      messageSchemas,
      messageTypeField: options.messageTypeField,
    })
  }

  publish(message: MessagePayloadType): void {
    const resolveSchemaResult = this.resolveSchema(message)
    if (resolveSchemaResult.error) {
      throw resolveSchemaResult.error
    }
    resolveSchemaResult.result.parse(message)

    if (this.logMessages) {
      // @ts-ignore
      const resolvedLogMessage = this.resolveMessageLog(message, message[this.messageTypeField])
      this.logMessage(resolvedLogMessage)
    }

    try {
      this.channel.sendToQueue(this.queueName, objectToBuffer(message))
    } catch (err) {
      // Unfortunately, reliable retry mechanism can't be implemented with try-catch block,
      // as not all failures end up here. If connection is closed programmatically, it works fine,
      // but if server closes connection unexpectedly (e. g. RabbitMQ is shut down), then we don't land here
      // @ts-ignore
      if (err.message === 'Channel closed') {
        this.logger.error(`AMQP channel closed`)
        void this.reconnect()
      } else {
        throw err
      }
    }
  }

  protected override resolveSchema(
    message: MessagePayloadType,
  ): Either<Error, ZodSchema<MessagePayloadType>> {
    return this.messageSchemaContainer.resolveSchema(message)
  }

  /* c8 ignore start */
  protected resolveMessage(): Either<MessageInvalidFormatError | MessageValidationError, unknown> {
    throw new Error('Not implemented for publisher')
  }

  /* c8 ignore start */
  protected override processPrehandlers(): Promise<unknown> {
    throw new Error('Not implemented for publisher')
  }

  protected override preHandlerBarrier<BarrierOutput>(): Promise<BarrierResult<BarrierOutput>> {
    throw new Error('Not implemented for publisher')
  }

  protected override resolveNextFunction(): () => void {
    throw new Error('Not implemented for publisher')
  }

  override processMessage(): Promise<Either<'retryLater', 'success'>> {
    throw new Error('Not implemented for publisher')
  }
  /* c8 ignore stop */
}