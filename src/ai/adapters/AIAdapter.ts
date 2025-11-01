import { Message } from "../../types/Message";
import { AIResponse, StreamingChunk, StreamingParams } from "../../types/Responses";

export interface AIAdapter {
  readonly modelId: string;
  readonly displayName: string;
  readonly supportsStreaming: boolean;

  sendMessage(messages: Message[], options?: Partial<StreamingParams>): Promise<AIResponse>;

  streamMessage(
    messages: Message[],
    options: Partial<StreamingParams>,
    onChunk: (chunk: StreamingChunk) => void,
  ): Promise<AIResponse>;
}
