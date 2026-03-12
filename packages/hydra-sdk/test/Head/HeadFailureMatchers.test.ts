import { Head } from "@no-witness-labs/hydra-sdk";
import { describe, expect, it } from "vitest";

// Helper to create ServerOutput ApiEvents
const serverOutput = (tag: string, payload?: unknown): Head.ApiEvent => ({
  _tag: "ServerOutput",
  output: { tag, payload },
});

// Helper to create ClientMessage ApiEvents
const clientMessage = (
  tag: "CommandFailed" | "PostTxOnChainFailed",
  clientInputTag: Head.ClientInputTag,
  reason?: string,
): Head.ApiEvent => ({
  _tag: "ClientMessage",
  message: { tag, clientInputTag, reason },
});

// Helper to create InvalidInput ApiEvents
const invalidInput = (reason: string): Head.ApiEvent => ({
  _tag: "InvalidInput",
  invalidInput: { reason },
});

describe("isCommandFailure", () => {
  it("matches InvalidInput with details", () => {
    const event = invalidInput("Missing required field: contestationPeriod");
    const result = Head.isCommandFailure(event, "Init");

    expect(result._tag).toBe("failure");
    if (result._tag === "failure") {
      expect(result.error.message).toContain("Missing required field");
      expect(result.error.details?.tag).toBe("InvalidInput");
      expect(result.error.details?.command).toBe("Init");
      expect(result.error.details?.validationError).toBe(
        "Missing required field: contestationPeriod",
      );
    }
  });

  it("matches CommandFailed for the correct command", () => {
    const event = clientMessage("CommandFailed", "Close", "CommandFailed: Close command was rejected by hydra-node");
    const result = Head.isCommandFailure(event, "Close");

    expect(result._tag).toBe("failure");
    if (result._tag === "failure") {
      expect(result.error.message).toContain("Close");
      expect(result.error.details?.tag).toBe("CommandFailed");
      expect(result.error.details?.command).toBe("Close");
    }
  });

  it("matches PostTxOnChainFailed for the correct command", () => {
    const event = clientMessage(
      "PostTxOnChainFailed",
      "Init",
      "PostTxOnChainFailed: script validation failed",
    );
    const result = Head.isCommandFailure(event, "Init");

    expect(result._tag).toBe("failure");
    if (result._tag === "failure") {
      expect(result.error.message).toContain("script validation failed");
      expect(result.error.details?.tag).toBe("PostTxOnChainFailed");
      expect(result.error.details?.command).toBe("Init");
    }
  });

  it("continues on unrelated ClientMessage (different command)", () => {
    const event = clientMessage("CommandFailed", "Close");
    const result = Head.isCommandFailure(event, "Init");

    expect(result._tag).toBe("continue");
  });

  it("continues on unrelated ServerOutput", () => {
    const event = serverOutput("PeerConnected", {});
    const result = Head.isCommandFailure(event, "Init");

    expect(result._tag).toBe("continue");
  });
});

describe("matchServerTag", () => {
  it("succeeds on matching tag", () => {
    const event = serverOutput("HeadIsClosed");
    const result = Head.matchServerTag(event, "HeadIsClosed", "Close");
    expect(result._tag).toBe("success");
  });

  it("fails on CommandFailed", () => {
    const event = clientMessage("CommandFailed", "Close", "CommandFailed: Close command was rejected");
    const result = Head.matchServerTag(event, "HeadIsClosed", "Close");

    expect(result._tag).toBe("failure");
    if (result._tag === "failure") {
      expect(result.error.details?.tag).toBe("CommandFailed");
    }
  });

  it("continues on unrelated event", () => {
    const event = serverOutput("HeadIsOpen");
    const result = Head.matchServerTag(event, "HeadIsClosed", "Close");
    expect(result._tag).toBe("continue");
  });
});

describe("matchCommit", () => {
  it("succeeds on HeadIsOpen", () => {
    const event = serverOutput("HeadIsOpen", { utxo: {} });
    const result = Head.matchCommit(event);
    expect(result._tag).toBe("success");
  });

  it("fails on DepositExpired with details", () => {
    const event = serverOutput("DepositExpired", {
      depositTxId: "abc123",
      headId: "head-1",
    });
    const result = Head.matchCommit(event);

    expect(result._tag).toBe("failure");
    if (result._tag === "failure") {
      expect(result.error.message).toContain("Deposit expired");
      expect(result.error.message).toContain("abc123");
      expect(result.error.details?.tag).toBe("DepositExpired");
      expect(result.error.details?.command).toBe("Commit");
      expect(result.error.details?.txId).toBe("abc123");
    }
  });

  it("fails on CommandFailed for Commit", () => {
    const event = clientMessage("CommandFailed", "Commit");
    const result = Head.matchCommit(event);

    expect(result._tag).toBe("failure");
    if (result._tag === "failure") {
      expect(result.error.details?.tag).toBe("CommandFailed");
    }
  });

  it("continues on unrelated event", () => {
    const event = serverOutput("TxValid", {});
    const result = Head.matchCommit(event);
    expect(result._tag).toBe("continue");
  });
});

describe("HeadError details field", () => {
  it("preserves structured details through TxInvalid failure", async () => {
    // TxInvalid is matched inside newTxEffect, which we can't call directly
    // without a full head. Test that HeadError carries details correctly.
    const err = new Head.HeadError({
      message: "Transaction was invalid",
      details: {
        tag: "TxInvalid",
        command: "NewTx",
        txId: "deadbeef",
        validationError: { reason: "InsufficientFunds" },
      },
    });

    expect(err.message).toBe("Transaction was invalid");
    expect(err.details?.tag).toBe("TxInvalid");
    expect(err.details?.command).toBe("NewTx");
    expect(err.details?.txId).toBe("deadbeef");
    expect(err.details?.validationError).toEqual({
      reason: "InsufficientFunds",
    });
  });

  it("works without details (backwards compatible)", () => {
    const err = new Head.HeadError({ message: "timeout" });
    expect(err.message).toBe("timeout");
    expect(err.details).toBeUndefined();
  });
});
