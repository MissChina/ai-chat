import { randomUUID } from "crypto";
import { describe, expect, test } from "vitest";
import { MockAdapter } from "../src/ai/adapters/MockAdapter";
import { SequentialSessionService } from "../src/chat/SequentialSessionService";
import { SequentialSession } from "../src/chat/types";
import { store } from "../src/storage/InMemoryStore";

async function waitForSessionState(
  service: SequentialSessionService,
  sessionId: string,
  states: SequentialSession["state"] | SequentialSession["state"][],
  timeoutMs = 5000,
): Promise<SequentialSession> {
  const expected = Array.isArray(states) ? states : [states];
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const session = service.getSession(sessionId);
    if (expected.includes(session.state)) {
      return session;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Session ${sessionId} did not reach state ${expected.join(",")} within ${timeoutMs}ms`);
}

describe("SequentialSessionService", () => {
  test("requires explicit advancement between speakers", async () => {
    const userId = randomUUID();
    store.reset();
    const room = store.createDefaultRoom(userId);
    const service = new SequentialSessionService();

    const session = service.startSession(room, userId, "如何规划一个教育科技产品？");
    const firstCycle = await waitForSessionState(service, session.id, "AI_FINISHED");
    expect(firstCycle.currentIndex).toBe(1);
    expect(firstCycle.messages.filter((msg) => msg.role === "assistant").length).toBe(1);

    // advance second speaker
    await service.next(session.id);
    const secondCycle = await waitForSessionState(service, session.id, "AI_FINISHED");
    expect(secondCycle.currentIndex).toBe(2);
    expect(secondCycle.messages.filter((msg) => msg.role === "assistant").length).toBe(2);

    // skip third speaker to finish faster
    const skipped = service.skip(session.id);
    expect(skipped.speakers[2]?.status).toBe("skipped");
    const completedSession = await waitForSessionState(service, session.id, "COMPLETED");
    expect(completedSession.state).toBe("COMPLETED");
    expect(completedSession.messages.filter((msg) => msg.role === "assistant").length).toBe(2);
  });

  test("supports supplemental follow-ups", async () => {
    const userId = randomUUID();
    store.reset();
    const room = store.createDefaultRoom(userId);
    const service = new SequentialSessionService();

    const session = service.startSession(room, userId, "介绍一个新的市场进入策略");
    const ready = await waitForSessionState(service, session.id, "AI_FINISHED");
    const firstSpeaker = ready.speakers[0];

    await service.supplement(session.id, firstSpeaker.aiMemberId, "请进一步解释执行步骤");
    const updated = await waitForSessionState(service, session.id, ["AI_FINISHED", "COMPLETED"]);

    const supplements = updated.messages.filter(
      (msg) => msg.role === "assistant" && msg.metadata?.supplemental,
    );
    expect(supplements.length).toBeGreaterThan(0);

    // resume flow and finish
    await service.next(session.id);
    await service.next(session.id);
    const completed = await waitForSessionState(service, session.id, "COMPLETED");
    expect(completed.state).toBe("COMPLETED");
  });

  test("recovers when supplemental call fails", async () => {
    const userId = randomUUID();
    store.reset();
    const room = store.createDefaultRoom(userId);
    const service = new SequentialSessionService();

    const session = service.startSession(room, userId, "阐述一个增长战略");
    const ready = await waitForSessionState(service, session.id, "AI_FINISHED");
    const firstSpeaker = ready.speakers[0];

    class FailingAdapter extends MockAdapter {
      constructor(modelId: string) {
        super(modelId);
      }
      async sendMessage(): Promise<never> {
        throw new Error("network failure");
      }
    }

    const failingAdapter = new FailingAdapter(firstSpeaker.modelId);

    (service as unknown as { adapters: Map<string, MockAdapter> }).adapters.set(
      firstSpeaker.modelId,
      failingAdapter,
    );

    await expect(
      service.supplement(session.id, firstSpeaker.aiMemberId, "请补充风险点"),
    ).rejects.toThrow("network failure");

    const afterFailure = service.getSession(session.id);
    expect(afterFailure.state).toBe("AI_FINISHED");
    expect(afterFailure.speakers[0]?.supplementCount).toBe(0);

    // restore adapter so subsequent flows remain valid if needed
    (service as unknown as { adapters: Map<string, MockAdapter> }).adapters.set(
      firstSpeaker.modelId,
      new MockAdapter(firstSpeaker.modelId),
    );
  });
});
