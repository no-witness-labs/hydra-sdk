import { FetchHttpClient, HttpClient } from "@effect/platform";
import { Protocol, Socket, Head } from "@no-witness-labs/hydra-sdk";
import {
  Effect,
  Schedule,
  Schema,
  Queue,
  PubSub,
  Scope,
  Duration,
} from "effect";
import { TimeoutException } from "effect/Cause";

const awaitMessageWithSchema = <A, I>(
  socketController: Socket.SocketController,
  schema: Schema.Schema<A, I, never>,
  duration: Duration.Duration,
): Effect.Effect<A, TimeoutException, Scope.Scope> =>
  Effect.gen(function* () {
    // TODO: change to catch a message with a needed field instead, to catch failed answers as well
    const socketMessages = yield* PubSub.subscribe(
      socketController.messageQueue,
    );

    while (true) {
      const rawMessage = yield* Queue.take(socketMessages);
      const messageText = new TextDecoder().decode(rawMessage);

      const result = yield* Effect.either(
        Schema.decode(Schema.parseJson(schema))(messageText),
      );

      if (result._tag === "Right") {
        return result.right;
      }
    }
  }).pipe(Effect.timeout(duration));

export class HydraHeadController extends Effect.Service<HydraHeadController>()(
  "HydraHeadController",
  {
    effect: Effect.gen(function* () {
      yield* Effect.log("HydraHeadController was created");

      const httpClient = yield* HttpClient.HttpClient;
      const socketController = yield* Socket.SocketController;
      const hydraStateMachine = yield* Head.HydraStateMachine;

      const logStatusHeadForewer = Effect.gen(function* () {
        yield* Effect.logInfo(
          `The status is: [${hydraStateMachine.getStatus()}]`,
        );
      }).pipe(Effect.repeat(Schedule.linear("1 second")));

      const initialize = Effect.gen(function* () {
        yield* Effect.log(`Called initialize`);

        var status: Protocol.Status = "IDLE";
        yield* Effect.log(`Awaiting [${status}] status`);
        hydraStateMachine.awaitStatus(status);

        yield* Effect.log(`Sending "Init" message`);
        const message: Protocol.InitMessage = { tag: "Init" };
        yield* socketController.sendMessage(JSON.stringify(message));

        status = "INITIALIZING";
        yield* Effect.log(`Awaiting [${status}] status`);
        hydraStateMachine.awaitStatus(status);

        yield* Effect.log(
          `Initialization complete, status is now is ${[hydraStateMachine.getStatus()]}`,
        );
      });

      const abort = Effect.gen(function* () {
        yield* Effect.log(`Called abort`);

        var status: Protocol.Status = "INITIALIZING";
        yield* Effect.log(`Awaiting [${status}] status`);
        hydraStateMachine.awaitStatus(status);

        yield* Effect.log(`Sending "Abort" message`);
        const message: Protocol.AbortMessage = { tag: "Abort" };
        yield* socketController.sendMessage(JSON.stringify(message));

        status = "IDLE";
        yield* Effect.log(`Awaiting [${status}] status`);
        hydraStateMachine.awaitStatus(status);

        yield* Effect.log(
          `Abort action complete, status is now is ${[hydraStateMachine.getStatus()]}`,
        );
      });

      const recover = (recoverTxId: string) =>
        Effect.gen(function* () {
          yield* Effect.log(`Called recover with recoverTxId: ${recoverTxId}`);

          var status: Protocol.Status = "INITIALIZING";
          yield* Effect.log(`Awaiting [${status}] status`);
          hydraStateMachine.awaitStatus(status);

          yield* Effect.log(`Sending "Recover" message`);
          const message: Protocol.RecoverMessage = {
            tag: "Recover",
            recoverTxId,
          };
          yield* socketController.sendMessage(JSON.stringify(message));

          yield* Effect.log(`Awaiting CommitRecovered message`);

          const commitRecoveredMessage = yield* Effect.gen(function* () {
            var msg = yield* awaitMessageWithSchema(
              socketController,
              Protocol.CommitRecoveredMessageSchema,
              Duration.seconds(5),
            );

            while (msg.recoveredTxId !== recoverTxId) {
              yield* Effect.log(
                `Received wrong recoveredTxId: ${msg.recoveredTxId}, waiting for ${recoverTxId}`,
              );
              msg = yield* awaitMessageWithSchema(
                socketController,
                Protocol.CommitRecoveredMessageSchema,
                Duration.seconds(5),
              );
            }

            return msg;
          }).pipe(Effect.timeout(Duration.minutes(1)));

          yield* Effect.log(
            `Recover action complete, recovered TxId: [${commitRecoveredMessage.recoveredTxId}]`,
          );
        });

      const commit = Effect.gen(function* () {
        yield* Effect.log(`Called commit`);

        const status: Protocol.Status = "INITIALIZING";
        yield* Effect.log(`Awaiting [${status}] status`);
        hydraStateMachine.awaitStatus(status);

        yield* Effect.log(`Commiting UTXO on L1`);

        // TODO: L1 handling

        yield* Effect.log(
          `Commit complete, status is now is ${[hydraStateMachine.getStatus()]}`,
        );
      });

      const newTx = (transaction: Protocol.TransactionMessage) =>
        Effect.gen(function* () {
          yield* Effect.log(`Called newTx`);

          const status: Protocol.Status = "OPEN";
          yield* Effect.log(`Awaiting [${status}] status`);
          hydraStateMachine.awaitStatus(status);

          yield* Effect.log(
            `Sending "NewTx" message with txId: ${transaction.txId}`,
          );
          const message: Protocol.NewTxMessage = { tag: "NewTx", transaction };
          yield* socketController.sendMessage(JSON.stringify(message));

          yield* Effect.log(`Awaiting CommitRecovered message`);

          const txValidMessage = yield* Effect.gen(function* () {
            var msg = yield* awaitMessageWithSchema(
              socketController,
              Protocol.TxValidMessageSchema,
              Duration.seconds(5),
            );

            while (msg.transactionId !== transaction.txId) {
              yield* Effect.log(
                `Received wrong recoveredTxId: ${msg.transactionId}, waiting for ${transaction.txId}`,
              );
              msg = yield* awaitMessageWithSchema(
                socketController,
                Protocol.TxValidMessageSchema,
                Duration.seconds(5),
              );
            }

            return msg;
          }).pipe(Effect.timeout(Duration.minutes(1)));

          yield* Effect.log(
            `NewTx complete, txValidMessage TxId is ${[txValidMessage.transactionId]}`,
          );
        });

      const decommit = (decommitTx: Protocol.TransactionMessage) =>
        Effect.gen(function* () {
          yield* Effect.log(`Called decommit`);

          const status: Protocol.Status = "OPEN";
          yield* Effect.log(`Awaiting [${status}] status`);
          hydraStateMachine.awaitStatus(status);

          yield* Effect.log(
            `Sending "Decommit" message with txId: ${decommitTx.txId}`,
          );
          const message: Protocol.DecommitMessage = {
            tag: "Decommit",
            decommitTx,
          };
          yield* socketController.sendMessage(JSON.stringify(message));

          yield* Effect.log(`Awaiting CommitRecovered message`);

          const txValidMessage = yield* Effect.gen(function* () {
            var msg = yield* awaitMessageWithSchema(
              socketController,
              Protocol.DecommitApprovedMessageSchema,
              Duration.seconds(5),
            );

            while (msg.decommitTxId !== decommitTx.txId) {
              yield* Effect.log(
                `Received wrong recoveredTxId: ${msg.decommitTxId}, waiting for ${decommitTx.txId}`,
              );
              msg = yield* awaitMessageWithSchema(
                socketController,
                Protocol.DecommitApprovedMessageSchema,
                Duration.seconds(5),
              );
            }

            return msg;
          }).pipe(Effect.timeout(Duration.minutes(1)));

          yield* Effect.log(
            `NewTx complete, txValidMessage TxId is ${[txValidMessage.decommitTxId]}`,
          );
        });

      const close = Effect.gen(function* () {
        yield* Effect.log(`Called close`);

        var status: Protocol.Status = "OPEN";
        yield* Effect.log(`Awaiting [${status}] status`);
        hydraStateMachine.awaitStatus(status);

        yield* Effect.log(`Sending "Close" message`);
        const message: Protocol.CloseMessage = { tag: "Close" };
        yield* socketController.sendMessage(JSON.stringify(message));

        var status: Protocol.Status = "CLOSED";
        yield* Effect.log(`Awaiting [${status}] status`);
        hydraStateMachine.awaitStatus(status);

        yield* Effect.log(
          `Close action is complete, status is now is ${[hydraStateMachine.getStatus()]}`,
        );
      });

      const contest = Effect.gen(function* () {
        yield* Effect.log(`Called contest`);

        var status: Protocol.Status = "CLOSED";
        yield* Effect.log(`Awaiting [${status}] status`);
        hydraStateMachine.awaitStatus(status);

        yield* Effect.log(`Sending "Contest" message`);
        const message: Protocol.ContestMessage = { tag: "Contest" };
        yield* socketController.sendMessage(JSON.stringify(message));

        yield* Effect.log(`Awaiting CommitRecovered message`);

        const headIsContestedMessage = yield* awaitMessageWithSchema(
          socketController,
          Protocol.HeadIsContestedMessageSchema,
          Duration.seconds(5),
        );

        yield* Effect.log(
          `Contest action is complete, snapshotNumber now is ${[headIsContestedMessage.snapshotNumber]}`,
        );
      });

      const fanout = Effect.gen(function* () {
        var status: Protocol.Status = "FANOUT_POSSIBLE";
        yield* Effect.log(`Awaiting [${status}] status`);
        hydraStateMachine.awaitStatus(status);

        yield* Effect.log(`Sending "Fanout" message`);
        const message: Protocol.FanoutMessage = { tag: "Fanout" };
        yield* socketController.sendMessage(JSON.stringify(message));

        status = "FINAL";
        yield* Effect.log(`Awaiting [${status}] status`);
        hydraStateMachine.awaitStatus(status);
        yield* Effect.log(
          `Contest action is complete, status is now ${[hydraStateMachine.getStatus()]}`,
        );
      });

      return {
        logStatus: Effect.logInfo(
          `The status is: [${hydraStateMachine.getStatus()}]`,
        ),
        logStatusHeadForewer,
        initialize,
        abort,
        recover,
        commit,
        newTx,
        decommit,
        close,
        contest,
        fanout,
      };
    }),

    dependencies: [FetchHttpClient.layer],
  },
) {}
