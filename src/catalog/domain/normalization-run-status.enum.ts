export enum NormalizationRunStatus {
  SUCCESS = 'SUCCESS',
  /** The model answered, but the output was not valid JSON or failed the schema. */
  INVALID_OUTPUT = 'INVALID_OUTPUT',
  /** The model did not answer (unavailable or request rejected). */
  ERROR = 'ERROR',
}
