import type { ConnectionEnvVar } from '../../../core/api/connection-api';

/**
 * Renders one environment variable as a shell assignment.
 *
 * A credential is not a value the console holds, so the line becomes the
 * kubectl command that reads it from the Secret: the reader fetches it with
 * their own rights, and the console still never sees it.
 */
export function envLine(variable: ConnectionEnvVar): string {
  if (variable.secretRef) {
    const namespace = variable.secretRef.namespace ? ` -n ${variable.secretRef.namespace}` : '';
    return (
      `${variable.name}=$(kubectl get secret ${variable.secretRef.name}${namespace} ` +
      `-o jsonpath='{.data.${variable.secretRef.key}}' | base64 -d)`
    );
  }
  return `${variable.name}=${variable.value ?? ''}`;
}

/** The whole environment block, ready to paste into a shell. */
export function envBlock(env: ConnectionEnvVar[]): string {
  return env.map(envLine).join('\n');
}
