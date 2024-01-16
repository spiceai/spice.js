import * as retry from 'retry';
import * as grpc from '@grpc/grpc-js';

//default max retry value
const FLIGHT_QUERY_MAX_RETRIES = 3; 

function someFunc(){}

function shouldRetryOperationForError (err: any) : boolean {

    let code  = err && err.code;

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
  
async function retryWithExponentialBackoff<Type>(operation: any, maxRetries: number):Promise<Type> {
  
    if (maxRetries < 0) {
      throw new Error('maxRetries must be greater than or equal to 0');
    }
  
    return new Promise((resolve, reject) => {
  
      const operationRetry = retry.operation({
        retries: maxRetries,
        // the exponential factor that will be used
        factor: 2,
      });
  
      operationRetry.attempt(() => {
        operation()
          .then(resolve)
          .catch((err: any) => {
          
            let shouldRetry = shouldRetryOperationForError(err);
            // console.log(`Attempt to retry operation; previous attempts ${operationRetry.attempts()}`);
            if (!shouldRetry) {
              // if we don't retry specific error we can't use operationRetry.mainError() as it is not available
              // so we reject it here 
              reject(err);
              return;
            }
  
            if (operationRetry.retry(err)) {
              return
            }
            reject(operationRetry.mainError())
          })
      })
    })
  }

  export {
    FLIGHT_QUERY_MAX_RETRIES,
    retryWithExponentialBackoff,
  }
