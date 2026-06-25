export type SendController = Readonly<{
  beginSend: () => number;
  cancelSend: () => number;
  isCurrent: (generation: number) => boolean;
}>;

export function createSendController(): SendController {
  let sendGeneration = 0;

  return {
    beginSend(): number {
      sendGeneration += 1;
      return sendGeneration;
    },
    cancelSend(): number {
      sendGeneration += 1;
      return sendGeneration;
    },
    isCurrent(generation: number): boolean {
      return generation === sendGeneration;
    },
  };
}
