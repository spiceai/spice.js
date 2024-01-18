import * as retry from "retry";
import * as grpc from "@grpc/grpc-js";

//default max retry value
const FLIGHT_QUERY_MAX_RETRIES = 3;
const SPICE_NO_RETRY = "_SPICE_NO_RETRY";

function dontRetry(err: any) {
  err[SPICE_NO_RETRY] = true;
}

function shouldRetryOperationForError(err: any): boolean {
  // error marked as permanent so operation should not be retried
  if (err && err[SPICE_NO_RETRY]) {
    return false;
  }

  let code = err && err.code;

  if (!code) {
    return false;
  }

  return [
    grpc.status.CANCELLED,
    grpc.status.UNAVAILABLE,
    grpc.status.DEADLINE_EXCEEDED,
    grpc.status.RESOURCE_EXHAUSTED,
    grpc.status.ABORTED,
    grpc.status.INTERNAL,
  ].includes(code);
}

async function retryWithExponentialBackoff<Type>(
  operation: any,
  maxRetries: number
): Promise<Type> {
  if (maxRetries < 0) {
    throw new Error("maxRetries must be greater than or equal to 0");
  }

  return new Promise((resolve, reject) => {
    const operationRetry = retry.operation({
      retries: maxRetries,
      // the exponential factor that will be used
      factor: 1.5,
    });

    operationRetry.attempt(() => {
      operation()
        .then(resolve)
        .catch((err: any) => {
          let shouldRetry = shouldRetryOperationForError(err);

          // console.log(
          //   `Attempt to retry operation; previous attempts ${operationRetry.attempts()}; should retry: ${shouldRetry}`
          // );

          if (shouldRetry && operationRetry.retry(err)) {
            return;
          }

          // in case we didn't try to retry the operation then mainError will be null
          // so we need to pass err for this scenario as an alternative
          reject(operationRetry.mainError() || err);
        });
    });
  });
}

export { FLIGHT_QUERY_MAX_RETRIES, dontRetry, retryWithExponentialBackoff };
