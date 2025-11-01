import { ChatRoom, SequentialSession } from "../chat/types";
import { Message } from "../types/Message";

function serializeDate(value: Date | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function serializeMessage(message: Message) {
  return {
    ...message,
    createdAt: serializeDate(message.createdAt),
  };
}

export function serializeChatRoom(room: ChatRoom) {
  return {
    ...room,
    createdAt: serializeDate(room.createdAt),
    updatedAt: serializeDate(room.updatedAt),
    aiMembers: room.aiMembers.map((member) => ({
      ...member,
    })),
  };
}

export function serializeSession(session: SequentialSession) {
  return {
    ...session,
    createdAt: serializeDate(session.createdAt),
    updatedAt: serializeDate(session.updatedAt),
    speakers: session.speakers.map((speaker) => ({
      ...speaker,
      startTime: serializeDate(speaker.startTime),
      endTime: serializeDate(speaker.endTime),
    })),
    messages: session.messages.map((message) => serializeMessage(message)),
  };
}
