import { cli, io } from "httpyac";
import type { PromptHandler } from "./types.js";

let promptHandler: PromptHandler = async () => undefined;

export function setPromptHandler(handler: PromptHandler): void {
  promptHandler = handler;
}

export function initEngineProviders(): void {
  cli.initFileProvider();
  io.userInteractionProvider.isTrusted = () => true;
  io.userInteractionProvider.showNote = async (message) => {
    const result = await promptHandler({ kind: "confirm", message });
    return result === true;
  };
  io.userInteractionProvider.showInputPrompt = async (message, defaultValue, masked) => {
    const result = await promptHandler({
      kind: "input",
      message,
      defaultValue,
      masked: masked ?? false,
    });
    return typeof result === "string" ? result : undefined;
  };
  io.userInteractionProvider.showListPrompt = async (message, values) => {
    const result = await promptHandler({ kind: "list", message, values });
    return typeof result === "string" ? result : undefined;
  };
  io.userInteractionProvider.showInformationMessage = async (message) => {
    await promptHandler({ kind: "confirm", message });
    return undefined;
  };
  io.userInteractionProvider.showWarnMessage = async (message) => {
    await promptHandler({ kind: "confirm", message });
    return undefined;
  };
  io.userInteractionProvider.showErrorMessage = async (message) => {
    await promptHandler({ kind: "confirm", message });
    return undefined;
  };
}
