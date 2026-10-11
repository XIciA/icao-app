// Apps keep their existing content/audio behavior; this recovery is Web-only.
export function useQuestionRecording(_id?: string, _text?: string) {
  return { uri: undefined as string | undefined, resolving: false, retry: () => {} };
}
